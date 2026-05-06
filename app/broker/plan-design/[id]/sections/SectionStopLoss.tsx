'use client';

import React from 'react';
import {
  Field, FormGrid, MoneyInput, PercentInput, TextInput, Select, Toggle, RadioGroup, SubHeading, Callout, TextArea,
} from './FormControls';

export type Laser = {
  memberLabel: string; // e.g. "EE-12345" or "Spouse of EE-12345" — broker uses internal IDs, never names
  customSpec: string;  // e.g. "150000"
  reason?: string;     // condition / reason
};

export type StopLossConfig = {
  // Specific stop-loss
  specificDeductible?: string | number;
  specificCarrier?: string;
  specificCarrierOther?: string;

  // Aggregate
  aggregateEnabled?: boolean;
  aggregateCorridor?: string | number; // typically 120-125%
  aggregatingSpecific?: boolean; // members combine toward an aggregate threshold

  // Contract type
  contractType?: '12_12' | '12_15' | '24_12' | '12_24' | 'paid';

  // Lasers
  lasers?: Laser[];
  noNewLasers?: boolean;
  rateCap?: string | number; // e.g. 50% rate cap on renewal

  // Disclosure
  disclosure?: 'full' | 'pass_through' | 'no_disclosure';

  // Notes
  notes?: string;
};

const STOP_LOSS_CARRIERS = [
  { value: 'sun_life',          label: 'Sun Life' },
  { value: 'symetra',           label: 'Symetra' },
  { value: 'tokio_marine_hcc',  label: 'Tokio Marine HCC' },
  { value: 'voya',              label: 'Voya' },
  { value: 'berkshire',         label: 'Berkshire Hathaway Specialty' },
  { value: 'companion',         label: 'Companion Life' },
  { value: 'qbe',               label: 'QBE' },
  { value: 'hm_life',           label: 'HM Life / Highmark' },
  { value: 'optum',             label: 'Optum (UHC)' },
  { value: 'aetna',             label: 'Aetna Stop Loss' },
  { value: 'other',             label: 'Other' },
];

