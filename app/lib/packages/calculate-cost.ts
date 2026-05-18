// ============================================================================
// Package Cost Calculator
// ============================================================================
// Pure function. Given a package's lines + each line's underlying quote_line
// rate data + the package's tier_breakdown, returns the computed cost totals
// and a warnings array flagging any data quality issues.
//
// All math derived; nothing stored here. Caller is responsible for persisting
// the returned totals back to the package row.
//
// v1 only supports rate_structure = 'tiered_4' (the only structure in production
// quote_lines data). Other structures fall back to composite math and emit a
// warning, so the package is still usable but flagged for review.
// ============================================================================

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type Tier = 'employee_only' | 'employee_spouse' | 'employee_children' | 'family';

export const TIERS: Tier[] = ['employee_only', 'employee_spouse', 'employee_children', 'family'];

export type TierBreakdown = Partial<Record<Tier, number>>;

export type ContributionSplit = {
  split_mode: 'uniform' | 'per_tier';
  uniform?: { employer_pct: number; employee_pct: number };
  per_tier?: Partial<Record<Tier, { employer_pct: number; employee_pct: number }>>;
};

export type QuoteLineRateData = {
  quote_line_id: string;
  benefit_type: string;
  plan_name: string | null;
  rate_structure: string | null;        // 'tiered_4' in v1; anything else triggers fallback
  rates: Partial<Record<Tier, number>> | null;  // per-tier monthly rates per employee
  monthly_premium: number | null;       // composite/fallback monthly premium
  annual_cost: number | null;            // composite/fallback annual cost
};

export type PackageLineInput = {
  package_line_id: string;
  display_order: number;
  contribution_split: ContributionSplit | null;
  quote_line: QuoteLineRateData;
};

export type CalculatorInput = {
  member_count_assumption: number | null;
  tier_breakdown: TierBreakdown | null;
  lines: PackageLineInput[];
  rfp_current_annual_cost: number | null;
};

export type LineComputed = {
  package_line_id: string;
  benefit_type: string;
  monthly_total: number;
  monthly_employer: number;
  monthly_employee: number;
  annual_total: number;
  annual_employer: number;
  annual_employee: number;
  by_tier: Array<{
    tier: Tier;
    headcount: number;
    rate_per_employee: number | null;
    monthly_total: number;
    monthly_employer: number;
    monthly_employee: number;
  }>;
};

export type CalculatorWarning = {
  level: 'warning' | 'info';
  code:
    | 'missing_tier_breakdown'
    | 'missing_rates'
    | 'unsupported_rate_structure'
    | 'partial_tier_rates'
    | 'missing_contribution_split'
    | 'fallback_to_composite';
  message: string;
  line_id?: string;
  tier?: Tier;
};

