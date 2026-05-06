'use client';

import React from 'react';
import {
  Field, FormGrid, MoneyInput, TextInput, Select, Toggle, RadioGroup, SubHeading, Callout, TextArea,
} from './FormControls';

export type EligibilityConfig = {
  // Waiting period
  waitingPeriod?: 'none' | '30_days' | '60_days' | '90_days' | 'fom_after_30' | 'fom_after_60' | 'custom';
  waitingPeriodCustom?: string;

  // Dependent rules
  dependentMaxAge?: string | number; // typically 26
  studentExtension?: boolean;        // some plans extend for full-time students

  // Domestic partner
  domesticPartner?: 'none' | 'same_sex' | 'all_partners';

  // Spousal carve-out
  spousalCarveOut?: boolean;
  spousalSurcharge?: string | number; // monthly $ amount

  // Tobacco
  tobaccoSurcharge?: boolean;
  tobaccoSurchargeAmount?: string | number; // monthly $ amount

  // Wellness incentive
  wellnessIncentive?: boolean;
  wellnessIncentiveAmount?: string | number; // monthly $ discount or credit
  wellnessIncentiveType?: 'biometric' | 'tobacco_cessation' | 'health_assessment' | 'multiple';

  // Open enrollment
  openEnrollmentStart?: string;
  openEnrollmentDays?: string | number;

  // Eligibility classes
  hasMultipleClasses?: boolean;
  classDescription?: string;

  // Special enrollment notes
  notes?: string;
};

