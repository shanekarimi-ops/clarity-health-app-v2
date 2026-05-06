'use client';

import React from 'react';
import {
  Field, FormGrid, MoneyInput, PercentInput, TextInput, Select, Toggle, RadioGroup, SubHeading, Callout, TextArea,
} from './FormControls';

export type PBMConfig = {
  // PBM selection
  pbmName?: string;
  pbmNameOther?: string;

  // Pricing model
  pricingModel?: 'traditional' | 'pass_through' | 'hybrid';
  adminFeePepm?: string | number;

  // Rebates
  rebatePassThroughPct?: string | number; // % of rebates passed to plan
  rebateGuaranteePerRx?: string | number; // $ minimum guaranteed per script

  // Specialty
  specialtyCarveOut?: boolean;
  specialtyVendor?: string;

  // Mail order
  mailOrderEnabled?: boolean;
  mailOrderCopayMultiplier?: '1x' | '2x' | '2.5x';

  // Formulary
  formularyType?: 'open' | 'closed' | 'preferred';

  // Step therapy / PA
  utilizationManagement?: 'none' | 'standard' | 'aggressive';

  // Generic
  genericDispensingTarget?: string | number; // %

  // Notes
  notes?: string;
};

const PBM_OPTIONS = [
  { value: 'express_scripts', label: 'Express Scripts (Cigna)' },
  { value: 'cvs_caremark',    label: 'CVS Caremark (Aetna)' },
  { value: 'optumrx',         label: 'OptumRx (UHC)' },
  { value: 'navitus',         label: 'Navitus' },
  { value: 'capital_rx',      label: 'Capital Rx' },
  { value: 'medimpact',       label: 'MedImpact' },
  { value: 'rxbenefits',      label: 'RxBenefits' },
  { value: 'truepill',        label: 'Truepill' },
  { value: 'sav_rx',          label: 'Sav-Rx' },
  { value: 'maxor',           label: 'MaxorPlus' },
  { value: 'eligma',          label: 'Eligma / Pharmacy Benefit Dimensions' },
  { value: 'bundled_with_tpa',label: 'Bundled with TPA' },
  { value: 'other',           label: 'Other / custom' },
];

