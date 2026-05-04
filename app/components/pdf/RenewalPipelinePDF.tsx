import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import {
  BrandedPDF,
  reportStyles,
  PDF_COLORS,
} from './BrandedPDF';

// =====================================================
// RENEWAL PIPELINE PDF
// Shows clients with upcoming renewals in 30/60/90 days.
// Real if clients.renewal_date is set, mock otherwise.
// =====================================================

export type RenewalRow = {
  id: string;
  first_name: string;
  last_name: string;
  employer_name: string | null;
  member_count: number | null;
  state: string | null;
  renewal_date: string;
  daysUntil: number;
  estPremium?: number | null;
  carrier?: string | null;
};

interface RenewalPipelinePDFProps {
  agencyName: string;
  brokerName: string;
  isSample: boolean;
  renewals30: RenewalRow[];
  renewals60: RenewalRow[];
  renewals90: RenewalRow[];
}

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `$${Number(n).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

function formatDate(iso: string): string {
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

const s = StyleSheet.create({
  // Stats summary row
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
  statRed: { borderLeftColor: '#c44' },
  statOrange: { borderLeftColor: '#d28a4a' },
  statBlue: { borderLeftColor: PDF_COLORS.accent3 },
  statLabel: {
    fontSize: 7,
    color: PDF_COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 22,
    color: PDF_COLORS.ink,
  },
  statSubtext: {
    fontSize: 8,
    color: PDF_COLORS.textMuted,
    marginTop: 2,
  },
  // Bucket section
  bucketBox: {
    backgroundColor: PDF_COLORS.white,
    borderRadius: 4,
    padding: 14,
    marginBottom: 14,
    borderLeftWidth: 3,
  },
  bucketBoxRed: { borderLeftColor: '#c44' },
  bucketBoxOrange: { borderLeftColor: '#d28a4a' },
  bucketBoxBlue: { borderLeftColor: PDF_COLORS.accent3 },
  bucketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.border,
  },
  bucketTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 13,
    color: PDF_COLORS.ink,
  },
  bucketCount: {
    fontSize: 9,
    color: PDF_COLORS.textMuted,
    fontFamily: 'Helvetica-Bold',
  },
  // Table
  rowHeader: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.ink,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.border,
    alignItems: 'center',
  },
  cellHeader: {
    fontSize: 8,
    color: PDF_COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontFamily: 'Helvetica-Bold',
  },
  cell: {
    fontSize: 9,
    color: PDF_COLORS.ink2,
  },
  colClient: { width: '24%', paddingRight: 6 },
  colEmployer: { width: '24%', paddingRight: 6 },
  colMembers: { width: '10%', paddingRight: 6 },
  colCarrier: { width: '16%', paddingRight: 6 },
  colDate: { width: '14%', paddingRight: 6 },
  colDays: { width: '12%' },
  daysBadge: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 3,
    color: PDF_COLORS.white,
    textAlign: 'center',
  },
  daysBadgeRed: { backgroundColor: '#c44' },
  daysBadgeOrange: { backgroundColor: '#d28a4a' },
  daysBadgeBlue: { backgroundColor: PDF_COLORS.accent3 },
  emptyText: {
    fontSize: 9,
    color: PDF_COLORS.textMuted,
    fontStyle: 'italic',
    paddingVertical: 8,
    textAlign: 'center',
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

function bucketColor(bucket: '30' | '60' | '90') {
  return bucket === '30'
    ? { stat: s.statRed, box: s.bucketBoxRed, badge: s.daysBadgeRed }
    : bucket === '60'
    ? { stat: s.statOrange, box: s.bucketBoxOrange, badge: s.daysBadgeOrange }
    : { stat: s.statBlue, box: s.bucketBoxBlue, badge: s.daysBadgeBlue };
}

function RenewalTable({
  rows,
  bucket,
}: {
  rows: RenewalRow[];
  bucket: '30' | '60' | '90';
}) {
  if (rows.length === 0) {
    return (
      <Text style={s.emptyText}>No renewals in this window.</Text>
    );
  }

  const colors = bucketColor(bucket);

  return (
    <>
      <View style={s.rowHeader}>
        <Text style={[s.cellHeader, s.colClient]}>Client</Text>
        <Text style={[s.cellHeader, s.colEmployer]}>Employer</Text>
        <Text style={[s.cellHeader, s.colMembers]}>Members</Text>
        <Text style={[s.cellHeader, s.colCarrier]}>Carrier</Text>
        <Text style={[s.cellHeader, s.colDate]}>Renewal</Text>
        <Text style={[s.cellHeader, s.colDays]}>Days</Text>
      </View>
      {rows.map((r) => (
        <View key={r.id} style={s.row}>
          <Text style={[s.cell, s.colClient]}>
            {r.first_name} {r.last_name}
          </Text>
          <Text style={[s.cell, s.colEmployer]}>
            {r.employer_name || '—'}
          </Text>
          <Text style={[s.cell, s.colMembers]}>{r.member_count || '—'}</Text>
          <Text style={[s.cell, s.colCarrier]}>{r.carrier || '—'}</Text>
          <Text style={[s.cell, s.colDate]}>{formatDate(r.renewal_date)}</Text>
          <View style={s.colDays}>
            <Text style={[s.daysBadge, colors.badge]}>{r.daysUntil}d</Text>
          </View>
        </View>
      ))}
    </>
  );
}

export function RenewalPipelinePDF({
  agencyName,
  brokerName,
  isSample,
  renewals30,
  renewals60,
  renewals90,
}: RenewalPipelinePDFProps) {
  const totalEstPremium30 = renewals30.reduce(
    (sum, r) => sum + Number(r.estPremium || 0),
    0
  );
  const totalEstPremium60 = renewals60.reduce(
    (sum, r) => sum + Number(r.estPremium || 0),
    0
  );
  const totalEstPremium90 = renewals90.reduce(
    (sum, r) => sum + Number(r.estPremium || 0),
    0
  );

  return (
    <BrandedPDF
      agencyName={agencyName}
      reportTitle="Renewal Pipeline"
      reportSubtitle="Upcoming client renewals by 30/60/90-day windows"
      isSample={isSample}
    >
      {/* Summary stats */}
      <View style={s.statsGrid}>
        <View style={s.statBox}>
          <View style={[s.statInner, s.statRed]}>
            <Text style={s.statLabel}>Next 30 Days</Text>
            <Text style={s.statValue}>{renewals30.length}</Text>
            <Text style={s.statSubtext}>
              ~{fmtMoney(totalEstPremium30)} annual premium
            </Text>
          </View>
        </View>
        <View style={s.statBox}>
          <View style={[s.statInner, s.statOrange]}>
            <Text style={s.statLabel}>31–60 Days</Text>
            <Text style={s.statValue}>{renewals60.length}</Text>
            <Text style={s.statSubtext}>
              ~{fmtMoney(totalEstPremium60)} annual premium
            </Text>
          </View>
        </View>
        <View style={s.statBox}>
          <View style={[s.statInner, s.statBlue]}>
            <Text style={s.statLabel}>61–90 Days</Text>
            <Text style={s.statValue}>{renewals90.length}</Text>
            <Text style={s.statSubtext}>
              ~{fmtMoney(totalEstPremium90)} annual premium
            </Text>
          </View>
        </View>
      </View>

      {/* 30-day bucket */}
      <View style={[s.bucketBox, s.bucketBoxRed]}>
        <View style={s.bucketHeader}>
        <Text style={s.bucketTitle}>Urgent: Renewing in 30 days</Text>
          <Text style={s.bucketCount}>
            {renewals30.length} {renewals30.length === 1 ? 'client' : 'clients'}
          </Text>
        </View>
        <RenewalTable rows={renewals30} bucket="30" />
      </View>

      {/* 60-day bucket */}
      <View style={[s.bucketBox, s.bucketBoxOrange]}>
        <View style={s.bucketHeader}>
        <Text style={s.bucketTitle}>Renewing in 31–60 days</Text>
          <Text style={s.bucketCount}>
            {renewals60.length} {renewals60.length === 1 ? 'client' : 'clients'}
          </Text>
        </View>
        <RenewalTable rows={renewals60} bucket="60" />
      </View>

      {/* 90-day bucket */}
      <View style={[s.bucketBox, s.bucketBoxBlue]}>
        <View style={s.bucketHeader}>
        <Text style={s.bucketTitle}>Renewing in 61–90 days</Text>
          <Text style={s.bucketCount}>
            {renewals90.length} {renewals90.length === 1 ? 'client' : 'clients'}
          </Text>
        </View>
        <RenewalTable rows={renewals90} bucket="90" />
      </View>

      <Text style={s.disclaimer}>
        Renewal dates and premium estimates are based on data recorded in
        Clarity Health. Actual renewal dates may vary based on carrier
        agreements. Prepared by {brokerName} of {agencyName}.
      </Text>
    </BrandedPDF>
  );
}