'use client';

import React from 'react';
import {
  Field, FormGrid, MoneyInput, PercentInput, Select, Toggle, RadioGroup, SubHeading, Callout,
} from './FormControls';

export type PlanStructure = {
  // Deductibles
  deductibleInNetSingle?: string | number;
  deductibleInNetFamily?: string | number;
  includeOON?: boolean;
  deductibleOonSingle?: string | number;
  deductibleOonFamily?: string | number;

  // OOP max
  oopMaxInNetSingle?: string | number;
  oopMaxInNetFamily?: string | number;
  oopMaxOonSingle?: string | number;
  oopMaxOonFamily?: string | number;

  // Coinsurance
  coinsuranceInNet?: string | number;
  coinsuranceOon?: string | number;

  // HSA
  hsaEligible?: boolean;

  // Deductible structure
  deductibleStructure?: 'embedded' | 'aggregate';

  // Copays — these can be either copay $ or coinsurance %
  copayPcp?: string | number;
  copaySpecialist?: string | number;
  copayUrgent?: string | number;
  copayEr?: string | number;
  copayErWaived?: boolean; // ER copay waived if admitted

  // Rx tiers
  rxTier1Generic?: string | number;
  rxTier2PreferredBrand?: string | number;
  rxTier3NonPreferredBrand?: string | number;
  rxTier4Specialty?: string | number;
  rxDeductibleSeparate?: boolean;
  rxDeductibleAmount?: string | number;
};

// 2026 IRS HSA-qualifying HDHP minimums (placeholder — broker will adjust as IRS updates)
const HSA_MIN_DEDUCTIBLE_SINGLE = 1650;
const HSA_MIN_DEDUCTIBLE_FAMILY = 3300;
const HSA_MAX_OOP_SINGLE = 8300;
const HSA_MAX_OOP_FAMILY = 16600;

