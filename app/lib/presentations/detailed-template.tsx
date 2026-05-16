import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type { StandardTemplateData } from './standard-template';

// Detailed template uses the same data shape as Standard,
// but also accepts optional AI narrative bullets.
// custom_sections fields (custom_takeaways, custom_recommendation, custom_footer_note)
// are inherited from StandardTemplateData.
export type DetailedTemplateData = StandardTemplateData & {
  narrative_bullets?: string[];
};

// ============================================================================
// CONSTANTS
// ============================================================================

const BENEFIT_TYPE_LABELS: Record<string, string> = {
  medical: 'Medical',
  dental: 'Dental',
  vision: 'Vision',
  life: 'Life',
  std: 'Short-Term Disability',
  ltd: 'Long-Term Disability',
};

const PLAN_DESIGN_FIELDS: Record<string, { key: string; label: string; format?: 'currency' | 'percent' | 'text' }[]> = {
  medical: [
    { key: 'deductible_individual', label: 'Deductible (Ind)', format: 'currency' },
    { key: 'deductible_family', label: 'Deductible (Fam)', format: 'currency' },
    { key: 'oop_max_individual', label: 'OOP Max (Ind)', format: 'currency' },
    { key: 'oop_max_family', label: 'OOP Max (Fam)', format: 'currency' },
    { key: 'coinsurance_pct', label: 'Coinsurance %', format: 'percent' },
    { key: 'pcp_copay', label: 'PCP Copay', format: 'currency' },
    { key: 'specialist_copay', label: 'Specialist Copay', format: 'currency' },
    { key: 'urgent_care_copay', label: 'Urgent Care Copay', format: 'currency' },
    { key: 'telehealth_copay', label: 'Telehealth Copay', format: 'currency' },
    { key: 'er_copay', label: 'ER Copay', format: 'currency' },
    { key: 'rx_generic', label: 'Rx Generic', format: 'currency' },
    { key: 'rx_preferred_brand', label: 'Rx Preferred Brand', format: 'currency' },
    { key: 'rx_non_preferred_brand', label: 'Rx Non-Preferred Brand', format: 'currency' },
    { key: 'rx_specialty', label: 'Rx Specialty', format: 'currency' },
  ],
  dental: [
    { key: 'annual_max', label: 'Annual Max', format: 'currency' },
    { key: 'deductible_individual', label: 'Deductible (Ind)', format: 'currency' },
    { key: 'deductible_family', label: 'Deductible (Fam)', format: 'currency' },
    { key: 'preventive_coverage_pct', label: 'Preventive %', format: 'percent' },
    { key: 'basic_coverage_pct', label: 'Basic %', format: 'percent' },
    { key: 'major_coverage_pct', label: 'Major %', format: 'percent' },
    { key: 'ortho_coverage_pct', label: 'Ortho %', format: 'percent' },
    { key: 'ortho_lifetime_max', label: 'Ortho Lifetime Max', format: 'currency' },
    { key: 'ortho_covered', label: 'Ortho Covered', format: 'text' },
  ],
  vision: [
    { key: 'exam_copay', label: 'Exam Copay', format: 'currency' },
    { key: 'exam_frequency', label: 'Exam Frequency', format: 'text' },
    { key: 'frames_allowance', label: 'Frames Allowance', format: 'currency' },
    { key: 'frames_frequency', label: 'Frames Frequency', format: 'text' },
    { key: 'lenses_copay', label: 'Lenses Copay', format: 'currency' },
    { key: 'lenses_frequency', label: 'Lenses Frequency', format: 'text' },
    { key: 'contacts_allowance', label: 'Contacts Allowance', format: 'currency' },
    { key: 'contacts_frequency', label: 'Contacts Frequency', format: 'text' },
  ],
  life: [
    { key: 'benefit_amount', label: 'Benefit Amount', format: 'currency' },
    { key: 'salary_multiple', label: 'Salary Multiple', format: 'text' },
    { key: 'max_benefit', label: 'Max Benefit', format: 'currency' },
    { key: 'age_reduction_schedule', label: 'Age Reduction', format: 'text' },
  ],
  std: [
    { key: 'benefit_pct', label: 'Benefit %', format: 'percent' },
    { key: 'max_weekly_benefit', label: 'Max Weekly', format: 'currency' },
    { key: 'elimination_period_days', label: 'Elimination (days)', format: 'text' },
    { key: 'max_benefit_duration', label: 'Max Duration', format: 'text' },
  ],
  ltd: [
    { key: 'benefit_pct', label: 'Benefit %', format: 'percent' },
    { key: 'max_monthly_benefit', label: 'Max Monthly', format: 'currency' },
    { key: 'elimination_period_days', label: 'Elimination (days)', format: 'text' },
    { key: 'max_benefit_duration', label: 'Max Duration', format: 'text' },
  ],
};

