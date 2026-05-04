import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import CompliancePDF from '../../../components/pdf/CompliancePDF';

export const maxDuration = 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type PeriodKey = 'current' | 'last' | 'forward';

const PERIOD_LABELS: Record<PeriodKey, string> = {
  current: 'Current Plan Year',
  last: 'Last Plan Year',
  forward: 'Looking Forward',
};

type ComplianceStatus = 'on_track' | 'action_needed' | 'overdue';

// Deterministic hash so sample numbers stay stable across runs.
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Status weighting per period — current year skews on track,
// last year is mostly resolved, forward is mostly upcoming.
function pickStatus(seed: number, periodKey: PeriodKey): ComplianceStatus {
  const r = seed % 100;
  if (periodKey === 'current') {
    if (r < 65) return 'on_track';
    if (r < 90) return 'action_needed';
    return 'overdue';
  }
  if (periodKey === 'last') {
    if (r < 85) return 'on_track';
    if (r < 95) return 'action_needed';
    return 'overdue';
  }
  // forward
  if (r < 50) return 'on_track';
  if (r < 85) return 'action_needed';
  return 'overdue';
}

function statusLabelFor(status: ComplianceStatus, kind: '1095c' | 'sbc' | '5500'): string {
  if (kind === '1095c') {
    if (status === 'on_track') return 'Filed';
    if (status === 'action_needed') return 'In Progress';
    return 'Not Filed';
  }
  if (kind === 'sbc') {
    if (status === 'on_track') return 'Distributed';
    if (status === 'action_needed') return 'Partial';
    return 'Not Sent';
  }
  // 5500
  if (status === 'on_track') return 'Filed';
  if (status === 'action_needed') return 'In Progress';
  return 'Past Due';
}

function aleStatusFor(employeeCount: number): string {
  if (employeeCount >= 50) return 'ALE';
  if (employeeCount >= 40) return 'Borderline';
  return 'Non-ALE';
}

function filingTypeFor(employeeCount: number): string {
  if (employeeCount >= 100) return '5500';
  if (employeeCount >= 80) return '5500-SF';
  return 'Exempt';
}

