'use client';

import React from 'react';
import {
  Field, FormGrid, MoneyInput, TextInput, Select, Toggle, RadioGroup, SubHeading, Callout, TextArea,
} from './FormControls';

export type TPAConfig = {
  // TPA selection
  tpaName?: string;
  tpaNameOther?: string;

  // Admin fees
  adminFeeStructure?: 'pepm' | 'pct_claims' | 'flat';
  adminFeePepm?: string | number;       // $/employee/month
  adminFeePctClaims?: string | number;  // %
  adminFeeFlat?: string | number;       // $/year flat

  // Claims funding
  fundingModel?: 'monthly_bank' | 'pay_as_you_go' | 'fully_pre_funded';

  // ID card branding
  idCardBranding?: 'tpa_branded' | 'employer_branded' | 'cobranded';

  // COBRA
  cobraAdmin?: 'included_with_tpa' | 'separate_vendor' | 'in_house';
  cobraVendor?: string;

  // Runout
  runoutAdmin?: 'included' | 'add_on' | 'self_admin';
  runoutMonths?: string | number;

  // Implementation
  implementationDate?: string;
  cutoverNotes?: string;

  // Notes
  notes?: string;
};

const TPA_OPTIONS = [
  { value: 'anthem_aso',     label: 'Anthem ASO' },
  { value: 'aetna_aso',      label: 'Aetna ASO' },
  { value: 'cigna_aso',      label: 'Cigna ASO' },
  { value: 'uhc_aso',        label: 'UnitedHealthcare ASO' },
  { value: 'bcbs_aso',       label: 'BCBS ASO (other state Blue)' },
  { value: 'healthez',       label: 'HealthEZ' },
  { value: 'trustmark',      label: 'Trustmark Health Benefits' },
  { value: '6_degrees',      label: '6 Degrees Health' },
  { value: 'allied',         label: 'Allied National' },
  { value: 'meritain',       label: 'Meritain Health (Aetna)' },
  { value: 'webtpa',         label: 'WebTPA' },
  { value: 'planstin',       label: 'Planstin / Carthage' },
  { value: 'collective',     label: 'Collective Health' },
  { value: 'regional',       label: 'Regional / state-specific' },
  { value: 'other',          label: 'Other / custom' },
];

