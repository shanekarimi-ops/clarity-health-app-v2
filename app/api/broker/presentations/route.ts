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

    const body = await req.json();
    const { rfp_id, template = 'standard', title, included_quote_ids, package_id } = body || {};

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

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

    // RFP now references group_id instead of client_id
    const { data: rfp, error: rfpError } = await admin
      .from('rfps')
      .select('id, agency_id, group_id, name')
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

    const finalTitle = (title && title.trim()) || rfp.name;

    let quoteIds: string[] = [];
    let resolvedPackageId: string | null = null;

    if (package_id) {
      const { data: pkg, error: pkgError } = await admin
        .from('packages')
        .select('id, rfp_id, agency_id')
        .eq('id', package_id)
        .maybeSingle();

      if (pkgError || !pkg) {
        return NextResponse.json(
          { error: 'Package not found', debug: { package_id, error: pkgError?.message } },
          { status: 404 }
        );
      }
      if (pkg.rfp_id !== rfp.id) {
        return NextResponse.json(
          { error: 'Package does not belong to this RFP', debug: { package_rfp: pkg.rfp_id, expected_rfp: rfp.id } },
          { status: 400 }
        );
      }
      if (pkg.agency_id !== broker.agency_id) {
        return NextResponse.json(
          { error: 'Package does not belong to your agency' },
          { status: 403 }
        );
      }

      const { data: pkgLines, error: pkgLinesError } = await admin
        .from('package_lines')
        .select('quote_line_id')
        .eq('package_id', package_id);

      if (pkgLinesError) {
        return NextResponse.json(
          { error: 'Failed to load package lines', debug: { error: pkgLinesError.message } },
          { status: 500 }
        );
      }
      if (!pkgLines || pkgLines.length === 0) {
        return NextResponse.json(
          { error: 'Package has no lines. Add at least one line before creating a presentation.', debug: { package_id } },
          { status: 400 }
        );
      }

      const quoteLineIds = pkgLines.map((pl: any) => pl.quote_line_id).filter(Boolean);
      const { data: quoteLines, error: qlError } = await admin
        .from('quote_lines')
        .select('quote_id')
        .in('id', quoteLineIds);

      if (qlError) {
        return NextResponse.json(
          { error: 'Failed to resolve quote lines', debug: { error: qlError.message } },
          { status: 500 }
        );
      }

      quoteIds = Array.from(new Set((quoteLines || []).map((ql: any) => ql.quote_id).filter(Boolean)));
      if (quoteIds.length === 0) {
        return NextResponse.json(
          { error: 'Package lines have no associated quotes', debug: { package_id } },
          { status: 500 }
        );
      }
      resolvedPackageId = package_id;
    } else if (Array.isArray(included_quote_ids) && included_quote_ids.length > 0) {
      quoteIds = included_quote_ids;
    } else {
      const { data: quotes } = await admin
        .from('quotes')
        .select('id')
        .eq('rfp_id', rfp_id)
        .in('status', ['submitted', 'reviewed', 'shortlisted']);
      quoteIds = (quotes || []).map((q: any) => q.id);
    }

    const meta = user.user_metadata || {};
    const brokerName = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim() || null;
    const { data: insert, error: insertError } = await admin
      .from('broker_presentations')
      .insert({
        agency_id: broker.agency_id,
        rfp_id: rfp.id,
        group_id: rfp.group_id, // group_id now flows through from the RFP
        template,
        status: 'draft',
        title: finalTitle,
        included_quote_ids: quoteIds,
        package_id: resolvedPackageId,
        is_package_sourced: resolvedPackageId !== null,
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

    // activity_log no longer carries client_id for group-shaped events
    try {
      await admin.from('activity_log').insert({
        agency_id: broker.agency_id,
        actor_user_id: user.id,
        actor_name: brokerName,
        event_type: 'presentation_created',
        event_summary: `Created ${template} presentation "${finalTitle}"${resolvedPackageId ? ' from package' : ''}`,
        metadata: {
          presentation_id: insert.id,
          rfp_id: rfp.id,
          group_id: rfp.group_id,
          template,
          quote_count: quoteIds.length,
          package_id: resolvedPackageId,
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

    // group:groups join replaces client:clients join
    const { data: rows, error } = await admin
      .from('broker_presentations')
      .select(`
        *,
        rfp:rfps(id, name, effective_date),
        group:groups(id, name)
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