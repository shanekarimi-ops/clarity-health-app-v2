import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@supabase/supabase-js';
import React from 'react';
import { BrandedPDF, reportStyles } from '../../../components/pdf/BrandedPDF';
import { Text, View } from '@react-pdf/renderer';

// =====================================================
// TEST PDF GENERATION ROUTE
// Used to verify the PDF pipeline works on Vercel.
// We'll remove this in Push 5.
// =====================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // Use service role for server-side data access
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Look up the broker's agency name
    const { data: brokerRow, error: brokerError } = await supabase
      .from('brokers')
      .select('agency_id, agencies(name)')
      .eq('user_id', userId)
      .maybeSingle();

    if (brokerError) {
      console.error('Broker lookup error:', brokerError);
    }

    const agencyName =
      (brokerRow?.agencies as any)?.name || 'Your Agency';

    // Build the test PDF document
    const doc = React.createElement(
      BrandedPDF,
      {
        agencyName,
        reportTitle: 'Test Report',
        reportSubtitle:
          'This is a test PDF to verify the generation pipeline.',
      },
      React.createElement(
        View,
        { style: reportStyles.section },
        React.createElement(
          Text,
          { style: reportStyles.sectionTitle },
          'Pipeline Verification'
        ),
        React.createElement(
          Text,
          { style: reportStyles.paragraph },
          'If you can read this, the @react-pdf/renderer library is working correctly on the Vercel deployment.'
        ),
        React.createElement(
          Text,
          { style: reportStyles.paragraph },
          `Agency: ${agencyName}`
        ),
        React.createElement(
          Text,
          { style: reportStyles.paragraph },
          `Generated: ${new Date().toISOString()}`
        )
      ),
      React.createElement(
        View,
        { style: reportStyles.card },
        React.createElement(
          Text,
          { style: reportStyles.label },
          'Status'
        ),
        React.createElement(
          Text,
          { style: reportStyles.value },
          '\u2713 PDF generation working'
        )
      )
    );

    // Render the PDF to a buffer (simpler than stream)
    const pdfBuffer = await renderToBuffer(doc as any);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          'attachment; filename="clarity-health-test.pdf"',
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (err: any) {
    console.error('Test PDF generation error:', err);
    return NextResponse.json(
      {
        error: 'Failed to generate PDF',
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}