// Types matching the current_plan_design JSONB structure
export type PlanTier = {
    tier_name: string;
    deductible_individual: number | null;
    deductible_family: number | null;
    aca_oop_individual: number | null;
    aca_oop_family: number | null;
    coinsurance_oop_individual: number | null;
    coinsurance_oop_family: number | null;
    inpatient_hospital_coinsurance_pct: number | null;
    office_visit_pcp_copay: number | null;
    office_visit_specialist_copay: number | null;
    telehealth_copay: number | null;
    urgent_care_copay: number | null;
    er_copay: number | null;
    preventive_covered_100pct: boolean | null;
    lifetime_max: string | number | null;
  };
  
  export type PlanOption = {
    name: string;
    type: string;
    hsa_eligible: boolean | null;
    tiers: PlanTier[];
  };
  
  export type RxTierPricing = {
    generic: number | null;
    preferred_brand: number | null;
    non_preferred_brand: number | null;
    specialty: number | null;
  };
  
  export type RxBenefit = {
    carrier: string | null;
    retail_30day: RxTierPricing | null;
    mail_90day: RxTierPricing | null;
  };
  
  export type DentalBenefit = {
    carrier: string | null;
    annual_max: number | null;
    deductible_individual: number | null;
    preventive_coverage_pct: number | null;
    basic_coverage_pct: number | null;
    major_coverage_pct: number | null;
    ortho_lifetime_max: number | null;
  };
  
  export type VisionBenefit = {
    carrier: string | null;
    exam_copay: number | null;
    exam_frequency_months: number | null;
    frames_allowance: number | null;
    contacts_allowance: number | null;
  };
  
  export type LifeBenefit = {
    carrier: string | null;
    amount: number | null;
    ad_d_amount: number | null;
  };
  
  export type ParsedPlanDesign = {
    planYear: number | null;
    medical: {
      planOptions: PlanOption[];
      rx: RxBenefit | null;
    };
    dental: DentalBenefit | null;
    vision: VisionBenefit | null;
    life: LifeBenefit | null;
  };
  
  /**
   * Safely parse current_plan_design JSONB into a typed structure.
   * Returns null sub-fields when data is missing.
   */
  export function parsePlanDesign(raw: any): ParsedPlanDesign {
    const safe = (raw && typeof raw === 'object') ? raw : {};
    return {
      planYear: typeof safe.planYear === 'number' ? safe.planYear : null,
      medical: {
        planOptions: Array.isArray(safe.planOptions) ? safe.planOptions as PlanOption[] : [],
        rx: safe.rx ?? null,
      },
      dental: safe.dental ?? null,
      vision: safe.vision ?? null,
      life: safe.life ?? null,
    };
  }
  
  /**
   * Format a number as USD currency, returning '—' for null/undefined.
   */
  export function fmtMoney(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    return `$${value.toLocaleString()}`;
  }
  
  /**
   * Format a percentage value, returning '—' for null/undefined.
   */
  export function fmtPct(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    return `${value}%`;
  }
  
  /**
   * Format a copay (returns '$50' or 'Not specified' or '—').
   */
  export function fmtCopay(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    return `$${value}`;
  }
  
  /**
   * Format a generic value that might be a string (like 'Unlimited') or number.
   */
  export function fmtAny(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') return value.toLocaleString();
    return String(value);
  }
  
  /**
   * Map a benefit_line value to which tab it belongs to in the carrier RFP detail view.
   * Returns null for benefit lines that don't have a dedicated tab.
   */
  export function benefitToTab(benefitLine: string): 'medical' | 'dental' | 'vision' | 'life' | 'disability' | null {
    switch (benefitLine) {
      case 'medical':
      case 'community_rated_medical':
        return 'medical';
      case 'dental':
        return 'dental';
      case 'vision':
        return 'vision';
      case 'basic_life_add':
      case 'voluntary_life_add':
        return 'life';
      case 'std':
      case 'ltd':
        return 'disability';
      default:
        return null;
    }
  }
  
  /**
   * Given the requested_benefits array, return which tabs to render in order.
   * De-duplicated and ordered logically.
   */
  export function tabsForRequestedBenefits(
    requestedBenefits: string[]
  ): Array<'medical' | 'dental' | 'vision' | 'life' | 'disability'> {
    const tabSet = new Set<'medical' | 'dental' | 'vision' | 'life' | 'disability'>();
    for (const benefit of requestedBenefits) {
      const tab = benefitToTab(benefit);
      if (tab) tabSet.add(tab);
    }
    // Render in this fixed order regardless of input order
    const order: Array<'medical' | 'dental' | 'vision' | 'life' | 'disability'> = [
      'medical', 'dental', 'vision', 'life', 'disability',
    ];
    return order.filter((t) => tabSet.has(t));
  }