export default function SectionStopLoss({
  data,
  onChange,
}: {
  data: StopLossConfig;
  onChange: (next: StopLossConfig) => void;
}) {
  function update<K extends keyof StopLossConfig>(key: K, value: StopLossConfig[K]) {
    onChange({ ...data, [key]: value });
  }

  function updateLaser(idx: number, patch: Partial<Laser>) {
    const next = [...(data.lasers || [])];
    next[idx] = { ...next[idx], ...patch };
    update('lasers', next);
  }

  function addLaser() {
    const next = [...(data.lasers || []), { memberLabel: '', customSpec: '', reason: '' }];
    update('lasers', next);
  }

  function removeLaser(idx: number) {
    const next = (data.lasers || []).filter((_, i) => i !== idx);
    update('lasers', next);
  }

  // Validation: specific deductible should typically be 5-15% of expected total claims
  const specNum = num(data.specificDeductible);
  const specWarning = specNum !== null && (specNum < 25000 || specNum > 500000)
    ? specNum < 25000
      ? 'Specific deductibles below $25K are unusual — most carriers won\'t quote that low.'
      : 'Specific deductibles above $500K are typically only used for very large groups (1000+ lives).'
    : null;

  return (
    <FormGrid>
      <Callout variant="info">
        Stop-loss insurance protects the plan from catastrophic claims. <strong>Specific</strong> caps the plan&apos;s liability per
        member; <strong>aggregate</strong> caps total claims for the entire group.
      </Callout>

      {/* Specific stop-loss */}
      <SubHeading
        title="Specific stop-loss"
        helper="Caps the plan's liability for any single member. Once a member's claims hit the specific deductible, the carrier reimburses everything above it."
      />

      <Field
        label="Specific deductible"
        helper="Per-member, per-year. Common levels: $25K, $50K, $75K, $100K, $150K, $200K. Lower = more protection but higher premium."
        width="half"
        required
      >
        <MoneyInput
          value={data.specificDeductible}
          onChange={v => update('specificDeductible', v)}
          placeholder="e.g. 75000"
        />
      </Field>

      <Field label="Stop-loss carrier" width="half" required>
        <Select
          value={data.specificCarrier || ''}
          onChange={v => update('specificCarrier', v)}
          placeholder="Select carrier..."
          options={STOP_LOSS_CARRIERS}
        />
      </Field>

      {data.specificCarrier === 'other' && (
        <Field label="Specify carrier" width="full">
          <TextInput
            value={data.specificCarrierOther || ''}
            onChange={v => update('specificCarrierOther', v)}
            placeholder="Carrier name"
          />
        </Field>
      )}

      {specWarning && (
        <Callout variant="warning">⚠️ {specWarning}</Callout>
      )}

      {/* Aggregate */}
      <SubHeading
        title="Aggregate stop-loss"
        helper="Caps total claims liability for the entire group. The carrier reimburses claims that exceed expected by more than the corridor."
      />

      <Field label=" " width="full">
        <Toggle
          checked={!!data.aggregateEnabled}
          onChange={v => update('aggregateEnabled', v)}
          label="Include aggregate stop-loss (recommended for groups under 200 lives)"
        />
      </Field>

      {data.aggregateEnabled && (
        <>
          <Field
            label="Aggregate corridor"
            helper="Total claims must exceed expected by this percentage before aggregate kicks in. 120-125% is standard."
            width="half"
          >
            <PercentInput
              value={data.aggregateCorridor}
              onChange={v => update('aggregateCorridor', v)}
              placeholder="e.g. 125"
            />
          </Field>

          <Field label=" " width="half">
            <Toggle
              checked={!!data.aggregatingSpecific}
              onChange={v => update('aggregatingSpecific', v)}
              label="Aggregating specific (members' claims roll up toward aggregate)"
            />
          </Field>
        </>
      )}

      {/* Contract type */}
      <SubHeading
        title="Contract type"
        helper="Defines which claims are eligible based on incurred and paid dates. Affects how claims runout is handled at renewal."
      />

      <Field label="Contract" width="full">
        <RadioGroup
          value={data.contractType || ''}
          onChange={v => update('contractType', v as StopLossConfig['contractType'])}
          options={[
            { value: '12_12', label: '12/12',  helper: 'Claims incurred AND paid in the 12-month policy year. Cheapest, but no runout coverage.' },
            { value: '12_15', label: '12/15',  helper: 'Claims incurred in 12, paid through month 15. The most common choice.' },
            { value: '24_12', label: '24/12',  helper: 'Claims incurred up to 24 months back, paid in 12. Good for first-year self-funded.' },
            { value: '12_24', label: '12/24',  helper: 'Claims incurred in 12, paid through 24. Best runout coverage; most expensive.' },
            { value: 'paid',  label: 'Paid contract', helper: 'Claims simply paid in the contract period. Less common.' },
          ]}
        />
      </Field>

      {/* Lasers */}
      <SubHeading
        title="Lasers"
        helper="Members the carrier wants to exclude or charge a higher specific deductible due to known high claims. List by internal ID, never name."
      />

      <Callout variant="info">
        <strong>Privacy:</strong> Use internal employee IDs (e.g. &quot;EE-12345&quot;) — never names, SSNs, or PHI. The PDF proposal won&apos;t include identifying info.
      </Callout>

      {(data.lasers || []).length === 0 ? (
        <Field label=" " width="full">
          <div style={emptyLasersBox}>
            <span style={{ fontSize: 13, color: '#3a4d68', fontFamily: 'Figtree, sans-serif' }}>
              No lasers. Click below if the carrier has flagged any members.
            </span>
          </div>
        </Field>
      ) : (
        <Field label=" " width="full">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(data.lasers || []).map((laser, idx) => (
              <div key={idx} style={laserRow}>
                <input
                  value={laser.memberLabel}
                  onChange={e => updateLaser(idx, { memberLabel: e.target.value })}
                  placeholder="e.g. EE-12345"
                  style={{ ...laserInput, flex: 1 }}
                />
                <div style={{ ...laserInput, display: 'flex', alignItems: 'center', flex: 1.2, padding: 0 }}>
                  <span style={laserAffix}>$</span>
                  <input
                    value={laser.customSpec}
                    onChange={e => updateLaser(idx, { customSpec: e.target.value })}
                    placeholder="Custom specific (e.g. 200000)"
                    type="number"
                    style={{ ...laserInput, border: 'none', flex: 1, padding: '8px 10px' }}
                  />
                </div>
                <input
                  value={laser.reason || ''}
                  onChange={e => updateLaser(idx, { reason: e.target.value })}
                  placeholder="Reason / condition"
                  style={{ ...laserInput, flex: 1.5 }}
                />
                <button
                  onClick={() => removeLaser(idx)}
                  style={removeBtn}
                  title="Remove laser"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </Field>
      )}

      <Field label=" " width="full">
        <button onClick={addLaser} style={addLaserBtn}>+ Add laser</button>
      </Field>

      <Field label=" " width="half">
        <Toggle
          checked={!!data.noNewLasers}
          onChange={v => update('noNewLasers', v)}
          label="No-new-lasers provision at renewal"
        />
      </Field>

      <Field
        label="Rate cap at renewal"
        helper="Max % the carrier can increase rates next year. Common: 50% rate cap."
        width="half"
      >
        <PercentInput
          value={data.rateCap}
          onChange={v => update('rateCap', v)}
          placeholder="e.g. 50"
        />
      </Field>

      {/* Disclosure */}
      <SubHeading
        title="Disclosure"
        helper="What the carrier knows about the group's claims history when underwriting."
      />

      <Field label=" " width="full">
        <RadioGroup
          value={data.disclosure || ''}
          onChange={v => update('disclosure', v as StopLossConfig['disclosure'])}
          options={[
            { value: 'full',         label: 'Full disclosure',       helper: 'All historical claims and known conditions disclosed. Cleanest underwriting, fewest surprises.' },
            { value: 'pass_through', label: 'Pass-through',          helper: 'Information shared but underwriter does not adjust rates for known claimants.' },
            { value: 'no_disclosure',label: 'No-disclosure quote',   helper: 'Aggressive: carrier quotes blind. Risk: lasers or rate-up if underwriter re-evaluates.' },
          ]}
        />
      </Field>

      {/* Notes */}
      <Field label="Stop-loss notes" width="full">
        <TextArea
          value={data.notes || ''}
          onChange={v => update('notes', v)}
          placeholder="e.g. Quoting against incumbent Sun Life renewal at $75K spec, 125% agg. Tokio Marine has a competing quote at $100K with no lasers."
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

const emptyLasersBox: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px dashed #cbd5e0',
  borderRadius: 6,
  padding: '12px 14px',
};

const laserRow: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
};

const laserInput: React.CSSProperties = {
  padding: '8px 10px',
  border: '1px solid #cbd5e0',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'Figtree, sans-serif',
  color: '#1e3a5f',
  background: '#fff',
  outline: 'none',
};

const laserAffix: React.CSSProperties = {
  padding: '0 10px',
  fontSize: 13,
  color: '#94a3b8',
  background: '#f8fafc',
  borderRight: '1px solid #cbd5e0',
  alignSelf: 'stretch',
  display: 'flex',
  alignItems: 'center',
};

const removeBtn: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #fecaca',
  color: '#dc2626',
  width: 32,
  height: 32,
  borderRadius: 6,
  cursor: 'pointer',
  fontFamily: 'Figtree, sans-serif',
  fontSize: 14,
  fontWeight: 600,
};

const addLaserBtn: React.CSSProperties = {
  background: '#fff',
  border: '1px dashed #cbd5e0',
  color: '#1e3a5f',
  padding: '8px 16px',
  borderRadius: 6,
  cursor: 'pointer',
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  fontWeight: 600,
};