export default function SectionTPA({
  data,
  onChange,
}: {
  data: TPAConfig;
  onChange: (next: TPAConfig) => void;
}) {
  function update<K extends keyof TPAConfig>(key: K, value: TPAConfig[K]) {
    onChange({ ...data, [key]: value });
  }

  return (
    <FormGrid>
      <Callout variant="info">
        The TPA (Third-Party Administrator) processes claims, issues ID cards, runs the claims system, and handles member service.
        For self-funded plans, the TPA is one of the most important vendor decisions — it shapes member experience and reporting quality.
      </Callout>

      {/* TPA selection */}
      <SubHeading title="TPA selection" />

      <Field label="TPA" width="full" required>
        <Select
          value={data.tpaName || ''}
          onChange={v => update('tpaName', v)}
          placeholder="Select TPA..."
          options={TPA_OPTIONS}
        />
      </Field>

      {(data.tpaName === 'regional' || data.tpaName === 'other') && (
        <Field label="Specify TPA" width="full">
          <TextInput
            value={data.tpaNameOther || ''}
            onChange={v => update('tpaNameOther', v)}
            placeholder="TPA name"
          />
        </Field>
      )}

      {/* Admin fees */}
      <SubHeading
        title="Administrative fees"
        helper="How the TPA charges. PEPM is the most common for self-funded; % of claims is more common in larger or complex programs."
      />

      <Field label="Fee structure" width="full">
        <RadioGroup
          value={data.adminFeeStructure || ''}
          onChange={v => update('adminFeeStructure', v as TPAConfig['adminFeeStructure'])}
          options={[
            { value: 'pepm',       label: 'Per employee per month (PEPM)', helper: 'Fixed dollar amount per employee per month. Most common.' },
            { value: 'pct_claims', label: '% of claims',                    helper: 'TPA takes a percentage of paid claims. Aligns incentive with claims volume.' },
            { value: 'flat',       label: 'Flat annual fee',                helper: 'Single annual amount regardless of group size or claims.' },
          ]}
        />
      </Field>

      {data.adminFeeStructure === 'pepm' && (
        <Field
          label="PEPM fee"
          helper="Typical range: $25 – $60 PEPM. Includes claims admin, ID cards, member service, basic reporting."
          width="half"
        >
          <MoneyInput
            value={data.adminFeePepm}
            onChange={v => update('adminFeePepm', v)}
            placeholder="e.g. 38"
          />
        </Field>
      )}

      {data.adminFeeStructure === 'pct_claims' && (
        <Field
          label="% of claims"
          helper="Typical range: 3% – 6%. Higher rates often include additional services."
          width="half"
        >
          <TextInput
            value={data.adminFeePctClaims !== undefined ? String(data.adminFeePctClaims) : ''}
            onChange={v => update('adminFeePctClaims', v)}
            type="number"
            suffix="%"
            placeholder="e.g. 4.5"
          />
        </Field>
      )}

      {data.adminFeeStructure === 'flat' && (
        <Field
          label="Annual flat fee"
          width="half"
        >
          <MoneyInput
            value={data.adminFeeFlat}
            onChange={v => update('adminFeeFlat', v)}
            placeholder="e.g. 50000"
          />
        </Field>
      )}

      {/* Claims funding */}
      <SubHeading
        title="Claims funding model"
        helper="How the employer funds claims as they're paid. Affects cash flow and reserve requirements."
      />

      <Field label="Funding" width="full">
        <RadioGroup
          value={data.fundingModel || ''}
          onChange={v => update('fundingModel', v as TPAConfig['fundingModel'])}
          options={[
            { value: 'monthly_bank',     label: 'Monthly claims bank',  helper: 'Employer wires expected claims to a bank account monthly; TPA draws from it as claims are paid. Most common.' },
            { value: 'pay_as_you_go',    label: 'Pay-as-you-go',         helper: 'TPA invoices employer weekly or biweekly for claims actually paid. Lower carrying balance.' },
            { value: 'fully_pre_funded', label: 'Fully pre-funded',      helper: 'Employer pre-funds annual expected claims at the start of the year. Less common; ties up capital.' },
          ]}
        />
      </Field>

      {/* ID card */}
      <SubHeading
        title="ID card branding"
        helper="Whether ID cards show the TPA's name, the employer's name, or both. Affects member perception."
      />

      <Field label="Branding" width="full">
        <RadioGroup
          value={data.idCardBranding || ''}
          onChange={v => update('idCardBranding', v as TPAConfig['idCardBranding'])}
          options={[
            { value: 'tpa_branded',      label: 'TPA-branded',      helper: 'Member sees TPA name. Easier provider acceptance, but feels less personal.' },
            { value: 'employer_branded', label: 'Employer-branded', helper: 'Member sees employer name + group health plan. Strong identity, but providers may not recognize.' },
            { value: 'cobranded',        label: 'Co-branded',       helper: 'Both names visible. Balanced approach.' },
          ]}
        />
      </Field>

      {/* COBRA */}
      <SubHeading
        title="COBRA administration"
        helper="Required for groups with 20+ employees. Often bundled with the TPA but can be carved out."
      />

      <Field label="COBRA admin" width="full">
        <RadioGroup
          value={data.cobraAdmin || ''}
          onChange={v => update('cobraAdmin', v as TPAConfig['cobraAdmin'])}
          options={[
            { value: 'included_with_tpa', label: 'Included with TPA',  helper: 'Bundled service. Simpler.' },
            { value: 'separate_vendor',   label: 'Separate vendor',     helper: 'Specialty COBRA admin (WageWorks, Optum Financial, BAS, etc.).' },
            { value: 'in_house',          label: 'In-house',            helper: 'Employer handles COBRA themselves. Risky for compliance.' },
          ]}
        />
      </Field>

      {data.cobraAdmin === 'separate_vendor' && (
        <Field label="COBRA vendor name" width="full">
          <TextInput
            value={data.cobraVendor || ''}
            onChange={v => update('cobraVendor', v)}
            placeholder="e.g. WageWorks, Optum Financial"
          />
        </Field>
      )}

      {/* Runout */}
      <SubHeading
        title="Run-out / terminal liability"
        helper="If the group leaves this TPA, who handles claims that were incurred but not yet paid?"
      />

      <Field label="Run-out admin" width="half">
        <RadioGroup
          value={data.runoutAdmin || ''}
          onChange={v => update('runoutAdmin', v as TPAConfig['runoutAdmin'])}
          options={[
            { value: 'included',    label: 'Included',     helper: 'TPA processes runout claims at no extra cost.' },
            { value: 'add_on',      label: 'Add-on fee',   helper: 'Additional 1-3 months of admin fees.' },
            { value: 'self_admin',  label: 'Self-admin',   helper: 'Employer handles unpaid claims after termination.' },
          ]}
        />
      </Field>

      <Field
        label="Run-out months"
        helper="How long the TPA continues processing claims after termination. 12 months is standard."
        width="half"
      >
        <TextInput
          value={data.runoutMonths !== undefined ? String(data.runoutMonths) : ''}
          onChange={v => update('runoutMonths', v)}
          type="number"
          suffix="mo"
          placeholder="e.g. 12"
        />
      </Field>

      {/* Implementation */}
      <SubHeading
        title="Implementation"
        helper="Critical for first-time self-insurers and TPA changes. Plan a 90-120 day runway before effective date."
      />

      <Field
        label="Implementation date"
        helper="Date the TPA expects to receive census, plan documents, and begin setup. Usually 60-90 days before effective."
        width="half"
      >
        <TextInput
          value={data.implementationDate || ''}
          onChange={v => update('implementationDate', v)}
          type="date"
        />
      </Field>

      <Field label="Cutover notes" width="full">
        <TextArea
          value={data.cutoverNotes || ''}
          onChange={v => update('cutoverNotes', v)}
          placeholder="e.g. Coming off Cigna fully-insured 12/31. Need to coordinate ID card mail by 12/15. Open enrollment Nov 1-15."
          rows={3}
        />
      </Field>

      {/* Notes */}
      <Field label="TPA notes" width="full">
        <TextArea
          value={data.notes || ''}
          onChange={v => update('notes', v)}
          placeholder="Anything else: implementation team contacts, special services, performance guarantees, etc."
          rows={3}
        />
      </Field>
    </FormGrid>
  );
}