import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@supabase/supabase-js';
import React from 'react';
import { ClientRecPDF } from '../../../components/pdf/ClientRecPDF';

// =====================================================
// CLIENT RECOMMENDATION PDF GENERATION
// Generates a white-label, agency-branded PDF for a
// specific recommendation run on a specific client.
// =====================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId,
      clientId,
      recId,
      includeClaims = true,
      includeReasoning = true,
      topN = 5,
    } = body;

    if (!userId || !clientId || !recId) {
      return NextResponse.json(
        { error: 'userId, clientId, and recId are required' },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Look up the broker + agency
    const { data: brokerRow, error: brokerError } = await supabase
      .from('brokers')
      .select('agency_id, first_name, last_name, agencies(name)')
      .eq('user_id', userId)
      .maybeSingle();

    if (brokerError || !brokerRow) {
      console.error('Broker lookup error:', brokerError);
      return NextResponse.json(
        { error: 'Broker profile not found' },
        { status: 404 }
      );
    }

    const agencyName =
      (brokerRow.agencies as any)?.name || 'Your Agency';
    const brokerName =
      `${brokerRow.first_name || ''} ${brokerRow.last_name || ''}`.trim() ||
      'Your Broker';
    const agencyId = brokerRow.agency_id;

    // 2. Fetch the client
    const { data: clientData, error: clientError } = await supabase
      .from('clients')
      .select(
        'id, first_name, last_name, employer_name, member_count, state'
      )
      .eq('id', clientId)
      .maybeSingle();

    if (clientError || !clientData) {
      console.error('Client lookup error:', clientError);
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      );
    }

    // 3. Fetch the recommendation
    const { data: recData, error: recError } = await supabase
      .from('recommendations')
      .select('*')
      .eq('id', recId)
      .maybeSingle();

    if (recError || !recData) {
      console.error('Recommendation lookup error:', recError);
      return NextResponse.json(
        { error: 'Recommendation not found' },
        { status: 404 }
      );
    }

    // Sanity check: rec must belong to this client
    if (recData.client_id !== clientId) {
      return NextResponse.json(
        { error: 'Recommendation does not belong to this client' },
        { status: 403 }
      );
    }

    // 4. Fetch all parsed claims for this client (only if requested)
    let claimsData: any[] = [];
    if (includeClaims) {
      const { data: claims, error: claimsError } = await supabase
        .from('claims_parsed')
        .select(
          'conditions, procedures, medications, specialty_visits_count, prescription_count, total_billed, total_out_of_pocket, provider_name, summary_text, parse_status'
        )
        .eq('client_id', clientId)
        .eq('parse_status', 'success');

      if (claimsError) {
        console.error('Claims lookup error (non-fatal):', claimsError);
      } else if (claims) {
        claimsData = claims;
      }
    }

    // 5. Render the PDF
    const doc = React.createElement(ClientRecPDF, {
      agencyName,
      brokerName,
      client: clientData as any,
      rec: recData as any,
      claims: claimsData as any,
      includeClaims,
      includeReasoning,
      topN,
    });

    const pdfBuffer = await renderToBuffer(doc as any);

    // 6. Log activity (best-effort — don't fail the PDF if logging fails)
    try {
      await supabase.from('activity_log').insert({
        agency_id: agencyId,
        client_id: clientId,
        actor_user_id: userId,
        event_type: 'report_generated',
        event_data: {
          report_type: 'client_recommendation',
          recommendation_id: recId,
          client_name: `${clientData.first_name} ${clientData.last_name}`,
          include_claims: includeClaims,
          include_reasoning: includeReasoning,
          top_n: topN,
        },
      });
    } catch (logErr) {
      console.error('Activity log write failed (non-fatal):', logErr);
    }

    // 7. Return PDF as download
    const safeFileName = `${clientData.first_name}-${clientData.last_name}-recommendations`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-');

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeFileName}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (err: any) {
    console.error('Client rec PDF error:', err);
    return NextResponse.json(
      {
        error: 'Failed to generate PDF',
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}