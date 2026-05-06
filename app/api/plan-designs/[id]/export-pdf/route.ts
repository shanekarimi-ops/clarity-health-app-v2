import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { renderToBuffer } from '@react-pdf/renderer';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import React from 'react';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Helper to combine styles, filtering falsy values (workaround for @react-pdf/renderer strict typing)
const combine = (...styles: any[]): any => styles.filter(Boolean);

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const designId = params.id;
    const body = await req.json();
    const { accessToken } = body;

    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
    }

    // Verify the user
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = userData.user.id;
    const userMeta = userData.user.user_metadata || {};

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Look up the broker's agency
    const { data: brokerRow } = await admin
      .from('brokers')
      .select('agency_id, agencies(name)')
      .eq('user_id', userId)
      .maybeSingle();

    if (!brokerRow) {
      return NextResponse.json({ error: 'Broker profile not found' }, { status: 403 });
    }
    const agencyId = brokerRow.agency_id;
    const agency: any = Array.isArray(brokerRow.agencies)
      ? brokerRow.agencies[0]
      : brokerRow.agencies;
    const agencyName = agency?.name || '';

    // Load the plan design
    const { data: planDesign, error: fetchErr } = await admin
      .from('plan_designs')
      .select(`
        id, agency_id, name, funding_model, status, effective_date,
        design, ai_projection, ai_projection_generated_at,
        clients(id, employer_name, first_name, last_name, member_count, state)
      `)
      .eq('id', designId)
      .maybeSingle();

    if (fetchErr || !planDesign) {
      return NextResponse.json({ error: 'Plan design not found' }, { status: 404 });
    }
    if (planDesign.agency_id !== agencyId) {
      return NextResponse.json({ error: 'Not authorized for this plan design' }, { status: 403 });
    }

    // Build the PDF
    const client: any = Array.isArray(planDesign.clients)
      ? planDesign.clients[0]
      : planDesign.clients;
    const brokerName = `${userMeta.first_name || ''} ${userMeta.last_name || ''}`.trim() || 'Broker';

    const pdfDoc = buildPdfDocument({
      planDesign,
      client,
      brokerName,
      agencyName,
    });

    const pdfBuffer = await renderToBuffer(pdfDoc);

    // Build a safe filename
    const employerName = (client?.employer_name || 'plan_design')
      .replace(/[^a-zA-Z0-9_\- ]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 60);
    const filename = `${employerName}_plan_design.pdf`;

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    console.error('export PDF error:', e);
    return NextResponse.json(
      { error: 'Server error', detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}

// ============================================
// PDF Styles
// ============================================
const styles = StyleSheet.create({
  // Page
  page: {
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1e3a5f',
  },

  // Cover page
  coverContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
  },
  coverBrand: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e3a5f',
    marginBottom: 6,
  },
  coverBrandAccent: {
    color: '#7a9b76',
    fontStyle: 'italic',
  },
  coverDivider: {
    width: 60,
    height: 2,
    backgroundColor: '#7a9b76',
    marginVertical: 24,
  },
  coverTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e3a5f',
    marginBottom: 8,
    maxWidth: 400,
  },
  coverSubtitle: {
    fontSize: 14,
    color: '#3a4d68',
    marginBottom: 30,
  },
  coverMeta: {
    fontSize: 11,
    color: '#3a4d68',
    marginBottom: 4,
  },
  coverMetaLabel: {
    fontSize: 9,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  coverFooter: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 9,
    color: '#94a3b8',
  },

  // Section header (on each content page)
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#7a9b76',
  },
  sectionHeaderNum: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#7a9b76',
    marginRight: 10,
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e3a5f',
    flex: 1,
  },

  // Subsection
  subSection: {
    marginBottom: 14,
  },
  subSectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1e3a5f',
    marginBottom: 6,
  },

  // Two-column row
  row: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e2e8f0',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    width: 160,
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: 'normal',
  },
  rowValue: {
    flex: 1,
    fontSize: 10,
    color: '#1e3a5f',
    fontWeight: 'bold',
  },

  // Summary cards (executive summary)
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  summaryCard: {
    flexBasis: '48%',
    backgroundColor: '#faf7f2',
    borderRadius: 6,
    padding: 12,
    borderWidth: 0.5,
    borderColor: '#e2e8f0',
  },
  summaryCardHighlight: {
    backgroundColor: '#1e3a5f',
  },
  summaryCardLabel: {
    fontSize: 8,
    color: '#7a9b76',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryCardLabelHighlight: {
    color: '#a8c4a4',
  },
  summaryCardValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e3a5f',
  },
  summaryCardValueHighlight: {
    color: '#ffffff',
  },
  summaryCardSub: {
    fontSize: 8,
    color: '#94a3b8',
    marginTop: 2,
  },
  summaryCardSubHighlight: {
    color: '#cbd5e0',
  },

  // Callout box
  callout: {
    backgroundColor: '#f0f7fa',
    borderRadius: 6,
    padding: 10,
    borderWidth: 0.5,
    borderColor: '#bae6e6',
    marginBottom: 14,
  },
  calloutWarning: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  calloutSuccess: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  calloutText: {
    fontSize: 9,
    color: '#0e7490',
    lineHeight: 1.5,
  },
  calloutTextWarning: {
    color: '#92400e',
  },
  calloutTextSuccess: {
    color: '#166534',
  },

  // Bullet list
  bulletItem: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingLeft: 4,
  },
  bulletDot: {
    width: 10,
    fontSize: 10,
    color: '#7a9b76',
  },
  bulletText: {
    flex: 1,
    fontSize: 9.5,
    color: '#3a4d68',
    lineHeight: 1.5,
  },

  // Recommendation block
  recommendation: {
    backgroundColor: '#f0fdf4',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: '#bbf7d0',
  },
  recommendationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  recommendationTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#166534',
    flex: 1,
  },
  recommendationImpact: {
    fontSize: 9,
    color: '#7a9b76',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  recommendationRationale: {
    fontSize: 9,
    color: '#3a4d68',
    lineHeight: 1.5,
  },

  // Disclaimer
  disclaimer: {
    backgroundColor: '#faf7f2',
    borderRadius: 4,
    padding: 10,
    marginTop: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#94a3b8',
  },
  disclaimerText: {
    fontSize: 8.5,
    color: '#3a4d68',
    fontStyle: 'italic',
    lineHeight: 1.5,
  },

  // Footer (on every content page)
  pageFooter: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#94a3b8',
    borderTopWidth: 0.5,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
  },

  // "Bundled by carrier" notice for level-funded
  bundledNotice: {
    backgroundColor: '#f8fafc',
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: '#e2e8f0',
  },
  bundledNoticeText: {
    fontSize: 9,
    color: '#3a4d68',
    fontStyle: 'italic',
  },
});

