import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ============================================================
// TYPES
// ============================================================

type Household = {
  id: string;
  user_id: string;
  zip_code: string | null;
  household_size: number | null;
  annual_income: number | null;
  coverage_scope: string | null;
  conditions: string[] | null;
  medications: string | null;
  monthly_budget: number | null;
};

type EmployerPlan = {
  id: string;
  packet_id: string;
  plan_name: string;
  plan_type: string | null;
  monthly_premium_employee: number | null;
  monthly_premium_employee_plus_family: number | null;
  monthly_premium_employee_plus_spouse: number | null;
  monthly_premium_employee_plus_children: number | null;
  deductible_individual: number | null;
  deductible_family: number | null;
  out_of_pocket_max_individual: number | null;
  out_of_pocket_max_family: number | null;
  hsa_eligible: boolean;
  highlights: string | null;
};

type SpouseEmployment = {
  spouse_employer_name: string | null;
  spouse_annual_income: number | null;
  spousal_surcharge_applies: boolean;
  spousal_surcharge_amount: number | null;
};

type ScenarioId = 'self_family' | 'spouse_family' | 'both_single' | 'self_ee_kids' | 'spouse_ee_kids';

type Scenario = {
  id: string;
  scenario_type: ScenarioId;
  scenario_label: string;
  selfPlan: { id: string; name: string; tier: string } | null;
  spousePlan: { id: string; name: string; tier: string } | null;
  monthlyPremium: number;
  annualPremium: number;
  expectedAnnualOOP: number;
  expectedAnnualCost: number;
  worstCaseAnnualCost: number;
  hsaEligible: boolean;
  gotchas: Array<{ severity: 'warn' | 'info' | 'positive'; tag: string; message: string }>;
  whoIsOn: {
    self: string;
    spouse: string;
    children: string;
  };
};

// ============================================================
// UTILIZATION RULES
// ============================================================

function estimateUtilizationLevel(
  household: Household,
  claimsCount: number
): 'low' | 'moderate' | 'high' {
  const conditions = household.conditions || [];
  const meds = (household.medications || '').toLowerCase();
  const householdSize = household.household_size || 1;

  let score = 0;
  const highSev = ['cancer', 'heart disease', 'autoimmune', 'chronic pain', 'pregnancy'];
  for (const c of conditions) {
    if (highSev.some((h) => c.toLowerCase().includes(h))) score += 3;
  }
  const modSev = ['diabetes', 'hypertension', 'asthma', 'mental health', 'depression', 'anxiety'];
  for (const c of conditions) {
    if (modSev.some((m) => c.toLowerCase().includes(m))) score += 1.5;
  }
  if (meds.length > 50) score += 1;
  if (meds.includes(',')) score += 0.5;
  if (claimsCount >= 5) score += 2;
  else if (claimsCount >= 3) score += 1;
  if (householdSize >= 4) score += 0.5;

  if (score >= 4) return 'high';
  if (score >= 1.5) return 'moderate';
  return 'low';
}

function expectedSpendForLevel(level: 'low' | 'moderate' | 'high', householdSize: number): number {
  const baseByLevel = { low: 800, moderate: 3500, high: 9000 };
  const base = baseByLevel[level];
  const multiplier = 1 + (householdSize - 1) * 0.6;
  return Math.round(base * multiplier);
}

function expectedOOPGivenSpend(
  totalSpend: number,
  deductible: number | null,
  oopMax: number | null
): number {
  const ded = deductible ?? 0;
  const oop = oopMax ?? Infinity;
  if (totalSpend <= 0) return 0;
  let oopPaid = 0;
  if (totalSpend <= ded) oopPaid = totalSpend;
  else oopPaid = ded + (totalSpend - ded) * 0.2;
  return Math.min(oopPaid, oop);
}

// ============================================================
// HELPERS
// ============================================================

