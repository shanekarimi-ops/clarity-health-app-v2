'use client';

import React from 'react';
import {
  Field, FormGrid, MoneyInput, PercentInput, TextInput, Toggle, RadioGroup, SubHeading, Callout, TextArea,
} from './FormControls';

export type CarveOutsConfig = {
  // Dental
  dentalEnabled?: boolean;
  dentalCarrier?: string;
  dentalIntegration?: 'standalone' | 'integrated_with_medical';
  dentalEmployerContribution?: string | number; // % employer pays

  // Vision
  visionEnabled?: boolean;
  visionCarrier?: string;
  visionEmployerContribution?: string | number;

  // EAP
  eapEnabled?: boolean;
  eapVendor?: string;
  eapSessionsPerYear?: string | number;

  // Life / AD&D
  lifeEnabled?: boolean;
  lifeCarrier?: string;
  lifeBenefit?: string; // e.g. "1× salary up to $200K" — kept as text for flexibility

  // Short-term disability
  stdEnabled?: boolean;
  stdCarrier?: string;
  stdBenefitPct?: string | number; // % of salary
  stdWaitingPeriod?: string | number; // days
  stdMaxWeeks?: string | number;

  // Long-term disability
  ltdEnabled?: boolean;
  ltdCarrier?: string;
  ltdBenefitPct?: string | number;
  ltdWaitingPeriod?: string | number; // days
  ltdMaxAge?: string | number; // typically to age 65

  // Voluntary supplemental
  accidentEnabled?: boolean;
  hospitalIndemnityEnabled?: boolean;
  criticalIllnessEnabled?: boolean;
  voluntaryCarrier?: string;

  // Other voluntary
  identityTheftEnabled?: boolean;
  petInsuranceEnabled?: boolean;
  legalEnabled?: boolean;

  // HSA / HRA / FSA
  spendingAccountType?: 'none' | 'hsa' | 'hra' | 'fsa' | 'hsa_fsa' | 'hra_fsa';
  spendingAccountVendor?: string;
  hsaEmployerContribution?: string | number; // annual $
  hraAllowance?: string | number; // annual $

  // Notes
  notes?: string;
};