export default function SectionPlan({
  data,
  onChange,
}: {
  data: PlanStructure;
  onChange: (next: PlanStructure) => void;
}) {
  function update<K extends keyof PlanStructure>(key: K, value: PlanStructure[K]) {
    onChange({ ...data, [key]: value });
  }

  // HSA eligibility check
  const hsaIssues: string[] = [];
  if (data.hsaEligible) {
    const dSingle = num(data.deductibleInNetSingle);
    const dFamily = num(data.deductibleInNetFamily);
    const oopSingle = num(data.oopMaxInNetSingle);
    const oopFamily = num(data.oopMaxInNetFamily);
    if (dSingle !== null && dSingle < HSA_MIN_DEDUCTIBLE_SINGLE) {
      hsaIssues.push(`Single deductible $${dSingle} is below the 2026 HSA minimum of $${HSA_MIN_DEDUCTIBLE_SINGLE.toLocaleString()}.`);
    }
    if (dFamily !== null && dFamily < HSA_MIN_DEDUCTIBLE_FAMILY) {
      hsaIssues.push(`Family deductible $${dFamily} is below the 2026 HSA minimum of $${HSA_MIN_DEDUCTIBLE_FAMILY.toLocaleString()}.`);
    }
    if (oopSingle !== null && oopSingle > HSA_MAX_OOP_SINGLE) {
      hsaIssues.push(`Single OOP max $${oopSingle} exceeds the 2026 HSA cap of $${HSA_MAX_OOP_SINGLE.toLocaleString()}.`);
    }
    if (oopFamily !== null && oopFamily > HSA_MAX_OOP_FAMILY) {
      hsaIssues.push(`Family OOP max $${oopFamily} exceeds the 2026 HSA cap of $${HSA_MAX_OOP_FAMILY.toLocaleString()}.`);
    }
    if (data.copayPcp || data.copaySpecialist || data.copayUrgent) {
      hsaIssues.push('HSA-qualifying plans usually can\'t have copays for non-preventive care before the deductible is met.');
    }
  }

  return (
    <FormGrid>
      {/* Deductible structure */}
      <SubHeading
        title="Deductible structure"
        helper="Embedded means each member has their own deductible cap within the family deductible. Aggregate means the whole family must meet the family deductible together."
      />

      <Field label="Type" width="full">
        <RadioGroup
          value={data.deductibleStructure || ''}
          onChange={v => update('deductibleStructure', v as 'embedded' | 'aggregate')}
          options={[
            { value: 'embedded',  label: 'Embedded',  helper: 'Each individual member has their own deductible cap (more member-friendly, more common in 2026 plans)' },
            { value: 'aggregate', label: 'Aggregate', helper: 'No single member can satisfy the family deductible alone (older HSA-style; less common today)' },
          ]}
        />
      </Field>

      {/* In-network deductible */}
      <SubHeading title="In-network deductible" helper="The amount members pay out of pocket before the plan starts covering claims (other than preventive care)." />

      <Field label="Single" width="half" required>
        <MoneyInput
          value={data.deductibleInNetSingle}
          onChange={v => update('deductibleInNetSingle', v)}
          placeholder="e.g. 2500"
        />
      </Field>

      <Field label="Family" width="half" required>
        <MoneyInput
          value={data.deductibleInNetFamily}
          onChange={v => update('deductibleInNetFamily', v)}
          placeholder="e.g. 5000"
        />
      </Field>

      {/* In-network OOP max */}
      <SubHeading title="In-network out-of-pocket maximum" helper="The most a member pays in a year before the plan covers 100%. ACA caps for 2026: $9,200 single / $18,400 family." />

      <Field label="Single" width="half" required>
        <MoneyInput
          value={data.oopMaxInNetSingle}
          onChange={v => update('oopMaxInNetSingle', v)}
          placeholder="e.g. 7000"
        />
      </Field>

      <Field label="Family" width="half" required>
        <MoneyInput
          value={data.oopMaxInNetFamily}
          onChange={v => update('oopMaxInNetFamily', v)}
          placeholder="e.g. 14000"
        />
      </Field>

      {/* Coinsurance */}
      <SubHeading title="Coinsurance" helper="The member's share of costs after the deductible is met. 80/20 means the plan pays 80%, member pays 20%." />

      <Field
        label="In-network member coinsurance %"
        helper="Member's share. 20% is the most common default."
        width="half"
      >
        <PercentInput
          value={data.coinsuranceInNet}
          onChange={v => update('coinsuranceInNet', v)}
          placeholder="e.g. 20"
        />
      </Field>

      {/* Out-of-network toggle */}
      <Field label=" " width="half">
        <Toggle
          checked={!!data.includeOON}
          onChange={v => update('includeOON', v)}
          label="Include out-of-network coverage"
        />
      </Field>

      {/* OON details */}
      {data.includeOON && (
        <>
          <SubHeading title="Out-of-network deductible" />
          <Field label="Single" width="half">
            <MoneyInput
              value={data.deductibleOonSingle}
              onChange={v => update('deductibleOonSingle', v)}
              placeholder="e.g. 5000"
            />
          </Field>
          <Field label="Family" width="half">
            <MoneyInput
              value={data.deductibleOonFamily}
              onChange={v => update('deductibleOonFamily', v)}
              placeholder="e.g. 10000"
            />
          </Field>

          <SubHeading title="Out-of-network OOP max" />
          <Field label="Single" width="half">
            <MoneyInput
              value={data.oopMaxOonSingle}
              onChange={v => update('oopMaxOonSingle', v)}
              placeholder="e.g. 14000"
            />
          </Field>
          <Field label="Family" width="half">
            <MoneyInput
              value={data.oopMaxOonFamily}
              onChange={v => update('oopMaxOonFamily', v)}
              placeholder="e.g. 28000"
            />
          </Field>

          <Field label="Out-of-network member coinsurance %" width="half">
            <PercentInput
              value={data.coinsuranceOon}
              onChange={v => update('coinsuranceOon', v)}
              placeholder="e.g. 40"
            />
          </Field>
        </>
      )}

      {/* HSA */}
      <SubHeading title="HSA eligibility" helper="HSA-qualifying plans must meet IRS minimums for deductible and have no pre-deductible copays for non-preventive care." />

      <Field label=" " width="full">
        <Toggle
          checked={!!data.hsaEligible}
          onChange={v => update('hsaEligible', v)}
          label="This is an HSA-qualifying plan"
        />
      </Field>

      {hsaIssues.length > 0 && (
        <Callout variant="warning">
          <strong>HSA compliance issues to fix:</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
            {hsaIssues.map((issue, i) => <li key={i}>{issue}</li>)}
          </ul>
        </Callout>
      )}

      {data.hsaEligible && hsaIssues.length === 0 && (data.deductibleInNetSingle || data.oopMaxInNetSingle) && (
        <Callout variant="success">✓ Plan structure looks compliant with 2026 HSA-qualifying HDHP rules.</Callout>
      )}

      {/* Office visit copays */}
      <SubHeading
        title="Office visit copays"
        helper="Leave blank if not using copays (i.e. all visits subject to deductible + coinsurance, common on HSA plans). Enter $ for copays or % for coinsurance."
      />

      <Field label="Primary care (PCP)" width="quarter">
        <MoneyInput
          value={data.copayPcp}
          onChange={v => update('copayPcp', v)}
          placeholder="e.g. 30"
        />
      </Field>

      <Field label="Specialist" width="quarter">
        <MoneyInput
          value={data.copaySpecialist}
          onChange={v => update('copaySpecialist', v)}
          placeholder="e.g. 60"
        />
      </Field>

      <Field label="Urgent care" width="quarter">
        <MoneyInput
          value={data.copayUrgent}
          onChange={v => update('copayUrgent', v)}
          placeholder="e.g. 75"
        />
      </Field>

      <Field label="Emergency room" width="quarter">
        <MoneyInput
          value={data.copayEr}
          onChange={v => update('copayEr', v)}
          placeholder="e.g. 350"
        />
      </Field>

      <Field label=" " width="full">
        <Toggle
          checked={!!data.copayErWaived}
          onChange={v => update('copayErWaived', v)}
          label="ER copay waived if admitted"
        />
      </Field>

      {/* Rx tiers */}
      <SubHeading
        title="Prescription drug tiers"
        helper="Standard 4-tier formulary. Enter $ amounts for copays. Specialty often uses coinsurance % — write as a number, e.g. 30 for 30%."
      />

      <Field label="Tier 1 — Generic" helper="Most common drugs" width="quarter">
        <MoneyInput
          value={data.rxTier1Generic}
          onChange={v => update('rxTier1Generic', v)}
          placeholder="e.g. 10"
        />
      </Field>

      <Field label="Tier 2 — Preferred brand" width="quarter">
        <MoneyInput
          value={data.rxTier2PreferredBrand}
          onChange={v => update('rxTier2PreferredBrand', v)}
          placeholder="e.g. 40"
        />
      </Field>

      <Field label="Tier 3 — Non-preferred brand" width="quarter">
        <MoneyInput
          value={data.rxTier3NonPreferredBrand}
          onChange={v => update('rxTier3NonPreferredBrand', v)}
          placeholder="e.g. 75"
        />
      </Field>

      <Field label="Tier 4 — Specialty" helper="Often a %" width="quarter">
        <MoneyInput
          value={data.rxTier4Specialty}
          onChange={v => update('rxTier4Specialty', v)}
          placeholder="e.g. 250"
        />
      </Field>

      <Field label=" " width="full">
        <Toggle
          checked={!!data.rxDeductibleSeparate}
          onChange={v => update('rxDeductibleSeparate', v)}
          label="Rx has a separate deductible (not combined with medical)"
        />
      </Field>

      {data.rxDeductibleSeparate && (
        <Field label="Rx deductible amount" width="half">
          <MoneyInput
            value={data.rxDeductibleAmount}
            onChange={v => update('rxDeductibleAmount', v)}
            placeholder="e.g. 250"
          />
        </Field>
      )}
    </FormGrid>
  );
}

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? null : n;
}