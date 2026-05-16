import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer';

// ============================================================================
// TYPES — shape of the data we receive from the generate API
// ============================================================================

export type StandardTemplateData = {
  agency: {
    name: string;
    logo_url: string | null;
    primary_color: string | null;
    accent_color: string | null;
  };
  client: {
    employer_name: string;
    member_count: number | null;
    state: string | null;
  };
  rfp: {
    id: string;
    name: string;
    effective_date: string | null;
    current_annual_cost: number | null;
  };
  quotes: Array<{
    quote_id: string;
    carrier_name: string;
    carrier_logo_url: string | null;
    carrier_brand_color: string | null;
    total_annual_cost: number | null;
    monthly_cost: number | null;
    cost_change_pct: number | null;
    status: string;
    notes: string | null;
    lines: Array<{
      id: string;
      benefit_type: string;
      plan_name: string | null;
      monthly_premium: number | null;
      annual_cost: number | null;
      plan_design: any;
      tier_rates: any;
    }> | null;
  }>;
  generated_by_name: string | null;
  generated_at: string;
  // ---- custom_sections overrides (Commit 1 wiring) ----
  // takeaways override narrative_bullets in Exec/Detailed templates only
  custom_takeaways?: string[];
  // recommendation appears under the recommended carrier in Exec hero (Exec only)
  custom_recommendation?: string;
  // footer_note appended below the footer line in all templates
  custom_footer_note?: string;
};

// ============================================================================
// HELPERS
// ============================================================================

const fmtMoney = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
};

const fmtPct = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
};

const fmtDate = (iso: string | null): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
};

// ============================================================================
// STYLES — uses agency.primary_color where available, falls back to neutrals
// ============================================================================

const makeStyles = (primaryColor: string, accentColor: string) => StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a1a1a',
  },
  // Header band
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: primaryColor,
    borderBottomStyle: 'solid',
  },
  agencyLogo: {
    width: 80,
    height: 40,
    objectFit: 'contain',
  },
  agencyName: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: primaryColor,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  // Title block
  titleBlock: {
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 11,
    color: '#666666',
  },
  // Section
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: primaryColor,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // Summary grid (3 stat boxes)
  summaryGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    padding: 14,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: accentColor,
    borderLeftStyle: 'solid',
  },
  statLabel: {
    fontSize: 8,
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
  },
  statSubtext: {
    fontSize: 9,
    color: '#888888',
    marginTop: 2,
  },
  // Carrier card
  carrierCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderStyle: 'solid',
    borderRadius: 6,
    padding: 16,
    marginBottom: 12,
  },
  carrierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  carrierNameBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  carrierColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  carrierName: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
  },
  carrierCostBlock: {
    alignItems: 'flex-end',
  },
  carrierAnnualCost: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
  },
  carrierMonthly: {
    fontSize: 9,
    color: '#666666',
  },
  costChangeBadge: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    marginTop: 2,
  },
  // Line items table
  linesTable: {
    marginTop: 6,
  },
  lineRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eeeeee',
    borderBottomStyle: 'solid',
  },
  lineRowHeader: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#cccccc',
    borderBottomStyle: 'solid',
    backgroundColor: '#fafafa',
  },
  lineCellType: { width: '25%', fontSize: 9, paddingLeft: 4 },
  lineCellPlan: { width: '45%', fontSize: 9 },
  lineCellMonthly: { width: '15%', fontSize: 9, textAlign: 'right' },
  lineCellAnnual: { width: '15%', fontSize: 9, textAlign: 'right', paddingRight: 4 },
  lineCellHeaderText: { fontFamily: 'Helvetica-Bold', color: '#666666', textTransform: 'uppercase', fontSize: 7, letterSpacing: 0.5 },
  // Notes
  notesBlock: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#e5e5e5',
    borderTopStyle: 'solid',
  },
  notesLabel: {
    fontSize: 8,
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  notesText: {
    fontSize: 9,
    color: '#1a1a1a',
    lineHeight: 1.5,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: '#cccccc',
    borderTopStyle: 'solid',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#888888',
  },
  footerCustomNote: {
    fontSize: 7,
    color: '#999999',
    fontStyle: 'italic',
    marginTop: 4,
    lineHeight: 1.4,
  },
});

// ============================================================================
// COMPONENT
// ============================================================================

const BENEFIT_TYPE_LABELS: Record<string, string> = {
  medical: 'Medical',
  dental: 'Dental',
  vision: 'Vision',
  life: 'Life',
  std: 'Short-Term Disability',
  ltd: 'Long-Term Disability',
};

