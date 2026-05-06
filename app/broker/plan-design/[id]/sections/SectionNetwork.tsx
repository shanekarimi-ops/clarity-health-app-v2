'use client';

import React from 'react';
import {
  Field, FormGrid, TextInput, Select, Toggle, RadioGroup, SubHeading, Callout,
} from './FormControls';

export type NetworkConfig = {
  // Core network
  networkType?: 'ppo' | 'hmo' | 'epo' | 'pos' | 'rbp';
  networkCarrier?: string;
  networkCarrierOther?: string;
  networkTier?: 'broad' | 'narrow' | 'tiered';

  // Reference-based pricing (alternative to traditional networks)
  rbpEnabled?: boolean;
  rbpMultiplier?: string | number;

  // Wraparound / travel
  outOfAreaNetwork?: boolean;
  outOfAreaNotes?: string;

  // Telehealth
  telehealthVendor?: string;
  telehealthCopay?: string | number;

  // Utilization management
  umVendor?: string;

  // Notes
  notes?: string;
};

const NETWORK_CARRIERS = [
  { value: 'aetna',         label: 'Aetna' },
  { value: 'anthem',        label: 'Anthem BCBS' },
  { value: 'bcbs',          label: 'BCBS (other state Blue)' },
  { value: 'cigna',         label: 'Cigna' },
  { value: 'uhc',           label: 'UnitedHealthcare' },
  { value: 'humana',        label: 'Humana' },
  { value: 'kaiser',        label: 'Kaiser Permanente' },
  { value: 'first_health',  label: 'First Health (Coventry)' },
  { value: 'phcs',          label: 'PHCS / MultiPlan' },
  { value: 'hmsa',          label: 'HMSA' },
  { value: 'regional',      label: 'Regional / state-specific' },
  { value: 'custom',        label: 'Custom / direct contract' },
  { value: 'other',         label: 'Other' },
];

