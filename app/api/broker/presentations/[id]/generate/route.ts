import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { StandardTemplate, type StandardTemplateData } from '../../../../../lib/presentations/standard-template';
import { buildStandardExcel } from '../../../../../lib/presentations/standard-excel';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

// ============================================================================
// POST — render PDF + Excel, upload, update row, return signed URLs
// ============================================================================
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const presentationId = params.id;

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

    // ---- Verify broker → agency match against the presentation ----
    const { data: broker } = await admin
      .from('brokers')
      .select('agency_id, first_name, last_name')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!broker) {
      return NextResponse.json(
        { error: 'No broker profile for this user', debug: { user_id: user.id } },
        { status: 403 }
      );
    }

    // ---- Load the presentation record ----
    const { data: presentation, error: presError } = await admin
      .from('broker_presentations')
      .select('*')
      .eq('id', presentationId)
      .maybeSingle();

    if (presError || !presentation) {
      return NextResponse.json(
        { error: 'Presentation not found', debug: { presentation_id: presentationId, error: presError?.message } },
        { status: 404 }
      );
    }

    if (presentation.agency_id !== broker.agency_id) {
      return NextResponse.json(
        { error: 'Presentation does not belong to your agency' },
        { status: 403 }
      );
    }

    // ---- Assemble the full data graph ----
    // 1. Agency (branding)
    const { data: agency, error: agencyError } = await admin
      .from('agencies')
      .select('id, name, logo_url, primary_color, accent_color')
      .eq('id', presentation.agency_id)
      .maybeSingle();

    if (agencyError || !agency) {
      return NextResponse.json(
        { error: 'Agency not found', debug: { agency_id: presentation.agency_id, error: agencyError?.message } },
        { status: 500 }
      );
    }

    // 2. Client
    const { data: client, error: clientError } = await admin
      .from('clients')
      .select('id, employer_name, member_count, state')
      .eq('id', presentation.client_id)
      .maybeSingle();

    if (clientError || !client) {
      return NextResponse.json(
        { error: 'Client not found', debug: { client_id: presentation.client_id, error: clientError?.message } },
        { status: 500 }
      );
    }

    // 3. RFP
    const { data: rfp, error: rfpError } = await admin
      .from('rfps')
      .select('id, name, effective_date, current_annual_cost')
      .eq('id', presentation.rfp_id)
      .maybeSingle();

    if (rfpError || !rfp) {
      return NextResponse.json(
        { error: 'RFP not found', debug: { rfp_id: presentation.rfp_id, error: rfpError?.message } },
        { status: 500 }
      );
    }

    // 4. Quotes (filtered by included_quote_ids if any, else all submitted+ for the RFP)
    const includedIds: string[] = Array.isArray(presentation.included_quote_ids)
      ? presentation.included_quote_ids
      : [];

    let quotesQuery = admin
      .from('quotes')
      .select(`
        id, carrier_id, total_annual_cost, monthly_cost, cost_change_pct, status, notes, submitted_at,
        carrier:carriers(id, name, logo_url, brand_color)
      `)
      .eq('rfp_id', rfp.id);

    if (includedIds.length > 0) {
      quotesQuery = quotesQuery.in('id', includedIds);
    } else {
      quotesQuery = quotesQuery.in('status', ['submitted', 'reviewed', 'shortlisted']);
    }

    const { data: quotes, error: quotesError } = await quotesQuery;

    if (quotesError) {
      return NextResponse.json(
        { error: 'Failed to load quotes', debug: { error: quotesError.message } },
        { status: 500 }
      );
    }

    // 5. Quote lines (one query for all quotes)
    const quoteIds = (quotes || []).map((q: any) => q.id);
    let lines: any[] = [];
    if (quoteIds.length > 0) {
      const { data: lineRows, error: linesError } = await admin
        .from('quote_lines')
        .select('*')
        .in('quote_id', quoteIds);

      if (linesError) {
        return NextResponse.json(
          { error: 'Failed to load quote lines', debug: { error: linesError.message } },
          { status: 500 }
        );
      }
      lines = lineRows || [];
    }

    // ---- Shape the data for the template ----
    const templateData: StandardTemplateData = {
      agency: {
        name: agency.name,
        logo_url: agency.logo_url,
        primary_color: agency.primary_color,
        accent_color: agency.accent_color,
      },
      client: {
        employer_name: client.employer_name,
        member_count: client.member_count,
        state: client.state,
      },
      rfp: {
        id: rfp.id,
        name: rfp.name,
        effective_date: rfp.effective_date,
        current_annual_cost: rfp.current_annual_cost,
      },
      quotes: (quotes || []).map((q: any) => ({
        quote_id: q.id,
        carrier_name: q.carrier?.name || 'Unknown Carrier',
        carrier_logo_url: q.carrier?.logo_url || null,
        carrier_brand_color: q.carrier?.brand_color || null,
        total_annual_cost: q.total_annual_cost,
        monthly_cost: q.monthly_cost,
        cost_change_pct: q.cost_change_pct,
        status: q.status,
        notes: q.notes,
        lines: lines
          .filter((l: any) => l.quote_id === q.id)
          .map((l: any) => ({
            id: l.id,
            benefit_type: l.benefit_type,
            plan_name: l.plan_name,
            monthly_premium: l.monthly_premium,
            annual_cost: l.annual_cost,
            plan_design: l.plan_design,
            tier_rates: l.tier_rates,
          })),
      })),
      generated_by_name: presentation.generated_by_name,
      generated_at: new Date().toISOString(),
    };

    // ---- Render PDF ----
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderToBuffer(
        React.createElement(StandardTemplate, { data: templateData })
      );
    } catch (renderErr: any) {
      console.error('PDF render error:', renderErr);
      return NextResponse.json(
        { error: 'PDF rendering failed', debug: { message: renderErr?.message } },
        { status: 500 }
      );
    }

    // ---- Render Excel ----
    let excelBuffer: Buffer;
    try {
      excelBuffer = await buildStandardExcel(templateData);
    } catch (excelErr: any) {
      console.error('Excel render error:', excelErr);
      return NextResponse.json(
        { error: 'Excel rendering failed', debug: { message: excelErr?.message } },
        { status: 500 }
      );
    }

    // ---- Upload both to Storage ----
    const timestamp = Date.now();
    const safeTitle = (presentation.title || 'presentation')
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .slice(0, 60);
    const pdfPath = `${presentation.agency_id}/${presentationId}/${safeTitle}_${timestamp}.pdf`;
    const excelPath = `${presentation.agency_id}/${presentationId}/${safeTitle}_${timestamp}.xlsx`;

    const { error: pdfUploadError } = await admin.storage
      .from('presentations')
      .upload(pdfPath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (pdfUploadError) {
      return NextResponse.json(
        { error: 'Failed to upload PDF', debug: { error: pdfUploadError.message, path: pdfPath } },
        { status: 500 }
      );
    }

    const { error: excelUploadError } = await admin.storage
      .from('presentations')
      .upload(excelPath, excelBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      });

    if (excelUploadError) {
      return NextResponse.json(
        { error: 'Failed to upload Excel', debug: { error: excelUploadError.message, path: excelPath } },
        { status: 500 }
      );
    }

    // ---- Generate signed URLs ----
    const { data: pdfSigned, error: pdfSignError } = await admin.storage
      .from('presentations')
      .createSignedUrl(pdfPath, SIGNED_URL_TTL_SECONDS);

    const { data: excelSigned, error: excelSignError } = await admin.storage
      .from('presentations')
      .createSignedUrl(excelPath, SIGNED_URL_TTL_SECONDS);

    if (pdfSignError || excelSignError) {
      return NextResponse.json(
        {
          error: 'Failed to sign URLs',
          debug: {
            pdf_error: pdfSignError?.message,
            excel_error: excelSignError?.message,
          },
        },
        { status: 500 }
      );
    }

    // ---- Update the presentation row with the storage paths ----
    const { data: updated, error: updateError } = await admin
      .from('broker_presentations')
      .update({
        pdf_url: pdfPath,
        excel_url: excelPath,
        updated_at: new Date().toISOString(),
      })
      .eq('id', presentationId)
      .select('*')
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update presentation row', debug: { error: updateError.message } },
        { status: 500 }
      );
    }

    // ---- Non-blocking activity log ----
    try {
      const brokerName = [broker.first_name, broker.last_name].filter(Boolean).join(' ').trim() || null;
      await admin.from('activity_log').insert({
        agency_id: presentation.agency_id,
        client_id: presentation.client_id,
        actor_user_id: user.id,
        actor_name: brokerName,
        event_type: 'presentation_generated',
        event_summary: `Generated ${presentation.template} presentation "${presentation.title}"`,
        metadata: {
          presentation_id: presentationId,
          rfp_id: rfp.id,
          template: presentation.template,
          quote_count: templateData.quotes.length,
          pdf_size_bytes: pdfBuffer.length,
          excel_size_bytes: excelBuffer.length,
        },
      });
    } catch (logErr) {
      console.warn('activity_log insert failed (non-blocking):', logErr);
    }

    return NextResponse.json(
      {
        success: true,
        presentation: updated,
        pdf_signed_url: pdfSigned?.signedUrl,
        excel_signed_url: excelSigned?.signedUrl,
        quote_count: templateData.quotes.length,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('POST /api/broker/presentations/[id]/generate error:', err);
    return NextResponse.json(
      { error: 'Internal server error', debug: { message: err?.message } },
      { status: 500 }
    );
  }
}