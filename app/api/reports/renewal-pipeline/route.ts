import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@supabase/supabase-js';
import React from 'react';
import {
  RenewalPipelinePDF,
  RenewalRow,
} from '../../../components/pdf/RenewalPipelinePDF';

// =====================================================
// RENEWAL PIPELINE PDF
// Real if clients.renewal_date is set, mock otherwise.
// =====================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Mock carriers for synthesized data
const MOCK_CARRIERS = [
  'Blue Cross Blue Shield',
  'Aetna',
  'United Healthcare',
  'Cigna',
  'Anthem',
  'Kaiser Permanente',
  'Humana',
];

// Deterministic-ish hash for stable mock generation per client
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function daysBetween(future: Date, now: Date): number {
  const ms = future.getTime() - now.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Look up the broker + agency
    const { data: brokerRow, error: brokerError } = await supabase
      .from('brokers')
      .select('agency_id, agencies(name)')
      .eq('user_id', userId)
      .maybeSingle();

    if (brokerError || !brokerRow) {
      console.error('Broker lookup error:', brokerError);
      return NextResponse.json(
        { error: 'Broker profile not found' },
        { status: 404 }
      );
    }

    const agencyName = (brokerRow.agencies as any)?.name || 'Your Agency';
    const agencyId = brokerRow.agency_id;

    // Get broker name from auth metadata
    let brokerName = 'Your Broker';
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      const meta = userData?.user?.user_metadata || {};
      const fn = meta.first_name || '';
      const ln = meta.last_name || '';
      const fullName = `${fn} ${ln}`.trim();
      if (fullName) brokerName = fullName;
    } catch (nameErr) {
      console.error('Could not fetch broker name (non-fatal):', nameErr);
    }

    // 2. Fetch all clients in this agency
    const { data: allClients, error: clientsError } = await supabase
      .from('clients')
      .select(
        'id, first_name, last_name, employer_name, member_count, state, renewal_date'
      )
      .eq('agency_id', agencyId);

    if (clientsError) {
      console.error('Clients lookup error:', clientsError);
    }

    const clients = (allClients || []) as any[];

    // 3. Determine if we have any real renewal dates
    const realRenewalCount = clients.filter((c) => c.renewal_date).length;
    const isSample = realRenewalCount === 0;

    // 4. Build the row list
    const now = new Date();
    const rows: RenewalRow[] = [];

    if (!isSample) {
      // Real path — only include clients with renewal_date in the next 90 days
      for (const c of clients) {
        if (!c.renewal_date) continue;
        const renewalDate = new Date(c.renewal_date);
        if (Number.isNaN(renewalDate.getTime())) continue;
        const days = daysBetween(renewalDate, now);
        if (days < 0 || days > 90) continue;

        const seed = hashStr(c.id);
        const carrierIdx = seed % MOCK_CARRIERS.length;
        // Estimated annual premium based on group size: ~$8500/member
        const members = c.member_count || 1;
        const estPremium = members * 8500 + (seed % 5000);

        rows.push({
          id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
          employer_name: c.employer_name,
          member_count: c.member_count,
          state: c.state,
          renewal_date: c.renewal_date,
          daysUntil: days,
          estPremium,
          carrier: MOCK_CARRIERS[carrierIdx],
        });
      }
    } else {
      // Sample path — synthesize renewal dates spread across 90 days
      // Use real client data where possible to make the report feel grounded
      const baseClients = clients.length > 0 ? clients : [];

      // If broker has 0 clients, create 3-6 entirely fictional rows
      if (baseClients.length === 0) {
        const fictional = [
          { name: 'Acme Manufacturing', members: 28, state: 'AZ' },
          { name: 'Sunset Realty Group', members: 12, state: 'AZ' },
          { name: 'Desert Tech Co', members: 45, state: 'AZ' },
          { name: 'Pioneer Logistics', members: 67, state: 'NV' },
          { name: 'Lakeside Construction', members: 19, state: 'CA' },
        ];
        fictional.forEach((f, i) => {
          const seed = hashStr(f.name);
          const days = (i * 18 + 12) % 91; // spread across 0-90 days
          const renewalDate = new Date(now);
          renewalDate.setDate(renewalDate.getDate() + days);
          const carrierIdx = seed % MOCK_CARRIERS.length;
          const estPremium = f.members * 8500 + (seed % 5000);
          rows.push({
            id: `mock-${i}`,
            first_name: f.name.split(' ')[0],
            last_name: f.name.split(' ').slice(1).join(' '),
            employer_name: f.name,
            member_count: f.members,
            state: f.state,
            renewal_date: renewalDate.toISOString().slice(0, 10),
            daysUntil: days,
            estPremium,
            carrier: MOCK_CARRIERS[carrierIdx],
          });
        });
      } else {
        // Use real clients but synthesize renewal dates
        baseClients.forEach((c, i) => {
          const seed = hashStr(c.id);
          // Spread across 0-90 days using the client ID hash
          const days = ((seed % 91) + i * 7) % 91;
          const renewalDate = new Date(now);
          renewalDate.setDate(renewalDate.getDate() + days);
          const carrierIdx = seed % MOCK_CARRIERS.length;
          const members = c.member_count || (seed % 30) + 5;
          const estPremium = members * 8500 + (seed % 5000);
          rows.push({
            id: c.id,
            first_name: c.first_name,
            last_name: c.last_name,
            employer_name: c.employer_name,
            member_count: members,
            state: c.state,
            renewal_date: renewalDate.toISOString().slice(0, 10),
            daysUntil: days,
            estPremium,
            carrier: MOCK_CARRIERS[carrierIdx],
          });
        });
      }
    }

    // 5. Bucket the rows by 30/60/90 windows
    const renewals30 = rows
      .filter((r) => r.daysUntil <= 30)
      .sort((a, b) => a.daysUntil - b.daysUntil);
    const renewals60 = rows
      .filter((r) => r.daysUntil > 30 && r.daysUntil <= 60)
      .sort((a, b) => a.daysUntil - b.daysUntil);
    const renewals90 = rows
      .filter((r) => r.daysUntil > 60 && r.daysUntil <= 90)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    // 6. Render the PDF
    const doc = React.createElement(RenewalPipelinePDF, {
      agencyName,
      brokerName,
      isSample,
      renewals30,
      renewals60,
      renewals90,
    });

    const pdfBuffer = await renderToBuffer(doc as any);

    // 7. Log activity
    try {
      await supabase.from('activity_log').insert({
        agency_id: agencyId,
        client_id: null,
        actor_user_id: userId,
        event_type: 'report_generated',
        event_data: {
          report_type: 'renewal_pipeline',
          is_sample: isSample,
          total_renewals: rows.length,
        },
      });
    } catch (logErr) {
      console.error('Activity log write failed (non-fatal):', logErr);
    }

    // 8. Filename
    const today = new Date().toISOString().slice(0, 10);
    const safeAgency = agencyName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const fileName = `${safeAgency}-renewal-pipeline-${today}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (err: any) {
    console.error('Renewal pipeline PDF error:', err);
    return NextResponse.json(
      {
        error: 'Failed to generate PDF',
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}