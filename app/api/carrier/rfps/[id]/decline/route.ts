import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Predefined decline reason codes — keep in sync with the UI dropdown
const VALID_REASON_CODES = [
  'group_too_small',
  'industry_not_appetite',
  'timeline_too_short',
  'state_not_supported',
  'other',
] as const;

type DeclineBody = {
  reason_code?: string;
  reason_note?: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rfpId = params.id;
    if (!rfpId) {
      return NextResponse.json({ error: 'Missing RFP id' }, { status: 400 });
    }

    // Step 1: parse body
    let body: DeclineBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const reasonCode = body.reason_code?.trim() || null;
    const reasonNote = body.reason_note?.trim() || null;

    if (reasonCode && !VALID_REASON_CODES.includes(reasonCode as any)) {
      return NextResponse.json(
        { error: `Invalid reason_code. Must be one of: ${VALID_REASON_CODES.join(', ')}` },
        { status: 400 }
      );
    }

    // Step 2: extract bearer token
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Step 3: identify caller
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }
    const userId = userData.user.id;

    // Step 4: admin client
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Step 5: confirm caller is the assigned carrier_user for this RFP
    const { data: rfpCarrierRow, error: rcError } = await admin
      .from('rfp_carriers')
      .select(`
        id,
        rfp_id,
        carrier_id,
        assigned_carrier_user_id,
        status,
        carrier_users!inner ( id, user_id )
      `)
      .eq('rfp_id', rfpId)
      .eq('carrier_users.user_id', userId)
      .maybeSingle();

    if (rcError) {
      console.error('[decline] rfp_carriers lookup error:', rcError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!rfpCarrierRow) {
      return NextResponse.json(
        { error: 'You do not have access to this RFP' },
        { status: 403 }
      );
    }

    // Step 6: prevent double-decline / decline-after-submit
    if (rfpCarrierRow.status === 'declined') {
      return NextResponse.json(
        { error: 'This RFP has already been declined.' },
        { status: 409 }
      );
    }
    if (['submitted', 'won', 'lost'].includes(rfpCarrierRow.status)) {
      return NextResponse.json(
        { error: `This RFP cannot be declined because its current status is "${rfpCarrierRow.status}".` },
        { status: 409 }
      );
    }

    // Step 7: build decline_reason text (combines code + note)
    const reasonParts: string[] = [];
    if (reasonCode) reasonParts.push(REASON_LABELS[reasonCode] ?? reasonCode);
    if (reasonNote) reasonParts.push(reasonNote);
    const declineReason = reasonParts.length > 0 ? reasonParts.join(' — ') : null;

    const nowIso = new Date().toISOString();

    // Step 8: update rfp_carriers
    const { error: updateError } = await admin
      .from('rfp_carriers')
      .update({
        status: 'declined',
        declined_at: nowIso,
        decline_reason: declineReason,
        updated_at: nowIso,
      })
      .eq('id', rfpCarrierRow.id);

    if (updateError) {
      console.error('[decline] update rfp_carriers error:', updateError);
      return NextResponse.json({ error: 'Failed to record decline' }, { status: 500 });
    }

    // Step 9: log engagement event
    const { error: logError } = await admin
      .from('rfp_engagement_log')
      .insert({
        rfp_id: rfpId,
        rfp_carrier_id: rfpCarrierRow.id,
        carrier_user_id: rfpCarrierRow.assigned_carrier_user_id,
        event_type: 'declined',
        metadata: {
          reason_code: reasonCode,
          reason_note: reasonNote,
        },
        occurred_at: nowIso,
      });

    if (logError) {
      console.error('[decline] engagement log error:', logError);
      // Non-fatal — the decline itself was recorded
    }

    return NextResponse.json({
      success: true,
      declinedAt: nowIso,
      declineReason,
    });
  } catch (err) {
    console.error('[decline] uncaught error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const REASON_LABELS: Record<string, string> = {
  group_too_small: 'Group too small',
  industry_not_appetite: 'Industry not in appetite',
  timeline_too_short: 'Timeline too short',
  state_not_supported: 'State not supported',
  other: 'Other',
};