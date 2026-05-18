import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  calculatePackageCosts,
  type CalculatorInput,
  type ContributionSplit,
  type TierBreakdown,
} from '../../../../../../lib/packages/calculate-costs';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ============================================================================
// Helper: recompute the package's cost snapshot
// ============================================================================
// Same shape as the helper in lines/route.ts. Extracting to a shared module
// is the right move eventually; for now we duplicate to keep the diff scoped.
// ============================================================================
async function recomputePackageSnapshot(admin: any, packageId: string) {
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

  // If there are no lines left, the calculator returns zeros — which is correct,
  // and the persisted snapshot reflects an empty package. No special handling needed.
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
// DELETE — remove a line from a package
// ============================================================================
// URL: /api/broker/packages/[id]/lines/[line_id]
// No body.
// Returns: 200 with { success: true, snapshot: <calc result>, removed_line: { id, benefit_type } }
// Errors: 401/403, 404
// ============================================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; line_id: string } }
) {
  const packageId = params.id;
  const lineId = params.line_id;

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
      .select('id, agency_id')
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

    // ---- Load the line and verify it belongs to this package ----
    const { data: line, error: lineError } = await admin
      .from('package_lines')
      .select('id, package_id, benefit_type, quote_line:quote_lines(plan_name)')
      .eq('id', lineId)
      .maybeSingle();

    if (lineError || !line) {
      return NextResponse.json(
        { error: 'Line not found', debug: { line_id: lineId, error: lineError?.message } },
        { status: 404 }
      );
    }

    if (line.package_id !== packageId) {
      return NextResponse.json(
        { error: 'Line does not belong to this package' },
        { status: 404 }
      );
    }

    // ---- Delete the line ----
    const { error: deleteError } = await admin
      .from('package_lines')
      .delete()
      .eq('id', lineId);

    if (deleteError) {
      return NextResponse.json(
        { error: 'Failed to delete line', debug: { error: deleteError.message, code: deleteError.code } },
        { status: 500 }
      );
    }

    // ---- Recompute snapshot ----
    let snapshot;
    try {
      snapshot = await recomputePackageSnapshot(admin, packageId);
    } catch (recalcErr: any) {
      console.error(`Snapshot recompute failed for package ${packageId} after line delete:`, recalcErr);
      return NextResponse.json(
        {
          success: true,
          removed_line: { id: lineId, benefit_type: line.benefit_type },
          snapshot: null,
          snapshot_error: recalcErr?.message || 'Snapshot recompute failed',
        },
        { status: 200 }
      );
    }

    // ---- Non-blocking activity log ----
    try {
      const meta = user.user_metadata || {};
      const brokerName = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim() || null;
      const planName = (line as any).quote_line?.plan_name || 'Unnamed plan';
      await admin.from('activity_log').insert({
        agency_id: broker.agency_id,
        actor_user_id: user.id,
        actor_name: brokerName,
        event_type: 'package_line_removed',
        event_summary: `Removed ${line.benefit_type} line "${planName}" from package`,
        metadata: {
          package_id: packageId,
          package_line_id: lineId,
          benefit_type: line.benefit_type,
        },
      });
    } catch (logErr) {
      console.warn('activity_log insert failed (non-blocking):', logErr);
    }

    return NextResponse.json(
      {
        success: true,
        removed_line: { id: lineId, benefit_type: line.benefit_type },
        snapshot,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('DELETE /api/broker/packages/[id]/lines/[line_id] error:', err);
    return NextResponse.json(
      { error: 'Internal server error', debug: { message: err?.message } },
      { status: 500 }
    );
  }
}