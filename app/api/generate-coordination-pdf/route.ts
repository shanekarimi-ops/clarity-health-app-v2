import { NextResponse } from 'next/server';
import { renderToBuffer, Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import React from 'react';

export const runtime = 'nodejs';
export const maxDuration = 30;

// ---------- Types (mirror coordinate page) ----------
type Gotcha = {
  severity: 'warn' | 'info' | 'positive';
  tag: string;
  message: string;
};

type Scenario = {
  id: string;
  rank: 1 | 2 | 3;
  scenario_type: string;
  scenario_label: string;
  selfPlan: { id: string; name: string; tier: string } | null;
  spousePlan: { id: string; name: string; tier: string } | null;
  monthlyPremium: number;
  annualPremium: number;
  expectedAnnualOOP: number;
  expectedAnnualCost: number;
  worstCaseAnnualCost: number;
  hsaEligible: boolean;
  gotchas: Gotcha[];
  whoIsOn: { self: string; spouse: string; children: string };
  ai_insight: string | null;
};

type CoordinationResult = {
  success: boolean;
  household_size: number;
  coverage_scope: string;
  utilization_level: 'low' | 'moderate' | 'high';
  expected_annual_medical_spend: number;
  claims_used: number;
  self_employer_name: string;
  spouse_employer_name: string;
  self_plan_count: number;
  spouse_plan_count: number;
  total_scenarios_evaluated: number;
  top_scenarios: Scenario[];
  household_income: number;
  spouse_income: number;
  combined_income: number;
  marginal_tax_rate: number;
  spousal_surcharge_applies: boolean;
  spousal_surcharge_amount: number | null;
  ai_overall_recommendation: string | null;
  ai_key_tradeoffs: string[];
  ai_used: boolean;
};

// ---------- Helpers ----------
function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return '$' + Math.round(n).toLocaleString();
}

// Combines style objects, filtering out falsy entries. The `any` cast keeps
// react-pdf's strict SVGPresentationAttributes types from rejecting our usage.
function combine(...styleObjs: any[]): any {
  return styleObjs.filter(Boolean);
}

const scopeLabelMap: Record<string, string> = {
  individual: 'Just you (employee-only)',
  employee_plus_spouse: 'You + spouse',
  employee_plus_children: 'You + child(ren)',
  family: 'Whole family',
};

const utilizationLabelMap: Record<string, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
};

// ---------- Styles ----------
const COLORS = {
  navy: '#1e3a5f',
  sage: '#7a9b76',
  cream: '#faf7f2',
  sageBg: '#ebf3ea',
  sageBorder: '#c7d9c5',
  warnBg: '#fef9e8',
  warnBorder: '#f0e6b8',
  warnColor: '#806c1e',
  infoBg: '#eaf1f7',
  infoBorder: '#c5d6e8',
  infoColor: '#2c4a6b',
  positiveBg: '#f5f8f4',
  positiveBorder: '#c7d9c5',
  positiveColor: '#5a7857',
  text: '#3a4d68',
  muted: '#6b7785',
  border: '#eef1f4',
};

