import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { BrandedPDF, PDF_COLORS } from './BrandedPDF';

type ComplianceStatus = 'on_track' | 'action_needed' | 'overdue';

type AcaRow = {
  groupName: string;
  employeeCount: number;
  aleStatus: string; // 'ALE' | 'Non-ALE' | 'Borderline'
  filing1095Status: ComplianceStatus;
  filing1095Label: string;
  deadline: string;
};

type SbcRow = {
  groupName: string;
  sentDate: string;
  recipientCount: number;
  method: string;
  status: ComplianceStatus;
  statusLabel: string;
};

type Form5500Row = {
  groupName: string;
  filingType: string;
  deadline: string;
  status: ComplianceStatus;
  statusLabel: string;
  notes: string;
};

type ComplianceData = {
  agencyName: string;
  periodLabel: string;
  totalOnTrack: number;
  totalActionNeeded: number;
  totalOverdue: number;
  acaRows: AcaRow[];
  sbcRows: SbcRow[];
  form5500Rows: Form5500Row[];
};

const STATUS_COLORS: Record<ComplianceStatus, { bg: string; fg: string }> = {
  on_track: { bg: '#e6f0e3', fg: '#3d6e36' },
  action_needed: { bg: '#fff4e0', fg: '#a96a1c' },
  overdue: { bg: '#fde7e7', fg: '#a44' },
};

const styles = StyleSheet.create({
  // Local section heading (BrandedPDF doesn't expose one)
  sectionHeading: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 13,
    color: PDF_COLORS.ink,
    marginBottom: 8,
    marginTop: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.border,
  },
  sectionHelp: {
    fontSize: 9,
    color: PDF_COLORS.ink2,
    marginBottom: 10,
    marginTop: -4,
    fontStyle: 'italic',
  },

  // 3 stat tiles
  statsRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  statTile: {
    flex: 1,
    backgroundColor: PDF_COLORS.white,
    borderWidth: 1,
    borderColor: PDF_COLORS.warm,
    borderRadius: 4,
    padding: 10,
    marginRight: 8,
  },
  statTileLast: {
    flex: 1,
    backgroundColor: PDF_COLORS.white,
    borderWidth: 1,
    borderColor: PDF_COLORS.warm,
    borderRadius: 4,
    padding: 10,
  },
  statTileGreen: {
    borderLeftWidth: 3,
    borderLeftColor: '#3d6e36',
  },
  statTileOrange: {
    borderLeftWidth: 3,
    borderLeftColor: '#a96a1c',
  },
  statTileRed: {
    borderLeftWidth: 3,
    borderLeftColor: '#a44',
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
    fontSize: 24,
    color: PDF_COLORS.ink,
    fontFamily: 'Helvetica-Bold',
  },

  // Tables (shared structure)
  table: {
    borderWidth: 1,
    borderColor: PDF_COLORS.warm,
    borderRadius: 4,
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: PDF_COLORS.cream,
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.warm,
  },
  tableRow: {
    flexDirection: 'row',
    padding: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF_COLORS.warm,
    alignItems: 'center',
  },
  tableRowLast: {
    flexDirection: 'row',
    padding: 8,
    alignItems: 'center',
  },
  cellHeader: {
    fontSize: 8,
    color: PDF_COLORS.ink2,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cell: {
    fontSize: 9,
    color: PDF_COLORS.ink,
  },

  // ACA columns
  acaColGroup: { width: '32%' },
  acaColEmps: { width: '12%' },
  acaColAle: { width: '14%' },
  acaColDeadline: { width: '17%' },
  acaColStatus: { width: '25%' },

  // SBC columns
  sbcColGroup: { width: '30%' },
  sbcColSent: { width: '17%' },
  sbcColRecip: { width: '13%' },
  sbcColMethod: { width: '15%' },
  sbcColStatus: { width: '25%' },

  // 5500 columns
  f5500ColGroup: { width: '28%' },
  f5500ColType: { width: '17%' },
  f5500ColDeadline: { width: '17%' },
  f5500ColStatus: { width: '20%' },
  f5500ColNotes: { width: '18%' },

  // Status pill
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    alignSelf: 'flex-start',
  },

  // Disclaimer
  disclaimer: {
    marginTop: 14,
    padding: 10,
    backgroundColor: PDF_COLORS.cream,
    borderWidth: 1,
    borderColor: PDF_COLORS.warm,
    borderRadius: 4,
  },
  disclaimerTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: PDF_COLORS.ink2,
    marginBottom: 3,
  },
  disclaimerText: {
    fontSize: 8,
    color: PDF_COLORS.ink2,
    lineHeight: 1.4,
  },
});

function StatusPill({ status, label }: { status: ComplianceStatus; label: string }) {
  const colors = STATUS_COLORS[status];
  return (
    <Text
      style={[
        styles.statusPill,
        { backgroundColor: colors.bg, color: colors.fg },
      ]}
    >
      {label}
    </Text>
  );
}

