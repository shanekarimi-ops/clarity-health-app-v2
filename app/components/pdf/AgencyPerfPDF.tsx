import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import {
  BrandedPDF,
  reportStyles,
  PDF_COLORS,
} from './BrandedPDF';

// =====================================================
// AGENCY PERFORMANCE DASHBOARD PDF
// Monthly snapshot for broker/agency leadership.
// =====================================================

export type AgencyClientRow = {
  id: string;
  first_name: string;
  last_name: string;
  employer_name: string | null;
  member_count: number | null;
  state: string | null;
  created_at: string;
};

export type AgencyActivityRow = {
  id: string;
  event_type: string;
  event_data: any;
  created_at: string;
  client_id: string | null;
  client_name?: string;
};

export type CarrierStat = {
  issuer: string;
  count: number;
  avgRank: number;
};

interface AgencyPerfPDFProps {
  agencyName: string;
  brokerName: string;
  daysBack: number;
  rangeLabel: string;
  // Stats
  totalClients: number;
  recommendationsCount: number;
  documentsCount: number;
  activityEventsCount: number;
  newClientsInRange: number;
  // Sections
  includeRoster: boolean;
  includeActivity: boolean;
  includeCarriers: boolean;
  clients: AgencyClientRow[];
  activity: AgencyActivityRow[];
  topCarriers: CarrierStat[];
}

// ---- Helpers ----

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

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function eventLabel(eventType: string): string {
  const map: Record<string, string> = {
    client_added: 'Client added',
    client_updated: 'Client updated',
    client_deleted: 'Client deleted',
    document_uploaded: 'Document uploaded',
    document_deleted: 'Document deleted',
    document_parsed: 'Document parsed',
    recommendation_run: 'Recommendation run',
    note_added: 'Note added',
    note_deleted: 'Note deleted',
    link_request_sent: 'Link request sent',
    link_accepted: 'Link accepted',
    link_revoked: 'Link revoked',
    report_generated: 'Report generated',
  };
  return map[eventType] || eventType.replace(/_/g, ' ');
}

function eventDetail(row: AgencyActivityRow): string {
  const data = row.event_data || {};
  if (row.event_type === 'report_generated') {
    return data.report_type
      ? `${data.report_type.replace(/_/g, ' ')}${
          data.client_name ? ` for ${data.client_name}` : ''
        }`
      : 'Report';
  }
  if (row.event_type === 'recommendation_run' && data.plan_count) {
    return `${data.plan_count} plans ranked`;
  }
  if (row.event_type === 'document_uploaded' && data.file_name) {
    return data.file_name;
  }
  if (row.client_name) return row.client_name;
  return '';
}

// ---- Styles ----

