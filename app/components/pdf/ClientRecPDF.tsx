import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import {
  BrandedPDF,
  reportStyles,
  PDF_COLORS,
} from './BrandedPDF';

// =====================================================
// CLIENT RECOMMENDATION PDF
// White-label deliverable that brokers hand to clients.
// =====================================================

// ---- Types matching app/broker/clients/[id]/recommendations/[recId]/page.tsx ----

export type RankedPlan = {
  id: string;
  name: string;
  issuer: string;
  type: string;
  metalLevel: string;
  premium: number;
  premiumWithCredit: number;
  deductible: number | null;
  maxOutOfPocket: number | null;
  hsaEligible: boolean;
  rank: number;
  matchScore: number;
  summary: string;
  pros: string[];
  cons: string[];
  claimsInsight: string | null;
};

export type RecommendationData = {
  id: string;
  created_at: string;
  zip_code: string | null;
  county_name: string | null;
  state: string | null;
  household_size: number | null;
  annual_income: number | null;
  ages: number[] | null;
  uses_tobacco: boolean | null;
  total_plans_available: number | null;
  overall_advice: string | null;
  plans: RankedPlan[];
};

export type ClientData = {
  first_name: string;
  last_name: string;
  employer_name: string | null;
  member_count: number | null;
  state: string | null;
};

export type ClaimsParsedData = {
  conditions: string[] | null;
  procedures: string[] | null;
  medications: string[] | null;
  specialty_visits_count: number | null;
  prescription_count: number | null;
  total_billed: number | null;
  total_out_of_pocket: number | null;
  provider_name: string | null;
  summary_text: string | null;
}[];

interface ClientRecPDFProps {
  agencyName: string;
  brokerName: string;
  client: ClientData;
  rec: RecommendationData;
  claims: ClaimsParsedData;
  includeClaims: boolean;
  includeReasoning: boolean;
  topN: number;
}

// ---- Helpers ----

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
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ---- Local styles for the rec PDF ----

const s = StyleSheet.create({
  // Client overview block
  overviewBox: {
    backgroundColor: PDF_COLORS.white,
    borderRadius: 4,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: PDF_COLORS.accent3,
  },
  overviewName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 16,
    color: PDF_COLORS.ink,
    marginBottom: 2,
  },
  overviewMeta: {
    fontSize: 10,
    color: PDF_COLORS.textMuted,
    marginBottom: 10,
  },
  overviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  overviewCell: {
    width: '33%',
    paddingVertical: 4,
  },
  // Top pick highlight card
  topPickBox: {
    backgroundColor: PDF_COLORS.white,
    borderRadius: 4,
    padding: 14,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: PDF_COLORS.accent2,
    position: 'relative',
  },
  topPickBadge: {
    position: 'absolute',
    top: -8,
    left: 14,
    backgroundColor: PDF_COLORS.accent2,
    color: PDF_COLORS.white,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    letterSpacing: 0.5,
  },
  topPickHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    marginTop: 6,
  },
  topPickName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 15,
    color: PDF_COLORS.ink,
    flex: 1,
    paddingRight: 8,
  },
  topPickIssuer: {
    fontSize: 9,
    color: PDF_COLORS.textMuted,
    marginTop: 2,
  },
  topPickPremium: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 16,
    color: PDF_COLORS.ink,
  },
  topPickPremiumLabel: {
    fontSize: 8,
    color: PDF_COLORS.textMuted,
    textAlign: 'right',
  },
  // Plan card (full ranking)
  planCard: {
    backgroundColor: PDF_COLORS.white,
    borderRadius: 4,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 2,
    borderLeftColor: PDF_COLORS.border,
  },
  planHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  planRank: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PDF_COLORS.warm,
    color: PDF_COLORS.ink,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    paddingTop: 5,
    marginRight: 8,
  },
  planRankTop: {
    backgroundColor: PDF_COLORS.accent2,
    color: PDF_COLORS.white,
  },
  planTitleBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  planName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: PDF_COLORS.ink,
  },
  planIssuer: {
    fontSize: 8,
    color: PDF_COLORS.textMuted,
    marginTop: 1,
  },
  planRight: {
    alignItems: 'flex-end',
  },
  planPremium: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    color: PDF_COLORS.ink,
  },
  planMatch: {
    fontSize: 8,
    color: PDF_COLORS.accent2,
    fontFamily: 'Helvetica-Bold',
    marginTop: 1,
  },
  planSummary: {
    fontSize: 9,
    color: PDF_COLORS.ink2,
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 8,
    lineHeight: 1.4,
  },
  planMetricsRow: {
    flexDirection: 'row',
    paddingTop: 6,
    paddingBottom: 6,
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.border,
    marginTop: 4,
  },
  planMetricCell: {
    flex: 1,
  },
  planMetricLabel: {
    fontSize: 7,
    color: PDF_COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 1,
  },
  planMetricValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: PDF_COLORS.ink,
  },
  prosConsRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  prosConsCol: {
    flex: 1,
    paddingHorizontal: 4,
  },
  prosConsLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  prosLabel: {
    color: '#5a7857',
  },
  consLabel: {
    color: '#a44',
  },
  prosConsItem: {
    fontSize: 8,
    color: PDF_COLORS.ink2,
    marginBottom: 2,
    lineHeight: 1.3,
  },
  insightBox: {
    backgroundColor: '#fff8e8',
    borderRadius: 3,
    padding: 8,
    marginTop: 8,
  },
  insightText: {
    fontSize: 8,
    color: '#7a6500',
    lineHeight: 1.4,
  },
  // Claims summary
  claimsBox: {
    backgroundColor: PDF_COLORS.white,
    borderRadius: 4,
    padding: 14,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: PDF_COLORS.accent3,
  },
  claimsSummary: {
    fontSize: 10,
    color: PDF_COLORS.ink2,
    lineHeight: 1.5,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  claimsTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  claimsTag: {
    backgroundColor: PDF_COLORS.warm,
    color: PDF_COLORS.ink2,
    fontSize: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    marginRight: 4,
    marginBottom: 4,
  },
  claimsMetricsRow: {
    flexDirection: 'row',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.border,
  },
  claimsMetric: {
    flex: 1,
  },
  // Advisor summary
  adviceBox: {
    backgroundColor: '#f4f8f0',
    borderRadius: 4,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: PDF_COLORS.accent2,
  },
  adviceTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: PDF_COLORS.ink,
    marginBottom: 6,
  },
  adviceText: {
    fontSize: 10,
    color: PDF_COLORS.ink2,
    lineHeight: 1.5,
  },
  // Disclaimer
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