export default function SectionCarveOuts({
  data,
  onChange,
}: {
  data: CarveOutsConfig;
  onChange: (next: CarveOutsConfig) => void;
}) {
  function update<K extends keyof CarveOutsConfig>(key: K, value: CarveOutsConfig[K]) {
    onChange({ ...data, [key]: value });
  }

  return (
    <FormGrid>
      <Callout variant="info">
        Carve-outs are ancillary and supplemental benefits beyond the core medical plan. Common ones (dental, vision, EAP) are usually employer-paid;
        voluntary products (accident, critical illness) are typically employee-paid through payroll deduction.
      </Callout>

      {/* Dental */}
      <SubHeading title="Dental" />

      <Field label=" " width="full">
        <Toggle
          checked={!!data.dentalEnabled}
          onChange={v => update('dentalEnabled', v)}
          label="Offer dental coverage"
        />
      </Field>

      {data.dentalEnabled && (
        <>
          <Field label="Dental carrier" width="third">
            <TextInput
              value={data.dentalCarrier || ''}
              onChange={v => update('dentalCarrier', v)}
              placeholder="e.g. Delta Dental, Guardian, MetLife"
            />
          </Field>

          <Field label="Integration" width="third">
            <RadioGroup
              value={data.dentalIntegration || ''}
              onChange={v => update('dentalIntegration', v as CarveOutsConfig['dentalIntegration'])}
              options={[
                { value: 'standalone',              label: 'Standalone' },
                { value: 'integrated_with_medical', label: 'Integrated with medical' },
              ]}
            />
          </Field>

          <Field label="Employer contribution %" width="third">
            <PercentInput
              value={data.dentalEmployerContribution}
              onChange={v => update('dentalEmployerContribution', v)}
              placeholder="e.g. 50"
            />
          </Field>
        </>
      )}

      {/* Vision */}
      <SubHeading title="Vision" />

      <Field label=" " width="full">
        <Toggle
          checked={!!data.visionEnabled}
          onChange={v => update('visionEnabled', v)}
          label="Offer vision coverage"
        />
      </Field>

      {data.visionEnabled && (
        <>
          <Field label="Vision carrier" width="half">
            <TextInput
              value={data.visionCarrier || ''}
              onChange={v => update('visionCarrier', v)}
              placeholder="e.g. VSP, EyeMed, Davis Vision"
            />
          </Field>

          <Field label="Employer contribution %" width="half">
            <PercentInput
              value={data.visionEmployerContribution}
              onChange={v => update('visionEmployerContribution', v)}
              placeholder="e.g. 100"
            />
          </Field>
        </>
      )}

      {/* EAP */}
      <SubHeading
        title="Employee Assistance Program (EAP)"
        helper="Free counseling, legal, and financial wellness sessions. Often included free with medical or as a low-cost add-on."
      />

      <Field label=" " width="full">
        <Toggle
          checked={!!data.eapEnabled}
          onChange={v => update('eapEnabled', v)}
          label="Offer EAP"
        />
      </Field>

      {data.eapEnabled && (
        <>
          <Field label="EAP vendor" width="half">
            <TextInput
              value={data.eapVendor || ''}
              onChange={v => update('eapVendor', v)}
              placeholder="e.g. ComPsych, Lyra, Spring Health, included with TPA"
            />
          </Field>

          <Field
            label="Sessions per year"
            helper="Common: 3, 5, 6, 8, or unlimited."
            width="half"
          >
            <TextInput
              value={data.eapSessionsPerYear !== undefined ? String(data.eapSessionsPerYear) : ''}
              onChange={v => update('eapSessionsPerYear', v)}
              type="number"
              placeholder="e.g. 6"
            />
          </Field>
        </>
      )}

      {/* Life / AD&D */}
      <SubHeading
        title="Life and AD&D"
        helper="Basic group term life is typically 1× to 2× salary; voluntary additional life is buy-up."
      />

      <Field label=" " width="full">
        <Toggle
          checked={!!data.lifeEnabled}
          onChange={v => update('lifeEnabled', v)}
          label="Offer life / AD&D"
        />
      </Field>

      {data.lifeEnabled && (
        <>
          <Field label="Carrier" width="half">
            <TextInput
              value={data.lifeCarrier || ''}
              onChange={v => update('lifeCarrier', v)}
              placeholder="e.g. Sun Life, Lincoln, Guardian, MetLife"
            />
          </Field>

          <Field label="Benefit amount" helper="e.g. '1× salary up to $200K' or 'Flat $50K'" width="half">
            <TextInput
              value={data.lifeBenefit || ''}
              onChange={v => update('lifeBenefit', v)}
              placeholder="e.g. 1× salary, max $200K"
            />
          </Field>
        </>
      )}

      {/* STD */}
      <SubHeading title="Short-term disability (STD)" />

      <Field label=" " width="full">
        <Toggle
          checked={!!data.stdEnabled}
          onChange={v => update('stdEnabled', v)}
          label="Offer short-term disability"
        />
      </Field>

      {data.stdEnabled && (
        <>
          <Field label="Carrier" width="quarter">
            <TextInput
              value={data.stdCarrier || ''}
              onChange={v => update('stdCarrier', v)}
              placeholder="e.g. Sun Life"
            />
          </Field>

          <Field label="Benefit %" helper="% of salary" width="quarter">
            <PercentInput
              value={data.stdBenefitPct}
              onChange={v => update('stdBenefitPct', v)}
              placeholder="e.g. 60"
            />
          </Field>

          <Field label="Elimination period" helper="Days before benefits start" width="quarter">
            <TextInput
              value={data.stdWaitingPeriod !== undefined ? String(data.stdWaitingPeriod) : ''}
              onChange={v => update('stdWaitingPeriod', v)}
              type="number"
              suffix="days"
              placeholder="e.g. 7"
            />
          </Field>

          <Field label="Max benefit period" helper="Weeks" width="quarter">
            <TextInput
              value={data.stdMaxWeeks !== undefined ? String(data.stdMaxWeeks) : ''}
              onChange={v => update('stdMaxWeeks', v)}
              type="number"
              suffix="wks"
              placeholder="e.g. 26"
            />
          </Field>
        </>
      )}

      {/* LTD */}
      <SubHeading title="Long-term disability (LTD)" />

      <Field label=" " width="full">
        <Toggle
          checked={!!data.ltdEnabled}
          onChange={v => update('ltdEnabled', v)}
          label="Offer long-term disability"
        />
      </Field>

      {data.ltdEnabled && (
        <>
          <Field label="Carrier" width="quarter">
            <TextInput
              value={data.ltdCarrier || ''}
              onChange={v => update('ltdCarrier', v)}
              placeholder="e.g. Lincoln"
            />
          </Field>

          <Field label="Benefit %" helper="% of salary" width="quarter">
            <PercentInput
              value={data.ltdBenefitPct}
              onChange={v => update('ltdBenefitPct', v)}
              placeholder="e.g. 60"
            />
          </Field>

          <Field label="Elimination period" helper="Days" width="quarter">
            <TextInput
              value={data.ltdWaitingPeriod !== undefined ? String(data.ltdWaitingPeriod) : ''}
              onChange={v => update('ltdWaitingPeriod', v)}
              type="number"
              suffix="days"
              placeholder="e.g. 90"
            />
          </Field>

          <Field label="Benefits to age" helper="Often age 65" width="quarter">
            <TextInput
              value={data.ltdMaxAge !== undefined ? String(data.ltdMaxAge) : ''}
              onChange={v => update('ltdMaxAge', v)}
              type="number"
              placeholder="65"
            />
          </Field>
        </>
      )}

      {/* Voluntary supplemental */}
      <SubHeading
        title="Voluntary supplemental products"
        helper="Employee-paid through payroll. Useful for HDHP-paired groups where members want extra protection."
      />

      <Field label=" " width="third">
        <Toggle
          checked={!!data.accidentEnabled}
          onChange={v => update('accidentEnabled', v)}
          label="Accident insurance"
        />
      </Field>

      <Field label=" " width="third">
        <Toggle
          checked={!!data.hospitalIndemnityEnabled}
          onChange={v => update('hospitalIndemnityEnabled', v)}
          label="Hospital indemnity"
        />
      </Field>

      <Field label=" " width="third">
        <Toggle
          checked={!!data.criticalIllnessEnabled}
          onChange={v => update('criticalIllnessEnabled', v)}
          label="Critical illness"
        />
      </Field>

      {(data.accidentEnabled || data.hospitalIndemnityEnabled || data.criticalIllnessEnabled) && (
        <Field label="Voluntary carrier" width="full">
          <TextInput
            value={data.voluntaryCarrier || ''}
            onChange={v => update('voluntaryCarrier', v)}
            placeholder="e.g. Aflac, Allstate, Colonial Life, Voya"
          />
        </Field>
      )}

      {/* Other voluntary */}
      <SubHeading title="Other voluntary benefits" helper="Lower utilization but valued by certain employee populations." />

      <Field label=" " width="third">
        <Toggle
          checked={!!data.identityTheftEnabled}
          onChange={v => update('identityTheftEnabled', v)}
          label="Identity theft protection"
        />
      </Field>

      <Field label=" " width="third">
        <Toggle
          checked={!!data.petInsuranceEnabled}
          onChange={v => update('petInsuranceEnabled', v)}
          label="Pet insurance"
        />
      </Field>

      <Field label=" " width="third">
        <Toggle
          checked={!!data.legalEnabled}
          onChange={v => update('legalEnabled', v)}
          label="Legal services"
        />
      </Field>

      {/* Spending accounts */}
      <SubHeading
        title="Tax-advantaged spending accounts"
        helper="HSA pairs with HDHPs. HRA is employer-funded. FSA is employee-funded with use-it-or-lose-it."
      />

      <Field label="Account type" width="full">
        <RadioGroup
          value={data.spendingAccountType || ''}
          onChange={v => update('spendingAccountType', v as CarveOutsConfig['spendingAccountType'])}
          options={[
            { value: 'none',     label: 'None' },
            { value: 'hsa',      label: 'HSA only',           helper: 'Health Savings Account. Requires HDHP. Employee + employer contributions allowed.' },
            { value: 'hra',      label: 'HRA only',           helper: 'Health Reimbursement Arrangement. Employer-funded only. Pairs with non-HSA plans.' },
            { value: 'fsa',      label: 'FSA only',           helper: 'Flexible Spending Account. Employee-funded only. Use-it-or-lose-it.' },
            { value: 'hsa_fsa',  label: 'HSA + Limited FSA',  helper: 'HSA paired with a limited-purpose FSA (dental/vision only). Maximizes tax savings.' },
            { value: 'hra_fsa',  label: 'HRA + FSA',          helper: 'Common combo for non-HDHP plans.' },
          ]}
        />
      </Field>

      {data.spendingAccountType && data.spendingAccountType !== 'none' && (
        <Field label="Spending account vendor" width="full">
          <TextInput
            value={data.spendingAccountVendor || ''}
            onChange={v => update('spendingAccountVendor', v)}
            placeholder="e.g. HealthEquity, Optum Bank, WEX, Lively, Fidelity"
          />
        </Field>
      )}

      {(data.spendingAccountType === 'hsa' || data.spendingAccountType === 'hsa_fsa') && (
        <Field
          label="Annual employer HSA contribution"
          helper="Per employee. Common: $500-$1500 single, $1000-$3000 family. 2026 IRS max: $4,400 single / $8,750 family."
          width="full"
        >
          <MoneyInput
            value={data.hsaEmployerContribution}
            onChange={v => update('hsaEmployerContribution', v)}
            placeholder="e.g. 1000"
          />
        </Field>
      )}

      {(data.spendingAccountType === 'hra' || data.spendingAccountType === 'hra_fsa') && (
        <Field
          label="Annual HRA allowance"
          helper="Per employee. Often used to bridge a high deductible — e.g. employer pays first $1,500 of deductible via HRA."
          width="full"
        >
          <MoneyInput
            value={data.hraAllowance}
            onChange={v => update('hraAllowance', v)}
            placeholder="e.g. 1500"
          />
        </Field>
      )}

      {/* Notes */}
      <Field label="Carve-outs notes" width="full">
        <TextArea
          value={data.notes || ''}
          onChange={v => update('notes', v)}
          placeholder="Anything specific about ancillary lines: bundled rates, performance guarantees, voluntary participation requirements, etc."
          rows={3}
        />
      </Field>
    </FormGrid>
  );
}