const TIER_LABELS: Record<string, string> = {
  employee_only: 'Employee Only',
  employee_spouse: 'Employee + Spouse',
  employee_children: 'Employee + Children',
  family: 'Family',
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

const formatPlanDesignValue = (raw: any, format?: 'currency' | 'percent' | 'text'): string => {
  if (raw == null || raw === '') return '—';
  if (format === 'currency' && typeof raw === 'number') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(raw);
  }
  if (format === 'percent' && typeof raw === 'number') {
    return `${raw}%`;
  }
  return String(raw);
};

// ============================================================================
// STYLES
// ============================================================================

const makeStyles = (primaryColor: string, accentColor: string) => StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#1a1a1a',
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 14,
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
  // Title
  titleBlock: {
    marginBottom: 24,
  },
  eyebrow: {
    fontSize: 8,
    color: accentColor,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 10,
    color: '#666666',
  },
  // Section title
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: primaryColor,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
    borderBottomStyle: 'solid',
  },
  // Summary stats
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#fafafa',
    padding: 12,
    borderRadius: 5,
    borderLeftWidth: 3,
    borderLeftColor: accentColor,
    borderLeftStyle: 'solid',
  },
  statLabel: {
    fontSize: 7,
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
  },
  // Narrative bullets
  narrativeBlock: {
    backgroundColor: '#fafafa',
    padding: 16,
    borderRadius: 6,
    marginBottom: 24,
  },
  narrativeTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: primaryColor,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  narrativeBullet: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bulletDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: accentColor,
    marginTop: 6,
    marginRight: 10,
    flexShrink: 0,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
    color: '#1a1a1a',
    lineHeight: 1.5,
  },
  // Top totals table
  totalsTable: {
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderStyle: 'solid',
    borderRadius: 4,
    overflow: 'hidden',
  },
  totalsHeader: {
    flexDirection: 'row',
    backgroundColor: accentColor,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  totalsHeaderCell: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalsRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderTopWidth: 0.5,
    borderTopColor: '#e5e5e5',
    borderTopStyle: 'solid',
  },
  totalsRowFirst: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  totalsCell: {
    fontSize: 9,
    color: '#1a1a1a',
  },
  totalsCellBold: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
  },
  // Carrier appendix
  carrierAppendix: {
    marginBottom: 24,
  },
  carrierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: primaryColor,
    borderBottomStyle: 'solid',
  },
  carrierColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  carrierAppendixName: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
  },
  carrierCostInline: {
    marginLeft: 'auto',
    alignItems: 'flex-end',
  },
  carrierCostAnnual: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
  },
  carrierCostMonthly: {
    fontSize: 8,
    color: '#666666',
    marginTop: 2,
  },
  // Benefit line block
  benefitBlock: {
    marginBottom: 16,
    borderWidth: 0.5,
    borderColor: '#e5e5e5',
    borderStyle: 'solid',
    borderRadius: 4,
    overflow: 'hidden',
  },
  benefitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fafafa',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e5e5',
    borderBottomStyle: 'solid',
  },
  benefitTypeLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: primaryColor,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  benefitPlanName: {
    fontSize: 10,
    color: '#666666',
  },
  benefitContent: {
    padding: 12,
  },
  benefitCostRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eeeeee',
    borderBottomStyle: 'solid',
  },
  benefitCostLabel: {
    fontSize: 8,
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  benefitCostValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
  },
  // Plan design table
  planDesignTable: {
    marginTop: 6,
  },
  planDesignRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 0.25,
    borderBottomColor: '#f0f0f0',
    borderBottomStyle: 'solid',
  },
  planDesignLabel: {
    width: '60%',
    fontSize: 9,
    color: '#666666',
  },
  planDesignValue: {
    width: '40%',
    fontSize: 9,
    color: '#1a1a1a',
    textAlign: 'right',
  },
  // Tier rates
  tierRatesSection: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#e5e5e5',
    borderTopStyle: 'solid',
  },
  tierRatesTitle: {
    fontSize: 8,
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  tierRatesRow: {
    flexDirection: 'row',
    paddingVertical: 3,
  },
  tierLabel: {
    width: '60%',
    fontSize: 9,
    color: '#1a1a1a',
  },
  tierValue: {
    width: '40%',
    fontSize: 9,
    color: '#1a1a1a',
    textAlign: 'right',
    fontFamily: 'Helvetica-Bold',
  },
  // Carrier notes
  carrierNotesBlock: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#fafafa',
    borderRadius: 4,
  },
  carrierNotesLabel: {
    fontSize: 8,
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  carrierNotesText: {
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

export const DetailedTemplate: React.FC<{ data: DetailedTemplateData }> = ({ data }) => {
  const primaryColor = data.agency.primary_color || '#1a1919';
  const accentColor = data.agency.accent_color || '#4c58ae';
  const styles = makeStyles(primaryColor, accentColor);

  const validQuotes = data.quotes.filter(q => q.total_annual_cost !== null);
  const lowestCost = validQuotes.length > 0
    ? Math.min(...validQuotes.map(q => q.total_annual_cost!))
    : null;

  // Merge: custom_takeaways override narrative_bullets if non-empty
  const effectiveBullets = (data.custom_takeaways && data.custom_takeaways.length > 0)
    ? data.custom_takeaways
    : (data.narrative_bullets && data.narrative_bullets.length > 0)
      ? data.narrative_bullets
      : null;

  const customFooterNote = data.custom_footer_note && data.custom_footer_note.trim()
    ? data.custom_footer_note.trim()
    : null;

  return (
    <Document
      title={`${data.client.employer_name} - Detailed Proposal`}
      author={data.agency.name}
      creator="Clarity Health"
    >
      {/* ============================================================ */}
      {/* PAGE 1: Executive Summary */}
      {/* ============================================================ */}
      <Page size="LETTER" style={styles.page}>

        <View style={styles.header} fixed>
          <View>
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

        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>Detailed Proposal</Text>
          <Text style={styles.title}>{data.rfp.name}</Text>
          <Text style={styles.subtitle}>
            Prepared for {data.client.employer_name}
            {data.client.member_count ? ` · ${data.client.member_count} employees` : ''}
            {data.rfp.effective_date ? ` · Effective ${fmtDate(data.rfp.effective_date)}` : ''}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Summary</Text>

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

        {/* Narrative bullets */}
        {effectiveBullets && (
          <View style={styles.narrativeBlock}>
            <Text style={styles.narrativeTitle}>Key Takeaways</Text>
            {effectiveBullets.map((b, i) => (
              <View key={i} style={styles.narrativeBullet}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{b}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Top totals table */}
        <Text style={styles.sectionTitle}>Cost Comparison</Text>
        <View style={styles.totalsTable}>
          <View style={styles.totalsHeader}>
            <Text style={[styles.totalsHeaderCell, { width: '35%' }]}>Carrier</Text>
            <Text style={[styles.totalsHeaderCell, { width: '25%', textAlign: 'right' }]}>Annual</Text>
            <Text style={[styles.totalsHeaderCell, { width: '20%', textAlign: 'right' }]}>Monthly</Text>
            <Text style={[styles.totalsHeaderCell, { width: '20%', textAlign: 'right' }]}>vs Current</Text>
          </View>
          {data.quotes.map((quote, i) => {
            const isLowest = quote.total_annual_cost !== null && quote.total_annual_cost === lowestCost;
            const changeColor = quote.cost_change_pct === null ? '#888888'
              : quote.cost_change_pct > 0 ? '#b91c1c' : '#15803d';
            return (
              <View key={quote.quote_id} style={i === 0 ? styles.totalsRowFirst : styles.totalsRow}>
                <Text style={[styles.totalsCellBold, { width: '35%' }]}>
                  {quote.carrier_name}{isLowest ? '  ★' : ''}
                </Text>
                <Text style={[styles.totalsCellBold, { width: '25%', textAlign: 'right' }]}>
                  {fmtMoney(quote.total_annual_cost)}
                </Text>
                <Text style={[styles.totalsCell, { width: '20%', textAlign: 'right' }]}>
                  {fmtMoney(quote.monthly_cost)}
                </Text>
                <Text style={[styles.totalsCell, { width: '20%', textAlign: 'right', color: changeColor, fontFamily: 'Helvetica-Bold' }]}>
                  {fmtPct(quote.cost_change_pct)}
                </Text>
              </View>
            );
          })}
        </View>

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

      {/* ============================================================ */}
      {/* PAGES 2+: Per-carrier appendix */}
      {/* ============================================================ */}
      {data.quotes.map((quote) => (
        <Page key={quote.quote_id} size="LETTER" style={styles.page}>

          <View style={styles.header} fixed>
            <View>
              {data.agency.logo_url ? (
                <Image src={data.agency.logo_url} style={styles.agencyLogo} />
              ) : (
                <Text style={styles.agencyName}>{data.agency.name}</Text>
              )}
            </View>
            <View style={styles.headerRight}>
              <Text style={{ fontSize: 9, color: '#666666' }}>
                {data.client.employer_name} · {data.rfp.name}
              </Text>
            </View>
          </View>

          {/* Carrier header */}
          <View style={styles.carrierHeader}>
            {quote.carrier_brand_color && (
              <View style={[styles.carrierColorDot, { backgroundColor: quote.carrier_brand_color }]} />
            )}
            <Text style={styles.carrierAppendixName}>{quote.carrier_name}</Text>
            <View style={styles.carrierCostInline}>
              <Text style={styles.carrierCostAnnual}>{fmtMoney(quote.total_annual_cost)} / year</Text>
              <Text style={styles.carrierCostMonthly}>
                {fmtMoney(quote.monthly_cost)} per month
                {quote.cost_change_pct !== null && ` · ${fmtPct(quote.cost_change_pct)} vs current`}
              </Text>
            </View>
          </View>

          {/* Per-benefit blocks */}
          {(quote.lines || []).map((line) => {
            const fields = PLAN_DESIGN_FIELDS[line.benefit_type] || [];
            const tierRates = (line.plan_design as any)?.tier_rates || (line as any).tier_rates || null;
            return (
              <View key={line.id} style={styles.benefitBlock} wrap={false}>
                <View style={styles.benefitHeader}>
                  <Text style={styles.benefitTypeLabel}>
                    {BENEFIT_TYPE_LABELS[line.benefit_type] || line.benefit_type}
                  </Text>
                  <Text style={styles.benefitPlanName}>{line.plan_name || '—'}</Text>
                </View>
                <View style={styles.benefitContent}>
                  <View style={styles.benefitCostRow}>
                    <View>
                      <Text style={styles.benefitCostLabel}>Monthly Premium</Text>
                      <Text style={styles.benefitCostValue}>{fmtMoney(line.monthly_premium)}</Text>
                    </View>
                    <View>
                      <Text style={[styles.benefitCostLabel, { textAlign: 'right' }]}>Annual Cost</Text>
                      <Text style={[styles.benefitCostValue, { textAlign: 'right' }]}>{fmtMoney(line.annual_cost)}</Text>
                    </View>
                  </View>

                  {/* Plan design fields */}
                  {fields.length > 0 && line.plan_design && (
                    <View style={styles.planDesignTable}>
                      {fields.map((f) => (
                        <View key={f.key} style={styles.planDesignRow}>
                          <Text style={styles.planDesignLabel}>{f.label}</Text>
                          <Text style={styles.planDesignValue}>
                            {formatPlanDesignValue((line.plan_design as any)?.[f.key], f.format)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Tier rates */}
                  {tierRates && typeof tierRates === 'object' && Object.keys(tierRates).length > 0 && (
                    <View style={styles.tierRatesSection}>
                      <Text style={styles.tierRatesTitle}>Tier Rates</Text>
                      {Object.entries(tierRates).map(([tierKey, rate]) => {
                        if (rate === null || rate === undefined) return null;
                        return (
                          <View key={tierKey} style={styles.tierRatesRow}>
                            <Text style={styles.tierLabel}>{TIER_LABELS[tierKey] || tierKey}</Text>
                            <Text style={styles.tierValue}>
                              {typeof rate === 'number' ? fmtMoney(rate) : String(rate)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              </View>
            );
          })}

          {/* Carrier notes */}
          {quote.notes && quote.notes.trim() && (
            <View style={styles.carrierNotesBlock}>
              <Text style={styles.carrierNotesLabel}>Carrier Notes</Text>
              <Text style={styles.carrierNotesText}>{quote.notes}</Text>
            </View>
          )}

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
      ))}
    </Document>
  );
};