function getTierPremium(plan: EmployerPlan, tier: 'single' | 'family' | 'ee_spouse' | 'ee_children'): number | null {
  if (tier === 'single') return plan.monthly_premium_employee;
  if (tier === 'family') {
    return plan.monthly_premium_employee_plus_family ?? plan.monthly_premium_employee;
  }
  if (tier === 'ee_spouse') {
    return plan.monthly_premium_employee_plus_spouse ?? plan.monthly_premium_employee_plus_family ?? null;
  }
  if (tier === 'ee_children') {
    return plan.monthly_premium_employee_plus_children ?? plan.monthly_premium_employee_plus_family ?? null;
  }
  return null;
}

function getTierDeductible(plan: EmployerPlan, tier: 'single' | 'family' | 'ee_spouse' | 'ee_children'): number | null {
  if (tier === 'single') return plan.deductible_individual;
  return plan.deductible_family ?? plan.deductible_individual;
}

function getTierOOPMax(plan: EmployerPlan, tier: 'single' | 'family' | 'ee_spouse' | 'ee_children'): number | null {
  if (tier === 'single') return plan.out_of_pocket_max_individual;
  return plan.out_of_pocket_max_family ?? plan.out_of_pocket_max_individual;
}

function tierLabel(tier: 'single' | 'family' | 'ee_spouse' | 'ee_children'): string {
  if (tier === 'single') return 'Single';
  if (tier === 'family') return 'Family';
  if (tier === 'ee_spouse') return 'Employee + Spouse';
  if (tier === 'ee_children') return 'Employee + Children';
  return tier;
}

// ============================================================
// SCENARIO BUILDERS
// ============================================================

function buildSelfFamily(
  selfPlan: EmployerPlan,
  spouseEmployment: SpouseEmployment,
  utilLevel: 'low' | 'moderate' | 'high',
  household: Household
): Scenario | null {
  const tier = household.coverage_scope === 'employee_plus_spouse' ? 'ee_spouse' : 'family';
  const premium = getTierPremium(selfPlan, tier);
  if (premium == null) return null;

  const ded = getTierDeductible(selfPlan, tier);
  const oop = getTierOOPMax(selfPlan, tier);
  const householdSize = household.household_size || 2;
  const totalSpend = expectedSpendForLevel(utilLevel, householdSize);
  const expectedOOP = expectedOOPGivenSpend(totalSpend, ded, oop);
  const surchargePerMonth = spouseEmployment.spousal_surcharge_applies ? (spouseEmployment.spousal_surcharge_amount || 0) : 0;
  const monthlyPremium = premium + surchargePerMonth;
  const annualPremium = monthlyPremium * 12;
  const expectedAnnualCost = annualPremium + expectedOOP;
  const worstCaseAnnualCost = annualPremium + (oop ?? expectedOOP);

  const gotchas: Scenario['gotchas'] = [];
  if (surchargePerMonth > 0) {
    gotchas.push({
      severity: 'warn',
      tag: 'spousal-surcharge',
      message: `Your employer charges a $${surchargePerMonth}/mo spousal surcharge — adding $${(surchargePerMonth * 12).toLocaleString()} to your annual cost.`,
    });
  }
  if (selfPlan.hsa_eligible) {
    gotchas.push({
      severity: 'positive',
      tag: 'hsa-eligible',
      message: `${selfPlan.plan_name} is HSA-eligible. With everyone on this plan, you can contribute up to the family HSA limit ($8,550 in 2025).`,
    });
  }

  return {
    id: `self_family__${selfPlan.id}`,
    scenario_type: 'self_family',
    scenario_label: `Everyone on ${selfPlan.plan_name} (your plan, ${tierLabel(tier).toLowerCase()})`,
    selfPlan: { id: selfPlan.id, name: selfPlan.plan_name, tier: tierLabel(tier) },
    spousePlan: null,
    monthlyPremium,
    annualPremium,
    expectedAnnualOOP: expectedOOP,
    expectedAnnualCost,
    worstCaseAnnualCost,
    hsaEligible: selfPlan.hsa_eligible,
    gotchas,
    whoIsOn: {
      self: `${selfPlan.plan_name} (${tierLabel(tier)})`,
      spouse: `${selfPlan.plan_name} (covered by your tier)`,
      children: `${selfPlan.plan_name} (covered by your tier)`,
    },
  };
}

