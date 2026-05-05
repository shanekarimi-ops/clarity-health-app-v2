import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type CompareMode = 'employer-only' | 'employer-vs-marketplace';

type CoverageScope = 'individual' | 'employee_plus_spouse' | 'employee_plus_children' | 'family';

type EmployerPlanRow = {
  id: string;
  plan_name: string;
  plan_type: string | null;
  monthly_premium_employee: number | null;
  monthly_premium_employee_plus_family: number | null;
  deductible_individual: number | null;
  deductible_family: number | null;
  out_of_pocket_max_individual: number | null;
  out_of_pocket_max_family: number | null;
  primary_care_copay: string | null;
  specialist_copay: string | null;
  generic_rx_copay: string | null;
  brand_rx_copay: string | null;
  hsa_eligible: boolean;
  highlights: string | null;
};

type PlanProjection = {
  // Tier-resolved values
  tierLabel: 'Single coverage' | 'Family coverage';
  tierPremium: number | null;
  tierDeductible: number | null;
  tierOOPMax: number | null;
  // Calculated annual costs
  annualPremium: number | null;
  expectedAnnualCost: number | null;
  worstCaseAnnualCost: number | null;
  // Diagnostic
  expectedUtilizationLevel: 'low' | 'moderate' | 'high';
  expectedOOPSpend: number;
  // Rule-based ranking
  costRank: number;
};