const styles: any = StyleSheet.create({
  page: {
    paddingTop: 50,
    paddingBottom: 50,
    paddingHorizontal: 50,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: COLORS.text,
    backgroundColor: COLORS.cream,
  },
  coverPage: {
    paddingTop: 50,
    paddingBottom: 50,
    paddingHorizontal: 50,
    fontFamily: 'Helvetica',
    color: COLORS.text,
    backgroundColor: COLORS.cream,
  },
  brand: {
    fontSize: 11,
    color: COLORS.sage,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    marginBottom: 24,
  },
  coverTitle: {
    fontSize: 28,
    color: COLORS.navy,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 8,
    lineHeight: 1.2,
  },
  coverSubtitle: {
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 36,
    lineHeight: 1.4,
  },
  pageTitle: {
    fontSize: 18,
    color: COLORS.navy,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 12,
    color: COLORS.sage,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 6,
  },
  bodyText: {
    fontSize: 10,
    lineHeight: 1.5,
    color: COLORS.text,
    marginBottom: 8,
  },
  smallText: {
    fontSize: 9,
    color: COLORS.muted,
    lineHeight: 1.4,
  },
  // Summary panel
  summaryPanel: {
    backgroundColor: COLORS.sageBg,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.sage,
    borderLeftStyle: 'solid',
    padding: 14,
    marginBottom: 18,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 9,
    color: COLORS.muted,
    fontFamily: 'Helvetica-Bold',
    width: 130,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 10,
    color: COLORS.navy,
    flex: 1,
  },
  // Scenario card
  scenarioCard: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#ffffff',
  },
  scenarioCardTop: {
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: COLORS.sage,
    backgroundColor: '#f9fcf9',
  },
  scenarioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  rankPill: {
    backgroundColor: COLORS.sage,
    color: '#ffffff',
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    paddingTop: 2,
    paddingBottom: 2,
    paddingHorizontal: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  rankPillSecondary: {
    backgroundColor: '#5b7a99',
  },
  recommendedTag: {
    backgroundColor: COLORS.sage,
    color: '#ffffff',
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    paddingTop: 2,
    paddingBottom: 2,
    paddingHorizontal: 5,
    borderRadius: 3,
    marginRight: 8,
    letterSpacing: 0.5,
  },
  scenarioLabel: {
    fontSize: 13,
    color: COLORS.navy,
    fontFamily: 'Helvetica-Bold',
    flex: 1,
  },
  whoIsOnRow: {
    fontSize: 9,
    color: COLORS.muted,
    marginBottom: 8,
    lineHeight: 1.4,
  },
  // Cost grid
  costRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  costBox: {
    flex: 1,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 6,
    marginRight: 6,
    backgroundColor: '#ffffff',
  },
  costBoxLast: {
    marginRight: 0,
  },
  costBoxHighlight: {
    backgroundColor: COLORS.sageBg,
    borderColor: COLORS.sageBorder,
  },
  costBoxSubtle: {
    backgroundColor: '#fafbfc',
  },
  costLabel: {
    fontSize: 7,
    color: COLORS.muted,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  costValue: {
    fontSize: 12,
    color: COLORS.navy,
    fontFamily: 'Helvetica-Bold',
  },
  // Plan details
  planRow: {
    fontSize: 9,
    color: COLORS.text,
    marginBottom: 3,
    lineHeight: 1.4,
  },
  hsaTag: {
    fontSize: 8,
    color: COLORS.positiveColor,
    marginTop: 4,
    marginBottom: 6,
  },
  // AI insight
  aiInsight: {
    backgroundColor: '#fafbfc',
    borderLeftWidth: 2,
    borderLeftColor: '#5b7a99',
    borderLeftStyle: 'solid',
    paddingTop: 6,
    paddingBottom: 6,
    paddingHorizontal: 8,
    fontSize: 9,
    color: COLORS.text,
    lineHeight: 1.4,
    marginBottom: 8,
  },
  // Gotchas
  gotchaRow: {
    flexDirection: 'row',
    paddingTop: 5,
    paddingBottom: 5,
    paddingHorizontal: 8,
    borderRadius: 3,
    borderWidth: 1,
    borderStyle: 'solid',
    marginBottom: 4,
  },
  gotchaIcon: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    marginRight: 6,
  },
  gotchaText: {
    fontSize: 9,
    flex: 1,
    lineHeight: 1.4,
  },
  // AI rec card
  recommendCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 14,
    marginBottom: 14,
  },
  recommendCallout: {
    marginTop: 10,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 10,
    backgroundColor: COLORS.positiveBg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: COLORS.positiveBorder,
    borderRadius: 4,
    fontSize: 9,
    color: COLORS.navy,
  },
  // Trade-offs
  tradeoffItem: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  tradeoffBullet: {
    fontSize: 10,
    color: COLORS.sage,
    fontFamily: 'Helvetica-Bold',
    width: 12,
  },
  tradeoffText: {
    flex: 1,
    fontSize: 10,
    color: COLORS.text,
    lineHeight: 1.5,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 50,
    right: 50,
    fontSize: 8,
    color: COLORS.muted,
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    borderTopStyle: 'solid',
    paddingTop: 8,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 30,
    right: 50,
    fontSize: 8,
    color: COLORS.muted,
  },
});