export default function SectionPBM({
  data,
  onChange,
}: {
  data: PBMConfig;
  onChange: (next: PBMConfig) => void;
}) {
  function update<K extends keyof PBMConfig>(key: K, value: PBMConfig[K]) {
    onChange({ ...data, [key]: value });
  }

  // Validation: rebate pass-through warnings
  const rebatePct = num(data.rebatePassThroughPct);
  const rebateWarning =
    rebatePct !== null && rebatePct < 90
      ? 'Pass-through below 90% means the PBM keeps a meaningful share of rebates. Negotiate harder if you can.'
      : null;

  return (
    <FormGrid>
      <Callout variant="info">
        The PBM (Pharmacy Benefit Manager) processes Rx claims, manages the formulary, negotiates manufacturer rebates, and runs mail order.
        Rx is now <strong>30-40%</strong> of total claim spend for most groups, so PBM economics matter a lot.
      </Callout>

      {/* PBM selection */}
      <SubHeading title="PBM selection" />

      <Field label="PBM" width="full" required>
        <Select
          value={data.pbmName || ''}
          onChange={v => update('pbmName', v)}
          placeholder="Select PBM..."
          options={PBM_OPTIONS}
        />
      </Field>

      {data.pbmName === 'other' && (
        <Field label="Specify PBM" width="full">
          <TextInput
            value={data.pbmNameOther || ''}
            onChange={v => update('pbmNameOther', v)}
            placeholder="PBM name"
          />
        </Field>
      )}

      {/* Pricing model */}
      <SubHeading
        title="Pricing model"
        helper="The single most important PBM decision. Traditional/spread is opaque and profitable for the PBM; pass-through is transparent."
      />

      <Field label="Model" width="full">
        <RadioGroup
          value={data.pricingModel || ''}
          onChange={v => update('pricingModel', v as PBMConfig['pricingModel'])}
          options={[
            { value: 'traditional',  label: 'Traditional / spread pricing', helper: 'PBM charges plan one rate, pays pharmacy a lower rate, keeps the spread. Simpler but more expensive.' },
            { value: 'pass_through', label: 'Pass-through / transparent',   helper: 'PBM charges plan exactly what it pays the pharmacy. PBM revenue is admin fee only. Most cost-effective.' },
            { value: 'hybrid',       label: 'Hybrid',                       helper: 'Mix of pass-through (generics) and traditional (brand). Common compromise.' },
          ]}
        />
      </Field>

      <Field
        label="PBM admin fee"
        helper="Pass-through PBMs charge a PEPM admin fee. Typical: $1.50 – $4.00 PEPM. Traditional PBMs often have $0 admin (revenue is in spread)."
        width="half"
      >
        <MoneyInput
          value={data.adminFeePepm}
          onChange={v => update('adminFeePepm', v)}
          placeholder="e.g. 2.50"
        />
      </Field>

      {/* Rebates */}
      <SubHeading
        title="Manufacturer rebates"
        helper="Drug manufacturers pay rebates to PBMs. The question is how much of those rebates flow back to your plan."
      />

      <Field
        label="Rebate pass-through %"
        helper="100% means all rebates go to the plan; 75% means PBM keeps 25% as additional revenue. Aim for 95-100%."
        width="half"
      >
        <PercentInput
          value={data.rebatePassThroughPct}
          onChange={v => update('rebatePassThroughPct', v)}
          placeholder="e.g. 100"
        />
      </Field>

      <Field
        label="Rebate guarantee per Rx"
        helper="Optional. Some PBMs guarantee a minimum rebate amount per branded script. Common: $50-$150 per brand Rx."
        width="half"
      >
        <MoneyInput
          value={data.rebateGuaranteePerRx}
          onChange={v => update('rebateGuaranteePerRx', v)}
          placeholder="e.g. 75"
        />
      </Field>

      {rebateWarning && <Callout variant="warning">⚠️ {rebateWarning}</Callout>}

      {/* Specialty Rx */}
      <SubHeading
        title="Specialty Rx"
        helper="Specialty drugs are now ~50% of Rx spend despite being <2% of scripts. Carving these out to a specialty-focused vendor often saves significantly."
      />

      <Field label=" " width="full">
        <Toggle
          checked={!!data.specialtyCarveOut}
          onChange={v => update('specialtyCarveOut', v)}
          label="Carve out specialty Rx to a separate vendor"
        />
      </Field>

      {data.specialtyCarveOut && (
        <Field
          label="Specialty vendor"
          helper="e.g. Archimedes, PaydHealth, SHARx, ScriptSourcing, RemedyOne, GoodRx Care."
          width="full"
        >
          <TextInput
            value={data.specialtyVendor || ''}
            onChange={v => update('specialtyVendor', v)}
            placeholder="e.g. Archimedes"
          />
        </Field>
      )}

      {/* Mail order */}
      <SubHeading
        title="Mail order"
        helper="90-day mail order encourages adherence and typically costs less than 90 days of retail."
      />

      <Field label=" " width="half">
        <Toggle
          checked={!!data.mailOrderEnabled}
          onChange={v => update('mailOrderEnabled', v)}
          label="Mail order enabled"
        />
      </Field>

      {data.mailOrderEnabled && (
        <Field
          label="Mail order copay multiplier"
          helper="How a 90-day mail copay compares to a 30-day retail copay."
          width="half"
        >
          <RadioGroup
            value={data.mailOrderCopayMultiplier || ''}
            onChange={v => update('mailOrderCopayMultiplier', v as PBMConfig['mailOrderCopayMultiplier'])}
            options={[
              { value: '1x',   label: '1x',   helper: '90-day mail = same as 30-day retail copay (most member-friendly)' },
              { value: '2x',   label: '2x',   helper: '90-day mail = 2× the 30-day retail copay (most common)' },
              { value: '2.5x', label: '2.5x', helper: '90-day mail = 2.5× the 30-day retail copay (least member-friendly)' },
            ]}
          />
        </Field>
      )}

      {/* Formulary */}
      <SubHeading
        title="Formulary"
        helper="The list of covered drugs and how strictly it's enforced."
      />

      <Field label="Formulary type" width="full">
        <RadioGroup
          value={data.formularyType || ''}
          onChange={v => update('formularyType', v as PBMConfig['formularyType'])}
          options={[
            { value: 'open',      label: 'Open formulary',      helper: 'Almost all drugs covered. Highest cost, fewest member abrasion issues.' },
            { value: 'preferred', label: 'Preferred formulary', helper: 'Standard 4-tier with most drugs covered but tiered. Most common.' },
            { value: 'closed',    label: 'Closed formulary',    helper: 'Only drugs on the formulary are covered. Maximum cost control, more member friction.' },
          ]}
        />
      </Field>

      {/* Utilization management */}
      <SubHeading
        title="Step therapy & prior authorization"
        helper="How aggressively the PBM requires members to try cheaper drugs before getting expensive ones."
      />

      <Field label="UM intensity" width="full">
        <RadioGroup
          value={data.utilizationManagement || ''}
          onChange={v => update('utilizationManagement', v as PBMConfig['utilizationManagement'])}
          options={[
            { value: 'none',       label: 'None / minimal',  helper: 'No step therapy, basic PA only on truly extreme drugs. Highest cost, lowest friction.' },
            { value: 'standard',   label: 'Standard',         helper: 'Step therapy on most therapeutic classes, PA on specialty drugs. Industry default.' },
            { value: 'aggressive', label: 'Aggressive',       helper: 'Step therapy and PA on a broader set of categories. Maximum savings, more member abrasion.' },
          ]}
        />
      </Field>

      {/* Generic dispensing */}
      <Field
        label="Generic dispensing rate target"
        helper="Optional performance guarantee. The PBM commits to dispensing generics at this rate or higher. Industry typical: 86-90%."
        width="half"
      >
        <PercentInput
          value={data.genericDispensingTarget}
          onChange={v => update('genericDispensingTarget', v)}
          placeholder="e.g. 88"
        />
      </Field>

      {/* Notes */}
      <Field label="PBM notes" width="full">
        <TextArea
          value={data.notes || ''}
          onChange={v => update('notes', v)}
          placeholder="e.g. Quoting Capital Rx pass-through against incumbent ESI traditional. Member abrasion from PA on weight-loss drugs is a known concern."
          rows={3}
        />
      </Field>
    </FormGrid>
  );
}

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? null : n;
}