export default function CompliancePDF({ data }: { data: ComplianceData }) {
  return (
    <BrandedPDF
      agencyName={data.agencyName}
      reportTitle="Compliance Summary"
      reportSubtitle={`ACA reporting, SBC distribution, and 5500 filings · ${data.periodLabel}`}
      isSample={true}
    >
      {/* 3 stat tiles */}
      <View style={styles.statsRow}>
        <View style={[styles.statTile, styles.statTileGreen]}>
          <Text style={styles.statLabel}>On Track</Text>
          <Text style={[styles.statValue, { color: '#3d6e36' }]}>
            {data.totalOnTrack}
          </Text>
        </View>
        <View style={[styles.statTile, styles.statTileOrange]}>
          <Text style={styles.statLabel}>Action Needed</Text>
          <Text style={[styles.statValue, { color: '#a96a1c' }]}>
            {data.totalActionNeeded}
          </Text>
        </View>
        <View style={[styles.statTileLast, styles.statTileRed]}>
          <Text style={styles.statLabel}>Overdue</Text>
          <Text style={[styles.statValue, { color: '#a44' }]}>
            {data.totalOverdue}
          </Text>
        </View>
      </View>

      {/* ACA Reporting */}
      <View wrap={false}>
        <Text style={styles.sectionHeading}>ACA Reporting Status (Form 1095-C)</Text>
        <Text style={styles.sectionHelp}>
          Applicable Large Employers (50+ FTEs) must file 1095-C with the IRS and
          provide copies to employees.
        </Text>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.cellHeader, styles.acaColGroup]}>Group</Text>
            <Text style={[styles.cellHeader, styles.acaColEmps]}>Emps</Text>
            <Text style={[styles.cellHeader, styles.acaColAle]}>ALE Status</Text>
            <Text style={[styles.cellHeader, styles.acaColDeadline]}>Deadline</Text>
            <Text style={[styles.cellHeader, styles.acaColStatus]}>Status</Text>
          </View>
          {data.acaRows.map((row, i) => {
            const isLast = i === data.acaRows.length - 1;
            return (
              <View
                key={row.groupName}
                style={isLast ? styles.tableRowLast : styles.tableRow}
              >
                <Text style={[styles.cell, styles.acaColGroup]}>{row.groupName}</Text>
                <Text style={[styles.cell, styles.acaColEmps]}>{row.employeeCount}</Text>
                <Text style={[styles.cell, styles.acaColAle]}>{row.aleStatus}</Text>
                <Text style={[styles.cell, styles.acaColDeadline]}>{row.deadline}</Text>
                <View style={styles.acaColStatus}>
                  <StatusPill status={row.filing1095Status} label={row.filing1095Label} />
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* SBC Distribution */}
      <View wrap={false}>
        <Text style={styles.sectionHeading}>SBC Distribution Log</Text>
        <Text style={styles.sectionHelp}>
          Summary of Benefits and Coverage must be distributed to all eligible
          employees at open enrollment and on request.
        </Text>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.cellHeader, styles.sbcColGroup]}>Group</Text>
            <Text style={[styles.cellHeader, styles.sbcColSent]}>Sent</Text>
            <Text style={[styles.cellHeader, styles.sbcColRecip]}>Recipients</Text>
            <Text style={[styles.cellHeader, styles.sbcColMethod]}>Method</Text>
            <Text style={[styles.cellHeader, styles.sbcColStatus]}>Status</Text>
          </View>
          {data.sbcRows.map((row, i) => {
            const isLast = i === data.sbcRows.length - 1;
            return (
              <View
                key={row.groupName}
                style={isLast ? styles.tableRowLast : styles.tableRow}
              >
                <Text style={[styles.cell, styles.sbcColGroup]}>{row.groupName}</Text>
                <Text style={[styles.cell, styles.sbcColSent]}>{row.sentDate}</Text>
                <Text style={[styles.cell, styles.sbcColRecip]}>{row.recipientCount}</Text>
                <Text style={[styles.cell, styles.sbcColMethod]}>{row.method}</Text>
                <View style={styles.sbcColStatus}>
                  <StatusPill status={row.status} label={row.statusLabel} />
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Form 5500 */}
      <View wrap={false}>
        <Text style={styles.sectionHeading}>Form 5500 Filing Tracker</Text>
        <Text style={styles.sectionHelp}>
          Annual ERISA filing required for groups with 100+ participants. Due 7 months
          after plan year end.
        </Text>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.cellHeader, styles.f5500ColGroup]}>Group</Text>
            <Text style={[styles.cellHeader, styles.f5500ColType]}>Filing Type</Text>
            <Text style={[styles.cellHeader, styles.f5500ColDeadline]}>Deadline</Text>
            <Text style={[styles.cellHeader, styles.f5500ColStatus]}>Status</Text>
            <Text style={[styles.cellHeader, styles.f5500ColNotes]}>Notes</Text>
          </View>
          {data.form5500Rows.map((row, i) => {
            const isLast = i === data.form5500Rows.length - 1;
            return (
              <View
                key={row.groupName}
                style={isLast ? styles.tableRowLast : styles.tableRow}
              >
                <Text style={[styles.cell, styles.f5500ColGroup]}>{row.groupName}</Text>
                <Text style={[styles.cell, styles.f5500ColType]}>{row.filingType}</Text>
                <Text style={[styles.cell, styles.f5500ColDeadline]}>{row.deadline}</Text>
                <View style={styles.f5500ColStatus}>
                  <StatusPill status={row.status} label={row.statusLabel} />
                </View>
                <Text style={[styles.cell, styles.f5500ColNotes]}>{row.notes}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Disclaimer */}
      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerTitle}>About this report</Text>
        <Text style={styles.disclaimerText}>
          This report uses illustrative sample data to demonstrate the Compliance
          Summary format. Real compliance tracking will become available as your
          agency wires up direct integrations with carrier portals, IRS filing
          confirmations, and SBC distribution logs. The statuses, deadlines, and
          filing details shown here do not represent actual compliance positions
          for {data.agencyName} or its clients.
        </Text>
      </View>
    </BrandedPDF>
  );
}