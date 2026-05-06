// app/api/reports/commission/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@supabase/supabase-js';
import React from 'react';
import {
  CommissionReportPDF,
  CommissionLineItem,
  CarrierBreakdown,
} from '../../../components/pdf/CommissionReportPDF';

// =====================================================
// COMMISSION REPORT (PDF or CSV) — fully mock data
// Synthesizes plausible commission figures based on
// the broker's real client roster.
// =====================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MOCK_CARRIERS = [
  'Blue Cross Blue Shield',
  'Aetna',
  'United Healthcare',
  'Cigna',
  'Anthem',
];

// Commission rates by carrier (mock standard rates)
const CARRIER_RATES: Record<string, number> = {
  'Blue Cross Blue Shield': 0.045,
  Aetna: 0.04,
  'United Healthcare': 0.05,
  Cigna: 0.038,
  Anthem: 0.042,
};

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ---- CSV HELPERS ----
// RFC 4180 cell escape: wrap in quotes if contains comma/quote/newline,
// double up internal quotes.
function csvCell(v: any): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cells: any[]): string {
  return cells.map(csvCell).join(',');
}

function fmtMoney(n: number): string {
  // CSV consumers expect plain numbers OR quoted "$X,XXX". We use quoted dollar-formatted
  // for human readability; Excel still parses neighboring numeric columns fine.
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function fmtRate(r: number): string {
  return `${(r * 100).toFixed(2)}%`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, period = 'ytd', format = 'pdf' } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    if (format !== 'pdf' && format !== 'csv') {
      return NextResponse.json(
        { error: 'format must be "pdf" or "csv"' },
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

    // 2. Fetch real clients for line items
    const { data: allClients, error: clientsError } = await supabase
      .from('clients')
      .select('id, first_name, last_name, employer_name, member_count')
      .eq('agency_id', agencyId);

    if (clientsError) {
      console.error('Clients lookup error:', clientsError);
    }

    let clients = (allClients || []) as any[];

    // If broker has no clients, generate fictional ones
    if (clients.length === 0) {
      clients = [
        { id: 'mock-1', first_name: 'Acme', last_name: 'Manufacturing', employer_name: 'Acme Manufacturing', member_count: 28 },
        { id: 'mock-2', first_name: 'Sunset', last_name: 'Realty', employer_name: 'Sunset Realty Group', member_count: 12 },
        { id: 'mock-3', first_name: 'Desert', last_name: 'Tech', employer_name: 'Desert Tech Co', member_count: 45 },
        { id: 'mock-4', first_name: 'Pioneer', last_name: 'Logistics', employer_name: 'Pioneer Logistics', member_count: 67 },
        { id: 'mock-5', first_name: 'Lakeside', last_name: 'Construction', employer_name: 'Lakeside Construction', member_count: 19 },
      ];
    }

    // 3. Generate line items for each client
    const lineItems: CommissionLineItem[] = [];
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);

    for (const c of clients) {
      const seed = hashStr(c.id);
      const carrierIdx = seed % MOCK_CARRIERS.length;
      const carrier = MOCK_CARRIERS[carrierIdx];
      const commissionRate = CARRIER_RATES[carrier] || 0.04;
      const members = c.member_count || (seed % 30) + 5;

      // Effective date: somewhere in the last 18 months
      const monthsBack = (seed % 18);
      const effectiveDate = new Date(now);
      effectiveDate.setMonth(effectiveDate.getMonth() - monthsBack);
      effectiveDate.setDate(1);

      // Annual premium: ~$8,500 per member + variance
      const annualPremium = members * 8500 + (seed % 5000);
      const commissionAmount = Math.round(annualPremium * commissionRate);

      // Status: randomized but stable per client
      const statusSeed = seed % 10;
      const status: 'paid' | 'pending' | 'projected' =
        statusSeed < 5 ? 'paid' : statusSeed < 8 ? 'pending' : 'projected';

      const clientName = c.employer_name || `${c.first_name} ${c.last_name}`;

      lineItems.push({
        carrier,
        clientName,
        groupSize: members,
        effectiveDate: effectiveDate.toISOString().slice(0, 10),
        annualPremium,
        commissionRate,
        commissionAmount,
        status,
      });
    }

    // Sort line items by commission amount desc
    lineItems.sort((a, b) => b.commissionAmount - a.commissionAmount);

    // 4. Aggregate carrier breakdowns
    const carrierMap: Record<
      string,
      { clientCount: number; totalPremium: number; totalCommission: number; rateSum: number }
    > = {};

    for (const item of lineItems) {
      if (!carrierMap[item.carrier]) {
        carrierMap[item.carrier] = {
          clientCount: 0,
          totalPremium: 0,
          totalCommission: 0,
          rateSum: 0,
        };
      }
      carrierMap[item.carrier].clientCount += 1;
      carrierMap[item.carrier].totalPremium += item.annualPremium;
      carrierMap[item.carrier].totalCommission += item.commissionAmount;
      carrierMap[item.carrier].rateSum += item.commissionRate;
    }

    const carrierBreakdowns: CarrierBreakdown[] = Object.entries(carrierMap)
      .map(([carrier, v]) => ({
        carrier,
        clientCount: v.clientCount,
        totalPremium: v.totalPremium,
        totalCommission: v.totalCommission,
        avgRate: v.rateSum / v.clientCount,
      }))
      .sort((a, b) => b.totalCommission - a.totalCommission);

    // 5. Totals by status
    let totalCommissionPaid = 0;
    let totalCommissionPending = 0;
    let totalCommissionProjected = 0;
    let totalAnnualPremium = 0;

    for (const item of lineItems) {
      totalAnnualPremium += item.annualPremium;
      if (item.status === 'paid') totalCommissionPaid += item.commissionAmount;
      else if (item.status === 'pending')
        totalCommissionPending += item.commissionAmount;
      else totalCommissionProjected += item.commissionAmount;
    }

    const periodLabel =
      period === 'ytd'
        ? `Year-to-date (${yearStart.getFullYear()})`
        : period === 'q1'
        ? 'Q1 ' + now.getFullYear()
        : period === 'last12'
        ? 'Last 12 months'
        : 'Year-to-date';

    const today = new Date().toISOString().slice(0, 10);
    const safeAgency = agencyName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // 7. Log activity (do this once, regardless of format)
    try {
      await supabase.from('activity_log').insert({
        agency_id: agencyId,
        client_id: null,
        actor_user_id: userId,
        event_type: 'report_generated',
        event_data: {
          report_type: 'commission_report',
          is_sample: true,
          period,
          format,
          line_item_count: lineItems.length,
        },
      });
    } catch (logErr) {
      console.error('Activity log write failed (non-fatal):', logErr);
    }

    // ===== CSV BRANCH =====
    if (format === 'csv') {
      const lines: string[] = [];

      // Header block
      lines.push(csvRow(['Clarity Health — Commission Report']));
      lines.push(csvRow(['Agency', agencyName]));
      lines.push(csvRow(['Broker', brokerName]));
      lines.push(csvRow(['Period', periodLabel]));
      lines.push(csvRow(['Generated', today]));
      lines.push('');

      // Totals block
      lines.push(csvRow(['TOTALS']));
      lines.push(csvRow(['Metric', 'Amount']));
      lines.push(csvRow(['Total Annual Premium', fmtMoney(totalAnnualPremium)]));
      lines.push(csvRow(['Commission Paid', fmtMoney(totalCommissionPaid)]));
      lines.push(csvRow(['Commission Pending', fmtMoney(totalCommissionPending)]));
      lines.push(csvRow(['Commission Projected', fmtMoney(totalCommissionProjected)]));
      lines.push(csvRow([
        'Total Commission',
        fmtMoney(totalCommissionPaid + totalCommissionPending + totalCommissionProjected),
      ]));
      lines.push('');

      // Carrier breakdown
      lines.push(csvRow(['CARRIER BREAKDOWN']));
      lines.push(csvRow([
        'Carrier',
        'Clients',
        'Total Annual Premium',
        'Total Commission',
        'Avg Rate',
      ]));
      for (const cb of carrierBreakdowns) {
        lines.push(csvRow([
          cb.carrier,
          cb.clientCount,
          fmtMoney(cb.totalPremium),
          fmtMoney(cb.totalCommission),
          fmtRate(cb.avgRate),
        ]));
      }
      lines.push('');

      // Line items
      lines.push(csvRow(['LINE ITEMS']));
      lines.push(csvRow([
        'Carrier',
        'Client',
        'Group Size',
        'Effective Date',
        'Annual Premium',
        'Commission Rate',
        'Commission Amount',
        'Status',
      ]));
      for (const item of lineItems) {
        lines.push(csvRow([
          item.carrier,
          item.clientName,
          item.groupSize,
          item.effectiveDate,
          fmtMoney(item.annualPremium),
          fmtRate(item.commissionRate),
          fmtMoney(item.commissionAmount),
          item.status,
        ]));
      }

      // BOM for Excel UTF-8 compatibility + CRLF line endings (CSV convention)
      const csv = '\uFEFF' + lines.join('\r\n') + '\r\n';
      const fileName = `${safeAgency}-commission-${today}.csv`;

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      });
    }

    // ===== PDF BRANCH (default) =====
    const doc = React.createElement(CommissionReportPDF, {
      agencyName,
      brokerName,
      periodLabel,
      totalCommissionPaid,
      totalCommissionPending,
      totalCommissionProjected,
      totalAnnualPremium,
      carrierBreakdowns,
      lineItems,
    });

    const pdfBuffer = await renderToBuffer(doc as any);
    const fileName = `${safeAgency}-commission-${today}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (err: any) {
    console.error('Commission report error:', err);
    return NextResponse.json(
      {
        error: 'Failed to generate report',
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}