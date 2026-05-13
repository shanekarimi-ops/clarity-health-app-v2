import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const VALID_TARGETS = ['submitted', 'reviewed', 'shortlisted', 'rejected', 'won', 'lost'] as const;
type ReviewTarget = typeof VALID_TARGETS[number];

const EVENT_TYPE_BY_TARGET: Record<ReviewTarget, string> = {
  submitted:   'quote_reset_to_submitted',
  reviewed:    'quote_marked_reviewed',
  shortlisted: 'quote_shortlisted',
  rejected:    'quote_rejected',
  won:         'quote_marked_won',
  lost:        'quote_marked_lost',
};

const ACTION_LABEL_BY_TARGET: Record<ReviewTarget, string> = {
  submitted:   'reset to submitted',
  reviewed:    'marked as reviewed',
  shortlisted: 'shortlisted',
  rejected:    'rejected',
  won:         'marked as won',
  lost:        'marked as lost',
};

export async function POST(
  req: NextRequest,
  { params }: { params: { quoteId: string } }
) {
  const quoteId = params.quoteId;

  try {
    // --- Auth ---
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: 'Missing authorization' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // Authenticated client (to verify user)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }
    const userId = userData.user.id;
    const userMeta = userData.user.user_metadata || {};
    const actorName = [userMeta.first_name, userMeta.last_name].filter(Boolean).join(' ').trim() || userData.user.email || 'Broker';

    // Service-role client for the actual write (we already verified the user)
    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // --- Parse body ---
    const body = await req.json().catch(() => ({}));
    const targetStatus = body.status as ReviewTarget | undefined;

    if (!targetStatus || !VALID_TARGETS.includes(targetStatus)) {
      return NextResponse.json({
        error: 'Invalid status value',
        debug: { received: targetStatus, valid: VALID_TARGETS },
      }, { status: 400 });
    }

    // --- Look up the broker (to scope to their agency) ---
    const { data: brokerRow, error: brokerErr } = await admin
      .from('brokers')
      .select('agency_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (brokerErr || !brokerRow) {
      return NextResponse.json({
        error: 'Broker profile not found',
        debug: { user_id: userId, error_message: brokerErr?.message, error_code: brokerErr?.code },
      }, { status: 403 });
    }
    const agencyId = brokerRow.agency_id;

    // --- Look up the quote + verify it belongs to this agency ---
    const { data: quoteRow, error: quoteErr } = await admin
      .from('quotes')
      .select(`
        id,
        status,
        rfp_id,
        carrier_id,
        rfps ( id, name, agency_id, client_id ),
        carriers ( id, name )
      `)
      .eq('id', quoteId)
      .maybeSingle();

    if (quoteErr || !quoteRow) {
      return NextResponse.json({
        error: 'Quote not found',
        debug: { quote_id: quoteId, error_message: quoteErr?.message, error_code: quoteErr?.code },
      }, { status: 404 });
    }

    const quoteAgencyId = (quoteRow.rfps as any)?.agency_id;
    if (quoteAgencyId !== agencyId) {
      return NextResponse.json({
        error: 'Quote does not belong to your agency',
        debug: { quote_agency_id: quoteAgencyId, broker_agency_id: agencyId },
      }, { status: 403 });
    }

    const carrierName = (quoteRow.carriers as any)?.name || 'a carrier';
    const rfpName = (quoteRow.rfps as any)?.name || 'an RFP';
    const clientId = (quoteRow.rfps as any)?.client_id || null;
    const previousStatus = quoteRow.status;

    // --- Update the quote ---
    const reviewedAt = targetStatus === 'submitted' ? null : new Date().toISOString();

    const { error: updateErr } = await admin
      .from('quotes')
      .update({
        status: targetStatus,
        reviewed_at: reviewedAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', quoteId);

    if (updateErr) {
      return NextResponse.json({
        error: 'Could not update quote status',
        debug: { error_message: updateErr.message, error_code: updateErr.code },
      }, { status: 500 });
    }

    // --- Log to activity_log ---
    const eventType = EVENT_TYPE_BY_TARGET[targetStatus];
    const actionLabel = ACTION_LABEL_BY_TARGET[targetStatus];
    const eventSummary = `${actorName} ${actionLabel} ${carrierName}'s quote for ${rfpName}`;

    const { error: logErr } = await admin
      .from('activity_log')
      .insert({
        agency_id: agencyId,
        client_id: clientId,
        actor_user_id: userId,
        actor_name: actorName,
        event_type: eventType,
        event_summary: eventSummary,
        metadata: {
          quote_id: quoteId,
          rfp_id: quoteRow.rfp_id,
          carrier_id: quoteRow.carrier_id,
          previous_status: previousStatus,
          new_status: targetStatus,
        },
      });

    if (logErr) {
      // Don't fail the request if logging fails — surface in debug
      console.error('activity_log insert failed:', logErr);
    }

    return NextResponse.json({
      success: true,
      quote_id: quoteId,
      previous_status: previousStatus,
      new_status: targetStatus,
      reviewed_at: reviewedAt,
      log_warning: logErr ? logErr.message : null,
    });
  } catch (err: any) {
    console.error('Review API error:', err);
    return NextResponse.json({
      error: 'Internal server error',
      debug: { message: err?.message || String(err) },
    }, { status: 500 });
  }
}