import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ============================================================================
// POST — toggle is_recommended on a package
// ============================================================================
// URL: /api/broker/packages/[id]/recommend
// Body: { recommended: boolean }
//
// If setting to true and another package on the same RFP is already
// recommended, that one is unflagged first (single-transaction-ish using a
// two-step update — Postgres doesn't have a way to "atomically swap" without
// a single UPDATE statement, but we minimize the window).
//
// Returns: 200 with { success: true, package: <row>, unflagged: <row|null> }
// Errors: 400, 401/403, 404, 500
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
    if (typeof body?.recommended !== 'boolean') {
      return NextResponse.json(
        { error: 'recommended (boolean) is required', debug: { received: body } },
        { status: 400 }
      );
    }
    const recommended: boolean = body.recommended;

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

    // ---- Load target package ----
    const { data: pkg, error: pkgError } = await admin
      .from('packages')
      .select('id, rfp_id, agency_id, name, is_recommended')
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

    // If we're trying to set it to the value it already has, no-op.
    if (pkg.is_recommended === recommended) {
      return NextResponse.json(
        { success: true, package: pkg, unflagged: null, noop: true },
        { status: 200 }
      );
    }

    let unflagged: any = null;

    // ---- If setting to true, unflag any other recommended package on this RFP first ----
    if (recommended) {
      const { data: previouslyRecommended, error: prevError } = await admin
        .from('packages')
        .select('id, name')
        .eq('rfp_id', pkg.rfp_id)
        .eq('is_recommended', true)
        .neq('id', packageId)
        .maybeSingle();

      if (prevError) {
        return NextResponse.json(
          { error: 'Failed to check for existing recommended package', debug: { error: prevError.message } },
          { status: 500 }
        );
      }

      if (previouslyRecommended) {
        const { error: unflagError } = await admin
          .from('packages')
          .update({ is_recommended: false, updated_at: new Date().toISOString() })
          .eq('id', previouslyRecommended.id);

        if (unflagError) {
          return NextResponse.json(
            { error: 'Failed to unflag previously recommended package', debug: { error: unflagError.message } },
            { status: 500 }
          );
        }

        unflagged = previouslyRecommended;
      }
    }

    // ---- Update target package ----
    const { data: updated, error: updateError } = await admin
      .from('packages')
      .update({ is_recommended: recommended, updated_at: new Date().toISOString() })
      .eq('id', packageId)
      .select('*')
      .single();

    if (updateError || !updated) {
      // If the partial unique index fires anyway (race condition with the previous unflag step),
      // surface a clean 409 with the unflagged context so the caller can retry.
      if (updateError?.code === '23505' && updateError?.message?.includes('one_recommended_per_rfp')) {
        return NextResponse.json(
          {
            error: 'Another package on this RFP is already recommended. Try again.',
            debug: { code: updateError.code, unflag_attempted: !!unflagged },
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to update package', debug: { error: updateError?.message, code: updateError?.code } },
        { status: 500 }
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
        event_type: recommended ? 'package_recommended' : 'package_unrecommended',
        event_summary: recommended
          ? `Marked package "${updated.name}" as recommended${unflagged ? ` (unflagged "${unflagged.name}")` : ''}`
          : `Removed recommended flag from package "${updated.name}"`,
        metadata: {
          package_id: packageId,
          rfp_id: pkg.rfp_id,
          previously_recommended_id: unflagged?.id || null,
        },
      });
    } catch (logErr) {
      console.warn('activity_log insert failed (non-blocking):', logErr);
    }

    return NextResponse.json(
      { success: true, package: updated, unflagged },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('POST /api/broker/packages/[id]/recommend error:', err);
    return NextResponse.json(
      { error: 'Internal server error', debug: { message: err?.message } },
      { status: 500 }
    );
  }
}