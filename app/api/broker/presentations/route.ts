import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const VALID_TEMPLATES = ['standard', 'executive', 'detailed'] as const;

// ============================================================================
// POST — create a new draft presentation
// ============================================================================
export async function POST(req: NextRequest) {
  try {
    // ---- Auth ----
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing Authorization header', debug: { has_header: !!authHeader } },
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
    const { rfp_id, template = 'standard', title, included_quote_ids } = body || {};

    if (!rfp_id) {
      return NextResponse.json(
        { error: 'rfp_id is required', debug: { received: body } },
        { status: 400 }
      );
    }
    if (!VALID_TEMPLATES.includes(template)) {
      return NextResponse.json(
        { error: 'Invalid template', debug: { received: template, valid: VALID_TEMPLATES } },
        { status: 400 }
      );
    }

    // ---- Service-role client for verified writes ----
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ---- Verify broker → agency match against the RFP ----
    const { data: broker, error: brokerError } = await admin
      .from('brokers')
      .select('id, agency_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (brokerError || !broker) {
      return NextResponse.json(
        { error: 'No broker profile found for this user', debug: { user_id: user.id, error: brokerError?.message } },
        { status: 403 }
      );
    }

    const { data: rfp, error: rfpError } = await admin
      .from('rfps')
      .select('id, agency_id, client_id, name')
      .eq('id', rfp_id)
      .maybeSingle();

    if (rfpError || !rfp) {
      return NextResponse.json(
        { error: 'RFP not found', debug: { rfp_id, error: rfpError?.message } },
        { status: 404 }
      );
    }

    if (rfp.agency_id !== broker.agency_id) {
      return NextResponse.json(
        { error: 'RFP does not belong to your agency', debug: { rfp_agency: rfp.agency_id, broker_agency: broker.agency_id } },
        { status: 403 }
      );
    }

    // ---- Default the title if not supplied ----
    const finalTitle = (title && title.trim()) || rfp.name;

    // ---- Default included_quote_ids: all submitted quotes for this RFP ----
    let quoteIds: string[] = Array.isArray(included_quote_ids) ? included_quote_ids : [];
    if (quoteIds.length === 0) {
      const { data: quotes } = await admin
        .from('quotes')
        .select('id')
        .eq('rfp_id', rfp_id)
        .in('status', ['submitted', 'reviewed', 'shortlisted']);
      quoteIds = (quotes || []).map((q: any) => q.id);
    }

    // ---- Insert draft ----
    const meta = user.user_metadata || {};
    const brokerName = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim() || null;
    const { data: insert, error: insertError } = await admin
      .from('broker_presentations')
      .insert({
        agency_id: broker.agency_id,
        rfp_id: rfp.id,
        client_id: rfp.client_id,
        template,
        status: 'draft',
        title: finalTitle,
        included_quote_ids: quoteIds,
        generated_by_user_id: user.id,
        generated_by_name: brokerName,
      })
      .select('*')
      .single();

    if (insertError || !insert) {
      return NextResponse.json(
        { error: 'Failed to create presentation', debug: { error: insertError?.message, code: insertError?.code } },
        { status: 500 }
      );
    }

    // ---- Non-blocking activity log ----
    try {
      await admin.from('activity_log').insert({
        agency_id: broker.agency_id,
        client_id: rfp.client_id,
        actor_user_id: user.id,
        actor_name: brokerName,
        event_type: 'presentation_created',
        event_summary: `Created ${template} presentation "${finalTitle}"`,
        metadata: {
          presentation_id: insert.id,
          rfp_id: rfp.id,
          template,
          quote_count: quoteIds.length,
        },
      });
    } catch (logErr) {
      console.warn('activity_log insert failed (non-blocking):', logErr);
    }

    return NextResponse.json({ success: true, presentation: insert }, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/broker/presentations error:', err);
    return NextResponse.json(
      { error: 'Internal server error', debug: { message: err?.message } },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET — list agency presentations
// ============================================================================
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }
    const accessToken = authHeader.slice(7);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: broker } = await admin
      .from('brokers')
      .select('agency_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!broker) {
      return NextResponse.json({ presentations: [] }, { status: 200 });
    }

    const { data: rows, error } = await admin
      .from('broker_presentations')
      .select(`
        *,
        rfp:rfps(id, name, effective_date),
        client:clients(id, employer_name)
      `)
      .eq('agency_id', broker.agency_id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to load presentations', debug: { error: error.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({ presentations: rows || [] }, { status: 200 });
  } catch (err: any) {
    console.error('GET /api/broker/presentations error:', err);
    return NextResponse.json(
      { error: 'Internal server error', debug: { message: err?.message } },
      { status: 500 }
    );
  }
}