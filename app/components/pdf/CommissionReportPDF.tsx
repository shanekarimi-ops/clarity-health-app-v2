import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import {
  BrandedPDF,
  reportStyles,
  PDF_COLORS,
} from './BrandedPDF';

// =====================================================
// COMMISSION REPORT PDF
// Fully mock data — real commission tracking is not
// yet implemented. Uses real client names where possible.
// =====================================================

export type CommissionLineItem = {
  carrier: string;
  clientName: string;
  groupSize: number;
  effectiveDate: string;
  annualPremium: number;
  commissionRate: number; // 0.04 = 4%
  commissionAmount: number;
  status: 'paid' | 'pending' | 'projected';
};

export type CarrierBreakdown = {
  carrier: string;
  clientCount: number;
  totalPremium: number;
  totalCommission: number;
  avgRate: number;
};

interface CommissionReportPDFProps {
  agencyName: string;
  brokerName: string;
  periodLabel: string;
  totalCommissionPaid: number;
  totalCommissionPending: number;
  totalCommissionProjected: number;
  totalAnnualPremium: number;
  carrierBreakdowns: CarrierBreakdown[];
  lineItems: CommissionLineItem[];
}

function fmtMoney(n: number): string {
  return `$${Number(n).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

const s = StyleSheet.create({
  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    marginBottom: 16,
    marginHorizontal: -4,
  },
  statBox: {
    flex: 1,
    paddingHorizontal: 4,
  },
  statInner: {
    backgroundColor: PDF_COLORS.white,
    borderRadius: 4,
    padding: 12,
    borderLeftWidth: 3,
  },
  statGreen: { borderLeftColor: PDF_COLORS.accent2 },
  statBlue: { borderLeftColor: PDF_COLORS.accent3 },
  statGold: { borderLeftColor: '#c4a04a' },
  statLabel: {
    fontSize: 7,
    color: PDF_COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 18,
    color: PDF_COLORS.ink,
  },
  statSubtext: {
    fontSize: 8,
    color: PDF_COLORS.textMuted,
    marginTop: 2,
  },
  // Headline section
  headlineBox: {
    backgroundColor: PDF_COLORS.white,
    borderRadius: 4,
    padding: 16,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: PDF_COLORS.accent2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headlineLeft: {
    flex: 1,
  },
  headlineLabel: {
    fontSize: 9,
    color: PDF_COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  headlineValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 28,
    color: PDF_COLORS.ink,
  },
  headlinePeriod: {
    fontSize: 9,
    color: PDF_COLORS.textMuted,
    marginTop: 4,
  },
  // Section
  sectionBox: {
    backgroundColor: PDF_COLORS.white,
    borderRadius: 4,
    padding: 14,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: PDF_COLORS.accent3,
  },
  rowHeader: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.ink,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.border,
    alignItems: 'center',
  },
  cellHeader: {
    fontSize: 7,
    color: PDF_COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontFamily: 'Helvetica-Bold',
  },
  cell: {
    fontSize: 9,
    color: PDF_COLORS.ink2,
  },
  cellBold: {
    fontSize: 9,
    color: PDF_COLORS.ink,
    fontFamily: 'Helvetica-Bold',
  },
  // Carrier breakdown columns
  cbColCarrier: { width: '32%', paddingRight: 6 },
  cbColClients: { width: '14%', paddingRight: 6 },
  cbColPremium: { width: '20%', paddingRight: 6 },
  cbColRate: { width: '12%', paddingRight: 6 },
  cbColCommission: { width: '22%' },
  // Line item columns
  liColCarrier: { width: '17%', paddingRight: 4 },
  liColClient: { width: '22%', paddingRight: 4 },
  liColSize: { width: '8%', paddingRight: 4 },
  liColEffective: { width: '13%', paddingRight: 4 },
  liColPremium: { width: '14%', paddingRight: 4 },
  liColCommission: { width: '14%', paddingRight: 4 },
  liColStatus: { width: '12%' },
  // Status badge
  statusBadge: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 3,
    color: PDF_COLORS.white,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  badgePaid: { backgroundColor: PDF_COLORS.accent2 },
  badgePending: { backgroundColor: '#d28a4a' },
  badgeProjected: { backgroundColor: PDF_COLORS.accent3 },
  // Carrier bar visual
  carrierBarBg: {
    backgroundColor: PDF_COLORS.warm,
    height: 5,
    borderRadius: 2,
    marginTop: 4,
  },
  carrierBar: {
    backgroundColor: PDF_COLORS.accent2,
    height: 5,
    borderRadius: 2,
  },
  disclaimer: {
    fontSize: 7,
    color: PDF_COLORS.textMuted,
    fontStyle: 'italic',
    lineHeight: 1.4,
    marginTop: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.border,
  },
});

function StatusBadge({ status }: { status: 'paid' | 'pending' | 'projected' }) {
  const style =
    status === 'paid'
      ? s.badgePaid
      : status === 'pending'
      ? s.badgePending
      : s.badgeProjected;
  return <Text style={[s.statusBadge, style]}>{status}</Text>;
}

export function CommissionReportPDF({
  agencyName,
  brokerName,
  periodLabel,
  totalCommissionPaid,
  totalCommissionPending,
  totalCommissionProjected,
  totalAnnualPremium,
  carrierBreakdowns,
  lineItems,
}: CommissionReportPDFProps) {
  const totalEarned =
    totalCommissionPaid + totalCommissionPending + totalCommissionProjected;
  const maxCarrierCommission =
    carrierBreakdowns.length > 0
      ? Math.max(...carrierBreakdowns.map((c) => c.totalCommission))
      : 1;

  return (
    <BrandedPDF
      agencyName={agencyName}
      reportTitle="Commission Report"
      reportSubtitle={`${periodLabel} · Carrier-level commission breakdown`}
      isSample={true}
    >
      {/* Headline number */}
      <View style={s.headlineBox}>
        <View style={s.headlineLeft}>
          <Text style={s.headlineLabel}>Total Commissions Earned</Text>
          <Text style={s.headlineValue}>{fmtMoney(totalEarned)}</Text>
          <Text style={s.headlinePeriod}>{periodLabel}</Text>
        </View>
      </View>

      {/* Stats breakdown */}
      <View style={s.statsGrid}>
        <View style={s.statBox}>
          <View style={[s.statInner, s.statGreen]}>
            <Text style={s.statLabel}>Paid</Text>
            <Text style={s.statValue}>{fmtMoney(totalCommissionPaid)}</Text>
            <Text style={s.statSubtext}>Settled by carrier</Text>
          </View>
        </View>
        <View style={s.statBox}>
          <View style={[s.statInner, s.statGold]}>
            <Text style={s.statLabel}>Pending</Text>
            <Text style={s.statValue}>{fmtMoney(totalCommissionPending)}</Text>
            <Text style={s.statSubtext}>In statement cycle</Text>
          </View>
        </View>
        <View style={s.statBox}>
          <View style={[s.statInner, s.statBlue]}>
            <Text style={s.statLabel}>Projected</Text>
            <Text style={s.statValue}>{fmtMoney(totalCommissionProjected)}</Text>
            <Text style={s.statSubtext}>Year-end estimate</Text>
          </View>
        </View>
      </View>

      {/* Carrier breakdown */}
      <View style={s.sectionBox}>
        <Text style={reportStyles.sectionTitle}>Commission by Carrier</Text>
        <View style={s.rowHeader}>
          <Text style={[s.cellHeader, s.cbColCarrier]}>Carrier</Text>
          <Text style={[s.cellHeader, s.cbColClients]}>Clients</Text>
          <Text style={[s.cellHeader, s.cbColPremium]}>Premium</Text>
          <Text style={[s.cellHeader, s.cbColRate]}>Avg Rate</Text>
          <Text style={[s.cellHeader, s.cbColCommission]}>Commission</Text>
        </View>
        {carrierBreakdowns.map((c, i) => {
          const widthPct = Math.round(
            (c.totalCommission / maxCarrierCommission) * 100
          );
          return (
            <View
              key={i}
              style={{
                paddingVertical: 6,
                borderBottomWidth: 1,
                borderBottomColor: PDF_COLORS.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[s.cellBold, s.cbColCarrier]}>{c.carrier}</Text>
                <Text style={[s.cell, s.cbColClients]}>{c.clientCount}</Text>
                <Text style={[s.cell, s.cbColPremium]}>
                  {fmtMoney(c.totalPremium)}
                </Text>
                <Text style={[s.cell, s.cbColRate]}>{fmtPct(c.avgRate)}</Text>
                <Text style={[s.cellBold, s.cbColCommission]}>
                  {fmtMoney(c.totalCommission)}
                </Text>
              </View>
              <View style={s.carrierBarBg}>
                <View style={[s.carrierBar, { width: `${widthPct}%` }]} />
              </View>
            </View>
          );
        })}
      </View>

      {/* Line items */}
      <View style={s.sectionBox}>
        <Text style={reportStyles.sectionTitle}>
          Commission Line Items ({lineItems.length})
        </Text>
        <View style={s.rowHeader}>
          <Text style={[s.cellHeader, s.liColCarrier]}>Carrier</Text>
          <Text style={[s.cellHeader, s.liColClient]}>Client</Text>
          <Text style={[s.cellHeader, s.liColSize]}>Size</Text>
          <Text style={[s.cellHeader, s.liColEffective]}>Effective</Text>
          <Text style={[s.cellHeader, s.liColPremium]}>Premium</Text>
          <Text style={[s.cellHeader, s.liColCommission]}>Commission</Text>
          <Text style={[s.cellHeader, s.liColStatus]}>Status</Text>
        </View>
        {lineItems.map((item, i) => (
          <View key={i} style={s.row}>
            <Text style={[s.cell, s.liColCarrier]}>{item.carrier}</Text>
            <Text style={[s.cell, s.liColClient]}>{item.clientName}</Text>
            <Text style={[s.cell, s.liColSize]}>{item.groupSize}</Text>
            <Text style={[s.cell, s.liColEffective]}>
              {fmtDate(item.effectiveDate)}
            </Text>
            <Text style={[s.cell, s.liColPremium]}>
              {fmtMoney(item.annualPremium)}
            </Text>
            <Text style={[s.cellBold, s.liColCommission]}>
              {fmtMoney(item.commissionAmount)}
            </Text>
            <View style={s.liColStatus}>
              <StatusBadge status={item.status} />
            </View>
          </View>
        ))}
      </View>

      <Text style={s.disclaimer}>
        Commission figures shown are illustrative. Actual commissions vary by
        carrier contract, group size, line of coverage, and renewal status.
        Refer to your carrier statements for authoritative figures. Prepared by{' '}
        {brokerName} of {agencyName}.
      </Text>
    </BrandedPDF>
  );
}