export default function SectionNetwork({
  data,
  onChange,
}: {
  data: NetworkConfig;
  onChange: (next: NetworkConfig) => void;
}) {
  function update<K extends keyof NetworkConfig>(key: K, value: NetworkConfig[K]) {
    onChange({ ...data, [key]: value });
  }

  const isRbp = data.networkType === 'rbp';

  return (
    <FormGrid>
      <SubHeading
        title="Network model"
        helper="The shape of the provider network determines access, discounts, and member experience."
      />

      <Field
        label="Network type"
        helper="PPO is most common for self-funded; RBP is the cost-saving alternative with no traditional network."
        width="full"
        required
      >
        <RadioGroup
          value={data.networkType || ''}
          onChange={v => update('networkType', v as NetworkConfig['networkType'])}
          options={[
            { value: 'ppo', label: 'PPO',  helper: 'Preferred Provider Organization. Member can go in or out of network. Most common for self-funded.' },
            { value: 'hmo', label: 'HMO',  helper: 'Health Maintenance Organization. Requires PCP referrals; generally in-network only.' },
            { value: 'epo', label: 'EPO',  helper: 'Exclusive Provider Organization. In-network only, no referrals required.' },
            { value: 'pos', label: 'POS',  helper: 'Point of Service. Hybrid PPO/HMO with PCP gatekeeper.' },
            { value: 'rbp', label: 'Reference-based pricing (RBP)', helper: 'No traditional network. Plan pays a multiple of Medicare. Big savings, more member friction.' },
          ]}
        />
      </Field>

      {/* Traditional network details */}
      {!isRbp && data.networkType && (
        <>
          <SubHeading title="Network selection" />

          <Field label="Network carrier / lessor" width="half" required>
            <Select
              value={data.networkCarrier || ''}
              onChange={v => update('networkCarrier', v)}
              placeholder="Select carrier..."
              options={NETWORK_CARRIERS}
            />
          </Field>

          {(data.networkCarrier === 'regional' || data.networkCarrier === 'custom' || data.networkCarrier === 'other') && (
            <Field label="Specify" width="half">
              <TextInput
                value={data.networkCarrierOther || ''}
                onChange={v => update('networkCarrierOther', v)}
                placeholder="e.g. Wellmark BCBS Iowa"
              />
            </Field>
          )}

          <Field
            label="Network breadth"
            helper="Broad is largest network with smallest discounts; narrow trades access for deeper discounts; tiered uses both."
            width="full"
          >
            <RadioGroup
              value={data.networkTier || ''}
              onChange={v => update('networkTier', v as NetworkConfig['networkTier'])}
              options={[
                { value: 'broad',  label: 'Broad',   helper: 'Maximum access, smallest discounts (e.g. Aetna Open Choice, Cigna PPO, BCBS PPO)' },
                { value: 'narrow', label: 'Narrow',  helper: 'Curated provider list, deeper discounts (10-30% lower than broad)' },
                { value: 'tiered', label: 'Tiered',  helper: 'In-network is split into preferred/non-preferred with different cost-shares' },
              ]}
            />
          </Field>
        </>
      )}

      {/* RBP details */}
      {isRbp && (
        <>
          <Callout variant="info">
            <strong>Heads up:</strong> RBP plans pay providers a multiple of Medicare rates instead of negotiated network rates.
            They typically save 20-30% but expose members to potential balance billing. Strong member advocacy and PPO wraparound are recommended.
          </Callout>

          <Field
            label="Reference price (% of Medicare)"
            helper="Common range is 120% – 200% of Medicare. Higher = less provider pushback but smaller savings."
            width="half"
          >
            <TextInput
              value={data.rbpMultiplier !== undefined ? String(data.rbpMultiplier) : ''}
              onChange={v => update('rbpMultiplier', v)}
              type="number"
              suffix="%"
              placeholder="e.g. 150"
            />
          </Field>

          <Field
            label="PPO wraparound carrier"
            helper="Optional. A traditional PPO sits behind RBP for facilities that won't accept RBP."
            width="half"
          >
            <Select
              value={data.networkCarrier || ''}
              onChange={v => update('networkCarrier', v)}
              placeholder="None"
              options={[{ value: '', label: 'No wraparound' }, ...NETWORK_CARRIERS]}
            />
          </Field>
        </>
      )}

      {/* Out-of-area */}
      <SubHeading
        title="Travel and out-of-area access"
        helper="Important for groups with remote workers or employees who travel frequently."
      />

      <Field label=" " width="full">
        <Toggle
          checked={!!data.outOfAreaNetwork}
          onChange={v => update('outOfAreaNetwork', v)}
          label="Group has employees outside the primary network area"
        />
      </Field>

      {data.outOfAreaNetwork && (
        <Field
          label="Out-of-area access notes"
          helper="States with remote employees, BlueCard reciprocity, etc."
          width="full"
        >
          <TextInput
            value={data.outOfAreaNotes || ''}
            onChange={v => update('outOfAreaNotes', v)}
            placeholder="e.g. 12 employees in CA/OR/WA — using BlueCard reciprocity through Anthem"
          />
        </Field>
      )}

      {/* Telehealth */}
      <SubHeading
        title="Telehealth"
        helper="Often carved out from the medical network with $0 or low-copay access."
      />

      <Field label="Telehealth vendor" width="half">
        <TextInput
          value={data.telehealthVendor || ''}
          onChange={v => update('telehealthVendor', v)}
          placeholder="e.g. Teladoc, MDLive, included w/ carrier"
        />
      </Field>

      <Field label="Telehealth copay" width="half" helper="$0 is increasingly common to encourage utilization.">
        <TextInput
          value={data.telehealthCopay !== undefined ? String(data.telehealthCopay) : ''}
          onChange={v => update('telehealthCopay', v)}
          type="number"
          prefix="$"
          placeholder="e.g. 0"
        />
      </Field>

      {/* Utilization management */}
      <SubHeading
        title="Utilization management"
        helper="Pre-certification, case management, prior auth. Often bundled with the TPA but sometimes standalone."
      />

      <Field
        label="UM vendor"
        helper="Leave blank if bundled with TPA."
        width="full"
      >
        <TextInput
          value={data.umVendor || ''}
          onChange={v => update('umVendor', v)}
          placeholder="e.g. Bundled with TPA, or eviCore, AIM, Cohere"
        />
      </Field>

      {/* Notes */}
      <Field label="Network notes" width="full">
        <TextInput
          value={data.notes || ''}
          onChange={v => update('notes', v)}
          placeholder="Any context about network selection rationale, provider gaps, member feedback, etc."
        />
      </Field>
    </FormGrid>
  );
}