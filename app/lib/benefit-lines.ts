// Canonical list of benefit lines used across the platform.
// Used by RFP send flows, quote intake, comparison grids, etc.
//
// Schema reference: rfp_carriers.requested_benefits is text[]
// Values stored in DB MUST match the `value` field below exactly.

export type BenefitLineValue =
  | 'medical'
  | 'dental'
  | 'vision'
  | 'basic_life_add'
  | 'voluntary_life_add'
  | 'std'
  | 'ltd'
  | 'community_rated_medical';

export type BenefitLine = {
  value: BenefitLineValue;
  label: string;
  shortLabel: string;
};

export const BENEFIT_LINES: BenefitLine[] = [
  { value: 'medical', label: 'Medical', shortLabel: 'Medical' },
  { value: 'dental', label: 'Dental', shortLabel: 'Dental' },
  { value: 'vision', label: 'Vision', shortLabel: 'Vision' },
  { value: 'basic_life_add', label: 'Basic Life & AD&D', shortLabel: 'Basic Life' },
  { value: 'voluntary_life_add', label: 'Voluntary Life & AD&D', shortLabel: 'Vol. Life' },
  { value: 'std', label: 'Short-Term Disability', shortLabel: 'STD' },
  { value: 'ltd', label: 'Long-Term Disability', shortLabel: 'LTD' },
  { value: 'community_rated_medical', label: 'Community Rated Medical', shortLabel: 'CR Medical' },
];

// Map of value → label for fast lookups (e.g., rendering a saved benefit array)
export const BENEFIT_LINE_LABELS: Record<BenefitLineValue, string> = BENEFIT_LINES.reduce(
  (acc, line) => {
    acc[line.value] = line.label;
    return acc;
  },
  {} as Record<BenefitLineValue, string>
);

// Validates an unknown string is a known benefit value.
// Useful when accepting user input or parsing webhook payloads.
export function isValidBenefitLine(value: string): value is BenefitLineValue {
  return BENEFIT_LINES.some(line => line.value === value);
}

// Filters an array of strings to only valid benefit values.
// Use when reading from DB to gracefully handle legacy/unknown values.
export function filterValidBenefitLines(values: string[]): BenefitLineValue[] {
  return values.filter(isValidBenefitLine);
}