export const StandardTemplate: React.FC<{ data: StandardTemplateData }> = ({ data }) => {
  const primaryColor = data.agency.primary_color || '#1a1919';
  const accentColor = data.agency.accent_color || '#4c58ae';
  const styles = makeStyles(primaryColor, accentColor);

  // Find lowest annual cost carrier for highlight
  const validQuotes = data.quotes.filter(q => q.total_annual_cost !== null);
  const lowestCost = validQuotes.length > 0
    ? Math.min(...validQuotes.map(q => q.total_annual_cost!))
    : null;

  const customFooterNote = data.custom_footer_note && data.custom_footer_note.trim()
    ? data.custom_footer_note.trim()
    : null;

  return (
    <Document
      title={`${data.client.employer_name} - ${data.rfp.name}`}
      author={data.agency.name}
      creator="Clarity Health"
    >
      <Page size="LETTER" style={styles.page}>

        {/* Header */}
        <View style={styles.header} fixed>
          <View style={styles.carrierNameBlock}>
            {data.agency.logo_url ? (
              <Image src={data.agency.logo_url} style={styles.agencyLogo} />
            ) : (
              <Text style={styles.agencyName}>{data.agency.name}</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <Text style={{ fontSize: 9, color: '#666666' }}>
              Prepared {fmtDate(data.generated_at)}
            </Text>
            {data.generated_by_name && (
              <Text style={{ fontSize: 9, color: '#666666' }}>
                By {data.generated_by_name}
              </Text>
            )}
          </View>
        </View>

        {/* Title */}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{data.rfp.name}</Text>
          <Text style={styles.subtitle}>
            Prepared for {data.client.employer_name}
            {data.client.member_count && ` · ${data.client.member_count} employees`}
            {data.rfp.effective_date && ` · Effective ${fmtDate(data.rfp.effective_date)}`}
          </Text>
        </View>

        {/* Summary stats */}
        <View style={styles.summaryGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Carriers Reviewed</Text>
            <Text style={styles.statValue}>{data.quotes.length}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Lowest Annual Cost</Text>
            <Text style={styles.statValue}>{fmtMoney(lowestCost)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Current Annual Cost</Text>
            <Text style={styles.statValue}>{fmtMoney(data.rfp.current_annual_cost)}</Text>
          </View>
        </View>

        {/* Carrier cards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Carrier Quotes</Text>

          {data.quotes.length === 0 && (
            <Text style={{ fontSize: 10, color: '#888888', fontStyle: 'italic' }}>
              No carrier quotes yet for this RFP.
            </Text>
          )}

          {data.quotes.map((quote) => {
            const isLowest = quote.total_annual_cost !== null && quote.total_annual_cost === lowestCost;
            const costChangeColor = quote.cost_change_pct === null ? '#888888'
              : quote.cost_change_pct > 0 ? '#b91c1c' : '#15803d';

            return (
              <View key={quote.quote_id} style={styles.carrierCard} wrap={false}>
                <View style={styles.carrierHeader}>
                  <View style={styles.carrierNameBlock}>
                    {quote.carrier_brand_color && (
                      <View style={[styles.carrierColorDot, { backgroundColor: quote.carrier_brand_color }]} />
                    )}
                    <Text style={styles.carrierName}>{quote.carrier_name}</Text>
                    {isLowest && (
                      <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#15803d', backgroundColor: '#dcfce7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, marginLeft: 6 }}>
                        LOWEST COST
                      </Text>
                    )}
                  </View>
                  <View style={styles.carrierCostBlock}>
                    <Text style={styles.carrierAnnualCost}>{fmtMoney(quote.total_annual_cost)}</Text>
                    <Text style={styles.carrierMonthly}>{fmtMoney(quote.monthly_cost)} /mo</Text>
                    {quote.cost_change_pct !== null && (
                      <Text style={[styles.costChangeBadge, { color: costChangeColor }]}>
                        {fmtPct(quote.cost_change_pct)} vs current
                      </Text>
                    )}
                  </View>
                </View>

                {/* Lines table */}
                {quote.lines && quote.lines.length > 0 && (
                  <View style={styles.linesTable}>
                    <View style={styles.lineRowHeader}>
                      <Text style={[styles.lineCellType, styles.lineCellHeaderText]}>Type</Text>
                      <Text style={[styles.lineCellPlan, styles.lineCellHeaderText]}>Plan</Text>
                      <Text style={[styles.lineCellMonthly, styles.lineCellHeaderText]}>Monthly</Text>
                      <Text style={[styles.lineCellAnnual, styles.lineCellHeaderText]}>Annual</Text>
                    </View>
                    {quote.lines.map((line) => (
                      <View key={line.id} style={styles.lineRow}>
                        <Text style={styles.lineCellType}>
                          {BENEFIT_TYPE_LABELS[line.benefit_type] || line.benefit_type}
                        </Text>
                        <Text style={styles.lineCellPlan}>{line.plan_name || '—'}</Text>
                        <Text style={styles.lineCellMonthly}>{fmtMoney(line.monthly_premium)}</Text>
                        <Text style={styles.lineCellAnnual}>{fmtMoney(line.annual_cost)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Carrier notes */}
                {quote.notes && quote.notes.trim() && (
                  <View style={styles.notesBlock}>
                    <Text style={styles.notesLabel}>Carrier Notes</Text>
                    <Text style={styles.notesText}>{quote.notes}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <View style={styles.footerRow}>
            <Text>{data.agency.name} · Confidential</Text>
            <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
          {customFooterNote && (
            <Text style={styles.footerCustomNote}>{customFooterNote}</Text>
          )}
        </View>

      </Page>
    </Document>
  );
};