import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@supabase/supabase-js';
import React from 'react';
import { AgencyPerfPDF } from '../../../components/pdf/AgencyPerfPDF';

// =====================================================
// AGENCY PERFORMANCE DASHBOARD PDF
// =====================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId,
      daysBack = 90,
      includeRoster = true,
      includeActivity = true,
      includeCarriers = true,
    } = body;

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

    // Compute the date threshold
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);
    const sinceISO = sinceDate.toISOString();

    const rangeLabel =
      daysBack === 7
        ? 'Last 7 days'
        : daysBack === 30
        ? 'Last 30 days'
        : daysBack === 90
        ? 'Last 90 days'
        : daysBack === 365
        ? 'Last 12 months'
        : `Last ${daysBack} days`;

    // 2. Fetch ALL clients in this agency (RLS will scope correctly)
    const { data: allClients, error: clientsError } = await supabase
      .from('clients')
      .select('id, first_name, last_name, employer_name, member_count, state, created_at, agency_id')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false });

    if (clientsError) {
      console.error('Clients lookup error:', clientsError);
    }

    const clients = (allClients || []) as any[];
    const clientIds = clients.map((c) => c.id);

    // New clients in range
    const newClientsInRange = clients.filter(
      (c) => new Date(c.created_at) >= sinceDate
    ).length;

    // 3. Recommendations count in range (only for this agency's clients)
    let recommendationsCount = 0;
    let recsForCarriers: any[] = [];
    if (clientIds.length > 0) {
      const { data: recsData, error: recsError } = await supabase
        .from('recommendations')
        .select('id, created_at, plans')
        .in('client_id', clientIds)
        .gte('created_at', sinceISO);

      if (recsError) {
        console.error('Recs lookup error (non-fatal):', recsError);
      } else if (recsData) {
        recommendationsCount = recsData.length;
        recsForCarriers = recsData;
      }
    }

    // 4. Documents count in range (claims uploaded by this agency's clients)
    let documentsCount = 0;
    if (clientIds.length > 0) {
      const { count, error: claimsError } = await supabase
        .from('claims')
        .select('id', { count: 'exact', head: true })
        .in('client_id', clientIds)
        .gte('created_at', sinceISO);

      if (claimsError) {
        console.error('Claims count error (non-fatal):', claimsError);
      } else {
        documentsCount = count || 0;
      }
    }

    // 5. Activity log for this agency in range
    let activityRows: any[] = [];
    let activityEventsCount = 0;
    {
      const { data: actData, error: actError } = await supabase
        .from('activity_log')
        .select('id, event_type, event_data, created_at, client_id')
        .eq('agency_id', agencyId)
        .gte('created_at', sinceISO)
        .order('created_at', { ascending: false });

      if (actError) {
        console.error('Activity lookup error (non-fatal):', actError);
      } else if (actData) {
        activityEventsCount = actData.length;
        activityRows = actData;
      }
    }

    // Enrich activity rows with client names
    const clientNameMap: Record<string, string> = {};
    for (const c of clients) {
      clientNameMap[c.id] = `${c.first_name} ${c.last_name}`;
    }
    const enrichedActivity = activityRows.map((r) => ({
      ...r,
      client_name: r.client_id ? clientNameMap[r.client_id] : undefined,
    }));

    // 6. Aggregate Top Carriers from recommendation plans[]
    const carrierMap: Record<string, { count: number; rankSum: number }> = {};
    for (const rec of recsForCarriers) {
      const plans = Array.isArray(rec.plans) ? rec.plans : [];
      for (const plan of plans) {
        const issuer = plan?.issuer;
        const rank = Number(plan?.rank);
        if (!issuer || !Number.isFinite(rank)) continue;
        if (!carrierMap[issuer]) {
          carrierMap[issuer] = { count: 0, rankSum: 0 };
        }
        carrierMap[issuer].count += 1;
        carrierMap[issuer].rankSum += rank;
      }
    }
    const topCarriers = Object.entries(carrierMap)
      .map(([issuer, v]) => ({
        issuer,
        count: v.count,
        avgRank: v.rankSum / v.count,
      }))
      .sort((a, b) => b.count - a.count);

    // 7. Render the PDF
    const doc = React.createElement(AgencyPerfPDF, {
      agencyName,
      brokerName,
      daysBack,
      rangeLabel,
      totalClients: clients.length,
      recommendationsCount,
      documentsCount,
      activityEventsCount,
      newClientsInRange,
      includeRoster,
      includeActivity,
      includeCarriers,
      clients: clients as any,
      activity: enrichedActivity as any,
      topCarriers,
    });

    const pdfBuffer = await renderToBuffer(doc as any);

    // 8. Log activity (best-effort)
    try {
      await supabase.from('activity_log').insert({
        agency_id: agencyId,
        client_id: null,
        actor_user_id: userId,
        event_type: 'report_generated',
        event_data: {
          report_type: 'agency_performance',
          days_back: daysBack,
          include_roster: includeRoster,
          include_activity: includeActivity,
          include_carriers: includeCarriers,
        },
      });
    } catch (logErr) {
      console.error('Activity log write failed (non-fatal):', logErr);
    }

    // 9. Build filename
    const today = new Date().toISOString().slice(0, 10);
    const safeAgency = agencyName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const fileName = `${safeAgency}-performance-${today}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (err: any) {
    console.error('Agency perf PDF error:', err);
    return NextResponse.json(
      {
        error: 'Failed to generate PDF',
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}