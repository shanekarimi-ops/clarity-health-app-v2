'use client';

import React from 'react';
import { Field, FormGrid, TextInput, Select, TextArea, PercentInput, SubHeading, Callout } from './FormControls';

export type GroupBasics = {
  effectiveDate?: string;
  planYear?: string;
  groupSize?: string | number;
  industry?: string;
  state?: string;
  zip?: string;
  avgEmployeeAge?: string | number;
  pctFemale?: string | number;
  pctTobacco?: string | number;
  notes?: string;
};

const INDUSTRY_OPTIONS = [
  { value: 'agriculture',          label: 'Agriculture / Forestry / Mining' },
  { value: 'construction',         label: 'Construction' },
  { value: 'manufacturing_light',  label: 'Manufacturing — light' },
  { value: 'manufacturing_heavy',  label: 'Manufacturing — heavy / industrial' },
  { value: 'transportation',       label: 'Transportation / Warehousing' },
  { value: 'wholesale_retail',     label: 'Wholesale / Retail' },
  { value: 'tech',                 label: 'Technology / Software' },
  { value: 'finance',              label: 'Finance / Insurance' },
  { value: 'real_estate',          label: 'Real Estate' },
  { value: 'professional',         label: 'Professional Services (legal, accounting, consulting)' },
  { value: 'healthcare',           label: 'Healthcare / Social Assistance' },
  { value: 'education',            label: 'Education' },
  { value: 'hospitality',          label: 'Hospitality / Food Service' },
  { value: 'arts_entertainment',   label: 'Arts / Entertainment / Recreation' },
  { value: 'public_admin',         label: 'Public Administration / Government' },
  { value: 'nonprofit',            label: 'Nonprofit' },
  { value: 'other',                label: 'Other' },
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

export default function SectionGroup({
  data,
  onChange,
  prefilledMemberCount,
  prefilledState,
}: {
  data: GroupBasics;
  onChange: (next: GroupBasics) => void;
  prefilledMemberCount?: number | null;
  prefilledState?: string | null;
}) {
  const groupSizePrefilled = data.groupSize === undefined && prefilledMemberCount;
  const statePrefilled = !data.state && prefilledState;

  function update<K extends keyof GroupBasics>(key: K, value: GroupBasics[K]) {
    onChange({ ...data, [key]: value });
  }

  // Validate effective date roughly
  const effectiveDateNote = (() => {
    if (!data.effectiveDate) return null;
    const d = new Date(data.effectiveDate);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    const monthsAway = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30));
    if (monthsAway > 18) return 'That\'s more than 18 months out — double-check the date.';
    if (monthsAway < -3) return 'That\'s in the past. Designs are usually for the next renewal.';
    return null;
  })();

  return (
    <FormGrid>
      <SubHeading title="When does coverage start?" />

      <Field
        label="Effective date"
        helper="The day this plan begins covering members. Usually the start of the next plan year."
        width="half"
        required
      >
        <TextInput
          value={data.effectiveDate || ''}
          onChange={v => update('effectiveDate', v)}
          type="date"
        />
      </Field>

      <Field
        label="Plan year"
        helper="Calendar-year resets on Jan 1. Plan-year resets on the effective date anniversary."
        width="half"
      >
        <Select
          value={data.planYear || ''}
          onChange={v => update('planYear', v)}
          placeholder="Select plan year type…"
          options={[
            { value: 'calendar', label: 'Calendar year (Jan 1 – Dec 31)' },
            { value: 'plan_year', label: 'Plan year (anniversary-based)' },
          ]}
        />
      </Field>

      {effectiveDateNote && (
        <Callout variant="warning">⚠️ {effectiveDateNote}</Callout>
      )}

      <SubHeading title="Group size & demographics" helper="The bigger and richer this picture, the better the AI cost projection." />

      <Field
        label="Group size (eligible employees)"
        helper={groupSizePrefilled ? `Prefilled from client record (${prefilledMemberCount}). Edit if needed.` : 'Number of employees eligible for benefits, not including dependents.'}
        width="third"
        required
      >
        <TextInput
          value={data.groupSize !== undefined ? String(data.groupSize) : (prefilledMemberCount ? String(prefilledMemberCount) : '')}
          onChange={v => update('groupSize', v)}
          type="number"
          placeholder="e.g. 75"
        />
      </Field>

      <Field
        label="Industry"
        helper="Affects expected utilization. Manufacturing/construction trends higher; tech/finance trends lower."
        width="third"
      >
        <Select
          value={data.industry || ''}
          onChange={v => update('industry', v)}
          placeholder="Select industry…"
          options={INDUSTRY_OPTIONS}
        />
      </Field>

      <Field
        label="State"
        helper={statePrefilled ? `Prefilled from client (${prefilledState}). Edit if needed.` : 'Primary state of operations. Used for stop-loss and network availability.'}
        width="third"
      >
        <Select
          value={data.state || prefilledState || ''}
          onChange={v => update('state', v)}
          placeholder="Select state…"
          options={US_STATES.map(s => ({ value: s, label: s }))}
        />
      </Field>

      <Field
        label="Average employee age"
        helper="Optional. Sharpens the cost projection."
        width="third"
      >
        <TextInput
          value={data.avgEmployeeAge !== undefined ? String(data.avgEmployeeAge) : ''}
          onChange={v => update('avgEmployeeAge', v)}
          type="number"
          placeholder="e.g. 42"
        />
      </Field>

      <Field
        label="% female"
        helper="Optional. Drives maternity & related utilization."
        width="third"
      >
        <PercentInput
          value={data.pctFemale}
          onChange={v => update('pctFemale', v)}
          placeholder="e.g. 45"
        />
      </Field>

      <Field
        label="% tobacco users"
        helper="Optional. Tobacco users have meaningfully higher claims."
        width="third"
      >
        <PercentInput
          value={data.pctTobacco}
          onChange={v => update('pctTobacco', v)}
          placeholder="e.g. 12"
        />
      </Field>

      <SubHeading title="Notes" helper="Anything else that matters — past loss runs, special situations, broker context." />

      <Field label="Internal notes" width="full">
        <TextArea
          value={data.notes || ''}
          onChange={v => update('notes', v)}
          placeholder="e.g. Group has had two large claimants in the past 24 months — both stable now. Renewing off Aetna fully-insured."
          rows={4}
        />
      </Field>
    </FormGrid>
  );
}