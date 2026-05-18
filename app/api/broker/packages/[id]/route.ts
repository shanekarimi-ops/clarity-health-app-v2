import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ============================================================================
// GET — fetch a single package with all its lines and RFP context
// ============================================================================
// URL: /api/broker/packages/[id]
// Returns: 200 with {
//   package: { ...header, snapshot fields, rfp: {...} },
//   lines: [ { id, benefit_type, display_order, contribution_split,
//              quote_line: { ...rates + plan_design },
//              quote: { carrier_name, carrier_brand_color } } ]
//   available_quote_lines: [...]  — quote_lines from this RFP that aren't
//                                    yet in the package (for the Add Line picker)
// }
// ============================================================================
export async function GET(
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

    // ---- Load package + RFP context ----
    const { data: pkg, error: pkgError } = await admin
      .from('packages')
      .select(`
        *,
        rfp:rfps(id, name, effective_date, current_annual_cost, client_id),
        client:clients(id, employer_name)
      `)
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

    // The clients join via rfps requires a manual step since the FK isn't direct.
    // Pull the client separately if not already on the rfp join.
    let clientRow: any = (pkg as any).client;
    if (!clientRow && (pkg as any).rfp?.client_id) {
      const { data: c } = await admin
        .from('clients')
        .select('id, employer_name')
        .eq('id', (pkg as any).rfp.client_id)
        .maybeSingle();
      clientRow = c;
    }

    // ---- Load package_lines with joined quote_line + quote + carrier ----
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

    // ---- Load available quote_lines for the Add Line picker ----
    // All quote_lines that belong to a quote on this RFP, excluding those already in the package.
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

    // Flatten + filter out already-used quote_lines
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

    // Sort by benefit_type then carrier for stable UI ordering
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