// ============================================
// PDF Document
// ============================================
function buildPdfDocument({
  planDesign,
  client,
  brokerName,
  agencyName,
}: {
  planDesign: any;
  client: any;
  brokerName: string;
  agencyName: string;
}) {
  const design = planDesign.design || {};
  const projection = planDesign.ai_projection || null;
  const fundingModel = planDesign.funding_model;
  const isSelfFunded = fundingModel === 'self_funded';

  const employerName = client?.employer_name || `${client?.first_name || ''} ${client?.last_name || ''}`.trim() || 'Unknown';
  const generatedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const effectiveDate = design.group?.effectiveDate
    ? new Date(design.group.effectiveDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : (planDesign.effective_date || '—');

  const footerText = `Prepared by ${brokerName}${agencyName ? ` · ${agencyName}` : ''} · ${generatedDate}`;

  return React.createElement(
    Document,
    { title: `${employerName} — Plan Design Proposal` },

    // ============================================
    // PAGE 1 — Cover
    // ============================================
    React.createElement(
      Page,
      { size: 'LETTER', style: styles.page, key: 'cover' },
      React.createElement(
        View,
        { style: styles.coverContent },
        React.createElement(
          Text,
          { style: styles.coverBrand },
          'Clarity ',
          React.createElement(Text, { style: styles.coverBrandAccent }, 'Health'),
        ),
        React.createElement(View, { style: styles.coverDivider }),
        React.createElement(Text, { style: styles.coverTitle }, planDesign.name || 'Plan Design Proposal'),
        React.createElement(Text, { style: styles.coverSubtitle }, employerName),

        React.createElement(View, { style: { marginTop: 30 } },
          React.createElement(Text, { style: styles.coverMetaLabel }, 'Funding Model'),
          React.createElement(Text, { style: combine(styles.coverMeta, { marginBottom: 14 }) },
            isSelfFunded ? 'Self-funded' : 'Level-funded'),

          React.createElement(Text, { style: styles.coverMetaLabel }, 'Effective Date'),
          React.createElement(Text, { style: combine(styles.coverMeta, { marginBottom: 14 }) }, effectiveDate),

          React.createElement(Text, { style: styles.coverMetaLabel }, 'Group Size'),
          React.createElement(Text, { style: combine(styles.coverMeta, { marginBottom: 14 }) },
            design.group?.groupSize ? `${design.group.groupSize} eligible employees` : '—'),

          React.createElement(Text, { style: styles.coverMetaLabel }, 'Prepared By'),
          React.createElement(Text, { style: styles.coverMeta }, brokerName),
          agencyName ? React.createElement(Text, { style: styles.coverMeta }, agencyName) : null,
        ),
      ),
      React.createElement(
        View,
        { style: styles.coverFooter },
        React.createElement(Text, null, `Generated ${generatedDate}`),
      ),
    ),

    // ============================================
    // PAGE 2 — Executive Summary (only if AI projection exists)
    // ============================================
    projection ? React.createElement(
      Page,
      { size: 'LETTER', style: styles.page, key: 'summary' },
      sectionHeader('1', 'Executive summary'),

      // Headline
      projection.summary?.headline ? React.createElement(
        Text,
        { style: { fontSize: 12, color: '#1e3a5f', marginBottom: 14, fontStyle: 'italic' } },
        projection.summary.headline,
      ) : null,

      // Top-line cards
      React.createElement(
        View,
        { style: styles.summaryGrid },
        summaryCardEl('Total annual cost', fmtMoney(projection.summary?.totalAnnualCost),
          fmtMoney(projection.summary?.pmpm) + ' PMPM', true),
        summaryCardEl('Best case', fmtMoney(projection.summary?.totalAnnualCostBest),
          '~10-15% under expected'),
        summaryCardEl('Worst case', fmtMoney(projection.summary?.totalAnnualCostWorst),
          'bad-claims year'),
        summaryCardEl('Max liability', fmtMoney(projection.maxLiability?.amount),
          'if aggregate stop-loss hits'),
      ),

      // Comparison
      projection.summary?.comparedToFullyInsured ? React.createElement(
        View,
        { style: styles.callout },
        React.createElement(Text, { style: styles.calloutText },
          React.createElement(Text, { style: { fontWeight: 'bold' } }, 'vs. fully-insured: '),
          projection.summary.comparedToFullyInsured),
      ) : null,

      // Two-column breakdown
      React.createElement(
        View,
        { style: { flexDirection: 'row', gap: 12, marginTop: 8 } },
        React.createElement(
          View,
          { style: { flex: 1 } },
          React.createElement(Text, { style: styles.subSectionTitle }, 'Expected claims'),
          rowEl('Medical claims', fmtMoney(projection.expectedClaims?.medicalClaims)),
          rowEl('Rx claims', fmtMoney(projection.expectedClaims?.rxClaims)),
          rowEl('Total claims', fmtMoney(projection.expectedClaims?.totalExpectedClaims), { bold: true }),
          rowEl('Claims PMPM', fmtMoney(projection.expectedClaims?.claimsPmpm), { last: true }),
        ),
        React.createElement(
          View,
          { style: { flex: 1 } },
          React.createElement(Text, { style: styles.subSectionTitle }, 'Fixed costs'),
          rowEl('TPA admin', fmtMoney(projection.fixedCosts?.tpaAdmin)),
          rowEl('Stop-loss premium', fmtMoney(projection.fixedCosts?.stopLossPremium)),
          rowEl('PBM admin', fmtMoney(projection.fixedCosts?.pbmAdmin)),
          rowEl('Ancillary & other', fmtMoney(projection.fixedCosts?.ancillaryAndOther)),
          rowEl('Total fixed', fmtMoney(projection.fixedCosts?.totalFixed), { bold: true }),
          rowEl('Fixed PMPM', fmtMoney(projection.fixedCosts?.fixedPmpm), { last: true }),
        ),
      ),

      pageFooter(footerText, 1),
    ) : null,

    // ============================================
    // PAGE 3 — Plan design summary (group + plan)
    // ============================================
    React.createElement(
      Page,
      { size: 'LETTER', style: styles.page, key: 'design1' },
      sectionHeader('2', 'Plan design'),

      // Group basics
      React.createElement(
        View,
        { style: styles.subSection },
        React.createElement(Text, { style: styles.subSectionTitle }, 'Group basics'),
        rowEl('Effective date', fmtDate(design.group?.effectiveDate) || '—'),
        rowEl('Plan year', planYearLabel(design.group?.planYear) || '—'),
        rowEl('Group size', design.group?.groupSize ? `${design.group.groupSize} employees` : '—'),
        rowEl('Industry', industryLabel(design.group?.industry) || '—'),
        rowEl('State', design.group?.state || '—'),
        rowEl('Avg employee age', design.group?.avgEmployeeAge ? String(design.group.avgEmployeeAge) : '—'),
        rowEl('% female', design.group?.pctFemale ? `${design.group.pctFemale}%` : '—'),
        rowEl('% tobacco users', design.group?.pctTobacco ? `${design.group.pctTobacco}%` : '—', { last: true }),
      ),

      // Plan structure
      React.createElement(
        View,
        { style: styles.subSection },
        React.createElement(Text, { style: styles.subSectionTitle }, 'Plan structure'),
        rowEl('Deductible structure', cap(design.plan?.deductibleStructure) || '—'),
        rowEl('In-network deductible', dollarPair(design.plan?.deductibleInNetSingle, design.plan?.deductibleInNetFamily) || '—'),
        rowEl('In-network OOP max', dollarPair(design.plan?.oopMaxInNetSingle, design.plan?.oopMaxInNetFamily) || '—'),
        rowEl('In-network coinsurance', design.plan?.coinsuranceInNet !== undefined ? `${design.plan.coinsuranceInNet}%` : '—'),
        rowEl('HSA-qualifying', design.plan?.hsaEligible ? 'Yes' : 'No'),
        ...(design.plan?.includeOON ? [
          rowEl('OON deductible', dollarPair(design.plan?.deductibleOonSingle, design.plan?.deductibleOonFamily) || '—'),
          rowEl('OON OOP max', dollarPair(design.plan?.oopMaxOonSingle, design.plan?.oopMaxOonFamily) || '—'),
          rowEl('OON coinsurance', design.plan?.coinsuranceOon !== undefined ? `${design.plan.coinsuranceOon}%` : '—'),
        ] : []),
        rowEl('Office visit copays',
          (design.plan?.copayPcp || design.plan?.copaySpecialist || design.plan?.copayUrgent || design.plan?.copayEr)
            ? `PCP $${design.plan.copayPcp || '—'} · Specialist $${design.plan.copaySpecialist || '—'} · Urgent $${design.plan.copayUrgent || '—'} · ER $${design.plan.copayEr || '—'}${design.plan.copayErWaived ? ' (ER waived if admitted)' : ''}`
            : 'None / subject to deductible'),
        rowEl('Rx tiers',
          (design.plan?.rxTier1Generic || design.plan?.rxTier2PreferredBrand)
            ? `Generic $${design.plan.rxTier1Generic || '—'} · Preferred $${design.plan.rxTier2PreferredBrand || '—'} · Non-preferred $${design.plan.rxTier3NonPreferredBrand || '—'} · Specialty $${design.plan.rxTier4Specialty || '—'}`
            : '—',
          { last: true }),
      ),

      pageFooter(footerText, projection ? 2 : 1),
    ),

    // ============================================
    // PAGE 4 — Network, Stop-loss, TPA, PBM (self-funded only) OR all-in-one for level-funded
    // ============================================
    React.createElement(
      Page,
      { size: 'LETTER', style: styles.page, key: 'design2' },
      sectionHeader('3', isSelfFunded ? 'Funding & vendors' : 'Carrier program'),

      // Network
      React.createElement(
        View,
        { style: styles.subSection },
        React.createElement(Text, { style: styles.subSectionTitle }, 'Network'),
        isSelfFunded
          ? React.createElement(
              View,
              null,
              rowEl('Network type', networkTypeLabel(design.network?.networkType) || '—'),
              ...(design.network?.networkType === 'rbp' ? [
                rowEl('Reference price', design.network?.rbpMultiplier ? `${design.network.rbpMultiplier}% of Medicare` : '—'),
                ...(design.network?.networkCarrier ? [rowEl('PPO wraparound', carrierLabel(design.network.networkCarrier) || '—')] : []),
              ] : [
                rowEl('Carrier', design.network?.networkCarrierOther || carrierLabel(design.network?.networkCarrier) || '—'),
                rowEl('Breadth', cap(design.network?.networkTier) || '—'),
              ]),
              ...(design.network?.outOfAreaNetwork ? [rowEl('Out-of-area access', design.network?.outOfAreaNotes || 'Yes')] : []),
              ...(design.network?.telehealthVendor ? [rowEl('Telehealth', `${design.network.telehealthVendor}${design.network.telehealthCopay !== undefined ? ` ($${design.network.telehealthCopay} copay)` : ''}`)] : []),
              ...(design.network?.umVendor ? [rowEl('UM vendor', design.network.umVendor, { last: true })] : []),
            )
          : React.createElement(
              View,
              { style: styles.bundledNotice },
              React.createElement(Text, { style: styles.bundledNoticeText },
                'Bundled by carrier — network selection is determined by the level-funded carrier program.'),
            ),
      ),

      // Stop-loss
      React.createElement(
        View,
        { style: styles.subSection },
        React.createElement(Text, { style: styles.subSectionTitle }, 'Stop-loss'),
        isSelfFunded
          ? React.createElement(
              View,
              null,
              rowEl('Specific deductible', design.stoploss?.specificDeductible ? `$${Number(design.stoploss.specificDeductible).toLocaleString()}` : '—'),
              rowEl('Stop-loss carrier', design.stoploss?.specificCarrierOther || carrierLabel(design.stoploss?.specificCarrier) || '—'),
              ...(design.stoploss?.aggregateEnabled ? [rowEl('Aggregate corridor', `${design.stoploss.aggregateCorridor || 125}%${design.stoploss.aggregatingSpecific ? ' (aggregating specific)' : ''}`)] : []),
              rowEl('Contract type', contractLabel(design.stoploss?.contractType) || '—'),
              ...((design.stoploss?.lasers || []).length > 0 ? [rowEl('Lasers', `${design.stoploss.lasers.length} laser(s) — see attached schedule`)] : []),
              ...(design.stoploss?.noNewLasers ? [rowEl('No-new-lasers provision', 'Yes')] : []),
              ...(design.stoploss?.rateCap ? [rowEl('Rate cap at renewal', `${design.stoploss.rateCap}%`)] : []),
              rowEl('Disclosure', disclosureLabel(design.stoploss?.disclosure) || '—', { last: true }),
            )
          : React.createElement(
              View,
              { style: styles.bundledNotice },
              React.createElement(Text, { style: styles.bundledNoticeText },
                'Bundled by carrier — stop-loss is included in the level-funded program.'),
            ),
      ),

      // TPA
      React.createElement(
        View,
        { style: styles.subSection },
        React.createElement(Text, { style: styles.subSectionTitle }, 'TPA / Claims administration'),
        isSelfFunded
          ? React.createElement(
              View,
              null,
              rowEl('TPA', design.tpa?.tpaNameOther || tpaLabel(design.tpa?.tpaName) || '—'),
              rowEl('Fee structure', tpaFeeLabel(design.tpa) || '—'),
              rowEl('Funding model', fundingModelLabel(design.tpa?.fundingModel) || '—'),
              rowEl('ID card branding', cap(design.tpa?.idCardBranding?.replace(/_/g, ' ')) || '—'),
              rowEl('COBRA admin', cobraLabel(design.tpa) || '—'),
              ...(design.tpa?.runoutMonths ? [rowEl('Run-out', `${design.tpa.runoutMonths} months${design.tpa.runoutAdmin === 'add_on' ? ' (add-on fee)' : ''}`)] : []),
              ...(design.tpa?.implementationDate ? [rowEl('Implementation date', fmtDate(design.tpa.implementationDate) || '—', { last: true })] : []),
            )
          : React.createElement(
              View,
              { style: styles.bundledNotice },
              React.createElement(Text, { style: styles.bundledNoticeText },
                'Bundled by carrier — claims administration is handled by the level-funded carrier.'),
            ),
      ),

      // PBM
      React.createElement(
        View,
        { style: styles.subSection },
        React.createElement(Text, { style: styles.subSectionTitle }, 'Pharmacy benefit manager'),
        isSelfFunded
          ? React.createElement(
              View,
              null,
              rowEl('PBM', design.pbm?.pbmNameOther || pbmLabel(design.pbm?.pbmName) || '—'),
              rowEl('Pricing model', cap(design.pbm?.pricingModel?.replace(/_/g, ' ')) || '—'),
              ...(design.pbm?.adminFeePepm ? [rowEl('Admin fee', `$${design.pbm.adminFeePepm} PEPM`)] : []),
              ...(design.pbm?.rebatePassThroughPct !== undefined ? [rowEl('Rebate pass-through', `${design.pbm.rebatePassThroughPct}%`)] : []),
              ...(design.pbm?.specialtyCarveOut ? [rowEl('Specialty Rx carve-out', design.pbm.specialtyVendor || 'Yes')] : []),
              ...(design.pbm?.mailOrderEnabled ? [rowEl('Mail order', `${design.pbm.mailOrderCopayMultiplier || '2x'} copay multiplier`)] : []),
              ...(design.pbm?.formularyType ? [rowEl('Formulary', cap(design.pbm.formularyType))] : []),
              ...(design.pbm?.utilizationManagement ? [rowEl('UM intensity', cap(design.pbm.utilizationManagement.replace(/_/g, ' ')), { last: true })] : []),
            )
          : React.createElement(
              View,
              { style: styles.bundledNotice },
              React.createElement(Text, { style: styles.bundledNoticeText },
                'Bundled by carrier — PBM is included in the level-funded program.'),
            ),
      ),

      pageFooter(footerText, projection ? 3 : 2),
    ),

    // ============================================
    // PAGE 5 — Eligibility + Carve-outs
    // ============================================
    React.createElement(
      Page,
      { size: 'LETTER', style: styles.page, key: 'design3' },
      sectionHeader('4', 'Eligibility & carve-outs'),

      // Eligibility
      React.createElement(
        View,
        { style: styles.subSection },
        React.createElement(Text, { style: styles.subSectionTitle }, 'Eligibility'),
        rowEl('Waiting period', waitingPeriodLabel(design.eligibility) || '—'),
        rowEl('Max dependent age', design.eligibility?.dependentMaxAge ? String(design.eligibility.dependentMaxAge) : '26'),
        ...(design.eligibility?.studentExtension ? [rowEl('Student extension', 'Yes')] : []),
        rowEl('Domestic partner', domesticPartnerLabel(design.eligibility?.domesticPartner) || '—'),
        ...(design.eligibility?.spousalCarveOut ? [rowEl('Spousal surcharge', `$${design.eligibility.spousalSurcharge || 0}/month`)] : []),
        ...(design.eligibility?.tobaccoSurcharge ? [rowEl('Tobacco surcharge', `$${design.eligibility.tobaccoSurchargeAmount || 0}/month`)] : []),
        ...(design.eligibility?.wellnessIncentive ? [rowEl('Wellness incentive', `$${design.eligibility.wellnessIncentiveAmount || 0}/month`)] : []),
        ...(design.eligibility?.openEnrollmentStart ? [rowEl('Open enrollment', `${fmtDate(design.eligibility.openEnrollmentStart)}, ${design.eligibility.openEnrollmentDays || 14} days`)] : []),
        ...(design.eligibility?.hasMultipleClasses ? [rowEl('Multiple eligibility classes', 'Yes — see notes', { last: true })] : []),
      ),

      // Carve-outs
      React.createElement(
        View,
        { style: styles.subSection },
        React.createElement(Text, { style: styles.subSectionTitle }, 'Carve-outs'),
        ...(hasCarveouts(design.carveouts || {}) ? [
          ...(design.carveouts?.dentalEnabled ? [rowEl('Dental', `${design.carveouts.dentalCarrier || '—'}${design.carveouts.dentalEmployerContribution ? ` (${design.carveouts.dentalEmployerContribution}% employer)` : ''}`)] : []),
          ...(design.carveouts?.visionEnabled ? [rowEl('Vision', `${design.carveouts.visionCarrier || '—'}${design.carveouts.visionEmployerContribution ? ` (${design.carveouts.visionEmployerContribution}% employer)` : ''}`)] : []),
          ...(design.carveouts?.eapEnabled ? [rowEl('EAP', `${design.carveouts.eapVendor || '—'}${design.carveouts.eapSessionsPerYear ? `, ${design.carveouts.eapSessionsPerYear} sessions/yr` : ''}`)] : []),
          ...(design.carveouts?.lifeEnabled ? [rowEl('Life / AD&D', `${design.carveouts.lifeCarrier || '—'} — ${design.carveouts.lifeBenefit || '—'}`)] : []),
          ...(design.carveouts?.stdEnabled ? [rowEl('Short-term disability', `${design.carveouts.stdCarrier || '—'} — ${design.carveouts.stdBenefitPct || 60}%, ${design.carveouts.stdMaxWeeks || 26}wk`)] : []),
          ...(design.carveouts?.ltdEnabled ? [rowEl('Long-term disability', `${design.carveouts.ltdCarrier || '—'} — ${design.carveouts.ltdBenefitPct || 60}%, to age ${design.carveouts.ltdMaxAge || 65}`)] : []),
          ...((design.carveouts?.accidentEnabled || design.carveouts?.hospitalIndemnityEnabled || design.carveouts?.criticalIllnessEnabled) ? [
            rowEl('Voluntary supplemental',
              [
                design.carveouts?.accidentEnabled && 'Accident',
                design.carveouts?.hospitalIndemnityEnabled && 'Hospital indemnity',
                design.carveouts?.criticalIllnessEnabled && 'Critical illness',
              ].filter(Boolean).join(', ') + (design.carveouts?.voluntaryCarrier ? ` (${design.carveouts.voluntaryCarrier})` : '')
            ),
          ] : []),
          ...((design.carveouts?.spendingAccountType && design.carveouts?.spendingAccountType !== 'none') ? [
            rowEl('Spending accounts',
              `${spendingAccountLabel(design.carveouts.spendingAccountType)}${design.carveouts.spendingAccountVendor ? ` — ${design.carveouts.spendingAccountVendor}` : ''}${design.carveouts.hsaEmployerContribution ? `, $${design.carveouts.hsaEmployerContribution}/yr employer HSA` : ''}${design.carveouts.hraAllowance ? `, $${design.carveouts.hraAllowance}/yr HRA` : ''}`,
              { last: true }),
          ] : []),
        ] : [
          React.createElement(Text, { style: { fontSize: 9.5, color: '#94a3b8', fontStyle: 'italic' } },
            'No carve-outs configured.'),
        ]),
      ),

      pageFooter(footerText, projection ? 4 : 3),
    ),

    // ============================================
    // PAGE 6 — AI projection details (only if projection exists)
    // ============================================
    projection ? React.createElement(
      Page,
      { size: 'LETTER', style: styles.page, key: 'projection' },
      sectionHeader('5', 'AI cost projection'),

      // Confidence
      projection.confidenceLevel ? React.createElement(
        View,
        { style: combine(styles.callout, projection.confidenceLevel === 'low' ? styles.calloutWarning : null) },
        React.createElement(Text, { style: combine(styles.calloutText, projection.confidenceLevel === 'low' ? styles.calloutTextWarning : null) },
          React.createElement(Text, { style: { fontWeight: 'bold' } }, `${cap(projection.confidenceLevel)} confidence: `),
          projection.confidenceExplanation || ''),
      ) : null,

      // Max liability explanation
      projection.maxLiability?.explanation ? React.createElement(
        View,
        { style: styles.subSection },
        React.createElement(Text, { style: styles.subSectionTitle }, 'About max liability'),
        React.createElement(Text, { style: { fontSize: 9.5, color: '#3a4d68', lineHeight: 1.5 } },
          projection.maxLiability.explanation),
      ) : null,

      // Assumptions
      (projection.assumptions || []).length > 0 ? React.createElement(
        View,
        { style: styles.subSection },
        React.createElement(Text, { style: styles.subSectionTitle }, 'Key assumptions'),
        ...projection.assumptions.map((a: string, i: number) =>
          React.createElement(
            View,
            { key: i, style: styles.bulletItem },
            React.createElement(Text, { style: styles.bulletDot }, '•'),
            React.createElement(Text, { style: styles.bulletText }, a),
          )),
      ) : null,

      // Sensitivity flags
      (projection.sensitivityFlags || []).length > 0 ? React.createElement(
        View,
        { style: styles.subSection },
        React.createElement(Text, { style: styles.subSectionTitle }, 'Sensitivity flags'),
        ...projection.sensitivityFlags.map((s: any, i: number) =>
          React.createElement(
            View,
            { key: i, style: { marginBottom: 6 } },
            React.createElement(Text, { style: { fontSize: 10, fontWeight: 'bold', color: '#1e3a5f' } }, s.field),
            React.createElement(Text, { style: { fontSize: 9, color: '#3a4d68', lineHeight: 1.5 } }, s.impact),
          )),
      ) : null,

      // Recommendations
      (projection.recommendations || []).length > 0 ? React.createElement(
        View,
        { style: styles.subSection },
        React.createElement(Text, { style: styles.subSectionTitle }, 'Design recommendations'),
        ...projection.recommendations.map((r: any, i: number) =>
          React.createElement(
            View,
            { key: i, style: styles.recommendation },
            React.createElement(
              View,
              { style: styles.recommendationHeader },
              React.createElement(Text, { style: styles.recommendationTitle }, r.title),
              React.createElement(Text, { style: styles.recommendationImpact }, r.estimatedImpact || ''),
            ),
            React.createElement(Text, { style: styles.recommendationRationale }, r.rationale),
          )),
      ) : null,

      pageFooter(footerText, projection ? 5 : 4),
    ) : null,

    // ============================================
    // FINAL PAGE — Disclaimer
    // ============================================
    React.createElement(
      Page,
      { size: 'LETTER', style: styles.page, key: 'disclaimer' },
      sectionHeader('!', 'Important disclaimers'),

      React.createElement(
        View,
        { style: styles.disclaimer },
        React.createElement(Text, { style: combine(styles.disclaimerText, { fontWeight: 'bold', marginBottom: 6, fontStyle: 'normal' }) },
          'About this proposal'),
        React.createElement(Text, { style: styles.disclaimerText },
          'This document represents a plan design proposal prepared by your broker. It outlines a recommended health benefits program structure for your group based on the information available at the time of preparation.'),
      ),

      projection ? React.createElement(
        View,
        { style: styles.disclaimer },
        React.createElement(Text, { style: combine(styles.disclaimerText, { fontWeight: 'bold', marginBottom: 6, fontStyle: 'normal' }) },
          'About the AI cost projection'),
        React.createElement(Text, { style: styles.disclaimerText },
          'The cost projection in this document is an AI-generated estimate based on industry benchmarks, the plan design described herein, and group demographics provided by the broker. It is NOT a certified actuarial projection. Actual costs may vary materially based on claims experience, network discounts achieved, regulatory changes, and other factors.'),
        React.createElement(Text, { style: combine(styles.disclaimerText, { marginTop: 6 }) },
          'Final pricing should be validated with a licensed actuary, and all stop-loss premiums and TPA fees should be confirmed via formal carrier and vendor quotes before binding.'),
      ) : null,

      React.createElement(
        View,
        { style: styles.disclaimer },
        React.createElement(Text, { style: combine(styles.disclaimerText, { fontWeight: 'bold', marginBottom: 6, fontStyle: 'normal' }) },
          'Compliance and regulatory'),
        React.createElement(Text, { style: styles.disclaimerText },
          'This proposal is for informational purposes and does not constitute a binding offer of coverage, a guarantee of insurability, or formal regulatory advice. ERISA, ACA, HIPAA, and applicable state benefit laws apply to all group health plans. The employer is responsible for ensuring full legal compliance, which may require consultation with benefits counsel.'),
      ),

      React.createElement(
        View,
        { style: styles.disclaimer },
        React.createElement(Text, { style: combine(styles.disclaimerText, { fontWeight: 'bold', marginBottom: 6, fontStyle: 'normal' }) },
          'Contact'),
        React.createElement(Text, { style: styles.disclaimerText },
          `Questions about this proposal should be directed to ${brokerName}${agencyName ? ` at ${agencyName}` : ''}.`),
      ),

      pageFooter(footerText, projection ? 6 : 5),
    ),
  );
}

// ============================================
// PDF helpers (React.createElement helpers)
// ============================================
function sectionHeader(num: string, title: string) {
  return React.createElement(
    View,
    { style: styles.sectionHeader },
    React.createElement(Text, { style: styles.sectionHeaderNum }, num),
    React.createElement(Text, { style: styles.sectionHeaderTitle }, title),
  );
}

function rowEl(label: string, value: string, opts: { bold?: boolean; last?: boolean } = {}) {
  return React.createElement(
    View,
    { style: combine(styles.row, opts.last ? styles.rowLast : null) },
    React.createElement(Text, { style: styles.rowLabel }, label),
    React.createElement(
      Text,
      { style: combine(styles.rowValue, opts.bold ? { fontWeight: 'bold' } : null) },
      value,
    ),
  );
}

function summaryCardEl(label: string, value: string, sub: string, highlight: boolean = false) {
  return React.createElement(
    View,
    { style: combine(styles.summaryCard, highlight ? styles.summaryCardHighlight : null) },
    React.createElement(
      Text,
      { style: combine(styles.summaryCardLabel, highlight ? styles.summaryCardLabelHighlight : null) },
      label,
    ),
    React.createElement(
      Text,
      { style: combine(styles.summaryCardValue, highlight ? styles.summaryCardValueHighlight : null) },
      value,
    ),
    React.createElement(
      Text,
      { style: combine(styles.summaryCardSub, highlight ? styles.summaryCardSubHighlight : null) },
      sub,
    ),
  );
}

function pageFooter(text: string, pageNum: number) {
  return React.createElement(
    View,
    { style: styles.pageFooter },
    React.createElement(Text, null, text),
    React.createElement(Text, null, `Page ${pageNum}`),
  );
}

// ============================================
// Display helpers
// ============================================
function fmtMoney(n: any): string {
  if (n === undefined || n === null || isNaN(n)) return '—';
  if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (n >= 10000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function dollarPair(single: any, family: any): string | null {
  if (!single && !family) return null;
  return `$${single ? Number(single).toLocaleString() : '—'} single / $${family ? Number(family).toLocaleString() : '—'} family`;
}

function cap(s: string | undefined): string | null {
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function planYearLabel(s: string | undefined): string | null {
  if (!s) return null;
  if (s === 'calendar') return 'Calendar year';
  if (s === 'plan_year') return 'Plan year (anniversary)';
  return s;
}

function industryLabel(s: string | undefined): string | null {
  if (!s) return null;
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function networkTypeLabel(s: string | undefined): string | null {
  if (!s) return null;
  if (s === 'rbp') return 'Reference-based pricing';
  return s.toUpperCase();
}

function carrierLabel(s: string | undefined): string | null {
  if (!s) return null;
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function contractLabel(s: string | undefined): string | null {
  if (!s) return null;
  if (s === 'paid') return 'Paid contract';
  return s.replace('_', '/');
}

function disclosureLabel(s: string | undefined): string | null {
  if (!s) return null;
  if (s === 'no_disclosure') return 'No-disclosure quote';
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function tpaLabel(s: string | undefined): string | null {
  if (!s) return null;
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function pbmLabel(s: string | undefined): string | null {
  if (!s) return null;
  if (s === 'bundled_with_tpa') return 'Bundled with TPA';
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function tpaFeeLabel(tpa: any): string | null {
  if (!tpa) return null;
  if (tpa.adminFeeStructure === 'pepm' && tpa.adminFeePepm) return `$${tpa.adminFeePepm} PEPM`;
  if (tpa.adminFeeStructure === 'pct_claims' && tpa.adminFeePctClaims) return `${tpa.adminFeePctClaims}% of claims`;
  if (tpa.adminFeeStructure === 'flat' && tpa.adminFeeFlat) return `$${Number(tpa.adminFeeFlat).toLocaleString()}/year flat`;
  if (tpa.adminFeeStructure) return cap(tpa.adminFeeStructure.replace(/_/g, ' '));
  return null;
}

function fundingModelLabel(s: string | undefined): string | null {
  if (!s) return null;
  if (s === 'monthly_bank') return 'Monthly claims bank';
  if (s === 'pay_as_you_go') return 'Pay-as-you-go';
  if (s === 'fully_pre_funded') return 'Fully pre-funded';
  return s;
}

function cobraLabel(tpa: any): string | null {
  if (!tpa?.cobraAdmin) return null;
  if (tpa.cobraAdmin === 'separate_vendor') return `Separate vendor${tpa.cobraVendor ? ` (${tpa.cobraVendor})` : ''}`;
  return tpa.cobraAdmin.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
}

function waitingPeriodLabel(e: any): string | null {
  if (!e?.waitingPeriod) return null;
  const map: Record<string, string> = {
    'none': 'None — eligible day of hire',
    '30_days': '30 days from hire',
    '60_days': '60 days from hire',
    '90_days': '90 days from hire',
    'fom_after_30': 'First of month after 30 days',
    'fom_after_60': 'First of month after 60 days',
    'custom': e.waitingPeriodCustom || 'Custom',
  };
  return map[e.waitingPeriod] || e.waitingPeriod;
}

function domesticPartnerLabel(s: string | undefined): string | null {
  if (!s) return null;
  if (s === 'none') return 'Not covered';
  if (s === 'same_sex') return 'Same-sex domestic partners only';
  if (s === 'all_partners') return 'All unmarried domestic partners';
  return s;
}

function spendingAccountLabel(s: string): string {
  const map: Record<string, string> = {
    hsa: 'HSA',
    hra: 'HRA',
    fsa: 'FSA',
    hsa_fsa: 'HSA + Limited FSA',
    hra_fsa: 'HRA + FSA',
  };
  return map[s] || s;
}

function hasCarveouts(c: any): boolean {
  return !!(
    c.dentalEnabled || c.visionEnabled || c.eapEnabled || c.lifeEnabled ||
    c.stdEnabled || c.ltdEnabled || c.accidentEnabled || c.hospitalIndemnityEnabled ||
    c.criticalIllnessEnabled || (c.spendingAccountType && c.spendingAccountType !== 'none')
  );
}