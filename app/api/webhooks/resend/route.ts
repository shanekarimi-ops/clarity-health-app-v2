import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 10;

// Resend webhook events we care about
type ResendEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.opened'
  | 'email.clicked'
  | 'email.bounced'
  | 'email.complained';

type ResendWebhookPayload = {
  type: ResendEventType;
  created_at: string;
  data: {
    email_id?: string;
    id?: string;
    to?: string[];
    from?: string;
    subject?: string;
    created_at?: string;
    [key: string]: any;
  };
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_WEBHOOK_SIGNING_SECRET = process.env.RESEND_WEBHOOK_SIGNING_SECRET || '';

export async function POST(req: NextRequest) {
  try {
    // ===== Step 1: Read raw body for signature verification =====
    const rawBody = await req.text();

    // ===== Step 2: Verify Resend signature (Svix) =====
    // Resend uses Svix for webhook signing. Headers:
    //   svix-id, svix-timestamp, svix-signature
    // Signature format: "v1,base64sig v1,base64sig ..." (space-separated, may have multiple versions)
    const svixId = req.headers.get('svix-id');
    const svixTimestamp = req.headers.get('svix-timestamp');
    const svixSignature = req.headers.get('svix-signature');

    if (!RESEND_WEBHOOK_SIGNING_SECRET) {
      console.error('[resend-webhook] RESEND_WEBHOOK_SIGNING_SECRET is not configured');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.warn('[resend-webhook] Missing Svix headers');
      return NextResponse.json({ error: 'Missing signature headers' }, { status: 401 });
    }

    // Reject events older than 5 minutes (replay protection)
    const eventTimestampMs = parseInt(svixTimestamp, 10) * 1000;
    if (Math.abs(Date.now() - eventTimestampMs) > 5 * 60 * 1000) {
      console.warn('[resend-webhook] Stale event rejected:', svixTimestamp);
      return NextResponse.json({ error: 'Event too old' }, { status: 401 });
    }

    // Build signed payload: `${svixId}.${svixTimestamp}.${rawBody}`
    const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;

    // Secret format from Resend: "whsec_BASE64STRING" — strip prefix and decode
    const secretKey = RESEND_WEBHOOK_SIGNING_SECRET.startsWith('whsec_')
      ? RESEND_WEBHOOK_SIGNING_SECRET.slice(6)
      : RESEND_WEBHOOK_SIGNING_SECRET;

    const secretBytes = Buffer.from(secretKey, 'base64');
    const expectedSig = createHmac('sha256', secretBytes)
      .update(signedPayload)
      .digest('base64');

    // svix-signature header looks like "v1,abc123 v1,def456" — check each
    const providedSigs = svixSignature
      .split(' ')
      .map(s => s.split(',')[1])
      .filter(Boolean);

    let sigValid = false;
    const expectedBuf = Buffer.from(expectedSig);
    for (const sig of providedSigs) {
      try {
        const sigBuf = Buffer.from(sig);
        if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
          sigValid = true;
          break;
        }
      } catch {
        // length mismatch or decode error — continue
      }
    }

    if (!sigValid) {
      console.warn('[resend-webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // ===== Step 3: Parse the validated body =====
    let payload: ResendWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const eventType = payload.type;
    const messageId = payload.data?.email_id || payload.data?.id || null;

    if (!messageId) {
      console.warn('[resend-webhook] Event has no message id:', eventType);
      return NextResponse.json({ ok: true, ignored: 'no_message_id' });
    }

    // ===== Step 4: Find the matching rfp_carriers row =====
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: rcRow, error: rcErr } = await admin
      .from('rfp_carriers')
      .select('id, rfp_id, assigned_carrier_user_id, status, first_opened_at, open_count')
      .eq('resend_message_id', messageId)
      .maybeSingle();

    if (rcErr) {
      console.error('[resend-webhook] rfp_carriers lookup error:', rcErr);
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    }

    if (!rcRow) {
      // Event for an unknown message — could be from a test send, or a stale event.
      // Acknowledge so Resend doesn't retry.
      console.log('[resend-webhook] No rfp_carriers row for message:', messageId, 'event:', eventType);
      return NextResponse.json({ ok: true, ignored: 'no_matching_row' });
    }

    // ===== Step 5: Apply the event =====
    const nowIso = payload.created_at || new Date().toISOString();

    if (eventType === 'email.opened') {
      await applyOpenedEvent(admin, rcRow, nowIso);
    } else if (eventType === 'email.delivered') {
      await applyDeliveredEvent(admin, rcRow, nowIso, payload);
    } else if (eventType === 'email.bounced' || eventType === 'email.complained') {
      await applyFailureEvent(admin, rcRow, nowIso, eventType, payload);
    } else {
      // Other events (sent, clicked, delayed) — log but don't update columns
      console.log('[resend-webhook] Logging-only event:', eventType, 'for rfp_carrier:', rcRow.id);
    }

    return NextResponse.json({ ok: true, applied: eventType });
  } catch (err) {
    console.error('[resend-webhook] uncaught error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ===== Event handlers =====

async function applyOpenedEvent(
  admin: ReturnType<typeof createClient>,
  rcRow: { id: string; rfp_id: string; assigned_carrier_user_id: string | null; status: string; first_opened_at: string | null; open_count: number | null },
  nowIso: string
) {
  // Update tracking columns
  const isFirstOpen = !rcRow.first_opened_at;
  const updates: Record<string, any> = {
    last_opened_at: nowIso,
    open_count: (rcRow.open_count ?? 0) + 1,
    updated_at: nowIso,
  };
  if (isFirstOpen) {
    updates.first_opened_at = nowIso;
  }
  // Advance status: sent → opened (only)
  if (rcRow.status === 'sent') {
    updates.status = 'opened';
  }

  const { error: updErr } = await admin
    .from('rfp_carriers')
    .update(updates)
    .eq('id', rcRow.id);

  if (updErr) {
    console.error('[resend-webhook] update opened error:', updErr);
  }

  // Log engagement event — only on first open to keep the log focused.
  // Subsequent opens still increment open_count but don't spam the log.
  if (isFirstOpen) {
    const { error: logErr } = await admin
      .from('rfp_engagement_log')
      .insert({
        rfp_id: rcRow.rfp_id,
        rfp_carrier_id: rcRow.id,
        carrier_user_id: rcRow.assigned_carrier_user_id,
        event_type: 'rfp_opened',
        metadata: { source: 'resend_webhook' },
        occurred_at: nowIso,
      });
    if (logErr) {
      console.error('[resend-webhook] engagement log error:', logErr);
    }
  }
}

async function applyDeliveredEvent(
  admin: ReturnType<typeof createClient>,
  rcRow: { id: string },
  nowIso: string,
  payload: ResendWebhookPayload
) {
  // Delivered is informational — we don't have a column for it, but the engagement log
  // gives the broker visibility that the email made it to the inbox.
  // event_type 'rfp_sent' is reserved for the actual send; we don't have a 'delivered' enum value.
  // So we just log a console line for now and skip writing to engagement_log to respect CHECK constraint.
  console.log('[resend-webhook] Delivered:', rcRow.id, nowIso);
}

async function applyFailureEvent(
  admin: ReturnType<typeof createClient>,
  rcRow: { id: string; rfp_id: string; assigned_carrier_user_id: string | null },
  nowIso: string,
  eventType: 'email.bounced' | 'email.complained',
  payload: ResendWebhookPayload
) {
  // Bounced or complained — log to console so we know, but don't touch rfp_carriers
  // (the CHECK constraint doesn't have a 'bounced' status, and the broker should
  // resend manually rather than auto-failing the row).
  console.warn('[resend-webhook] Failure event:', eventType, 'for rfp_carrier:', rcRow.id, 'data:', payload.data);
}