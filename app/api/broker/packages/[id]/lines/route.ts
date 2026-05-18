import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  calculatePackageCosts,
  type CalculatorInput,
  type ContributionSplit,
  type TierBreakdown,
} from '../../../../../lib/packages/calculate-costs';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const VALID_BENEFIT_TYPES = ['medical', 'dental', 'vision', 'life', 'std', 'ltd'] as const;
const ALLOWED_TIERS = ['employee_only', 'employee_spouse', 'employee_children', 'family'] as const;

// ============================================================================
// Helper: validate contribution_split jsonb input
// ============================================================================
function validateContributionSplit(raw: any): { ok: true; value: ContributionSplit | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'contribution_split must be an object or null' };
  }
  if (raw.split_mode !== 'uniform' && raw.split_mode !== 'per_tier') {
    return { ok: false, error: `contribution_split.split_mode must be "uniform" or "per_tier" (got ${JSON.stringify(raw.split_mode)})` };
  }

  if (raw.split_mode === 'uniform') {
    if (!raw.uniform || typeof raw.uniform !== 'object') {
      return { ok: false, error: 'contribution_split.uniform is required when split_mode is "uniform"' };
    }
    const { employer_pct, employee_pct } = raw.uniform;
    if (typeof employer_pct !== 'number' || typeof employee_pct !== 'number') {
      return { ok: false, error: 'uniform.employer_pct and employee_pct must be numbers' };
    }
    if (employer_pct < 0 || employer_pct > 100 || employee_pct < 0 || employee_pct > 100) {
      return { ok: false, error: 'employer_pct and employee_pct must be between 0 and 100' };
    }
    if (Math.abs(employer_pct + employee_pct - 100) > 0.01) {
      return { ok: false, error: `employer_pct + employee_pct must equal 100 (got ${employer_pct + employee_pct})` };
    }
  } else {
    // per_tier
    if (!raw.per_tier || typeof raw.per_tier !== 'object') {
      return { ok: false, error: 'contribution_split.per_tier is required when split_mode is "per_tier"' };
    }
    for (const [tier, val] of Object.entries(raw.per_tier)) {
      if (!(ALLOWED_TIERS as readonly string[]).includes(tier)) {
        return { ok: false, error: `Unknown tier in per_tier: ${tier}` };
      }
      const v = val as any;
      if (!v || typeof v !== 'object') {
        return { ok: false, error: `per_tier.${tier} must be an object` };
      }
      if (typeof v.employer_pct !== 'number' || typeof v.employee_pct !== 'number') {
        return { ok: false, error: `per_tier.${tier} employer_pct and employee_pct must be numbers` };
      }
      if (Math.abs(v.employer_pct + v.employee_pct - 100) > 0.01) {
        return { ok: false, error: `per_tier.${tier} percentages must sum to 100` };
      }
    }
  }

  return { ok: true, value: raw as ContributionSplit };
}