export type CalculatorResult = {
  total_annual_cost: number;
  employer_annual_cost: number;
  employee_annual_cost: number;
  total_monthly_cost: number;
  employer_monthly_cost: number;
  employee_monthly_cost: number;
  cost_change_vs_current_pct: number | null;
  lines: LineComputed[];
  warnings: CalculatorWarning[];
  computed_at: string;
};

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function getContributionForTier(
  split: ContributionSplit | null,
  tier: Tier
): { employer_pct: number; employee_pct: number } | null {
  if (!split) return null;

  if (split.split_mode === 'uniform' && split.uniform) {
    return {
      employer_pct: split.uniform.employer_pct,
      employee_pct: split.uniform.employee_pct,
    };
  }

  if (split.split_mode === 'per_tier' && split.per_tier?.[tier]) {
    return {
      employer_pct: split.per_tier[tier]!.employer_pct,
      employee_pct: split.per_tier[tier]!.employee_pct,
    };
  }

  return null;
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

// ----------------------------------------------------------------------------
// Main calculator
// ----------------------------------------------------------------------------

export function calculatePackageCosts(input: CalculatorInput): CalculatorResult {
  const warnings: CalculatorWarning[] = [];
  const lineResults: LineComputed[] = [];

  // Validate package-level inputs
  if (!input.tier_breakdown || Object.keys(input.tier_breakdown).length === 0) {
    warnings.push({
      level: 'warning',
      code: 'missing_tier_breakdown',
      message: 'Package has no tier breakdown. Tier-weighted math is unavailable; falling back to composite premiums where possible.',
    });
  }

  // Process each line
  for (const line of input.lines) {
    const ql = line.quote_line;
    const split = line.contribution_split;

    // Per-tier results, even for lines that don't have full tier data
    const byTier: LineComputed['by_tier'] = [];
    let lineMonthlyTotal = 0;
    let lineMonthlyEmployer = 0;
    let lineMonthlyEmployee = 0;

    const isTiered4 = ql.rate_structure === 'tiered_4';
    const hasRates = ql.rates && Object.values(ql.rates).some(v => typeof v === 'number');

    if (!ql.rate_structure) {
      warnings.push({
        level: 'warning',
        code: 'fallback_to_composite',
        message: `Line "${ql.plan_name || ql.benefit_type}" has no rate_structure. Using composite monthly_premium × member_count.`,
        line_id: line.package_line_id,
      });
    } else if (!isTiered4) {
      warnings.push({
        level: 'warning',
        code: 'unsupported_rate_structure',
        message: `Line "${ql.plan_name || ql.benefit_type}" uses rate_structure "${ql.rate_structure}". Only "tiered_4" is supported in v1; falling back to composite math.`,
        line_id: line.package_line_id,
      });
    } else if (!hasRates) {
      warnings.push({
        level: 'warning',
        code: 'missing_rates',
        message: `Line "${ql.plan_name || ql.benefit_type}" has rate_structure "tiered_4" but no usable rates. Using composite monthly_premium fallback.`,
        line_id: line.package_line_id,
      });
    }

    // If we don't have tier breakdown, OR the line doesn't have usable tier rates,
    // fall back to composite math: monthly_premium × member_count_assumption.
    const canDoTierMath =
      isTiered4 &&
      hasRates &&
      input.tier_breakdown &&
      Object.keys(input.tier_breakdown).length > 0;

    if (canDoTierMath) {
      // ---- Tier-weighted math ----
      const breakdown = input.tier_breakdown!;
      const rates = ql.rates!;

      // Flag partial tier coverage (some tiers in breakdown have no rate)
      const tiersWithHeadcount = TIERS.filter(t => (breakdown[t] ?? 0) > 0);
      const tiersWithRates = TIERS.filter(t => typeof rates[t] === 'number');
      const missingTiers = tiersWithHeadcount.filter(t => !tiersWithRates.includes(t));
      if (missingTiers.length > 0) {
        warnings.push({
          level: 'warning',
          code: 'partial_tier_rates',
          message: `Line "${ql.plan_name || ql.benefit_type}" is missing rates for tier(s): ${missingTiers.join(', ')}. Those tiers contribute $0 to the total.`,
          line_id: line.package_line_id,
        });
      }

      for (const tier of TIERS) {
        const headcount = breakdown[tier] ?? 0;
        const rate = rates[tier];
        const ratePerEmployee = typeof rate === 'number' ? rate : null;
        const tierMonthlyTotal =
          ratePerEmployee !== null ? headcount * ratePerEmployee : 0;

        const contribution = getContributionForTier(split, tier);
        const employerPct = contribution?.employer_pct ?? 0;
        const employeePct = contribution?.employee_pct ?? 0;

        if (!contribution && headcount > 0) {
          warnings.push({
            level: 'info',
            code: 'missing_contribution_split',
            message: `Line "${ql.plan_name || ql.benefit_type}" has no contribution split for tier "${tier}". Defaulting to employer 0%, employee 100%.`,
            line_id: line.package_line_id,
            tier,
          });
        }

        const tierMonthlyEmployer = roundCents(tierMonthlyTotal * (employerPct / 100));
        const tierMonthlyEmployee = roundCents(tierMonthlyTotal * (employeePct / 100));

        byTier.push({
          tier,
          headcount,
          rate_per_employee: ratePerEmployee,
          monthly_total: roundCents(tierMonthlyTotal),
          monthly_employer: tierMonthlyEmployer,
          monthly_employee: tierMonthlyEmployee,
        });

        lineMonthlyTotal += tierMonthlyTotal;
        lineMonthlyEmployer += tierMonthlyEmployer;
        lineMonthlyEmployee += tierMonthlyEmployee;
      }
    } else {
      // ---- Composite fallback math ----
      // Uses monthly_premium directly. No per-tier breakdown possible.
      const composite = ql.monthly_premium ?? 0;
      const headcount = input.member_count_assumption ?? 1;
      const fallbackMonthlyTotal = composite * headcount;

      // Apply uniform contribution if present; otherwise default to employer 0
      const contribution =
        split?.split_mode === 'uniform' && split.uniform
          ? split.uniform
          : null;

      if (!contribution && composite > 0) {
        warnings.push({
          level: 'info',
          code: 'missing_contribution_split',
          message: `Line "${ql.plan_name || ql.benefit_type}" has no uniform contribution split. Defaulting to employer 0%, employee 100%.`,
          line_id: line.package_line_id,
        });
      }

      const employerPct = contribution?.employer_pct ?? 0;
      const employeePct = contribution?.employee_pct ?? 0;
      const fallbackEmployer = roundCents(fallbackMonthlyTotal * (employerPct / 100));
      const fallbackEmployee = roundCents(fallbackMonthlyTotal * (employeePct / 100));

      lineMonthlyTotal = fallbackMonthlyTotal;
      lineMonthlyEmployer = fallbackEmployer;
      lineMonthlyEmployee = fallbackEmployee;

      // Emit an empty tier breakdown so the shape stays consistent
      for (const tier of TIERS) {
        byTier.push({
          tier,
          headcount: 0,
          rate_per_employee: null,
          monthly_total: 0,
          monthly_employer: 0,
          monthly_employee: 0,
        });
      }
    }

    const lineRoundedMonthlyTotal = roundCents(lineMonthlyTotal);
    const lineRoundedMonthlyEmployer = roundCents(lineMonthlyEmployer);
    const lineRoundedMonthlyEmployee = roundCents(lineMonthlyEmployee);

    lineResults.push({
      package_line_id: line.package_line_id,
      benefit_type: ql.benefit_type,
      monthly_total: lineRoundedMonthlyTotal,
      monthly_employer: lineRoundedMonthlyEmployer,
      monthly_employee: lineRoundedMonthlyEmployee,
      annual_total: roundCents(lineRoundedMonthlyTotal * 12),
      annual_employer: roundCents(lineRoundedMonthlyEmployer * 12),
      annual_employee: roundCents(lineRoundedMonthlyEmployee * 12),
      by_tier: byTier,
    });
  }

  // Package totals
  const totalMonthly = roundCents(lineResults.reduce((sum, l) => sum + l.monthly_total, 0));
  const employerMonthly = roundCents(lineResults.reduce((sum, l) => sum + l.monthly_employer, 0));
  const employeeMonthly = roundCents(lineResults.reduce((sum, l) => sum + l.monthly_employee, 0));

  const totalAnnual = roundCents(totalMonthly * 12);
  const employerAnnual = roundCents(employerMonthly * 12);
  const employeeAnnual = roundCents(employeeMonthly * 12);

  // vs current — only computable if RFP has a current_annual_cost
  let costChangeVsCurrentPct: number | null = null;
  if (input.rfp_current_annual_cost !== null && input.rfp_current_annual_cost > 0) {
    costChangeVsCurrentPct = roundCents(
      ((totalAnnual - input.rfp_current_annual_cost) / input.rfp_current_annual_cost) * 100
    );
  }

  return {
    total_annual_cost: totalAnnual,
    employer_annual_cost: employerAnnual,
    employee_annual_cost: employeeAnnual,
    total_monthly_cost: totalMonthly,
    employer_monthly_cost: employerMonthly,
    employee_monthly_cost: employeeMonthly,
    cost_change_vs_current_pct: costChangeVsCurrentPct,
    lines: lineResults,
    warnings,
    computed_at: new Date().toISOString(),
  };
}