export function ClientRecPDF({
  agencyName,
  brokerName,
  client,
  rec,
  claims,
  includeClaims,
  includeReasoning,
  topN,
}: ClientRecPDFProps) {
  const planList = Array.isArray(rec.plans) ? rec.plans.slice(0, topN) : [];
  const topPlan = planList[0];
  const otherPlans = planList.slice(1);

  // Aggregate claims data across all parsed claims
  const allConditions = new Set<string>();
  const allProcedures = new Set<string>();
  const allMedications = new Set<string>();
  let totalSpecialtyVisits = 0;
  let totalRx = 0;
  let totalOOP = 0;
  let claimSummaries: string[] = [];

  for (const c of claims || []) {
    (c.conditions || []).forEach((x) => x && allConditions.add(x));
    (c.procedures || []).forEach((x) => x && allProcedures.add(x));
    (c.medications || []).forEach((x) => x && allMedications.add(x));
    totalSpecialtyVisits += c.specialty_visits_count || 0;
    totalRx += c.prescription_count || 0;
    totalOOP += Number(c.total_out_of_pocket || 0);
    if (c.summary_text) claimSummaries.push(c.summary_text);
  }

  const hasClaimsData = includeClaims && (claims?.length || 0) > 0;
  const clientFullName = `${client.first_name} ${client.last_name}`;

  return (
    <BrandedPDF
      agencyName={agencyName}
      reportTitle={`Plan Recommendations: ${clientFullName}`}
      reportSubtitle={`Personalized health plan analysis · Run ${formatDate(
        rec.created_at
      )}`}
    >
      {/* Client Overview */}
      <View style={s.overviewBox}>
        <Text style={s.overviewName}>{clientFullName}</Text>
        <Text style={s.overviewMeta}>
          {client.employer_name ? `${client.employer_name} · ` : ''}
          {client.member_count ? `${client.member_count} members` : 'Individual'}
        </Text>
        <View style={s.overviewGrid}>
          <View style={s.overviewCell}>
            <Text style={reportStyles.label}>Location</Text>
            <Text style={reportStyles.value}>
              {rec.county_name ? `${rec.county_name}, ` : ''}
              {rec.state || '—'} {rec.zip_code || ''}
            </Text>
          </View>
          <View style={s.overviewCell}>
            <Text style={reportStyles.label}>Household</Text>
            <Text style={reportStyles.value}>
              {rec.household_size || 1}{' '}
              {(rec.household_size || 1) === 1 ? 'person' : 'people'}
            </Text>
          </View>
          <View style={s.overviewCell}>
            <Text style={reportStyles.label}>Annual Income</Text>
            <Text style={reportStyles.value}>
              {rec.annual_income
                ? `$${rec.annual_income.toLocaleString()}`
                : '—'}
            </Text>
          </View>
          <View style={s.overviewCell}>
            <Text style={reportStyles.label}>Ages</Text>
            <Text style={reportStyles.value}>
              {Array.isArray(rec.ages) && rec.ages.length > 0
                ? rec.ages.join(', ')
                : '—'}
            </Text>
          </View>
          <View style={s.overviewCell}>
            <Text style={reportStyles.label}>Tobacco</Text>
            <Text style={reportStyles.value}>
              {rec.uses_tobacco ? 'Yes' : 'No'}
            </Text>
          </View>
          <View style={s.overviewCell}>
            <Text style={reportStyles.label}>Plans Considered</Text>
            <Text style={reportStyles.value}>
              {rec.total_plans_available || 0} from CMS
            </Text>
          </View>
        </View>
      </View>

      {/* Claims Summary */}
      {hasClaimsData && (
        <View style={s.claimsBox}>
          <Text style={reportStyles.sectionTitle}>Claims Insights</Text>
          {claimSummaries.length > 0 && (
            <Text style={s.claimsSummary}>"{claimSummaries[0]}"</Text>
          )}

          {allConditions.size > 0 && (
            <>
              <Text style={reportStyles.label}>Conditions identified</Text>
              <View style={s.claimsTagRow}>
                {Array.from(allConditions).slice(0, 8).map((c, i) => (
                  <Text key={i} style={s.claimsTag}>
                    {c}
                  </Text>
                ))}
              </View>
            </>
          )}

          {allMedications.size > 0 && (
            <>
              <Text style={[reportStyles.label, { marginTop: 6 }]}>
                Active prescriptions
              </Text>
              <View style={s.claimsTagRow}>
                {Array.from(allMedications).slice(0, 8).map((m, i) => (
                  <Text key={i} style={s.claimsTag}>
                    {m}
                  </Text>
                ))}
              </View>
            </>
          )}

          <View style={s.claimsMetricsRow}>
            <View style={s.claimsMetric}>
              <Text style={s.planMetricLabel}>Specialty Visits</Text>
              <Text style={s.planMetricValue}>{totalSpecialtyVisits}</Text>
            </View>
            <View style={s.claimsMetric}>
              <Text style={s.planMetricLabel}>Prescriptions</Text>
              <Text style={s.planMetricValue}>{totalRx}</Text>
            </View>
            <View style={s.claimsMetric}>
              <Text style={s.planMetricLabel}>Annual Out-of-Pocket</Text>
              <Text style={s.planMetricValue}>{fmtMoney(totalOOP)}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Advisor Summary */}
      {rec.overall_advice && (
        <View style={s.adviceBox}>
          <Text style={s.adviceTitle}>Advisor Summary</Text>
          <Text style={s.adviceText}>{rec.overall_advice}</Text>
        </View>
      )}

      {/* Top Pick */}
      {topPlan && (
        <View style={s.topPickBox} wrap={false}>
          <Text style={s.topPickBadge}>★ TOP MATCH</Text>
          <View style={s.topPickHeader}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={s.topPickName}>{topPlan.name}</Text>
              <Text style={s.topPickIssuer}>
                {topPlan.issuer} · {topPlan.metalLevel} · {topPlan.type}
                {topPlan.hsaEligible ? ' · HSA-eligible' : ''}
              </Text>
            </View>
            <View>
              <Text style={s.topPickPremium}>
                {fmtMoney(topPlan.premiumWithCredit ?? topPlan.premium)}
                <Text style={{ fontSize: 9, color: PDF_COLORS.textMuted }}>
                  {' '}/mo
                </Text>
              </Text>
              <Text style={s.topPickPremiumLabel}>
                Match: {topPlan.matchScore}/100
              </Text>
            </View>
          </View>

          <Text style={s.planSummary}>"{topPlan.summary}"</Text>

          <View style={s.planMetricsRow}>
            <View style={s.planMetricCell}>
              <Text style={s.planMetricLabel}>Deductible</Text>
              <Text style={s.planMetricValue}>
                {fmtMoney(topPlan.deductible)}
              </Text>
            </View>
            <View style={s.planMetricCell}>
              <Text style={s.planMetricLabel}>Max OOP</Text>
              <Text style={s.planMetricValue}>
                {fmtMoney(topPlan.maxOutOfPocket)}
              </Text>
            </View>
            <View style={s.planMetricCell}>
              <Text style={s.planMetricLabel}>Full Premium</Text>
              <Text style={s.planMetricValue}>
                {fmtMoney(topPlan.premium)}/mo
              </Text>
            </View>
          </View>

          {includeReasoning && (
            <View style={s.prosConsRow}>
              <View style={s.prosConsCol}>
                <Text style={[s.prosConsLabel, s.prosLabel]}>PROS</Text>
                {(topPlan.pros || []).map((p, i) => (
                  <Text key={i} style={s.prosConsItem}>
                    • {p}
                  </Text>
                ))}
              </View>
              <View style={s.prosConsCol}>
                <Text style={[s.prosConsLabel, s.consLabel]}>CONS</Text>
                {(topPlan.cons || []).map((c, i) => (
                  <Text key={i} style={s.prosConsItem}>
                    • {c}
                  </Text>
                ))}
              </View>
            </View>
          )}

          {topPlan.claimsInsight && includeClaims && (
            <View style={s.insightBox}>
              <Text style={s.insightText}>
                Claims insight: {topPlan.claimsInsight}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Other Plans */}
      {otherPlans.length > 0 && (
        <>
          <Text style={[reportStyles.sectionTitle, { marginTop: 8 }]}>
            Additional Plan Options
          </Text>
          {otherPlans.map((plan) => (
            <View key={plan.id} style={s.planCard} wrap={false}>
              <View style={s.planHeaderRow}>
                <View style={s.planTitleBlock}>
                  <Text style={s.planRank}>#{plan.rank}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.planName}>{plan.name}</Text>
                    <Text style={s.planIssuer}>
                      {plan.issuer} · {plan.metalLevel}
                      {plan.hsaEligible ? ' · HSA' : ''}
                    </Text>
                  </View>
                </View>
                <View style={s.planRight}>
                  <Text style={s.planPremium}>
                    {fmtMoney(plan.premiumWithCredit ?? plan.premium)}/mo
                  </Text>
                  <Text style={s.planMatch}>{plan.matchScore}/100</Text>
                </View>
              </View>

              {includeReasoning && plan.summary && (
                <Text style={s.planSummary}>"{plan.summary}"</Text>
              )}

              <View style={s.planMetricsRow}>
                <View style={s.planMetricCell}>
                  <Text style={s.planMetricLabel}>Deductible</Text>
                  <Text style={s.planMetricValue}>
                    {fmtMoney(plan.deductible)}
                  </Text>
                </View>
                <View style={s.planMetricCell}>
                  <Text style={s.planMetricLabel}>Max OOP</Text>
                  <Text style={s.planMetricValue}>
                    {fmtMoney(plan.maxOutOfPocket)}
                  </Text>
                </View>
                <View style={s.planMetricCell}>
                  <Text style={s.planMetricLabel}>Full Premium</Text>
                  <Text style={s.planMetricValue}>
                    {fmtMoney(plan.premium)}/mo
                  </Text>
                </View>
              </View>

              {includeReasoning && (
                <View style={s.prosConsRow}>
                  <View style={s.prosConsCol}>
                    <Text style={[s.prosConsLabel, s.prosLabel]}>PROS</Text>
                    {(plan.pros || []).slice(0, 4).map((p, i) => (
                      <Text key={i} style={s.prosConsItem}>
                        • {p}
                      </Text>
                    ))}
                  </View>
                  <View style={s.prosConsCol}>
                    <Text style={[s.prosConsLabel, s.consLabel]}>CONS</Text>
                    {(plan.cons || []).slice(0, 4).map((c, i) => (
                      <Text key={i} style={s.prosConsItem}>
                        • {c}
                      </Text>
                    ))}
                  </View>
                </View>
              )}

              {plan.claimsInsight && includeClaims && (
                <View style={s.insightBox}>
                  <Text style={s.insightText}>
                    Claims insight: {plan.claimsInsight}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </>
      )}

      {/* Disclaimer */}
      <Text style={s.disclaimer}>
        This recommendation is provided for informational purposes only and
        does not constitute medical, legal, or financial advice. Plan details
        are based on data from the Healthcare.gov Marketplace at the time of
        analysis and may change. Premium estimates assume eligibility for
        applicable subsidies. Please review official plan documents (Summary
        of Benefits and Coverage) before enrolling. Prepared by {brokerName}{' '}
        of {agencyName}.
      </Text>
    </BrandedPDF>
  );
}