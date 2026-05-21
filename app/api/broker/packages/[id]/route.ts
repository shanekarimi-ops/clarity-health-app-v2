import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  calculatePackageCosts,
  type CalculatorInput,
  type ContributionSplit,
  type TierBreakdown,
} from '../../../../lib/packages/calculate-costs';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function recomputePackageSnapshot(admin: SupabaseClient, packageId: string) {
  const { data: pkg, error: pkgError } = await admin
    .from('packages')
    .select('id, rfp_id, member_count_assumption, tier_breakdown')
    .eq('id', packageId)
    .maybeSingle();
  if (pkgError || !pkg) {
    throw new Error(`Failed to load package for recomputation: ${pkgError?.message || 'not found'}`);
  }

  const { data: rfp } = await admin
    .from('rfps')
    .select('current_annual_cost')
    .eq('id', pkg.rfp_id)
    .maybeSingle();

  const { data: lineRows, error: linesError } = await admin
    .from('package_lines')
    .select(`
      id, display_order, contribution_split,
      quote_line:quote_lines(
        id, benefit_type, plan_name, rate_structure, rates, monthly_premium, annual_cost
      )
    `)
    .eq('package_id', packageId)
    .order('display_order', { ascending: true });

  if (linesError) {
    throw new Error(`Failed to load package_lines for recomputation: ${linesError.message}`);
  }

  const calcInput: CalculatorInput = {
    member_count_assumption: pkg.member_count_assumption,
    tier_breakdown: pkg.tier_breakdown as TierBreakdown | null,
    rfp_current_annual_cost: rfp?.current_annual_cost ?? null,
    lines: (lineRows || []).map((row: any) => ({
      package_line_id: row.id,
      display_order: row.display_order,
      contribution_split: row.contribution_split as ContributionSplit | null,
      quote_line: {
        quote_line_id: row.quote_line?.id,
        benefit_type: row.quote_line?.benefit_type,
        plan_name: row.quote_line?.plan_name,
        rate_structure: row.quote_line?.rate_structure,
        rates: row.quote_line?.rates,
        monthly_premium: row.quote_line?.monthly_premium,
        annual_cost: row.quote_line?.annual_cost,
      },
    })),
  };

  const result = calculatePackageCosts(calcInput);

  const { error: updateError } = await admin
    .from('packages')
    .update({
      total_annual_cost: result.total_annual_cost,
      employer_annual_cost: result.employer_annual_cost,
      employee_annual_cost: result.employee_annual_cost,
      cost_change_vs_current_pct: result.cost_change_vs_current_pct,
      costs_calculated_at: result.computed_at,
      updated_at: new Date().toISOString(),
    })
    .eq('id', packageId);

  if (updateError) {
    throw new Error(`Failed to persist snapshot: ${updateError.message}`);
  }

  return result;
}

type AuthSuccess = {
  ok: true;
  admin: SupabaseClient;
  broker: { id: string; agency_id: string };
  user: any;
  pkg: any;
};

type AuthFailure = {
  ok: false;
  response: NextResponse;
};

async function authAndLoadPackage(
  req: NextRequest,
  packageId: string
): Promise<AuthSuccess | AuthFailure> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, response: NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 }) };
  }
  const accessToken = authHeader.slice(7);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid session', debug: { error: userError?.message } }, { status: 401 }),
    };
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: broker } = await admin
    .from('brokers')
    .select('id, agency_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!broker) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'No broker profile found for this user' }, { status: 403 }),
    };
  }

  const { data: pkg, error: pkgError } = await admin
    .from('packages')
    .select('id, agency_id, rfp_id, name, member_count_assumption, tier_breakdown')
    .eq('id', packageId)
    .maybeSingle();

  if (pkgError || !pkg) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Package not found', debug: { package_id: packageId, error: pkgError?.message } },
        { status: 404 }
      ),
    };
  }

  if (pkg.agency_id !== broker.agency_id) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Package does not belong to your agency' }, { status: 403 }),
    };
  }

  return { ok: true, admin, broker, user, pkg };
}

const VALID_TIER_KEYS = ['employee_only', 'employee_spouse', 'employee_children', 'family'] as const;