export async function POST(request: Request) {
  try {
    const { user_id, mode } = (await request.json()) as { user_id?: string; mode?: CompareMode };

    if (!user_id) {
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }
    if (mode !== 'employer-only' && mode !== 'employer-vs-marketplace') {
      return NextResponse.json({ error: 'Invalid mode. Use employer-only or employer-vs-marketplace.' }, { status: 400 });
    }

    // ===== Fetch household + members for coverage scope =====
    const { data: household } = await supabaseAdmin
      .from('households')
      .select('id, household_size, coverage_scope, conditions, medications, preferred_providers, monthly_budget, priority_low_deductible, priority_mental_health, priority_dental_vision, priority_nationwide_network, tobacco_any')
      .eq('user_id', user_id)
      .maybeSingle();

    const coverageScope: CoverageScope = (household?.coverage_scope as CoverageScope) || 'individual';
    const householdSize = household?.household_size || 1;

    let members: Array<{ age: number | null; relationship: string; tobacco_user: boolean }> = [];
    if (household?.id) {
      const { data: memberRows } = await supabaseAdmin
        .from('household_members')
        .select('age, relationship, tobacco_user, member_order')
        .eq('household_id', household.id)
        .order('member_order', { ascending: true });
      members = (memberRows || []).map((m: any) => ({
        age: m.age,
        relationship: m.relationship,
        tobacco_user: m.tobacco_user,
      }));
    }

    // ===== Fetch most recent employer packet + its plans =====
    const { data: latestPacket, error: packetErr } = await supabaseAdmin
      .from('employer_benefits_packets')
      .select('*')
      .eq('user_id', user_id)
      .eq('parse_status', 'success')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (packetErr) {
      return NextResponse.json({ error: 'Failed to fetch employer packet', details: packetErr.message }, { status: 500 });
    }
    if (!latestPacket) {
      return NextResponse.json(
        { error: 'No employer benefits packet found. Upload one first.' },
        { status: 404 }
      );
    }

    const { data: employerPlans, error: planErr } = await supabaseAdmin
      .from('employer_plans')
      .select('*')
      .eq('packet_id', latestPacket.id)
      .order('created_at', { ascending: true });

    if (planErr) {
      return NextResponse.json({ error: 'Failed to fetch employer plans', details: planErr.message }, { status: 500 });
    }
    if (!employerPlans || employerPlans.length === 0) {
      return NextResponse.json(
        { error: 'No medical plans were extracted from your packet. Try re-uploading.' },
        { status: 404 }
      );
    }

    // ===== Fetch parsed claims =====
    const { data: claims } = await supabaseAdmin
      .from('claims_parsed')
      .select('conditions, procedures, medications, specialty_visits_count, prescription_count, total_billed, total_out_of_pocket, summary_text')
      .eq('user_id', user_id)
      .eq('parse_status', 'success');

    let claimsSummaryText = '';
    let totalClaimsOOP = 0;
    let totalSpecialty = 0;
    let totalRx = 0;
    let allConditions: string[] = [];
    let allMeds: string[] = [];
    if (claims && claims.length > 0) {
      allConditions = Array.from(new Set(claims.flatMap((c) => c.conditions || []))).filter(Boolean);
      const allProcedures = Array.from(new Set(claims.flatMap((c) => c.procedures || []))).filter(Boolean);
      allMeds = Array.from(new Set(claims.flatMap((c) => c.medications || []))).filter(Boolean);
      totalSpecialty = claims.reduce((s, c) => s + (c.specialty_visits_count || 0), 0);
      totalRx = claims.reduce((s, c) => s + (c.prescription_count || 0), 0);
      totalClaimsOOP = claims.reduce((s, c) => s + (Number(c.total_out_of_pocket) || 0), 0);
      claimsSummaryText = `
Claims history (${claims.length} document${claims.length === 1 ? '' : 's'}):
- Conditions: ${allConditions.length ? allConditions.join(', ') : 'none extracted'}
- Procedures: ${allProcedures.length ? allProcedures.join(', ') : 'none extracted'}
- Medications: ${allMeds.length ? allMeds.join(', ') : 'none extracted'}
- Specialist visits: ${totalSpecialty}
- Prescriptions: ${totalRx}
- Total out-of-pocket on file: $${totalClaimsOOP.toFixed(0)}
`.trim();
    }

    // ===== RULES LAYER: Determine utilization level and project annual cost per plan =====
    // Combines claims data + household conditions to estimate expected medical OOP spend before insurance.
    const householdConditions = household?.conditions || [];
    const utilizationLevel = estimateUtilizationLevel({
      claimsCount: claims?.length || 0,
      conditions: [...allConditions, ...householdConditions],
      specialty: totalSpecialty,
      rx: totalRx,
      claimsOOP: totalClaimsOOP,
      householdSize,
    });

    // Expected annual OOP medical spend BEFORE insurance kicks in (pre-deductible).
    // This is the baseline used to compare against each plan's deductible/coinsurance/OOP max.
    const expectedAnnualMedicalSpend = expectedSpendForLevel(utilizationLevel, householdSize);

    // Compute projections per plan
    const useFamilyTier = coverageScope !== 'individual';
    const projections: Record<string, PlanProjection> = {};
    for (const plan of employerPlans as EmployerPlanRow[]) {
      const projection = projectPlanCost(plan, useFamilyTier, expectedAnnualMedicalSpend);
      projections[plan.id] = projection;
    }

    // Cost rank: lowest expectedAnnualCost gets rank 1
    const costRanked = [...employerPlans]
      .map((p) => ({ id: p.id, exp: projections[p.id].expectedAnnualCost ?? Number.POSITIVE_INFINITY }))
      .sort((a, b) => a.exp - b.exp);
    costRanked.forEach((entry, i) => {
      projections[entry.id].costRank = i + 1;
    });

    const householdContextText = `
Household profile:
- Coverage scope chosen: ${prettyCoverageScope(coverageScope)} (${useFamilyTier ? 'family-tier' : 'single-tier'} pricing applies)
- Household size: ${householdSize}
${members.length > 0 ? '- Members: ' + members.map((m) => `${prettyRelationship(m.relationship)} age ${m.age ?? '?'}${m.tobacco_user ? ' (tobacco)' : ''}`).join('; ') : ''}
${household?.conditions?.length ? '- Stated conditions: ' + household.conditions.join(', ') : ''}
${household?.medications ? '- Stated medications: ' + household.medications : ''}
${household?.preferred_providers ? '- Preferred providers: ' + household.preferred_providers : ''}
${household?.monthly_budget ? '- Monthly budget target: $' + household.monthly_budget : ''}
- Priorities (1-5): low deductible ${household?.priority_low_deductible ?? 3}, mental health ${household?.priority_mental_health ?? 3}, dental/vision ${household?.priority_dental_vision ?? 3}, nationwide network ${household?.priority_nationwide_network ?? 3}
- Estimated medical utilization level (rules-derived): ${utilizationLevel}
- Estimated annual medical spend before insurance: $${expectedAnnualMedicalSpend.toLocaleString()}
`.trim();

    // ===== Branch on mode =====
    if (mode === 'employer-only') {
      // Build the simplified plan list with PROJECTIONS already attached so AI sees them
      const simplified = employerPlans.map((p: EmployerPlanRow) => {
        const proj = projections[p.id];
        return {
          id: p.id,
          plan_name: p.plan_name,
          plan_type: p.plan_type,
          tier_used: proj.tierLabel,
          tier_monthly_premium: proj.tierPremium,
          tier_deductible: proj.tierDeductible,
          tier_out_of_pocket_max: proj.tierOOPMax,
          primary_care_copay: p.primary_care_copay,
          specialist_copay: p.specialist_copay,
          generic_rx_copay: p.generic_rx_copay,
          brand_rx_copay: p.brand_rx_copay,
          hsa_eligible: p.hsa_eligible,
          highlights: p.highlights,
          projected_annual_premium: proj.annualPremium,
          projected_expected_annual_cost: proj.expectedAnnualCost,
          projected_worst_case_annual_cost: proj.worstCaseAnnualCost,
          cost_projection_rank: proj.costRank,
        };
      });

      const prompt = `You are a benefits advisor. The user works at ${latestPacket.employer_name || 'a company'} and is choosing among the medical plans their employer offers. Rank these plans for THIS person and explain in plain English (no jargon).

${householdContextText}

${claimsSummaryText ? claimsSummaryText + '\n' : ''}IMPORTANT: The "tier_*" fields and "projected_*" fields below have ALREADY been calculated for this household's coverage scope (${prettyCoverageScope(coverageScope)}). Use those numbers, not single-coverage assumptions.

When ranking, weight: claims history if available (chronic conditions → low deductible/broad network; multiple Rx → strong drug coverage; high past spend → low MOOP; routine usage → low premium), the household priorities listed above, and the projected annual costs.

Employer-offered medical plans (with tier-correct pricing already applied):
${JSON.stringify(simplified, null, 2)}

Return ONLY a valid JSON object (no markdown, no code fences) with this shape:
{
  "rankedPlans": [
    {
      "id": "the plan id",
      "rank": 1,
      "matchScore": 92,
      "summary": "One sentence on why this fits THIS household specifically (max 25 words). Reference their coverage scope or household composition where relevant.",
      "pros": ["Short bullet 1", "Short bullet 2", "Short bullet 3"],
      "cons": ["Short bullet 1", "Short bullet 2"],
      "claimsInsight": "Short note (max 30 words) on how claims data shaped this rank, or null if no claims."
    }
  ],
  "overallAdvice": "One paragraph (max 70 words) of plain-English guidance on which plan to pick and why. Reference the household composition (e.g. 'For your family of 4...')."
}

Rules:
- Rank ALL ${simplified.length} plans.
- matchScore 0-100. Spread realistically (don't cluster at 90+).
- The match score reflects overall fit — NOT just cost. Cost projection rank is shown separately.
- Return ONLY JSON.`;

      const claudeRes = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = claudeRes.content.find((b: any) => b.type === 'text') as any;
      let responseText = textBlock?.text || '';
      responseText = responseText.replace(/```json|```/g, '').trim();

      let claudeData;
      try {
        claudeData = JSON.parse(responseText);
      } catch {
        return NextResponse.json(
          { error: 'Could not parse Claude response', raw: responseText.slice(0, 500) },
          { status: 500 }
        );
      }

      // Merge ranking with full plan details + projections
      const rankedFull = (claudeData.rankedPlans || [])
        .map((r: any) => {
          const planDetails = employerPlans.find((p) => p.id === r.id);
          if (!planDetails) return null;
          const proj = projections[r.id];
          return {
            ...planDetails,
            ...r,
            // Projection fields surfaced for the UI
            tier_label: proj.tierLabel,
            tier_premium: proj.tierPremium,
            tier_deductible: proj.tierDeductible,
            tier_oop_max: proj.tierOOPMax,
            annual_premium: proj.annualPremium,
            expected_annual_cost: proj.expectedAnnualCost,
            worst_case_annual_cost: proj.worstCaseAnnualCost,
            cost_rank: proj.costRank,
            utilization_level: proj.expectedUtilizationLevel,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.rank - b.rank);

      return NextResponse.json({
        success: true,
        mode: 'employer-only',
        employer_name: latestPacket.employer_name,
        plan_year: latestPacket.plan_year,
        coverage_scope: coverageScope,
        coverage_scope_label: prettyCoverageScope(coverageScope),
        household_size: householdSize,
        utilization_level: utilizationLevel,
        expected_annual_medical_spend: expectedAnnualMedicalSpend,
        plans: rankedFull,
        overallAdvice: claudeData.overallAdvice || '',
        claimsUsed: claims?.length || 0,
      });
    }

    // ===== Mode: employer-vs-marketplace =====
    const { data: latestRec, error: recErr } = await supabaseAdmin
      .from('recommendations')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recErr) {
      return NextResponse.json({ error: 'Failed to fetch marketplace recommendation', details: recErr.message }, { status: 500 });
    }
    if (!latestRec || !Array.isArray(latestRec.plans) || latestRec.plans.length === 0) {
      return NextResponse.json(
        {
          error: 'No marketplace recommendation found. Run "Find Plans" first to generate one, then come back to compare.',
          requiresMarketplaceRun: true,
        },
        { status: 404 }
      );
    }

    const topMarketplacePlans = (latestRec.plans as any[]).slice(0, 3);

    // Build employer plans with projections for the AI prompt
    const employerWithProjections = (employerPlans as EmployerPlanRow[]).map((p) => {
      const proj = projections[p.id];
      return {
        id: p.id,
        plan_name: p.plan_name,
        plan_type: p.plan_type,
        tier_used: proj.tierLabel,
        tier_monthly_premium: proj.tierPremium,
        tier_deductible: proj.tierDeductible,
        tier_out_of_pocket_max: proj.tierOOPMax,
        primary_care_copay: p.primary_care_copay,
        specialist_copay: p.specialist_copay,
        hsa_eligible: p.hsa_eligible,
        highlights: p.highlights,
        projected_annual_premium: proj.annualPremium,
        projected_expected_annual_cost: proj.expectedAnnualCost,
        projected_worst_case_annual_cost: proj.worstCaseAnnualCost,
      };
    });

    // For Marketplace plans, compute cost projections with household-aware utilization too.
    // Marketplace plans always cover the full household (the API was called with all ages),
    // so we use their `premiumWithCredit` directly and apply the same expected medical spend.
    const marketplaceWithProjections = topMarketplacePlans.map((p: any) => {
      const monthlyPremium = p.premiumWithCredit ?? p.premium ?? 0;
      const annualPremium = monthlyPremium * 12;
      const deductible = p.deductible ?? 0;
      const oopMax = p.maxOutOfPocket ?? deductible;
      const expectedOOP = expectedOOPGivenSpend(expectedAnnualMedicalSpend, deductible, oopMax);
      const expectedAnnualCost = annualPremium + expectedOOP;
      const worstCaseAnnualCost = annualPremium + oopMax;
      return {
        id: p.id,
        name: p.name,
        issuer: p.issuer,
        type: p.type,
        metalLevel: p.metalLevel,
        monthlyPremium,
        annualPremium,
        deductible,
        maxOutOfPocket: oopMax,
        hsaEligible: p.hsaEligible,
        matchScore: p.matchScore,
        summary: p.summary,
        projected_expected_annual_cost: expectedAnnualCost,
        projected_worst_case_annual_cost: worstCaseAnnualCost,
      };
    });

    const prompt = `You are a benefits advisor helping someone decide between their EMPLOYER's medical plans and the FEDERAL MARKETPLACE alternatives. Be candid about trade-offs in plain English (no jargon).

${householdContextText}

${claimsSummaryText ? claimsSummaryText + '\n' : ''}IMPORTANT: All "projected_*" fields below are pre-calculated for this household's coverage scope (${prettyCoverageScope(coverageScope)}). Use those numbers as-is.

EMPLOYER plans offered by ${latestPacket.employer_name || 'their employer'}:
${JSON.stringify(employerWithProjections, null, 2)}

Top 3 MARKETPLACE plans (already pre-ranked for this household):
${JSON.stringify(marketplaceWithProjections, null, 2)}

Return ONLY a valid JSON object with this shape:
{
  "winner": "employer" or "marketplace" or "tie",
  "winnerPlanId": "id of the winning plan",
  "winnerPlanName": "name of the winning plan",
  "winnerSource": "employer" or "marketplace",
  "summary": "One paragraph (max 80 words) on which is the better deal for THIS household and why. Reference household composition.",
  "tradeoffs": [
    "Short bullet describing a key trade-off",
    "Short bullet describing another trade-off",
    "Short bullet describing another trade-off"
  ],
  "annualCostComparison": {
    "employerBestPlan": {
      "id": "employer plan id",
      "name": "employer plan name",
      "estimatedAnnualCost": <use projected_expected_annual_cost from chosen plan>,
      "worstCaseAnnualCost": <use projected_worst_case_annual_cost from chosen plan>
    },
    "marketplaceBestPlan": {
      "id": "marketplace plan id",
      "name": "marketplace plan name",
      "estimatedAnnualCost": <use projected_expected_annual_cost from chosen plan>,
      "worstCaseAnnualCost": <use projected_worst_case_annual_cost from chosen plan>
    }
  },
  "claimsInsight": "Short note (max 40 words) on how claims data shaped this conclusion, or null if no claims."
}

Rules:
- Use the projected_expected_annual_cost numbers exactly as provided. Do not recalculate.
- Be honest. If the employer plan is clearly better, say so. If marketplace wins, say so.
- Return ONLY JSON.`;

    const claudeRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = claudeRes.content.find((b: any) => b.type === 'text') as any;
    let responseText = textBlock?.text || '';
    responseText = responseText.replace(/```json|```/g, '').trim();

    let claudeData;
    try {
      claudeData = JSON.parse(responseText);
    } catch {
      return NextResponse.json(
        { error: 'Could not parse Claude response', raw: responseText.slice(0, 500) },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      mode: 'employer-vs-marketplace',
      employer_name: latestPacket.employer_name,
      plan_year: latestPacket.plan_year,
      coverage_scope: coverageScope,
      coverage_scope_label: prettyCoverageScope(coverageScope),
      household_size: householdSize,
      utilization_level: utilizationLevel,
      expected_annual_medical_spend: expectedAnnualMedicalSpend,
      employerPlans: employerWithProjections,
      marketplacePlans: marketplaceWithProjections,
      verdict: claudeData,
      claimsUsed: claims?.length || 0,
    });
  } catch (error: any) {
    console.error('Compare plans error:', error);
    return NextResponse.json(
      { error: 'Unexpected error', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================
// RULES LAYER HELPERS
// ============================================================

function prettyCoverageScope(scope: CoverageScope): string {
  const map: Record<CoverageScope, string> = {
    individual: 'Just you (employee-only)',
    employee_plus_spouse: 'You + spouse',
    employee_plus_children: 'You + child(ren)',
    family: 'Whole family',
  };
  return map[scope] || scope;
}

function prettyRelationship(rel: string): string {
  const map: Record<string, string> = {
    self: 'You',
    spouse: 'Spouse',
    domestic_partner: 'Partner',
    child: 'Child',
    dependent: 'Dependent',
  };
  return map[rel] || rel;
}

/**
 * Determines a household's expected medical utilization level based on claims + conditions.
 * Returns 'low' | 'moderate' | 'high'.
 */
function estimateUtilizationLevel(input: {
  claimsCount: number;
  conditions: string[];
  specialty: number;
  rx: number;
  claimsOOP: number;
  householdSize: number;
}): 'low' | 'moderate' | 'high' {
  const { claimsCount, conditions, specialty, rx, claimsOOP, householdSize } = input;

  const highSeverityConditions = [
    'cancer',
    'heart disease',
    'autoimmune',
    'chronic pain',
    'pregnancy',
  ];
  const moderateSeverityConditions = [
    'diabetes',
    'hypertension',
    'asthma',
    'mental health',
  ];

  const conditionsLower = conditions.map((c) => c.toLowerCase());
  const hasHighCondition = highSeverityConditions.some((hc) => conditionsLower.some((c) => c.includes(hc)));
  const hasModerateCondition = moderateSeverityConditions.some((mc) => conditionsLower.some((c) => c.includes(mc)));

  // Score components
  let score = 0;
  if (hasHighCondition) score += 3;
  if (hasModerateCondition) score += 1.5;
  if (specialty >= 5) score += 2;
  else if (specialty >= 2) score += 1;
  if (rx >= 10) score += 2;
  else if (rx >= 4) score += 1;
  if (claimsOOP >= 5000) score += 2;
  else if (claimsOOP >= 1500) score += 1;
  // Larger households typically have more healthcare touchpoints
  if (householdSize >= 4) score += 0.5;

  // No claims = unknown, but conditions still inform
  if (claimsCount === 0 && !hasHighCondition && !hasModerateCondition) return 'low';

  if (score >= 4) return 'high';
  if (score >= 1.5) return 'moderate';
  return 'low';
}

/**
 * Returns a baseline expected annual medical spend (pre-insurance) for the household,
 * based on utilization level. These are coarse industry-standard estimates.
 */
function expectedSpendForLevel(level: 'low' | 'moderate' | 'high', householdSize: number): number {
  const perPersonBase: Record<typeof level, number> = {
    low: 800,
    moderate: 3500,
    high: 9000,
  };
  // Diminishing returns per additional person — second person counts full, others 0.6x
  const effectivePeople = householdSize === 1 ? 1 : 1 + (householdSize - 1) * 0.6;
  return Math.round(perPersonBase[level] * effectivePeople);
}

/**
 * Given an annual medical spend before insurance, project actual OOP under a given
 * deductible / OOP max. Simplified model:
 *   - First $deductible of spend is paid 100% by user
 *   - Beyond deductible, user pays 20% coinsurance until OOP max
 *   - Capped at OOP max
 */
function expectedOOPGivenSpend(annualSpend: number, deductible: number, oopMax: number): number {
  if (annualSpend <= 0) return 0;
  if (deductible <= 0) {
    // No deductible — user pays 20% coinsurance up to OOP max
    return Math.min(annualSpend * 0.2, oopMax);
  }
  if (annualSpend <= deductible) {
    return annualSpend;
  }
  const overDeductible = annualSpend - deductible;
  const coinsurance = overDeductible * 0.2;
  const total = deductible + coinsurance;
  return Math.min(total, oopMax || total);
}

/**
 * Builds the per-plan projection record using tier-resolved values.
 */
function projectPlanCost(
  plan: EmployerPlanRow,
  useFamilyTier: boolean,
  expectedAnnualMedicalSpend: number
): PlanProjection {
  const tierLabel: 'Single coverage' | 'Family coverage' = useFamilyTier ? 'Family coverage' : 'Single coverage';
  const tierPremium = useFamilyTier
    ? plan.monthly_premium_employee_plus_family ?? plan.monthly_premium_employee
    : plan.monthly_premium_employee;
  const tierDeductible = useFamilyTier
    ? plan.deductible_family ?? plan.deductible_individual
    : plan.deductible_individual;
  const tierOOPMax = useFamilyTier
    ? plan.out_of_pocket_max_family ?? plan.out_of_pocket_max_individual
    : plan.out_of_pocket_max_individual;

  const annualPremium = tierPremium != null ? tierPremium * 12 : null;

  let expectedAnnualCost: number | null = null;
  let worstCaseAnnualCost: number | null = null;
  if (annualPremium != null) {
    const ded = tierDeductible ?? 0;
    const oopMax = tierOOPMax ?? ded;
    const expectedOOP = expectedOOPGivenSpend(expectedAnnualMedicalSpend, ded, oopMax);
    expectedAnnualCost = annualPremium + expectedOOP;
    worstCaseAnnualCost = annualPremium + oopMax;
  }

  const utilLevel: 'low' | 'moderate' | 'high' =
    expectedAnnualMedicalSpend < 1500 ? 'low' : expectedAnnualMedicalSpend < 6000 ? 'moderate' : 'high';

  return {
    tierLabel,
    tierPremium,
    tierDeductible,
    tierOOPMax,
    annualPremium,
    expectedAnnualCost,
    worstCaseAnnualCost,
    expectedUtilizationLevel: utilLevel,
    expectedOOPSpend: expectedAnnualMedicalSpend,
    costRank: 0, // filled in later
  };
}