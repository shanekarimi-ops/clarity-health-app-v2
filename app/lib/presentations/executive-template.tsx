import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type { StandardTemplateData } from './standard-template';

// Executive template uses the same data shape as Standard,
// but also accepts optional AI narrative bullets.
export type ExecutiveTemplateData = StandardTemplateData & {
  narrative_bullets?: string[];
};

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

const makeStyles = (primaryColor: string, accentColor: string) => StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 50,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a1a1a',
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 36,
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
  // Title
  titleSection: {
    marginBottom: 36,
  },
  eyebrow: {
    fontSize: 9,
    color: accentColor,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 12,
    color: '#666666',
    lineHeight: 1.5,
  },
  // Hero cost block (centerpiece)
  heroBlock: {
    backgroundColor: '#fafafa',
    borderRadius: 8,
    padding: 32,
    marginBottom: 36,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: accentColor,
    borderLeftStyle: 'solid',
  },
  heroLabel: {
    fontSize: 10,
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  heroAmount: {
    fontSize: 48,
    fontFamily: 'Helvetica-Bold',
    color: primaryColor,
    marginBottom: 6,
    letterSpacing: -1,
  },
  heroCarrier: {
    fontSize: 14,
    color: '#1a1a1a',
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  heroChange: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginTop: 6,
  },
  heroMonthly: {
    fontSize: 11,
    color: '#666666',
    marginTop: 8,
  },
  // Comparison row (if multiple carriers)
  comparisonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 36,
  },
  comparisonBox: {
    flex: 1,
    padding: 14,
    backgroundColor: '#fafafa',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftStyle: 'solid',
  },
  comparisonCarrier: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  comparisonCost: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
  },
  comparisonSubtext: {
    fontSize: 9,
    color: '#666666',
    marginTop: 4,
  },
  // Narrative bullets
  narrativeSection: {
    marginBottom: 24,
  },
  narrativeTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: primaryColor,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 14,
  },
  narrativeBullet: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  bulletDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: accentColor,
    marginTop: 6,
    marginRight: 12,
    flexShrink: 0,
  },
  bulletText: {
    flex: 1,
    fontSize: 11,
    color: '#1a1a1a',
    lineHeight: 1.6,
  },
  noNarrativeBox: {
    backgroundColor: '#fafafa',
    padding: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderStyle: 'solid',
  },
  noNarrativeText: {
    fontSize: 10,
    color: '#888888',
    fontStyle: 'italic',
    lineHeight: 1.5,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 50,
    right: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#cccccc',
    borderTopStyle: 'solid',
    fontSize: 8,
    color: '#888888',
  },
});

export const ExecutiveTemplate: React.FC<{ data: ExecutiveTemplateData }> = ({ data }) => {
  const primaryColor = data.agency.primary_color || '#1a1919';
  const accentColor = data.agency.accent_color || '#4c58ae';
  const styles = makeStyles(primaryColor, accentColor);

  // Find lowest annual cost carrier (the "winner")
  const validQuotes = data.quotes.filter(q => q.total_annual_cost !== null);
  const lowestQuote = validQuotes.length > 0
    ? validQuotes.reduce((acc, q) =>
        (q.total_annual_cost ?? Infinity) < (acc.total_annual_cost ?? Infinity) ? q : acc
      )
    : null;

  const otherQuotes = lowestQuote
    ? data.quotes.filter(q => q.quote_id !== lowestQuote.quote_id)
    : data.quotes;

  const bullets = data.narrative_bullets && data.narrative_bullets.length > 0
    ? data.narrative_bullets
    : null;

  return (
    <Document
      title={`${data.client.employer_name} - Executive Summary`}
      author={data.agency.name}
      creator="Clarity Health"
    >
      <Page size="LETTER" style={styles.page}>

        {/* Header */}
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

        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.eyebrow}>Executive Summary</Text>
          <Text style={styles.title}>{data.rfp.name}</Text>
          <Text style={styles.subtitle}>
            Prepared for {data.client.employer_name}
            {data.client.member_count ? ` · ${data.client.member_count} employees` : ''}
            {data.rfp.effective_date ? ` · Effective ${fmtDate(data.rfp.effective_date)}` : ''}
          </Text>
        </View>

        {/* Hero cost block */}
        {lowestQuote ? (
          <View style={styles.heroBlock}>
            <Text style={styles.heroLabel}>Recommended Carrier</Text>
            <Text style={styles.heroAmount}>{fmtMoney(lowestQuote.total_annual_cost)}</Text>
            <Text style={styles.heroCarrier}>{lowestQuote.carrier_name}</Text>
            <Text style={styles.heroMonthly}>{fmtMoney(lowestQuote.monthly_cost)} per month</Text>
            {lowestQuote.cost_change_pct !== null && (
              <Text style={[
                styles.heroChange,
                { color: lowestQuote.cost_change_pct > 0 ? '#b91c1c' : '#15803d' },
              ]}>
                {fmtPct(lowestQuote.cost_change_pct)} vs current annual cost
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.heroBlock}>
            <Text style={styles.noNarrativeText}>No carrier quotes available.</Text>
          </View>
        )}

        {/* Other carriers compared (if any) */}
        {otherQuotes.length > 0 && (
          <View style={styles.comparisonRow}>
            {otherQuotes.slice(0, 3).map((q) => (
              <View key={q.quote_id} style={[
                styles.comparisonBox,
                { borderLeftColor: q.carrier_brand_color || '#cccccc' },
              ]}>
                <Text style={styles.comparisonCarrier}>{q.carrier_name}</Text>
                <Text style={styles.comparisonCost}>{fmtMoney(q.total_annual_cost)}</Text>
                <Text style={styles.comparisonSubtext}>
                  {fmtMoney(q.monthly_cost)}/mo
                  {q.cost_change_pct !== null && ` · ${fmtPct(q.cost_change_pct)}`}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Narrative bullets */}
        <View style={styles.narrativeSection}>
          <Text style={styles.narrativeTitle}>Key Takeaways</Text>
          {bullets ? (
            bullets.map((b, i) => (
              <View key={i} style={styles.narrativeBullet}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{b}</Text>
              </View>
            ))
          ) : (
            <View style={styles.noNarrativeBox}>
              <Text style={styles.noNarrativeText}>
                Generate an AI summary from the Quote Comparison view to populate this section with key talking points.
              </Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>{data.agency.name} · Confidential</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>

      </Page>
    </Document>
  );
};