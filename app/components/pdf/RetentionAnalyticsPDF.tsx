import React from 'react';
import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
} from '@react-pdf/renderer';
import BrandedPDF, { reportStyles, PDF_COLORS } from './BrandedPDF';

type CohortRow = {
  year: number;
  acquired: number;
  active: number;
  churned: number;
  retentionPct: number;
};

type ChurnReason = {
  label: string;
  count: number;
  pct: number;
};

type LtvSegment = {
  label: string;
  description: string;
  avgLtv: number;
  clientCount: number;
};

type RetentionData = {
  agencyName: string;
  brokerName: string;
  periodLabel: string;
  headlineRetentionPct: number;
  totalAcquired: number;
  totalActive: number;
  totalChurned: number;
  cohorts: CohortRow[];
  churnReasons: ChurnReason[];
  ltvSegments: LtvSegment[];
};

const styles = StyleSheet.create({
  // Headline retention number
  headline: {
    backgroundColor: PDF_COLORS.cream,
    border: `1pt solid ${PDF_COLORS.warm}`,
    borderRadius: 6,
    padding: 18,
    marginBottom: 14,
    textAlign: 'center',
  },
  headlineLabel: {
    fontSize: 9,
    color: PDF_COLORS.ink2,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    fontFamily: 'Helvetica-Bold',
  },
  headlineNumber: {
    fontSize: 42,
    color: PDF_COLORS.accent2,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  headlineSub: {
    fontSize: 10,
    color: PDF_COLORS.ink2,
  },

  // Stat tiles row
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statTile: {
    flex: 1,
    backgroundColor: '#ffffff',
    border: `1pt solid ${PDF_COLORS.warm}`,
    borderRadius: 4,
    padding: 10,
  },
  statLabel: {
    fontSize: 8,
    color: PDF_COLORS.ink2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
    fontFamily: 'Helvetica-Bold',
  },
  statValue: {
    fontSize: 20,
    color: PDF_COLORS.ink,
    fontFamily: 'Helvetica-Bold',
  },
  statValueGreen: {
    fontSize: 20,
    color: PDF_COLORS.accent2,
    fontFamily: 'Helvetica-Bold',
  },
  statValueRed: {
    fontSize: 20,
    color: '#a44',
    fontFamily: 'Helvetica-Bold',
  },

  // Cohort table
  cohortTable: {
    border: `1pt solid ${PDF_COLORS.warm}`,
    borderRadius: 4,
    marginBottom: 14,
  },
  cohortHeader: {
    flexDirection: 'row',
    backgroundColor: PDF_COLORS.cream,
    padding: 8,
    borderBottom: `1pt solid ${PDF_COLORS.warm}`,
  },
  cohortRow: {
    flexDirection: 'row',
    padding: 8,
    borderBottom: `0.5pt solid ${PDF_COLORS.warm}`,
  },
  cohortRowLast: {
    flexDirection: 'row',
    padding: 8,
  },
  cohortCell: {
    fontSize: 9,
    color: PDF_COLORS.ink,
  },
  cohortCellHeader: {
    fontSize: 8,
    color: PDF_COLORS.ink2,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cellYear: { width: '20%' },
  cellAcquired: { width: '20%' },
  cellActive: { width: '20%' },
  cellChurned: { width: '20%' },
  cellRetention: { width: '20%' },

  // Churn reason bars
  reasonRow: {
    marginBottom: 8,
  },
  reasonLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  reasonLabel: {
    fontSize: 9,
    color: PDF_COLORS.ink,
  },
  reasonPct: {
    fontSize: 9,
    color: PDF_COLORS.ink2,
    fontFamily: 'Helvetica-Bold',
  },
  reasonBarTrack: {
    height: 8,
    backgroundColor: PDF_COLORS.warm,
    borderRadius: 2,
    overflow: 'hidden',
  },
  reasonBarFill: {
    height: 8,
    backgroundColor: PDF_COLORS.accent3,
    borderRadius: 2,
  },

  // LTV segments
  ltvRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  ltvCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    border: `1pt solid ${PDF_COLORS.warm}`,
    borderLeft: `3pt solid ${PDF_COLORS.accent2}`,
    borderRadius: 4,
    padding: 10,
  },
  ltvSegmentLabel: {
    fontSize: 10,
    color: PDF_COLORS.ink,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  ltvDesc: {
    fontSize: 8,
    color: PDF_COLORS.ink2,
    marginBottom: 8,
  },
  ltvValue: {
    fontSize: 16,
    color: PDF_COLORS.accent2,
    fontFamily: 'Helvetica-Bold',
  },
  ltvCount: {
    fontSize: 8,
    color: PDF_COLORS.ink2,
    marginTop: 2,
  },

  // Disclaimer
  disclaimer: {
    marginTop: 14,
    padding: 10,
    backgroundColor: PDF_COLORS.cream,
    border: `1pt solid ${PDF_COLORS.warm}`,
    borderRadius: 4,
    fontSize: 8,
    color: PDF_COLORS.ink2,
    lineHeight: 1.4,
  },
});

function formatCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export default function RetentionAnalyticsPDF({ data }: { data: RetentionData }) {
  const maxReasonCount = Math.max(...data.churnReasons.map((r) => r.count), 1);

  return (
    <Document>
      <Page size="LETTER" style={reportStyles.page}>
        <BrandedPDF
          agencyName={data.agencyName}
          brokerName={data.brokerName}
          isSample={true}
        >
          {/* Title */}
          <View style={reportStyles.titleBlock}>
            <Text style={reportStyles.title}>Retention Analytics</Text>
            <Text style={reportStyles.subtitle}>
              Client retention, churn analysis, and lifetime value · {data.periodLabel}
            </Text>
          </View>

          {/* Headline retention */}
          <View style={styles.headline}>
            <Text style={styles.headlineLabel}>Year-over-Year Retention</Text>
            <Text style={styles.headlineNumber}>{data.headlineRetentionPct}%</Text>
            <Text style={styles.headlineSub}>
              of clients retained across the reporting period
            </Text>
          </View>

          {/* 3 stat tiles */}
          <View style={styles.statsRow}>
            <View style={styles.statTile}>
              <Text style={styles.statLabel}>Total Acquired</Text>
              <Text style={styles.statValue}>{data.totalAcquired}</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statLabel}>Currently Active</Text>
              <Text style={styles.statValueGreen}>{data.totalActive}</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statLabel}>Churned</Text>
              <Text style={styles.statValueRed}>{data.totalChurned}</Text>
            </View>
          </View>

          {/* Cohort table */}
          <Text style={reportStyles.sectionHeading}>Cohort Retention by Acquisition Year</Text>

          <View style={styles.cohortTable}>
            <View style={styles.cohortHeader}>
              <Text style={[styles.cohortCellHeader, styles.cellYear]}>Year</Text>
              <Text style={[styles.cohortCellHeader, styles.cellAcquired]}>Acquired</Text>
              <Text style={[styles.cohortCellHeader, styles.cellActive]}>Active</Text>
              <Text style={[styles.cohortCellHeader, styles.cellChurned]}>Churned</Text>
              <Text style={[styles.cohortCellHeader, styles.cellRetention]}>Retention</Text>
            </View>
            {data.cohorts.map((row, i) => {
              const isLast = i === data.cohorts.length - 1;
              return (
                <View
                  key={row.year}
                  style={isLast ? styles.cohortRowLast : styles.cohortRow}
                >
                  <Text style={[styles.cohortCell, styles.cellYear]}>{row.year}</Text>
                  <Text style={[styles.cohortCell, styles.cellAcquired]}>{row.acquired}</Text>
                  <Text style={[styles.cohortCell, styles.cellActive]}>{row.active}</Text>
                  <Text style={[styles.cohortCell, styles.cellChurned]}>{row.churned}</Text>
                  <Text style={[styles.cohortCell, styles.cellRetention]}>
                    {row.retentionPct}%
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Churn reasons */}
          <Text style={reportStyles.sectionHeading}>Why Clients Leave</Text>

          <View style={{ marginBottom: 14 }}>
            {data.churnReasons.map((reason) => {
              const widthPct = (reason.count / maxReasonCount) * 100;
              return (
                <View key={reason.label} style={styles.reasonRow}>
                  <View style={styles.reasonLabelRow}>
                    <Text style={styles.reasonLabel}>{reason.label}</Text>
                    <Text style={styles.reasonPct}>
                      {reason.count} ({reason.pct}%)
                    </Text>
                  </View>
                  <View style={styles.reasonBarTrack}>
                    <View style={[styles.reasonBarFill, { width: `${widthPct}%` }]} />
                  </View>
                </View>
              );
            })}
          </View>

          {/* LTV by segment */}
          <Text style={reportStyles.sectionHeading}>Lifetime Value by Segment</Text>

          <View style={styles.ltvRow}>
            {data.ltvSegments.map((seg) => (
              <View key={seg.label} style={styles.ltvCard}>
                <Text style={styles.ltvSegmentLabel}>{seg.label}</Text>
                <Text style={styles.ltvDesc}>{seg.description}</Text>
                <Text style={styles.ltvValue}>{formatCurrency(seg.avgLtv)}</Text>
                <Text style={styles.ltvCount}>
                  avg LTV · {seg.clientCount} clients
                </Text>
              </View>
            ))}
          </View>

          {/* Disclaimer */}
          <View style={styles.disclaimer}>
            <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 3 }}>
              About this report
            </Text>
            <Text>
              This report uses illustrative sample data to demonstrate the Retention Analytics
              format. Real retention tracking will become available as your agency accumulates
              client history over multiple renewal cycles. Cohort retention, churn reasons, and
              LTV figures shown here do not represent actual outcomes for {data.agencyName}.
            </Text>
          </View>
        </BrandedPDF>
      </Page>
    </Document>
  );
}