const s = StyleSheet.create({
  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    marginHorizontal: -4,
  },
  statBox: {
    width: '25%',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  statInner: {
    backgroundColor: PDF_COLORS.white,
    borderRadius: 4,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: PDF_COLORS.accent3,
  },
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
  statTrend: {
    fontSize: 8,
    color: PDF_COLORS.accent2,
    marginTop: 2,
    fontFamily: 'Helvetica-Bold',
  },
  // Range header
  rangeHeader: {
    backgroundColor: PDF_COLORS.warm,
    borderRadius: 4,
    padding: 10,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rangeLabel: {
    fontSize: 9,
    color: PDF_COLORS.ink,
    fontFamily: 'Helvetica-Bold',
  },
  rangeMeta: {
    fontSize: 8,
    color: PDF_COLORS.textMuted,
  },
  // Section card
  sectionBox: {
    backgroundColor: PDF_COLORS.white,
    borderRadius: 4,
    padding: 14,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: PDF_COLORS.accent2,
  },
  // Roster table
  rosterRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.border,
  },
  rosterRowHeader: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.ink,
    marginBottom: 2,
  },
  rosterCell: {
    fontSize: 9,
    color: PDF_COLORS.ink2,
  },
  rosterCellHeader: {
    fontSize: 8,
    color: PDF_COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontFamily: 'Helvetica-Bold',
  },
  rosterColName: { width: '32%', paddingRight: 6 },
  rosterColEmployer: { width: '32%', paddingRight: 6 },
  rosterColMembers: { width: '14%', paddingRight: 6 },
  rosterColState: { width: '10%', paddingRight: 6 },
  rosterColAdded: { width: '12%' },
  // Activity row
  activityRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.border,
    alignItems: 'flex-start',
  },
  activityDate: {
    width: '22%',
    fontSize: 8,
    color: PDF_COLORS.textMuted,
    paddingRight: 8,
  },
  activityType: {
    width: '28%',
    fontSize: 9,
    color: PDF_COLORS.ink,
    fontFamily: 'Helvetica-Bold',
    paddingRight: 8,
  },
  activityDetail: {
    width: '50%',
    fontSize: 8,
    color: PDF_COLORS.ink2,
  },
  // Carrier row
  carrierRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.border,
    alignItems: 'center',
  },
  carrierBar: {
    backgroundColor: PDF_COLORS.accent2,
    height: 6,
    borderRadius: 2,
    marginTop: 4,
    marginBottom: 2,
  },
  carrierBarBg: {
    backgroundColor: PDF_COLORS.warm,
    height: 6,
    borderRadius: 2,
    marginTop: 4,
    marginBottom: 2,
  },
  carrierName: {
    width: '50%',
    fontSize: 9,
    color: PDF_COLORS.ink,
    fontFamily: 'Helvetica-Bold',
    paddingRight: 8,
  },
  carrierCount: {
    width: '20%',
    fontSize: 9,
    color: PDF_COLORS.ink2,
  },
  carrierRank: {
    width: '30%',
    fontSize: 9,
    color: PDF_COLORS.textMuted,
    textAlign: 'right',
  },
  emptyText: {
    fontSize: 9,
    color: PDF_COLORS.textMuted,
    fontStyle: 'italic',
    paddingVertical: 8,
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

// ---- The PDF Component ----

export function AgencyPerfPDF({
  agencyName,
  brokerName,
  daysBack,
  rangeLabel,
  totalClients,
  recommendationsCount,
  documentsCount,
  activityEventsCount,
  newClientsInRange,
  includeRoster,
  includeActivity,
  includeCarriers,
  clients,
  activity,
  topCarriers,
}: AgencyPerfPDFProps) {
  const today = new Date();
  const startDate = new Date();
  startDate.setDate(today.getDate() - daysBack);

  const maxCarrierCount = topCarriers.length > 0 ? topCarriers[0].count : 1;

  return (
    <BrandedPDF
      agencyName={agencyName}
      reportTitle="Agency Performance Dashboard"
      reportSubtitle={`${rangeLabel} · Prepared for ${agencyName}`}
    >
      {/* Range header */}
      <View style={s.rangeHeader}>
        <Text style={s.rangeLabel}>
          Reporting period: {formatDate(startDate.toISOString())} — {formatDate(today.toISOString())}
        </Text>
        <Text style={s.rangeMeta}>{daysBack} days</Text>
      </View>

      {/* Stats */}
      <View style={s.statsGrid}>
        <View style={s.statBox}>
          <View style={s.statInner}>
            <Text style={s.statLabel}>Total Clients</Text>
            <Text style={s.statValue}>{totalClients}</Text>
            {newClientsInRange > 0 && (
              <Text style={s.statTrend}>+{newClientsInRange} this period</Text>
            )}
          </View>
        </View>
        <View style={s.statBox}>
          <View style={s.statInner}>
            <Text style={s.statLabel}>Recommendations</Text>
            <Text style={s.statValue}>{recommendationsCount}</Text>
            <Text style={s.statTrend}>in last {daysBack} days</Text>
          </View>
        </View>
        <View style={s.statBox}>
          <View style={s.statInner}>
            <Text style={s.statLabel}>Documents</Text>
            <Text style={s.statValue}>{documentsCount}</Text>
            <Text style={s.statTrend}>in last {daysBack} days</Text>
          </View>
        </View>
        <View style={s.statBox}>
          <View style={s.statInner}>
            <Text style={s.statLabel}>Activity Events</Text>
            <Text style={s.statValue}>{activityEventsCount}</Text>
            <Text style={s.statTrend}>in last {daysBack} days</Text>
          </View>
        </View>
      </View>

      {/* Top Carriers */}
      {includeCarriers && (
        <View style={s.sectionBox}>
          <Text style={reportStyles.sectionTitle}>Top Carriers Recommended</Text>
          {topCarriers.length === 0 ? (
            <Text style={s.emptyText}>
              No recommendations have been run yet in this period.
            </Text>
          ) : (
            <>
              <View style={s.rosterRowHeader}>
                <Text style={[s.rosterCellHeader, s.carrierName]}>Carrier</Text>
                <Text style={[s.rosterCellHeader, s.carrierCount]}>Times Ranked</Text>
                <Text style={[s.rosterCellHeader, s.carrierRank]}>Avg Position</Text>
              </View>
              {topCarriers.slice(0, 8).map((c, i) => {
                const widthPct = Math.round((c.count / maxCarrierCount) * 100);
                return (
                  <View key={i} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: PDF_COLORS.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={s.carrierName}>{c.issuer}</Text>
                      <Text style={s.carrierCount}>{c.count}</Text>
                      <Text style={s.carrierRank}>
                        Avg rank: {c.avgRank.toFixed(1)}
                      </Text>
                    </View>
                    <View style={s.carrierBarBg}>
                      <View style={[s.carrierBar, { width: `${widthPct}%` }]} />
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </View>
      )}

      {/* Client Roster */}
      {includeRoster && (
        <View style={s.sectionBox}>
          <Text style={reportStyles.sectionTitle}>
            Client Roster ({clients.length})
          </Text>
          {clients.length === 0 ? (
            <Text style={s.emptyText}>No clients in your book yet.</Text>
          ) : (
            <>
              <View style={s.rosterRowHeader}>
                <Text style={[s.rosterCellHeader, s.rosterColName]}>Client</Text>
                <Text style={[s.rosterCellHeader, s.rosterColEmployer]}>Employer</Text>
                <Text style={[s.rosterCellHeader, s.rosterColMembers]}>Members</Text>
                <Text style={[s.rosterCellHeader, s.rosterColState]}>State</Text>
                <Text style={[s.rosterCellHeader, s.rosterColAdded]}>Added</Text>
              </View>
              {clients.map((c) => (
                <View key={c.id} style={s.rosterRow}>
                  <Text style={[s.rosterCell, s.rosterColName]}>
                    {c.first_name} {c.last_name}
                  </Text>
                  <Text style={[s.rosterCell, s.rosterColEmployer]}>
                    {c.employer_name || '—'}
                  </Text>
                  <Text style={[s.rosterCell, s.rosterColMembers]}>
                    {c.member_count || '—'}
                  </Text>
                  <Text style={[s.rosterCell, s.rosterColState]}>
                    {c.state || '—'}
                  </Text>
                  <Text style={[s.rosterCell, s.rosterColAdded]}>
                    {formatDate(c.created_at)}
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>
      )}

      {/* Recent Activity */}
      {includeActivity && (
        <View style={s.sectionBox}>
          <Text style={reportStyles.sectionTitle}>
            Recent Activity ({activity.length})
          </Text>
          {activity.length === 0 ? (
            <Text style={s.emptyText}>No activity in this period.</Text>
          ) : (
            <>
              <View style={s.rosterRowHeader}>
                <Text style={[s.rosterCellHeader, s.activityDate]}>When</Text>
                <Text style={[s.rosterCellHeader, s.activityType]}>Event</Text>
                <Text style={[s.rosterCellHeader, s.activityDetail]}>Details</Text>
              </View>
              {activity.slice(0, 20).map((row) => (
                <View key={row.id} style={s.activityRow}>
                  <Text style={s.activityDate}>{formatDateTime(row.created_at)}</Text>
                  <Text style={s.activityType}>{eventLabel(row.event_type)}</Text>
                  <Text style={s.activityDetail}>{eventDetail(row)}</Text>
                </View>
              ))}
            </>
          )}
        </View>
      )}

      {/* Disclaimer */}
      <Text style={s.disclaimer}>
        This dashboard reflects activity recorded in the Clarity Health platform
        for {agencyName}. Figures are based on data at time of generation and
        may not reflect external systems. Prepared by {brokerName}.
      </Text>
    </BrandedPDF>
  );
}