// ============================================================================
// Helper: recompute the package's cost snapshot and persist to packages row
// ============================================================================
// Called after every successful line add/update/delete. Reads the full state
// of the package (header + all lines + their quote_line rate data + RFP
// current cost), runs the calculator, writes the result back to the package
// header columns. Returns the calculator result for inclusion in the response.
// ============================================================================
async function recomputePackageSnapshot(admin: any, packageId: string) {
  // Fetch the package header + RFP for current_annual_cost
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

  // Fetch all package_lines + the joined quote_line rate data
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

  // Build calculator input
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

  // Persist snapshot to package row
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

// ============================================================================
// POST — add a line to a package
// ============================================================================
// URL: /api/broker/packages/[id]/lines
// Body:
//   {
//     quote_line_id: string (required),
//     display_order?: number (default 0),
//     contribution_split?: ContributionSplit | null
//   }
// Returns: 201 with { success: true, package_line: <row>, snapshot: <calc result> }
// Errors:
//   400 — missing/invalid fields
//   401/403 — auth/ownership
//   404 — package or quote_line not found
//   409 — duplicate benefit_type for this package (unique constraint)
//   422 — quote_line doesn't belong to a quote on the same RFP as the package
// ============================================================================
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const packageId = params.id;

  try {
    // ---- Auth ----
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing Authorization header' },
        { status: 401 }
      );
    }
    const accessToken = authHeader.slice(7);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Invalid session', debug: { error: userError?.message } },
        { status: 401 }
      );
    }

    // ---- Body ----
    const body = await req.json();
    const { quote_line_id, display_order, contribution_split } = body || {};

    if (!quote_line_id || typeof quote_line_id !== 'string') {
      return NextResponse.json(
        { error: 'quote_line_id is required', debug: { received: body } },
        { status: 400 }
      );
    }

    if (display_order !== undefined && display_order !== null) {
      if (typeof display_order !== 'number' || !Number.isInteger(display_order) || display_order < 0) {
        return NextResponse.json(
          { error: 'display_order must be a non-negative integer', debug: { received: display_order } },
          { status: 400 }
        );
      }
    }

    const splitValidation = validateContributionSplit(contribution_split);
    if (!splitValidation.ok) {
      return NextResponse.json(
        { error: splitValidation.error, debug: { received: contribution_split } },
        { status: 400 }
      );
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ---- Verify broker → agency ----
    const { data: broker } = await admin
      .from('brokers')
      .select('id, agency_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!broker) {
      return NextResponse.json(
        { error: 'No broker profile found for this user' },
        { status: 403 }
      );
    }

    // ---- Load package and verify ownership ----
    const { data: pkg, error: pkgError } = await admin
      .from('packages')
      .select('id, rfp_id, agency_id')
      .eq('id', packageId)
      .maybeSingle();

    if (pkgError || !pkg) {
      return NextResponse.json(
        { error: 'Package not found', debug: { package_id: packageId, error: pkgError?.message } },
        { status: 404 }
      );
    }

    if (pkg.agency_id !== broker.agency_id) {
      return NextResponse.json(
        { error: 'Package does not belong to your agency' },
        { status: 403 }
      );
    }

    // ---- Load quote_line and verify it's on a quote in the same RFP ----
    const { data: quoteLine, error: qlError } = await admin
      .from('quote_lines')
      .select(`
        id, benefit_type, plan_name,
        quote:quotes(id, rfp_id, agency_id)
      `)
      .eq('id', quote_line_id)
      .maybeSingle();

    if (qlError || !quoteLine) {
      return NextResponse.json(
        { error: 'Quote line not found', debug: { quote_line_id, error: qlError?.message } },
        { status: 404 }
      );
    }

    const ql: any = quoteLine;
    const parentQuoteRfpId = ql.quote?.rfp_id;
    if (!parentQuoteRfpId) {
      return NextResponse.json(
        { error: 'Quote line is not associated with a quote', debug: { quote_line_id } },
        { status: 422 }
      );
    }

    if (parentQuoteRfpId !== pkg.rfp_id) {
      return NextResponse.json(
        {
          error: 'Quote line belongs to a different RFP than this package',
          debug: { quote_line_rfp: parentQuoteRfpId, package_rfp: pkg.rfp_id },
        },
        { status: 422 }
      );
    }

    // ---- Insert package_line ----
    const insertPayload: any = {
      package_id: packageId,
      quote_line_id,
      benefit_type: ql.benefit_type,
      display_order: display_order ?? 0,
      contribution_split: splitValidation.value,
    };

    const { data: insert, error: insertError } = await admin
      .from('package_lines')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertError || !insert) {
      if (insertError?.code === '23505' && insertError?.message?.includes('one_per_benefit_type')) {
        return NextResponse.json(
          {
            error: `This package already has a ${ql.benefit_type} line`,
            debug: { code: insertError.code, hint: 'Remove the existing line first or update it instead' },
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to add line to package', debug: { error: insertError?.message, code: insertError?.code } },
        { status: 500 }
      );
    }

    // ---- Recompute snapshot ----
    let snapshot;
    try {
      snapshot = await recomputePackageSnapshot(admin, packageId);
    } catch (recalcErr: any) {
      // Line WAS inserted; snapshot just failed to update. Don't fail the
      // whole request — return the inserted line plus a flag so the caller
      // knows the snapshot is stale and can trigger a manual recompute.
      console.error(`Snapshot recompute failed for package ${packageId}:`, recalcErr);
      return NextResponse.json(
        {
          success: true,
          package_line: insert,
          snapshot: null,
          snapshot_error: recalcErr?.message || 'Snapshot recompute failed',
        },
        { status: 201 }
      );
    }

    // ---- Non-blocking activity log ----
    try {
      const meta = user.user_metadata || {};
      const brokerName = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim() || null;
      await admin.from('activity_log').insert({
        agency_id: broker.agency_id,
        actor_user_id: user.id,
        actor_name: brokerName,
        event_type: 'package_line_added',
        event_summary: `Added ${ql.benefit_type} line "${ql.plan_name || 'Unnamed plan'}" to package`,
        metadata: {
          package_id: packageId,
          package_line_id: insert.id,
          quote_line_id,
          benefit_type: ql.benefit_type,
        },
      });
    } catch (logErr) {
      console.warn('activity_log insert failed (non-blocking):', logErr);
    }

    return NextResponse.json(
      { success: true, package_line: insert, snapshot },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('POST /api/broker/packages/[id]/lines error:', err);
    return NextResponse.json(
      { error: 'Internal server error', debug: { message: err?.message } },
      { status: 500 }
    );
  }
}