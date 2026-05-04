import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import RetentionAnalyticsPDF from '../../../components/pdf/RetentionAnalyticsPDF';

export const maxDuration = 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Period dropdown values from the modal
type PeriodKey = '12m' | '24m' | '36m' | 'all';

const PERIOD_LABELS: Record<PeriodKey, string> = {
  '12m': 'Last 12 Months',
  '24m': 'Last 24 Months',
  '36m': 'Last 36 Months',
  'all': 'All Time',
};

// Number of cohort years to show in the table for each period
const PERIOD_COHORT_YEARS: Record<PeriodKey, number> = {
  '12m': 1,
  '24m': 2,
  '36m': 3,
  'all': 4,
};

// Deterministic hash so sample numbers stay stable across runs.
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId: string = body.userId;
    const periodKey: PeriodKey = (body.periodKey as PeriodKey) || '12m';

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

    // 2. Broker name from auth metadata (per S20 pattern — brokers table has no name cols)
    const { data: userResp } = await admin.auth.admin.getUserById(userId);
    const meta = userResp?.user?.user_metadata || {};
    const brokerName =
      `${meta.first_name || ''} ${meta.last_name || ''}`.trim() ||
      userResp?.user?.email ||
      'Broker';

    // 3. Get real client count for the agency to seed segment sizes
    const { count: realClientCount } = await admin
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', agencyId);

    // Floor at 12 so sample numbers look realistic (S21 P2 polish)
    const baseCount = Math.max(realClientCount || 0, 12);

    // 4. Synthesize sample data deterministically (seeded by agencyId)
    const seed = hashStr(agencyId);
    const periodLabel = PERIOD_LABELS[periodKey];
    const cohortYears = PERIOD_COHORT_YEARS[periodKey];

    // Headline retention rate: 82-92% range, deterministic
    const headlineRetentionPct = 82 + (seed % 11);

    // Cohort table: one row per year, going back from current year
    // (using 2026 as "current" since we're operating as of May 2026)
    const currentYear = 2026;
    const cohorts: Array<{
      year: number;
      acquired: number;
      active: number;
      churned: number;
      retentionPct: number;
    }> = [];

    let totalAcquired = 0;
    let totalActive = 0;
    let totalChurned = 0;

    for (let i = 0; i < cohortYears; i++) {
      const year = currentYear - i;
      // Older cohorts have more clients; current year is partial (S21 P2 polish — bumped multipliers)
      const ageMultiplier = i === 0 ? 0.6 : 1.2 + i * 0.6;
      const acquired = Math.round(baseCount * ageMultiplier * (0.9 + ((seed + i * 7) % 20) / 100));
      // Older cohorts have more churn
      const churnRate = 0.04 + i * 0.06 + ((seed + i * 13) % 5) / 100;
      const churned = Math.round(acquired * churnRate);
      const active = acquired - churned;
      const retentionPct = Math.round((active / acquired) * 100);

      cohorts.push({ year, acquired, active, churned, retentionPct });
      totalAcquired += acquired;
      totalActive += active;
      totalChurned += churned;
    }

    // Churn reasons: 5 categories, deterministic distribution
    // Total counts should sum to totalChurned
    const churnReasonsRaw = [
      { label: 'Price / cost increase', weight: 35 },
      { label: 'Switched to competing broker', weight: 25 },
      { label: 'Group dissolved or restructured', weight: 18 },
      { label: 'Service / responsiveness', weight: 14 },
      { label: 'Other / unspecified', weight: 8 },
    ];

    // Apply small deterministic jitter per agency
    const jitteredReasons = churnReasonsRaw.map((r, i) => ({
      label: r.label,
      weight: r.weight + ((seed + i * 11) % 6) - 2,
    }));

    const totalWeight = jitteredReasons.reduce((sum, r) => sum + r.weight, 0);

    const churnReasons = jitteredReasons.map((r) => {
      const count = Math.round((r.weight / totalWeight) * totalChurned);
      const pct = Math.round((r.weight / totalWeight) * 100);
      return { label: r.label, count, pct };
    });

    // LTV by segment
    const ltvSegments = [
      {
        label: 'Small Groups',
        description: '1–24 members',
        avgLtv: 4200 + (seed % 800),
        clientCount: Math.round(totalActive * 0.55),
      },
      {
        label: 'Medium Groups',
        description: '25–99 members',
        avgLtv: 14500 + ((seed * 3) % 2500),
        clientCount: Math.round(totalActive * 0.32),
      },
      {
        label: 'Large Groups',
        description: '100+ members',
        avgLtv: 48000 + ((seed * 7) % 8000),
        clientCount: Math.max(Math.round(totalActive * 0.13), 1),
      },
    ];

    // 5. Render the PDF
    const pdfBuffer = await renderToBuffer(
      React.createElement(RetentionAnalyticsPDF, {
        data: {
          agencyName,
          brokerName,
          periodLabel,
          headlineRetentionPct,
          totalAcquired,
          totalActive,
          totalChurned,
          cohorts,
          churnReasons,
          ltvSegments,
        },
      }) as any
    );

    // 6. Log the activity (best effort)
    try {
      const actorName = brokerName;
      await admin.from('activity_log').insert({
        agency_id: agencyId,
        client_id: null,
        actor_user_id: userId,
        actor_name: actorName,
        event_type: 'report_generated',
        event_summary: `Generated Retention Analytics report (${periodLabel})`,
        metadata: {
          report_type: 'retention_analytics',
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
        'Content-Disposition': `attachment; filename="retention-analytics-${periodKey}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error('Retention report error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}