function buildSpouseFamily(
  spousePlan: EmployerPlan,
  utilLevel: 'low' | 'moderate' | 'high',
  household: Household
): Scenario | null {
  const tier = household.coverage_scope === 'employee_plus_spouse' ? 'ee_spouse' : 'family';
  const premium = getTierPremium(spousePlan, tier);
  if (premium == null) return null;

  const ded = getTierDeductible(spousePlan, tier);
  const oop = getTierOOPMax(spousePlan, tier);
  const householdSize = household.household_size || 2;
  const totalSpend = expectedSpendForLevel(utilLevel, householdSize);
  const expectedOOP = expectedOOPGivenSpend(totalSpend, ded, oop);
  const monthlyPremium = premium;
  const annualPremium = monthlyPremium * 12;
  const expectedAnnualCost = annualPremium + expectedOOP;
  const worstCaseAnnualCost = annualPremium + (oop ?? expectedOOP);

  const gotchas: Scenario['gotchas'] = [];
  if (spousePlan.hsa_eligible) {
    gotchas.push({
      severity: 'positive',
      tag: 'hsa-eligible',
      message: `${spousePlan.plan_name} is HSA-eligible. Spouse can contribute up to the family HSA limit ($8,550 in 2025) since the whole family is on this HDHP.`,
    });
  }

  return {
    id: `spouse_family__${spousePlan.id}`,
    scenario_type: 'spouse_family',
    scenario_label: `Everyone on ${spousePlan.plan_name} (spouse's plan, ${tierLabel(tier).toLowerCase()})`,
    selfPlan: null,
    spousePlan: { id: spousePlan.id, name: spousePlan.plan_name, tier: tierLabel(tier) },
    monthlyPremium,
    annualPremium,
    expectedAnnualOOP: expectedOOP,
    expectedAnnualCost,
    worstCaseAnnualCost,
    hsaEligible: spousePlan.hsa_eligible,
    gotchas,
    whoIsOn: {
      self: `${spousePlan.plan_name} (covered by spouse's tier)`,
      spouse: `${spousePlan.plan_name} (${tierLabel(tier)})`,
      children: `${spousePlan.plan_name} (covered by spouse's tier)`,
    },
  };
}