// Format YYYY-MM-DD as e.g. "Mar 31, 2026"
function formatDeadline(year: number, month: number, day: number): string {
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function noteFor(status: ComplianceStatus, kind: '5500'): string {
  if (status === 'on_track') return 'Filed on time';
  if (status === 'action_needed') return 'Awaiting auditor';
  return 'Past due — needs filing';
}

function methodFor(seed: number): string {
  const methods = ['Email', 'Portal', 'Mail', 'In-person'];
  return methods[seed % methods.length];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId: string = body.userId;
    const periodKey: PeriodKey = (body.periodKey as PeriodKey) || 'current';

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Missing userId' },
        { status: 400 }
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Get broker -> agency
    const { data: brokerRow, error: brokerErr } = await admin
      .from('brokers')
      .select('agency_id, agencies(name)')
      .eq('user_id', userId)
      .single();

    if (brokerErr || !brokerRow) {
      return NextResponse.json(
        { success: false, error: 'Broker profile not found' },
        { status: 404 }
      );
    }

    const agencyId = brokerRow.agency_id;
    const agencyName = (brokerRow.agencies as any)?.name || 'Your Agency';

    // 2. Broker name from auth metadata (per S20 pattern)
    const { data: userResp } = await admin.auth.admin.getUserById(userId);
    const meta = userResp?.user?.user_metadata || {};
    const brokerName =
      `${meta.first_name || ''} ${meta.last_name || ''}`.trim() ||
      userResp?.user?.email ||
      'Broker';

    // 3. Get real client roster — one row per client = one row per group in the report
    const { data: clientRows } = await admin
      .from('clients')
      .select('id, first_name, last_name, employer_name, member_count')
      .eq('agency_id', agencyId)
      .order('first_name', { ascending: true });

    // If we have no clients, synthesize 5 fake group names so the report isn't empty
    const fallbackGroups = [
      { id: 'mock-1', employer_name: 'Acme Manufacturing', member_count: 142 },
      { id: 'mock-2', employer_name: 'Riverside Logistics', member_count: 87 },
      { id: 'mock-3', employer_name: 'Bluebird Cafe Group', member_count: 38 },
      { id: 'mock-4', employer_name: 'Summit Tech Solutions', member_count: 65 },
      { id: 'mock-5', employer_name: 'Northstar Healthcare', member_count: 215 },
    ];

    type Group = { id: string; name: string; employees: number };

    const groups: Group[] = (clientRows && clientRows.length > 0)
      ? clientRows.map((c: any) => ({
          id: c.id,
          name: c.employer_name || `${c.first_name} ${c.last_name}`,
          employees: c.member_count || 25,
        }))
      : fallbackGroups.map((g) => ({
          id: g.id,
          name: g.employer_name,
          employees: g.member_count,
        }));

    // 4. Synthesize sample compliance data deterministically (seeded by agencyId + group id)
    const periodLabel = PERIOD_LABELS[periodKey];

    // Determine deadline year based on period
    const baseYear = periodKey === 'last' ? 2025 : periodKey === 'forward' ? 2027 : 2026;

    const acaRows: any[] = [];
    const sbcRows: any[] = [];
    const form5500Rows: any[] = [];

    let totalOnTrack = 0;
    let totalActionNeeded = 0;
    let totalOverdue = 0;

    function tally(status: ComplianceStatus) {
      if (status === 'on_track') totalOnTrack++;
      else if (status === 'action_needed') totalActionNeeded++;
      else totalOverdue++;
    }

    for (const group of groups) {
      const groupSeed = hashStr(group.id + agencyId);

      // ACA row — only show ALEs and borderline (Non-ALE skips this filing)
      const aleStatus = aleStatusFor(group.employees);
      if (aleStatus !== 'Non-ALE') {
        const acaStatus = pickStatus(groupSeed + 1, periodKey);
        acaRows.push({
          groupName: group.name,
          employeeCount: group.employees,
          aleStatus,
          filing1095Status: acaStatus,
          filing1095Label: statusLabelFor(acaStatus, '1095c'),
          deadline: formatDeadline(baseYear, 3, 31),
        });
        tally(acaStatus);
      }

      // SBC row — applies to all groups
      const sbcStatus = pickStatus(groupSeed + 2, periodKey);
      const sbcMonth = (groupSeed % 11) + 1; // 1-11
      const sbcDay = (groupSeed % 27) + 1; // 1-27 (avoid month-end edge cases)
      sbcRows.push({
        groupName: group.name,
        sentDate: formatDeadline(baseYear, sbcMonth, sbcDay),
        recipientCount: group.employees,
        method: methodFor(groupSeed),
        status: sbcStatus,
        statusLabel: statusLabelFor(sbcStatus, 'sbc'),
      });
      tally(sbcStatus);

      // 5500 row — only show groups with 80+ employees (smaller groups exempt or use SF)
      if (group.employees >= 80) {
        const f5500Status = pickStatus(groupSeed + 3, periodKey);
        form5500Rows.push({
          groupName: group.name,
          filingType: filingTypeFor(group.employees),
          deadline: formatDeadline(baseYear, 7, 31),
          status: f5500Status,
          statusLabel: statusLabelFor(f5500Status, '5500'),
          notes: noteFor(f5500Status, '5500'),
        });
        tally(f5500Status);
      }
    }

    // 5. Render the PDF
    const pdfBuffer = await renderToBuffer(
      React.createElement(CompliancePDF, {
        data: {
          agencyName,
          periodLabel,
          totalOnTrack,
          totalActionNeeded,
          totalOverdue,
          acaRows,
          sbcRows,
          form5500Rows,
        },
      }) as any
    );

    // 6. Log the activity (best effort)
    try {
      await admin.from('activity_log').insert({
        agency_id: agencyId,
        client_id: null,
        actor_user_id: userId,
        actor_name: brokerName,
        event_type: 'report_generated',
        event_summary: `Generated Compliance Summary report (${periodLabel})`,
        metadata: {
          report_type: 'compliance_summary',
          period_key: periodKey,
          is_sample: true,
        },
      });
    } catch (logErr) {
      console.warn('Activity log failed (non-blocking):', logErr);
    }

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="compliance-summary-${periodKey}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error('Compliance report error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}