function validateTierBreakdown(tb: any): string | null {
  if (tb === null) return null;
  if (typeof tb !== 'object') return 'tier_breakdown must be an object or null';

  for (const key of Object.keys(tb)) {
    if (!VALID_TIER_KEYS.includes(key as any)) {
      return `tier_breakdown contains unknown key "${key}". Allowed: ${VALID_TIER_KEYS.join(', ')}`;
    }
  }

  for (const key of VALID_TIER_KEYS) {
    if (key in tb) {
      const v = tb[key];
      if (typeof v !== 'number' || !isFinite(v) || v < 0) {
        return `tier_breakdown.${key} must be a non-negative number`;
      }
      if (!Number.isInteger(v)) {
        return `tier_breakdown.${key} must be a whole number (got ${v})`;
      }
    }
  }

  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const packageId = params.id;

  try {
    const auth = await authAndLoadPackage(req, packageId);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    // RFP join now exposes group_id instead of client_id
    const { data: pkg, error: pkgError } = await admin
      .from('packages')
      .select(`
        *,
        rfp:rfps(id, name, effective_date, current_annual_cost, group_id)
      `)
      .eq('id', packageId)
      .maybeSingle();

    if (pkgError || !pkg) {
      return NextResponse.json(
        { error: 'Package not found', debug: { package_id: packageId, error: pkgError?.message } },
        { status: 404 }
      );
    }

    // Look up the group via rfp.group_id, then surface it under the legacy
    // `client` key so the UI doesn't need updating yet. The UI displays
    // pkg.client.employer_name — we feed it the group name.
    let clientRow: any = null;
    if ((pkg as any).rfp?.group_id) {
      const { data: g } = await admin
        .from('groups')
        .select('id, name')
        .eq('id', (pkg as any).rfp.group_id)
        .maybeSingle();
      if (g) {
        clientRow = { id: g.id, employer_name: g.name };
      }
    }

    const { data: lineRows, error: linesError } = await admin
      .from('package_lines')
      .select(`
        id, package_id, quote_line_id, benefit_type, display_order,
        contribution_split, created_at,
        quote_line:quote_lines(
          id, benefit_type, plan_name, monthly_premium, annual_cost,
          rate_structure, rates, plan_design,
          quote:quotes(
            id, total_annual_cost, monthly_cost, cost_change_pct,
            carrier:carriers(id, name, brand_color, logo_url)
          )
        )
      `)
      .eq('package_id', packageId)
      .order('display_order', { ascending: true });

    if (linesError) {
      return NextResponse.json(
        { error: 'Failed to load package lines', debug: { error: linesError.message } },
        { status: 500 }
      );
    }

    const usedQuoteLineIds = (lineRows || []).map((l: any) => l.quote_line_id);

    const { data: rfpQuotes } = await admin
      .from('quotes')
      .select(`
        id, status,
        carrier:carriers(id, name, brand_color),
        quote_lines:quote_lines(
          id, benefit_type, plan_name, monthly_premium, annual_cost,
          rate_structure, rates
        )
      `)
      .eq('rfp_id', (pkg as any).rfp_id)
      .in('status', ['submitted', 'reviewed', 'shortlisted']);

    const available_quote_lines: any[] = [];
    for (const q of rfpQuotes || []) {
      const carrier = (q as any).carrier;
      for (const ql of ((q as any).quote_lines || [])) {
        if (usedQuoteLineIds.includes(ql.id)) continue;
        available_quote_lines.push({
          quote_line_id: ql.id,
          benefit_type: ql.benefit_type,
          plan_name: ql.plan_name,
          monthly_premium: ql.monthly_premium,
          annual_cost: ql.annual_cost,
          rate_structure: ql.rate_structure,
          rates: ql.rates,
          carrier_id: carrier?.id,
          carrier_name: carrier?.name,
          carrier_brand_color: carrier?.brand_color,
        });
      }
    }

    available_quote_lines.sort((a, b) => {
      if (a.benefit_type !== b.benefit_type) return a.benefit_type.localeCompare(b.benefit_type);
      return (a.carrier_name || '').localeCompare(b.carrier_name || '');
    });

    return NextResponse.json({
      package: { ...pkg, client: clientRow },
      lines: lineRows || [],
      available_quote_lines,
    }, { status: 200 });
  } catch (err: any) {
    console.error('GET /api/broker/packages/[id] error:', err);
    return NextResponse.json(
      { error: 'Internal server error', debug: { message: err?.message } },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const packageId = params.id;

  try {
    const auth = await authAndLoadPackage(req, packageId);
    if (!auth.ok) return auth.response;
    const { admin, broker, user } = auth;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    let snapshotMayChange = false;

    if ('name' in body) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
      }
      if (body.name.trim().length > 200) {
        return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 });
      }
      updates.name = body.name.trim();
    }

    if ('description' in body) {
      if (body.description !== null && typeof body.description !== 'string') {
        return NextResponse.json({ error: 'description must be a string or null' }, { status: 400 });
      }
      updates.description = body.description;
    }

    if ('notes' in body) {
      if (body.notes !== null && typeof body.notes !== 'string') {
        return NextResponse.json({ error: 'notes must be a string or null' }, { status: 400 });
      }
      updates.notes = body.notes;
    }

    if ('tier_breakdown' in body) {
      const tbError = validateTierBreakdown(body.tier_breakdown);
      if (tbError) {
        return NextResponse.json({ error: tbError, debug: { received: body.tier_breakdown } }, { status: 400 });
      }
      updates.tier_breakdown = body.tier_breakdown;
      snapshotMayChange = true;

      if (body.tier_breakdown && typeof body.tier_breakdown === 'object') {
        const sum = VALID_TIER_KEYS.reduce((acc, k) => {
          const v = body.tier_breakdown[k];
          return acc + (typeof v === 'number' ? v : 0);
        }, 0);
        updates.member_count_assumption = sum;
      }
    }

    if ('member_count_assumption' in body && !('tier_breakdown' in body)) {
      if (body.member_count_assumption !== null) {
        if (
          typeof body.member_count_assumption !== 'number' ||
          !isFinite(body.member_count_assumption) ||
          body.member_count_assumption < 0 ||
          !Number.isInteger(body.member_count_assumption)
        ) {
          return NextResponse.json(
            { error: 'member_count_assumption must be a non-negative whole number or null' },
            { status: 400 }
          );
        }
      }
      updates.member_count_assumption = body.member_count_assumption;
      snapshotMayChange = true;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update', debug: { allowed_fields: ['name', 'description', 'notes', 'tier_breakdown', 'member_count_assumption'] } },
        { status: 400 }
      );
    }

    updates.updated_at = new Date().toISOString();

    const { data: updated, error: updateError } = await admin
      .from('packages')
      .update(updates)
      .eq('id', packageId)
      .select('*')
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: 'Failed to update package', debug: { error: updateError?.message, code: updateError?.code } },
        { status: 500 }
      );
    }

    let snapshot = null;
    let snapshot_error: string | null = null;
    if (snapshotMayChange) {
      try {
        snapshot = await recomputePackageSnapshot(admin, packageId);
      } catch (recalcErr: any) {
        console.error(`Snapshot recompute failed for package ${packageId} after PATCH:`, recalcErr);
        snapshot_error = recalcErr?.message || 'Snapshot recompute failed';
      }
    }

    const { data: freshPkg } = await admin
      .from('packages')
      .select('*')
      .eq('id', packageId)
      .maybeSingle();

    // activity_log no longer carries client_id for group-shaped events
    try {
      const meta = user.user_metadata || {};
      const brokerName = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim() || null;
      const changedFields = Object.keys(updates).filter(k => k !== 'updated_at');
      await admin.from('activity_log').insert({
        agency_id: broker.agency_id,
        actor_user_id: user.id,
        actor_name: brokerName,
        event_type: 'package_updated',
        event_summary: `Updated package "${updated.name}" (${changedFields.join(', ')})`,
        metadata: {
          package_id: packageId,
          changed_fields: changedFields,
          snapshot_recomputed: snapshotMayChange,
        },
      });
    } catch (logErr) {
      console.warn('activity_log insert failed (non-blocking):', logErr);
    }

    return NextResponse.json(
      {
        success: true,
        package: freshPkg || updated,
        snapshot,
        snapshot_recomputed: snapshotMayChange,
        snapshot_error,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('PATCH /api/broker/packages/[id] error:', err);
    return NextResponse.json(
      { error: 'Internal server error', debug: { message: err?.message } },
      { status: 500 }
    );
  }
}