const gotchaPalette = {
  warn: { bg: COLORS.warnBg, border: COLORS.warnBorder, color: COLORS.warnColor, icon: '!' },
  info: { bg: COLORS.infoBg, border: COLORS.infoBorder, color: COLORS.infoColor, icon: 'i' },
  positive: { bg: COLORS.positiveBg, border: COLORS.positiveBorder, color: COLORS.positiveColor, icon: '+' },
};

// ---------- Components ----------
function GotchaRowEl({ gotcha }: { gotcha: Gotcha }) {
  const palette = gotchaPalette[gotcha.severity] || gotchaPalette.info;
  return React.createElement(
    View,
    {
      style: combine(styles.gotchaRow, { backgroundColor: palette.bg, borderColor: palette.border }),
    },
    React.createElement(Text, { style: combine(styles.gotchaIcon, { color: palette.color }) }, palette.icon),
    React.createElement(
      Text,
      { style: combine(styles.gotchaText, { color: palette.color }) },
      React.createElement(Text, { style: { fontFamily: 'Helvetica-Bold' } }, gotcha.tag + ': '),
      gotcha.message
    )
  );
}

function ScenarioCardEl({ scenario }: { scenario: Scenario }) {
  const isTop = scenario.rank === 1;

  const headerChildren: any[] = [];
  if (isTop) {
    headerChildren.push(React.createElement(Text, { key: 'rec', style: styles.recommendedTag }, 'RECOMMENDED'));
  }
  headerChildren.push(
    React.createElement(
      Text,
      {
        key: 'rank',
        style: combine(styles.rankPill, !isTop ? styles.rankPillSecondary : null),
      },
      '#' + scenario.rank
    )
  );
  headerChildren.push(
    React.createElement(Text, { key: 'label', style: styles.scenarioLabel }, scenario.scenario_label)
  );

  const whoLine =
    'You: ' + scenario.whoIsOn.self +
    '   |   Spouse: ' + scenario.whoIsOn.spouse +
    (scenario.whoIsOn.children && scenario.whoIsOn.children !== 'none'
      ? '   |   Kids: ' + scenario.whoIsOn.children
      : '');

  return React.createElement(
    View,
    { wrap: false, style: combine(styles.scenarioCard, isTop ? styles.scenarioCardTop : null) },
    React.createElement(View, { style: styles.scenarioHeader }, ...headerChildren),
    React.createElement(Text, { style: styles.whoIsOnRow }, whoLine),
    React.createElement(
      View,
      { style: styles.costRow },
      React.createElement(
        View,
        { style: styles.costBox },
        React.createElement(Text, { style: styles.costLabel }, 'Annual premium'),
        React.createElement(Text, { style: styles.costValue }, fmtMoney(scenario.annualPremium))
      ),
      React.createElement(
        View,
        { style: styles.costBox },
        React.createElement(Text, { style: styles.costLabel }, 'Expected OOP'),
        React.createElement(Text, { style: styles.costValue }, fmtMoney(scenario.expectedAnnualOOP))
      ),
      React.createElement(
        View,
        { style: combine(styles.costBox, styles.costBoxHighlight) },
        React.createElement(Text, { style: styles.costLabel }, 'Expected total'),
        React.createElement(Text, { style: styles.costValue }, fmtMoney(scenario.expectedAnnualCost))
      ),
      React.createElement(
        View,
        { style: combine(styles.costBox, styles.costBoxSubtle, styles.costBoxLast) },
        React.createElement(Text, { style: styles.costLabel }, 'Worst-case'),
        React.createElement(Text, { style: styles.costValue }, fmtMoney(scenario.worstCaseAnnualCost))
      )
    ),
    scenario.selfPlan
      ? React.createElement(
          Text,
          { style: styles.planRow },
          React.createElement(Text, { style: { fontFamily: 'Helvetica-Bold' } }, 'Your plan: '),
          scenario.selfPlan.name,
          ' (' + scenario.selfPlan.tier + ')'
        )
      : null,
    scenario.spousePlan
      ? React.createElement(
          Text,
          { style: styles.planRow },
          React.createElement(Text, { style: { fontFamily: 'Helvetica-Bold' } }, "Spouse's plan: "),
          scenario.spousePlan.name,
          ' (' + scenario.spousePlan.tier + ')'
        )
      : null,
    scenario.hsaEligible
      ? React.createElement(Text, { style: styles.hsaTag }, '+ HSA eligible')
      : null,
    scenario.ai_insight
      ? React.createElement(Text, { style: styles.aiInsight }, scenario.ai_insight)
      : null,
    scenario.gotchas && scenario.gotchas.length > 0
      ? React.createElement(
          View,
          null,
          ...scenario.gotchas.map((g, i) => React.createElement(GotchaRowEl, { key: i, gotcha: g }))
        )
      : null
  );
}