function buildBothSingle(
  selfPlan: EmployerPlan,
  spousePlan: EmployerPlan,
  utilLevel: 'low' | 'moderate' | 'high',
  household: Household
): Scenario | null {
  const scope = household.coverage_scope;
  if (scope !== 'individual' && scope !== 'employee_plus_spouse') return null;

  const selfPrem = getTierPremium(selfPlan, 'single');
  const spousePrem = getTierPremium(spousePlan, 'single');
  if (selfPrem == null || spousePrem == null) return null;

  const selfDed = getTierDeductible(selfPlan, 'single');
  const selfOOP = getTierOOPMax(selfPlan, 'single');
  const spouseDed = getTierDeductible(spousePlan, 'single');
  const spouseOOP = getTierOOPMax(spousePlan, 'single');

  const householdSize = household.household_size || 2;
  const totalSpend = expectedSpendForLevel(utilLevel, householdSize);
  const perPersonSpend = totalSpend / householdSize;

  const selfExpectedOOP = expectedOOPGivenSpend(perPersonSpend, selfDed, selfOOP);
  const spouseExpectedOOP = expectedOOPGivenSpend(perPersonSpend, spouseDed, spouseOOP);

  const monthlyPremium = selfPrem + spousePrem;
  const annualPremium = monthlyPremium * 12;
  const expectedAnnualOOP = selfExpectedOOP + spouseExpectedOOP;
  const expectedAnnualCost = annualPremium + expectedAnnualOOP;
  const worstCaseAnnualCost = annualPremium + (selfOOP ?? selfExpectedOOP) + (spouseOOP ?? spouseExpectedOOP);

  const gotchas: Scenario['gotchas'] = [];
  const bothHSA = selfPlan.hsa_eligible && spousePlan.hsa_eligible;
  const oneHSA = selfPlan.hsa_eligible !== spousePlan.hsa_eligible;
  if (bothHSA) {
    gotchas.push({
      severity: 'positive',
      tag: 'hsa-eligible',
      message: `Both plans are HSA-eligible. Each spouse can contribute up to the individual HSA limit ($4,300 in 2025) for a combined $8,600.`,
    });
  } else if (oneHSA) {
    gotchas.push({
      severity: 'warn',
      tag: 'hsa-conflict',
      message: `Only one plan is HSA-eligible. The HSA-eligible spouse can still contribute, but only at the individual limit.`,
    });
  }

  return {
    id: `both_single__${selfPlan.id}__${spousePlan.id}`,
    scenario_type: 'both_single',
    scenario_label: `You on ${selfPlan.plan_name}, spouse on ${spousePlan.plan_name} (both single)`,
    selfPlan: { id: selfPlan.id, name: selfPlan.plan_name, tier: 'Single' },
    spousePlan: { id: spousePlan.id, name: spousePlan.plan_name, tier: 'Single' },
    monthlyPremium,
    annualPremium,
    expectedAnnualOOP,
    expectedAnnualCost,
    worstCaseAnnualCost,
    hsaEligible: bothHSA,
    gotchas,
    whoIsOn: {
      self: `${selfPlan.plan_name} (Single)`,
      spouse: `${spousePlan.plan_name} (Single)`,
      children: 'No children in household',
    },
  };
}

function buildSelfEEKids(
  selfPlan: EmployerPlan,
  spousePlan: EmployerPlan,
  utilLevel: 'low' | 'moderate' | 'high',
  household: Household
): Scenario | null {
  const scope = household.coverage_scope;
  if (scope !== 'employee_plus_children' && scope !== 'family') return null;

  const selfPrem = getTierPremium(selfPlan, 'ee_children');
  const spousePrem = getTierPremium(spousePlan, 'single');
  if (selfPrem == null || spousePrem == null) return null;

  const selfDed = getTierDeductible(selfPlan, 'ee_children');
  const selfOOP = getTierOOPMax(selfPlan, 'ee_children');
  const spouseDed = getTierDeductible(spousePlan, 'single');
  const spouseOOP = getTierOOPMax(spousePlan, 'single');

  const householdSize = household.household_size || 3;
  const totalSpend = expectedSpendForLevel(utilLevel, householdSize);
  const selfPortion = totalSpend * ((householdSize - 1) / householdSize);
  const spousePortion = totalSpend * (1 / householdSize);

  const selfExpectedOOP = expectedOOPGivenSpend(selfPortion, selfDed, selfOOP);
  const spouseExpectedOOP = expectedOOPGivenSpend(spousePortion, spouseDed, spouseOOP);

  const monthlyPremium = selfPrem + spousePrem;
  const annualPremium = monthlyPremium * 12;
  const expectedAnnualOOP = selfExpectedOOP + spouseExpectedOOP;
  const expectedAnnualCost = annualPremium + expectedAnnualOOP;
  const worstCaseAnnualCost = annualPremium + (selfOOP ?? selfExpectedOOP) + (spouseOOP ?? spouseExpectedOOP);

  const gotchas: Scenario['gotchas'] = [];
  if (selfPlan.hsa_eligible && spousePlan.hsa_eligible) {
    gotchas.push({
      severity: 'positive',
      tag: 'hsa-eligible',
      message: `Both plans are HSA-eligible. Family HSA limit applies via your plan ($8,550 in 2025); spouse can contribute individually too.`,
    });
  } else if (!selfPlan.hsa_eligible && spousePlan.hsa_eligible) {
    gotchas.push({
      severity: 'warn',
      tag: 'hsa-conflict',
      message: `Spouse's plan is HSA-eligible but yours isn't. Since spouse is on their own HDHP and not covered by your non-HDHP, spouse can still contribute at the individual limit.`,
    });
  }

  return {
    id: `self_ee_kids__${selfPlan.id}__${spousePlan.id}`,
    scenario_type: 'self_ee_kids',
    scenario_label: `You + kids on ${selfPlan.plan_name}, spouse on ${spousePlan.plan_name}`,
    selfPlan: { id: selfPlan.id, name: selfPlan.plan_name, tier: 'Employee + Children' },
    spousePlan: { id: spousePlan.id, name: spousePlan.plan_name, tier: 'Single' },
    monthlyPremium,
    annualPremium,
    expectedAnnualOOP,
    expectedAnnualCost,
    worstCaseAnnualCost,
    hsaEligible: selfPlan.hsa_eligible && spousePlan.hsa_eligible,
    gotchas,
    whoIsOn: {
      self: `${selfPlan.plan_name} (Employee + Children)`,
      spouse: `${spousePlan.plan_name} (Single)`,
      children: `${selfPlan.plan_name} (covered by your tier)`,
    },
  };
}

