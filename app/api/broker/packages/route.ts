import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const VALID_STATUSES = ['draft', 'locked'] as const;

// ============================================================================
// POST — create a new draft package on an RFP
// ============================================================================
// Body shape:
//   {
//     rfp_id: string (required),
//     name: string (optional, defaults to "Untitled package"),
//     description?: string,
//     member_count_assumption?: number,
//     tier_breakdown?: { employee_only?, employee_spouse?, employee_children?, family? },
//     notes?: string
//   }
// Returns: 201 with { success: true, package: <row> }
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
    const {
      rfp_id,
      name,
      description,
      member_count_assumption,
      tier_breakdown,
      notes,
    } = body || {};

    if (!rfp_id) {
      return NextResponse.json(
        { error: 'rfp_id is required', debug: { received: body } },
        { status: 400 }
      );
    }

    // ---- Validate optional fields ----
    if (member_count_assumption !== undefined && member_count_assumption !== null) {
      if (typeof member_count_assumption !== 'number' || member_count_assumption < 0 || !Number.isFinite(member_count_assumption)) {
        return NextResponse.json(
          { error: 'member_count_assumption must be a non-negative number', debug: { received: member_count_assumption } },
          { status: 400 }
        );
      }
    }

    if (tier_breakdown !== undefined && tier_breakdown !== null) {
      if (typeof tier_breakdown !== 'object' || Array.isArray(tier_breakdown)) {
        return NextResponse.json(
          { error: 'tier_breakdown must be an object', debug: { received: tier_breakdown } },
          { status: 400 }
        );
      }
      const ALLOWED_TIERS = ['employee_only', 'employee_spouse', 'employee_children', 'family'];
      for (const [k, v] of Object.entries(tier_breakdown)) {
        if (!ALLOWED_TIERS.includes(k)) {
          return NextResponse.json(
            { error: `Unknown tier key: ${k}`, debug: { allowed: ALLOWED_TIERS } },
            { status: 400 }
          );
        }
        if (v !== null && (typeof v !== 'number' || v < 0 || !Number.isFinite(v))) {
          return NextResponse.json(
            { error: `tier_breakdown.${k} must be a non-negative number`, debug: { received: v } },
            { status: 400 }
          );
        }
      }
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

    // ---- Build insert payload ----
    const finalName = (name && typeof name === 'string' && name.trim()) || 'Untitled package';

    const insertPayload: any = {
      agency_id: broker.agency_id,
      rfp_id: rfp.id,
      name: finalName,
      description: description ?? null,
      is_recommended: false,
      status: 'draft',
      member_count_assumption: member_count_assumption ?? null,
      tier_breakdown: tier_breakdown ?? null,
      notes: notes ?? null,
      created_by_user_id: user.id,
    };

    const { data: insert, error: insertError } = await admin
      .from('packages')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertError || !insert) {
      return NextResponse.json(
        { error: 'Failed to create package', debug: { error: insertError?.message, code: insertError?.code } },
        { status: 500 }
      );
    }

    // ---- Non-blocking activity log ----
    try {
      const meta = user.user_metadata || {};
      const brokerName = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim() || null;
      await admin.from('activity_log').insert({
        agency_id: broker.agency_id,
        client_id: rfp.client_id,
        actor_user_id: user.id,
        actor_name: brokerName,
        event_type: 'package_created',
        event_summary: `Created package "${finalName}"`,
        metadata: {
          package_id: insert.id,
          rfp_id: rfp.id,
        },
      });
    } catch (logErr) {
      console.warn('activity_log insert failed (non-blocking):', logErr);
    }

    return NextResponse.json({ success: true, package: insert }, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/broker/packages error:', err);
    return NextResponse.json(
      { error: 'Internal server error', debug: { message: err?.message } },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET — list packages for the broker's agency
// ============================================================================
// Query params:
//   ?rfp_id=<uuid>  (optional) — filter to a single RFP
// Returns: { packages: [<row with joined rfp + client>] }
// Sorted by created_at desc, limit 200.
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
      return NextResponse.json({ packages: [] }, { status: 200 });
    }

    // Optional rfp_id filter from query string
    const url = new URL(req.url);
    const rfpIdFilter = url.searchParams.get('rfp_id');

    let query = admin
      .from('packages')
      .select(`
        *,
        rfp:rfps(id, name, effective_date, current_annual_cost),
        line_count:package_lines(count)
      `)
      .eq('agency_id', broker.agency_id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (rfpIdFilter) {
      query = query.eq('rfp_id', rfpIdFilter);
    }

    const { data: rows, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Failed to load packages', debug: { error: error.message } },
        { status: 500 }
      );
    }

    // Flatten the line_count aggregate from Postgrest's [{ count: N }] shape
    // to a plain integer on each row for cleaner UI consumption.
    const packages = (rows || []).map((r: any) => ({
      ...r,
      line_count: Array.isArray(r.line_count) && r.line_count.length > 0
        ? (r.line_count[0]?.count ?? 0)
        : 0,
    }));

    return NextResponse.json({ packages }, { status: 200 });
  } catch (err: any) {
    console.error('GET /api/broker/packages error:', err);
    return NextResponse.json(
      { error: 'Internal server error', debug: { message: err?.message } },
      { status: 500 }
    );
  }
}