import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

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
  id: string; // Unique id for this scenario combo
  scenario_type: ScenarioId;
  scenario_label: string; // Human-readable
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
    self: string; // Plan name + tier, e.g. "Self on PPO (Single)" or "Waived"
    spouse: string;
    children: string;
  };
};

// ============================================================
// UTILIZATION RULES (mirror of compare-plans / recommend logic)
// ============================================================

function estimateUtilizationLevel(
  household: Household,
  claimsCount: number
): 'low' | 'moderate' | 'high' {
  const conditions = household.conditions || [];
  const meds = (household.medications || '').toLowerCase();
  const householdSize = household.household_size || 1;

  let score = 0;

  // High-severity conditions
  const highSev = ['cancer', 'heart disease', 'autoimmune', 'chronic pain', 'pregnancy'];
  for (const c of conditions) {
    if (highSev.some((h) => c.toLowerCase().includes(h))) score += 3;
  }

  // Moderate-severity conditions
  const modSev = ['diabetes', 'hypertension', 'asthma', 'mental health', 'depression', 'anxiety'];
  for (const c of conditions) {
    if (modSev.some((m) => c.toLowerCase().includes(m))) score += 1.5;
  }

  // Medications signal
  if (meds.length > 50) score += 1;
  if (meds.includes(',')) score += 0.5;

  // Claims signal (3+ claims = at least moderate)
  if (claimsCount >= 5) score += 2;
  else if (claimsCount >= 3) score += 1;

  // Household size scales utilization moderately
  if (householdSize >= 4) score += 0.5;

  if (score >= 4) return 'high';
  if (score >= 1.5) return 'moderate';
  return 'low';
}

function expectedSpendForLevel(level: 'low' | 'moderate' | 'high', householdSize: number): number {
  const baseByLevel = { low: 800, moderate: 3500, high: 9000 };
  const base = baseByLevel[level];
  // Diminishing returns for additional household members
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
  if (totalSpend <= ded) {
    oopPaid = totalSpend;
  } else {
    oopPaid = ded + (totalSpend - ded) * 0.2; // 20% coinsurance
  }
  return Math.min(oopPaid, oop);
}

// ============================================================
// HELPER: get tier premium with fallback ladder
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

  // Spousal surcharge applies when spouse has access to coverage but enrolls on this side
  const surchargePerMonth = spouseEmployment.spousal_surcharge_applies
    ? (spouseEmployment.spousal_surcharge_amount || 0)
    : 0;

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
  // Only valid when no kids are being covered
  const scope = household.coverage_scope;
  if (scope !== 'individual' && scope !== 'employee_plus_spouse') {
    return null; // Kids exist; this scenario doesn't cover them
  }

  const selfPrem = getTierPremium(selfPlan, 'single');
  const spousePrem = getTierPremium(spousePlan, 'single');
  if (selfPrem == null || spousePrem == null) return null;

  const selfDed = getTierDeductible(selfPlan, 'single');
  const selfOOP = getTierOOPMax(selfPlan, 'single');
  const spouseDed = getTierDeductible(spousePlan, 'single');
  const spouseOOP = getTierOOPMax(spousePlan, 'single');

  // Split household expected spend evenly between the two spouses
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
  // Self+kids carries (householdSize - 1) people, spouse carries 1
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

// ============================================================
// TAX BRACKET HELPER
// ============================================================

function approximateMarginalTaxRate(combinedIncome: number): number {
  // Rough 2025 federal MFJ brackets — we do not give tax advice, this is just for premium-pretax estimation
  if (combinedIncome >= 731200) return 0.37;
  if (combinedIncome >= 487450) return 0.35;
  if (combinedIncome >= 383900) return 0.32;
  if (combinedIncome >= 201050) return 0.24;
  if (combinedIncome >= 94300) return 0.22;
  if (combinedIncome >= 23200) return 0.12;
  return 0.10;
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

    // ===== LOAD HOUSEHOLD =====
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

    // ===== LOAD SELF + SPOUSE PACKETS =====
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

    // ===== LOAD PLANS =====
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

    // ===== LOAD SPOUSE EMPLOYMENT =====
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

    // ===== LOAD CLAIMS COUNT =====
    const { count: claimsCount } = await supabase
      .from('claims')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id);

    const utilizationLevel = estimateUtilizationLevel(household, claimsCount ?? 0);

    // ===== BUILD SCENARIOS =====
    const allScenarios: Scenario[] = [];

    // Self-Family scenarios (one per self plan)
    for (const sp of selfPlans) {
      const s = buildSelfFamily(sp, spouseEmployment, utilizationLevel, household);
      if (s) allScenarios.push(s);
    }

    // Spouse-Family scenarios (one per spouse plan)
    for (const sp of spousePlans) {
      const s = buildSpouseFamily(sp, utilizationLevel, household);
      if (s) allScenarios.push(s);
    }

    // Both-Single scenarios (cross product)
    for (const selfP of selfPlans) {
      for (const spouseP of spousePlans) {
        const s = buildBothSingle(selfP, spouseP, utilizationLevel, household);
        if (s) allScenarios.push(s);
      }
    }

    // Self-EE+Kids scenarios (cross product)
    for (const selfP of selfPlans) {
      for (const spouseP of spousePlans) {
        const s = buildSelfEEKids(selfP, spouseP, utilizationLevel, household);
        if (s) allScenarios.push(s);
      }
    }

    // Spouse-EE+Kids scenarios (cross product)
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

    // ===== ADD INCOME-DERIVED GOTCHA TO ALL SCENARIOS =====
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

    // ===== RANK BY EXPECTED ANNUAL COST =====
    allScenarios.sort((a, b) => a.expectedAnnualCost - b.expectedAnnualCost);

    // ===== TOP 3 + ASSIGN RANKS =====
    const top3 = allScenarios.slice(0, 3).map((s, i) => ({ ...s, rank: i + 1 }));

    return NextResponse.json({
      success: true,
      household_size: household.household_size,
      coverage_scope: household.coverage_scope,
      utilization_level: utilizationLevel,
      expected_annual_medical_spend: expectedSpendForLevel(utilizationLevel, household.household_size || 2),
      claims_used: claimsCount ?? 0,
      self_employer_name: selfPacket.employer_name || 'Your employer',
      spouse_employer_name: spousePacket.employer_name || spouseEmployment.spouse_employer_name || "Spouse's employer",
      self_plan_count: selfPlans.length,
      spouse_plan_count: spousePlans.length,
      total_scenarios_evaluated: allScenarios.length,
      top_scenarios: top3,
      all_scenarios_count: allScenarios.length,
      // Helpful for AI layer downstream:
      household_income: householdIncome,
      spouse_income: spouseIncome,
      combined_income: combinedIncome,
      marginal_tax_rate: marginalRate,
      spousal_surcharge_applies: spouseEmployment.spousal_surcharge_applies,
      spousal_surcharge_amount: spouseEmployment.spousal_surcharge_amount,
    });
  } catch (e: any) {
    console.error('coordinate-spouse-plans error:', e);
    return NextResponse.json({
      success: false,
      error: e.message || 'Unknown error',
    }, { status: 500 });
  }
}