function buildSpouseEEKids(
  selfPlan: EmployerPlan,
  spousePlan: EmployerPlan,
  utilLevel: 'low' | 'moderate' | 'high',
  household: Household
): Scenario | null {
  const scope = household.coverage_scope;
  if (scope !== 'employee_plus_children' && scope !== 'family') return null;

  const selfPrem = getTierPremium(selfPlan, 'single');
  const spousePrem = getTierPremium(spousePlan, 'ee_children');
  if (selfPrem == null || spousePrem == null) return null;

  const selfDed = getTierDeductible(selfPlan, 'single');
  const selfOOP = getTierOOPMax(selfPlan, 'single');
  const spouseDed = getTierDeductible(spousePlan, 'ee_children');
  const spouseOOP = getTierOOPMax(spousePlan, 'ee_children');

  const householdSize = household.household_size || 3;
  const totalSpend = expectedSpendForLevel(utilLevel, householdSize);
  const spousePortion = totalSpend * ((householdSize - 1) / householdSize);
  const selfPortion = totalSpend * (1 / householdSize);

  const selfExpectedOOP = expectedOOPGivenSpend(selfPortion, selfDed, selfOOP);
  const spouseExpectedOOP = expectedOOPGivenSpend(spousePortion, spouseDed, spouseOOP);

  const monthlyPremium = selfPrem + spousePrem;
  const annualPremium = monthlyPremium * 12;
  const expectedAnnualOOP = selfExpectedOOP + spouseExpectedOOP;
  const expectedAnnualCost = annualPremium + expectedAnnualOOP;
  const worstCaseAnnualCost = annualPremium + (selfOOP ?? selfExpectedOOP) + (spouseOOP ?? spouseExpectedOOP);

  const gotchas: Scenario['gotchas'] = [];
  if (selfPlan.hsa_eligible && spousePlan.hsa_eligible) {
    gotchas.push({
      severity: 'positive',
      tag: 'hsa-eligible',
      message: `Both plans are HSA-eligible. Family HSA limit applies via spouse's plan ($8,550 in 2025); you can contribute individually too.`,
    });
  }

  return {
    id: `spouse_ee_kids__${selfPlan.id}__${spousePlan.id}`,
    scenario_type: 'spouse_ee_kids',
    scenario_label: `You on ${selfPlan.plan_name}, spouse + kids on ${spousePlan.plan_name}`,
    selfPlan: { id: selfPlan.id, name: selfPlan.plan_name, tier: 'Single' },
    spousePlan: { id: spousePlan.id, name: spousePlan.plan_name, tier: 'Employee + Children' },
    monthlyPremium,
    annualPremium,
    expectedAnnualOOP,
    expectedAnnualCost,
    worstCaseAnnualCost,
    hsaEligible: selfPlan.hsa_eligible && spousePlan.hsa_eligible,
    gotchas,
    whoIsOn: {
      self: `${selfPlan.plan_name} (Single)`,
      spouse: `${spousePlan.plan_name} (Employee + Children)`,
      children: `${spousePlan.plan_name} (covered by spouse's tier)`,
    },
  };
}