function buildPdfDocument(result: CoordinationResult, generatedDate: string) {
  const recommended = result.top_scenarios.find((s) => s.rank === 1);
  const scopeLabel = scopeLabelMap[result.coverage_scope] || result.coverage_scope;
  const utilLabel = utilizationLabelMap[result.utilization_level] || result.utilization_level;

  // ---- Page 1: Cover + summary ----
  const coverPage = React.createElement(
    Page,
    { size: 'LETTER', style: styles.coverPage, key: 'cover' },
    React.createElement(Text, { style: styles.brand }, 'CLARITY HEALTH'),
    React.createElement(Text, { style: styles.coverTitle }, 'Coordination of Benefits Report'),
    React.createElement(
      Text,
      { style: styles.coverSubtitle },
      'A side-by-side analysis of how to share medical coverage across your dual-employer household.'
    ),
    React.createElement(
      View,
      { style: styles.summaryPanel },
      React.createElement(Text, { style: styles.sectionTitle }, 'HOUSEHOLD SUMMARY'),
      React.createElement(
        View,
        { style: styles.summaryRow },
        React.createElement(Text, { style: styles.summaryLabel }, 'Coverage scope'),
        React.createElement(Text, { style: styles.summaryValue }, scopeLabel)
      ),
      React.createElement(
        View,
        { style: styles.summaryRow },
        React.createElement(Text, { style: styles.summaryLabel }, 'Household size'),
        React.createElement(Text, { style: styles.summaryValue }, String(result.household_size))
      ),
      React.createElement(
        View,
        { style: styles.summaryRow },
        React.createElement(Text, { style: styles.summaryLabel }, 'Expected use'),
        React.createElement(Text, { style: styles.summaryValue }, utilLabel)
      ),
      React.createElement(
        View,
        { style: styles.summaryRow },
        React.createElement(Text, { style: styles.summaryLabel }, 'Expected medical spend'),
        React.createElement(Text, { style: styles.summaryValue }, fmtMoney(result.expected_annual_medical_spend) + ' / year')
      ),
      React.createElement(
        View,
        { style: styles.summaryRow },
        React.createElement(Text, { style: styles.summaryLabel }, 'Your employer'),
        React.createElement(Text, { style: styles.summaryValue }, result.self_employer_name || '—')
      ),
      React.createElement(
        View,
        { style: styles.summaryRow },
        React.createElement(Text, { style: styles.summaryLabel }, "Spouse's employer"),
        React.createElement(Text, { style: styles.summaryValue }, result.spouse_employer_name || '—')
      ),
      React.createElement(
        View,
        { style: styles.summaryRow },
        React.createElement(Text, { style: styles.summaryLabel }, 'Plans evaluated'),
        React.createElement(
          Text,
          { style: styles.summaryValue },
          result.self_plan_count + ' yours, ' + result.spouse_plan_count + " spouse's, " + result.total_scenarios_evaluated + ' total combinations'
        )
      )
    ),
    result.ai_overall_recommendation
      ? React.createElement(
          View,
          { style: styles.recommendCard, wrap: false },
          React.createElement(Text, { style: styles.sectionTitle }, 'OUR RECOMMENDATION'),
          React.createElement(Text, { style: styles.bodyText }, result.ai_overall_recommendation),
          recommended
            ? React.createElement(
                Text,
                { style: styles.recommendCallout },
                React.createElement(Text, { style: { fontFamily: 'Helvetica-Bold' } }, 'Recommended scenario: '),
                recommended.scenario_label,
                '   |   ',
                React.createElement(Text, { style: { fontFamily: 'Helvetica-Bold' } }, fmtMoney(recommended.expectedAnnualCost) + '/yr'),
                ' expected total'
              )
            : null
        )
      : null,
    React.createElement(Text, { style: styles.footer }, 'Generated ' + generatedDate + ' by Clarity Health'),
    React.createElement(Text, { style: styles.pageNumber, render: ({ pageNumber, totalPages }: any) => pageNumber + ' / ' + totalPages })
  );

  // ---- Page 2: Top scenarios ----
  const scenariosPage = React.createElement(
    Page,
    { size: 'LETTER', style: styles.page, key: 'scenarios' },
    React.createElement(Text, { style: styles.pageTitle }, 'Top ' + result.top_scenarios.length + ' Scenarios'),
    React.createElement(
      Text,
      { style: combine(styles.bodyText, { marginBottom: 12 }) },
      'Each scenario is ranked by expected total annual cost. Numbers reflect your household profile and expected utilization.'
    ),
    ...result.top_scenarios.map((s) => React.createElement(ScenarioCardEl, { key: s.id, scenario: s })),
    React.createElement(Text, { style: styles.footer }, 'Generated ' + generatedDate + ' by Clarity Health'),
    React.createElement(Text, { style: styles.pageNumber, render: ({ pageNumber, totalPages }: any) => pageNumber + ' / ' + totalPages })
  );

  // ---- Page 3: Trade-offs ----
  const hasTradeoffs = result.ai_key_tradeoffs && result.ai_key_tradeoffs.length > 0;
  const tradeoffsPage = hasTradeoffs
    ? React.createElement(
        Page,
        { size: 'LETTER', style: styles.page, key: 'tradeoffs' },
        React.createElement(Text, { style: styles.pageTitle }, 'Key Trade-offs'),
        React.createElement(
          Text,
          { style: combine(styles.bodyText, { marginBottom: 14 }) },
          'These are the higher-level decisions to weigh as you choose between scenarios.'
        ),
        ...result.ai_key_tradeoffs.map((t, i) =>
          React.createElement(
            View,
            { key: i, style: styles.tradeoffItem, wrap: false },
            React.createElement(Text, { style: styles.tradeoffBullet }, '+'),
            React.createElement(Text, { style: styles.tradeoffText }, t)
          )
        ),
        React.createElement(
          View,
          { style: { marginTop: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border, borderTopStyle: 'solid' } },
          React.createElement(Text, { style: styles.sectionTitle }, 'IMPORTANT NOTES'),
          React.createElement(
            Text,
            { style: styles.smallText },
            'Estimates are based on the plan documents you uploaded, your household profile, and recent claims (if any). ' +
              'Actual costs depend on real utilization, network usage, and any mid-year life changes. Always confirm specifics ' +
              'with your benefits administrator before enrolling. This report is informational and is not a substitute for ' +
              'professional financial, tax, or legal advice.'
          )
        ),
        React.createElement(Text, { style: styles.footer }, 'Generated ' + generatedDate + ' by Clarity Health'),
        React.createElement(Text, { style: styles.pageNumber, render: ({ pageNumber, totalPages }: any) => pageNumber + ' / ' + totalPages })
      )
    : null;

  const pages = [coverPage, scenariosPage];
  if (tradeoffsPage) pages.push(tradeoffsPage);

  return React.createElement(Document, null, ...pages);
}

// ---------- Route ----------
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result: CoordinationResult | undefined = body?.result;

    if (!result || !result.success || !Array.isArray(result.top_scenarios)) {
      return NextResponse.json(
        { error: 'Missing or invalid coordination result in request body' },
        { status: 400 }
      );
    }

    const generatedDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const doc = buildPdfDocument(result, generatedDate);
    const pdfBuffer = await renderToBuffer(doc as any);

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    console.error('PDF generation error:', e);
    return NextResponse.json(
      { error: e?.message || 'PDF generation failed' },
      { status: 500 }
    );
  }
}