export default function SectionEligibility({
  data,
  onChange,
}: {
  data: EligibilityConfig;
  onChange: (next: EligibilityConfig) => void;
}) {
  function update<K extends keyof EligibilityConfig>(key: K, value: EligibilityConfig[K]) {
    onChange({ ...data, [key]: value });
  }

  return (
    <FormGrid>
      <Callout variant="info">
        Eligibility rules determine who&apos;s covered and when. Federal law sets a max 90-day waiting period for ACA compliance and dependent
        coverage to age 26. Everything else is the employer&apos;s choice.
      </Callout>

      {/* Waiting period */}
      <SubHeading
        title="New hire waiting period"
        helper="How long after a new hire starts before they're eligible. ACA caps this at 90 days from date of hire."
      />

      <Field label="Waiting period" width="full" required>
        <RadioGroup
          value={data.waitingPeriod || ''}
          onChange={v => update('waitingPeriod', v as EligibilityConfig['waitingPeriod'])}
          options={[
            { value: 'none',          label: 'None — eligible day of hire',     helper: 'Most generous. Employer absorbs more risk on quick turnover.' },
            { value: '30_days',       label: '30 days from date of hire',        helper: 'Common for tech and professional services.' },
            { value: '60_days',       label: '60 days from date of hire',        helper: 'Middle-of-road choice.' },
            { value: '90_days',       label: '90 days from date of hire',        helper: 'ACA maximum. Most common in retail, hospitality, manufacturing.' },
            { value: 'fom_after_30',  label: 'First of month after 30 days',     helper: 'Cleaner billing. Effectively 30-60 day waiting period.' },
            { value: 'fom_after_60',  label: 'First of month after 60 days',     helper: 'Cleaner billing. Effectively 60-90 day waiting period.' },
            { value: 'custom',        label: 'Custom',                           helper: 'Specify below.' },
          ]}
        />
      </Field>

      {data.waitingPeriod === 'custom' && (
        <Field label="Custom waiting period" width="full">
          <TextInput
            value={data.waitingPeriodCustom || ''}
            onChange={v => update('waitingPeriodCustom', v)}
            placeholder="e.g. First of month coincident with 90 days"
          />
        </Field>
      )}

      {/* Dependents */}
      <SubHeading
        title="Dependent eligibility"
        helper="Federal law requires coverage for dependent children to age 26 regardless of student or marital status."
      />

      <Field
        label="Max dependent age"
        helper="Federal default is 26. Some employers extend higher; cannot go lower without special compliance."
        width="half"
      >
        <TextInput
          value={data.dependentMaxAge !== undefined ? String(data.dependentMaxAge) : '26'}
          onChange={v => update('dependentMaxAge', v)}
          type="number"
          placeholder="26"
        />
      </Field>

      <Field label=" " width="half">
        <Toggle
          checked={!!data.studentExtension}
          onChange={v => update('studentExtension', v)}
          label="Extend coverage for full-time students past max age"
        />
      </Field>

      {/* Domestic partner */}
      <SubHeading title="Domestic partner coverage" />

      <Field label="Domestic partners" width="full">
        <RadioGroup
          value={data.domesticPartner || ''}
          onChange={v => update('domesticPartner', v as EligibilityConfig['domesticPartner'])}
          options={[
            { value: 'none',          label: 'Not covered',                              helper: 'Spouses (legally married) only.' },
            { value: 'same_sex',      label: 'Same-sex domestic partners only',          helper: 'Less common since marriage equality. Mostly legacy.' },
            { value: 'all_partners',  label: 'All unmarried domestic partners',          helper: 'Most inclusive. May require affidavit of partnership.' },
          ]}
        />
      </Field>

      {/* Spousal carve-out */}
      <SubHeading
        title="Spousal carve-out"
        helper="If a spouse has access to coverage at their own employer, they can be excluded or surcharged. Common cost-control measure."
      />

      <Field label=" " width="full">
        <Toggle
          checked={!!data.spousalCarveOut}
          onChange={v => update('spousalCarveOut', v)}
          label="Apply spousal carve-out / surcharge"
        />
      </Field>

      {data.spousalCarveOut && (
        <Field
          label="Spousal surcharge (monthly)"
          helper="Additional monthly contribution if spouse declines own employer coverage. $0 if you fully exclude rather than surcharge."
          width="half"
        >
          <MoneyInput
            value={data.spousalSurcharge}
            onChange={v => update('spousalSurcharge', v)}
            placeholder="e.g. 100"
          />
        </Field>
      )}

      {/* Tobacco */}
      <SubHeading
        title="Tobacco surcharge"
        helper="ACA permits up to 50% surcharge for tobacco users. Most employers use $50-$100/month."
      />

      <Field label=" " width="half">
        <Toggle
          checked={!!data.tobaccoSurcharge}
          onChange={v => update('tobaccoSurcharge', v)}
          label="Apply tobacco surcharge"
        />
      </Field>

      {data.tobaccoSurcharge && (
        <Field label="Tobacco surcharge (monthly)" width="half">
          <MoneyInput
            value={data.tobaccoSurchargeAmount}
            onChange={v => update('tobaccoSurchargeAmount', v)}
            placeholder="e.g. 75"
          />
        </Field>
      )}

      {/* Wellness incentive */}
      <SubHeading
        title="Wellness incentive"
        helper="A monthly contribution discount for members who complete a wellness activity. Common in self-funded programs."
      />

      <Field label=" " width="half">
        <Toggle
          checked={!!data.wellnessIncentive}
          onChange={v => update('wellnessIncentive', v)}
          label="Offer wellness incentive credit"
        />
      </Field>

      {data.wellnessIncentive && (
        <>
          <Field label="Monthly credit" width="quarter">
            <MoneyInput
              value={data.wellnessIncentiveAmount}
              onChange={v => update('wellnessIncentiveAmount', v)}
              placeholder="e.g. 50"
            />
          </Field>

          <Field label="Activity required" width="quarter">
            <Select
              value={data.wellnessIncentiveType || ''}
              onChange={v => update('wellnessIncentiveType', v as EligibilityConfig['wellnessIncentiveType'])}
              placeholder="Select..."
              options={[
                { value: 'biometric',         label: 'Biometric screening' },
                { value: 'health_assessment', label: 'Health risk assessment' },
                { value: 'tobacco_cessation', label: 'Tobacco cessation' },
                { value: 'multiple',          label: 'Multiple activities' },
              ]}
            />
          </Field>
        </>
      )}

      {/* Open enrollment */}
      <SubHeading
        title="Open enrollment"
        helper="The annual window when employees can change elections. Typically 2-4 weeks before plan year start."
      />

      <Field label="Open enrollment start date" width="half">
        <TextInput
          value={data.openEnrollmentStart || ''}
          onChange={v => update('openEnrollmentStart', v)}
          type="date"
        />
      </Field>

      <Field label="Duration (days)" width="half">
        <TextInput
          value={data.openEnrollmentDays !== undefined ? String(data.openEnrollmentDays) : ''}
          onChange={v => update('openEnrollmentDays', v)}
          type="number"
          placeholder="e.g. 14"
        />
      </Field>

      {/* Eligibility classes */}
      <SubHeading
        title="Eligibility classes"
        helper="Some employers offer different plans or contributions to different employee groups (e.g. salaried vs. hourly, by location)."
      />

      <Field label=" " width="full">
        <Toggle
          checked={!!data.hasMultipleClasses}
          onChange={v => update('hasMultipleClasses', v)}
          label="Multiple eligibility classes"
        />
      </Field>

      {data.hasMultipleClasses && (
        <Field
          label="Class description"
          helper="Briefly describe each class and its eligibility / contribution differences."
          width="full"
        >
          <TextArea
            value={data.classDescription || ''}
            onChange={v => update('classDescription', v)}
            placeholder="e.g. Class 1: Full-time salaried (40+ hrs/wk) — eligible day 1, 80% employer contribution. Class 2: Full-time hourly — eligible after 60 days, 70% employer contribution."
            rows={4}
          />
        </Field>
      )}

      {/* Notes */}
      <Field label="Eligibility notes" width="full">
        <TextArea
          value={data.notes || ''}
          onChange={v => update('notes', v)}
          placeholder="Any special enrollment events, eligibility audits, or compliance notes."
          rows={3}
        />
      </Field>
    </FormGrid>
  );
}