function approximateMarginalTaxRate(combinedIncome: number): number {
  if (combinedIncome >= 731200) return 0.37;
  if (combinedIncome >= 487450) return 0.35;
  if (combinedIncome >= 383900) return 0.32;
  if (combinedIncome >= 201050) return 0.24;
  if (combinedIncome >= 94300) return 0.22;
  if (combinedIncome >= 23200) return 0.12;
  return 0.10;
}

// ============================================================
// AI SUMMARIZATION LAYER
// ============================================================

async function generateAISummary(args: {
  household: Household;
  spouseEmployment: SpouseEmployment;
  topScenarios: Scenario[];
  utilizationLevel: 'low' | 'moderate' | 'high';
  expectedSpend: number;
  combinedIncome: number;
  marginalRate: number;
  selfEmployerName: string;
  spouseEmployerName: string;
  claimsCount: number;
}): Promise<{
  overallRecommendation: string;
  perScenarioInsights: Array<{ scenario_id: string; insight: string }>;
  keyTradeoffs: string[];
} | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  const scenariosForPrompt = args.topScenarios.map((s, i) => ({
    rank: i + 1,
    id: s.id,
    label: s.scenario_label,
    monthly_premium: Math.round(s.monthlyPremium),
    annual_premium: Math.round(s.annualPremium),
    expected_annual_cost: Math.round(s.expectedAnnualCost),
    worst_case_annual_cost: Math.round(s.worstCaseAnnualCost),
    hsa_eligible: s.hsaEligible,
    who_is_on: s.whoIsOn,
    gotchas: s.gotchas.map((g) => ({ severity: g.severity, message: g.message })),
  }));

  const prompt = `You are a benefits advisor helping a couple decide how to coordinate their employer health insurance.

HOUSEHOLD CONTEXT:
- Coverage scope: ${args.household.coverage_scope || 'unknown'}
- Household size: ${args.household.household_size || 'unknown'}
- Conditions: ${(args.household.conditions || []).join(', ') || 'none reported'}
- Estimated medical utilization: ${args.utilizationLevel}
- Expected annual medical spend: ~$${args.expectedSpend.toLocaleString()}
- Combined household income: ~$${args.combinedIncome.toLocaleString()} (marginal tax rate ~${Math.round(args.marginalRate * 100)}%)
- Claims uploaded: ${args.claimsCount}
- Self employer: ${args.selfEmployerName}
- Spouse employer: ${args.spouseEmployerName}

TOP 3 SCENARIOS (already ranked by total expected annual cost):
${JSON.stringify(scenariosForPrompt, null, 2)}

Your task: Return ONLY valid JSON (no preamble, no markdown fences) with this exact shape:

{
  "overallRecommendation": "2-3 sentence plain-English explanation of why scenario rank #1 wins for this household. Reference the dollar gap to scenario #2, the household composition, and any decisive trade-off (HSA, surcharge, taxes). Talk to the user as 'you' and refer to the spouse naturally.",
  "perScenarioInsights": [
    { "scenario_id": "<exact id from input>", "insight": "1 sentence per scenario explaining why it ranked here, claim/condition-aware where relevant" },
    { "scenario_id": "<exact id>", "insight": "..." },
    { "scenario_id": "<exact id>", "insight": "..." }
  ],
  "keyTradeoffs": [
    "3-5 short bullet-style tradeoffs across the top scenarios. Examples: HSA conflicts, premium vs OOP risk, tax impact, network differences."
  ]
}

Important:
- Write at a 9th-grade reading level. No insurance jargon unless you explain it.
- Be specific with dollar figures from the data.
- If a scenario has spousal-surcharge gotcha, call that out by name.
- If utilization is low, lean toward HDHP/HSA reasoning. If high, lean toward low-deductible plans.
- Never give actual tax advice — phrase tax savings as estimates.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
      .replace(/```json|```/g, '')
      .trim();

    const parsed = JSON.parse(responseText);
    return {
      overallRecommendation: parsed.overallRecommendation || '',
      perScenarioInsights: Array.isArray(parsed.perScenarioInsights) ? parsed.perScenarioInsights : [],
      keyTradeoffs: Array.isArray(parsed.keyTradeoffs) ? parsed.keyTradeoffs : [],
    };
  } catch (e: any) {
    console.error('AI summary failed:', e.message);
    return null;
  }
}

// ============================================================
// MAIN HANDLER
// ============================================================

export async function POST(request: Request) {
  try {
    const { user_id } = await request.json();
    if (!user_id) {
      return NextResponse.json({ success: false, error: 'Missing user_id' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: hh, error: hhErr } = await supabase
      .from('households')
      .select('*')
      .eq('user_id', user_id)
      .maybeSingle();

    if (hhErr || !hh) {
      return NextResponse.json({
        success: false,
        error: 'Household not found. Please complete your household setup first.',
      }, { status: 400 });
    }
    const household = hh as Household;

    const { data: selfPackets } = await supabase
      .from('employer_benefits_packets')
      .select('*')
      .eq('user_id', user_id)
      .eq('is_spouse_packet', false)
      .eq('parse_status', 'success')
      .order('uploaded_at', { ascending: false })
      .limit(1);

    const { data: spousePackets } = await supabase
      .from('employer_benefits_packets')
      .select('*')
      .eq('user_id', user_id)
      .eq('is_spouse_packet', true)
      .eq('parse_status', 'success')
      .order('uploaded_at', { ascending: false })
      .limit(1);

    if (!selfPackets || selfPackets.length === 0) {
      return NextResponse.json({ success: false, error: 'No self employer packet found.' }, { status: 400 });
    }
    if (!spousePackets || spousePackets.length === 0) {
      return NextResponse.json({ success: false, error: 'No spouse employer packet found.' }, { status: 400 });
    }

    const selfPacket = selfPackets[0];
    const spousePacket = spousePackets[0];

    const { data: selfPlansData } = await supabase
      .from('employer_plans')
      .select('*')
      .eq('packet_id', selfPacket.id);

    const { data: spousePlansData } = await supabase
      .from('employer_plans')
      .select('*')
      .eq('packet_id', spousePacket.id);

    const selfPlans = (selfPlansData || []) as EmployerPlan[];
    const spousePlans = (spousePlansData || []) as EmployerPlan[];

    if (selfPlans.length === 0 || spousePlans.length === 0) {
      return NextResponse.json({ success: false, error: 'Need at least one plan in each packet.' }, { status: 400 });
    }

    const { data: empData } = await supabase
      .from('spouse_employment_info')
      .select('*')
      .eq('user_id', user_id)
      .maybeSingle();

    const spouseEmployment: SpouseEmployment = {
      spouse_employer_name: empData?.spouse_employer_name || null,
      spouse_annual_income: empData?.spouse_annual_income ? Number(empData.spouse_annual_income) : null,
      spousal_surcharge_applies: !!empData?.spousal_surcharge_applies,
      spousal_surcharge_amount: empData?.spousal_surcharge_amount ? Number(empData.spousal_surcharge_amount) : null,
    };

    const { count: claimsCount } = await supabase
      .from('claims')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id);

    const utilizationLevel = estimateUtilizationLevel(household, claimsCount ?? 0);

    const allScenarios: Scenario[] = [];

    for (const sp of selfPlans) {
      const s = buildSelfFamily(sp, spouseEmployment, utilizationLevel, household);
      if (s) allScenarios.push(s);
    }
    for (const sp of spousePlans) {
      const s = buildSpouseFamily(sp, utilizationLevel, household);
      if (s) allScenarios.push(s);
    }
    for (const selfP of selfPlans) {
      for (const spouseP of spousePlans) {
        const s = buildBothSingle(selfP, spouseP, utilizationLevel, household);
        if (s) allScenarios.push(s);
      }
    }
    for (const selfP of selfPlans) {
      for (const spouseP of spousePlans) {
        const s = buildSelfEEKids(selfP, spouseP, utilizationLevel, household);
        if (s) allScenarios.push(s);
      }
    }
    for (const selfP of selfPlans) {
      for (const spouseP of spousePlans) {
        const s = buildSpouseEEKids(selfP, spouseP, utilizationLevel, household);
        if (s) allScenarios.push(s);
      }
    }

    if (allScenarios.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No valid coordination scenarios could be constructed. Make sure both packets have premium and tier data.',
      }, { status: 400 });
    }

    const householdIncome = household.annual_income || 0;
    const spouseIncome = spouseEmployment.spouse_annual_income || 0;
    const combinedIncome = Math.max(householdIncome, householdIncome + spouseIncome);
    const marginalRate = approximateMarginalTaxRate(combinedIncome);

    if (marginalRate >= 0.22) {
      const taxNote = `Premiums are typically pre-tax. At your estimated combined income (~$${combinedIncome.toLocaleString()}), the after-tax cost of premiums is roughly ${Math.round((1 - marginalRate) * 100)}% of the sticker price.`;
      for (const s of allScenarios) {
        s.gotchas.push({
          severity: 'info',
          tag: 'tax-bracket',
          message: taxNote,
        });
      }
    }

    allScenarios.sort((a, b) => a.expectedAnnualCost - b.expectedAnnualCost);
    const top3 = allScenarios.slice(0, 3);

    // ===== AI LAYER =====
    const expectedSpend = expectedSpendForLevel(utilizationLevel, household.household_size || 2);
    const aiSummary = await generateAISummary({
      household,
      spouseEmployment,
      topScenarios: top3,
      utilizationLevel,
      expectedSpend,
      combinedIncome,
      marginalRate,
      selfEmployerName: selfPacket.employer_name || 'Your employer',
      spouseEmployerName: spousePacket.employer_name || spouseEmployment.spouse_employer_name || "Spouse's employer",
      claimsCount: claimsCount ?? 0,
    });

    // Attach AI insights per scenario by id
    const top3WithAI = top3.map((s, i) => {
      const aiInsight = aiSummary?.perScenarioInsights.find((x) => x.scenario_id === s.id)?.insight || null;
      return { ...s, rank: i + 1, ai_insight: aiInsight };
    });

    return NextResponse.json({
      success: true,
      household_size: household.household_size,
      coverage_scope: household.coverage_scope,
      utilization_level: utilizationLevel,
      expected_annual_medical_spend: expectedSpend,
      claims_used: claimsCount ?? 0,
      self_employer_name: selfPacket.employer_name || 'Your employer',
      spouse_employer_name: spousePacket.employer_name || spouseEmployment.spouse_employer_name || "Spouse's employer",
      self_plan_count: selfPlans.length,
      spouse_plan_count: spousePlans.length,
      total_scenarios_evaluated: allScenarios.length,
      top_scenarios: top3WithAI,
      household_income: householdIncome,
      spouse_income: spouseIncome,
      combined_income: combinedIncome,
      marginal_tax_rate: marginalRate,
      spousal_surcharge_applies: spouseEmployment.spousal_surcharge_applies,
      spousal_surcharge_amount: spouseEmployment.spousal_surcharge_amount,
      // AI fields
      ai_overall_recommendation: aiSummary?.overallRecommendation || null,
      ai_key_tradeoffs: aiSummary?.keyTradeoffs || [],
      ai_used: !!aiSummary,
    });
  } catch (e: any) {
    console.error('coordinate-spouse-plans error:', e);
    return NextResponse.json({
      success: false,
      error: e.message || 'Unknown error',
    }, { status: 500 });
  }
}