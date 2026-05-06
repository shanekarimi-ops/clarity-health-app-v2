'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '../../../supabase';
import BrokerSidebar from '../../../components/BrokerSidebar';
import SectionGroup, { GroupBasics } from './sections/SectionGroup';
import SectionPlan, { PlanStructure } from './sections/SectionPlan';
import SectionNetwork, { NetworkConfig } from './sections/SectionNetwork';
import SectionStopLoss, { StopLossConfig } from './sections/SectionStopLoss';
import SectionTPA, { TPAConfig } from './sections/SectionTPA';
import SectionPBM, { PBMConfig } from './sections/SectionPBM';
import SectionEligibility, { EligibilityConfig } from './sections/SectionEligibility';
import SectionCarveOuts, { CarveOutsConfig } from './sections/SectionCarveOuts';

type FundingModel = 'level_funded' | 'self_funded';
type Status = 'draft' | 'finalized' | 'archived';

type PlanDesign = {
  id: string;
  client_id: string;
  agency_id: string;
  name: string;
  funding_model: FundingModel;
  status: Status;
  effective_date: string | null;
  design: any;
  created_at: string;
  updated_at: string;
  clients?: {
    id: string;
    employer_name: string | null;
    first_name: string;
    last_name: string;
    member_count: number | null;
    state: string | null;
  } | null;
};

type SectionDef = {
  key: string;
  title: string;
  shortTitle: string;
  description: string;
  bundledForLevelFunded?: boolean;
};

const SECTIONS: SectionDef[] = [
  { key: 'group',       title: 'Group basics',     shortTitle: 'Group',      description: 'Effective date, group size, industry, demographics' },
  { key: 'plan',        title: 'Plan structure',   shortTitle: 'Plan',       description: 'Deductible, out-of-pocket max, coinsurance, copays, Rx tiers' },
  { key: 'network',     title: 'Network',          shortTitle: 'Network',    description: 'PPO/HMO network selection and access tier', bundledForLevelFunded: true },
  { key: 'stoploss',    title: 'Stop-loss',        shortTitle: 'Stop-loss',  description: 'Specific deductible, aggregate corridor, contract type', bundledForLevelFunded: true },
  { key: 'tpa',         title: 'TPA',              shortTitle: 'TPA',        description: 'Third-party administrator selection and admin fees', bundledForLevelFunded: true },
  { key: 'pbm',         title: 'PBM',              shortTitle: 'PBM',        description: 'Pharmacy benefit manager, formulary, rebate model', bundledForLevelFunded: true },
  { key: 'eligibility', title: 'Eligibility',      shortTitle: 'Eligibility', description: 'Waiting period, dependent age, domestic partner rules' },
  { key: 'carveouts',   title: 'Carve-outs',       shortTitle: 'Carve-outs', description: 'Dental, vision, EAP, telehealth, ancillary lines' },
  { key: 'projection',  title: 'AI cost projection', shortTitle: 'Projection', description: 'AI-estimated expected claims, fixed costs, max liability' },
  { key: 'review',      title: 'Review & export',  shortTitle: 'Review',     description: 'Final review and PDF proposal export' },
];

export default function PlanDesignWizardPage() {
  const router = useRouter();
  const params = useParams();
  const designId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agencyName, setAgencyName] = useState('');

  const [planDesign, setPlanDesign] = useState<PlanDesign | null>(null);
  const [name, setName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [design, setDesign] = useState<any>({});
  const [activeSection, setActiveSection] = useState(0);

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (designId) loadEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designId]);

  async function loadEverything() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    const meta = user.user_metadata || {};
    setFirstName(meta.first_name || '');
    setLastName(meta.last_name || '');

    const { data: brokerRow } = await supabase
      .from('brokers')
      .select('agency_id, agencies(name)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (brokerRow?.agencies) {
      const agency: any = Array.isArray(brokerRow.agencies)
        ? brokerRow.agencies[0]
        : brokerRow.agencies;
      setAgencyName(agency?.name || '');
    }

    const { data, error } = await supabase
      .from('plan_designs')
      .select(`
        id, client_id, agency_id, name, funding_model, status, effective_date,
        design, created_at, updated_at,
        clients(id, employer_name, first_name, last_name, member_count, state)
      `)
      .eq('id', designId)
      .maybeSingle();

    if (error) {
      console.error(error);
      setLoadError(error.message || 'Failed to load plan design');
      setLoading(false);
      return;
    }
    if (!data) {
      setLoadError('Plan design not found, or you do not have access.');
      setLoading(false);
      return;
    }

    setPlanDesign(data as any);
    setName((data as any).name || '');
    setDesign((data as any).design || {});
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  // ============================================
  // Autosave
  // ============================================
  const triggerAutosave = useCallback(
    (overrides: { name?: string; design?: any } = {}) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveStatus('saving');
      saveTimerRef.current = setTimeout(async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) {
            setSaveStatus('error');
            return;
          }
          const payload: any = { accessToken: session.access_token };
          if (overrides.name !== undefined) payload.name = overrides.name;
          if (overrides.design !== undefined) payload.design = overrides.design;

          const res = await fetch(`/api/plan-designs/${designId}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            console.error('Autosave failed:', json);
            setSaveStatus('error');
            return;
          }
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus(s => s === 'saved' ? 'idle' : s), 2000);
        } catch (e) {
          console.error(e);
          setSaveStatus('error');
        }
      }, 800);
    },
    [designId]
  );

  function handleNameBlur() {
    setEditingName(false);
    if (planDesign && name.trim() && name.trim() !== planDesign.name) {
      triggerAutosave({ name: name.trim() });
    } else if (!name.trim()) {
      setName(planDesign?.name || '');
    }
  }

  function updateDesignSection(sectionKey: string, value: any) {
    const next = { ...design, [sectionKey]: value };
    setDesign(next);
    triggerAutosave({ design: next });
  }

  // ============================================
  // Section completion logic
  // ============================================
  function sectionState(sec: SectionDef): 'empty' | 'partial' | 'complete' | 'locked' {
    if (planDesign?.funding_model === 'level_funded' && sec.bundledForLevelFunded) {
      return 'locked';
    }
    const data = design?.[sec.key];
    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) return 'empty';

    if (sec.key === 'group') {
      const g = data as GroupBasics;
      const hasAll = g.effectiveDate && g.groupSize;
      return hasAll ? 'complete' : 'partial';
    }
    if (sec.key === 'plan') {
      const p = data as PlanStructure;
      const hasCore =
        p.deductibleInNetSingle && p.deductibleInNetFamily &&
        p.oopMaxInNetSingle && p.oopMaxInNetFamily &&
        p.coinsuranceInNet !== undefined;
      return hasCore ? 'complete' : 'partial';
    }
    if (sec.key === 'network') {
      const n = data as NetworkConfig;
      if (!n.networkType) return 'partial';
      if (n.networkType === 'rbp') {
        return n.rbpMultiplier ? 'complete' : 'partial';
      }
      return (n.networkCarrier && n.networkTier) ? 'complete' : 'partial';
    }
    if (sec.key === 'stoploss') {
      const s = data as StopLossConfig;
      const hasCore = s.specificDeductible && s.specificCarrier && s.contractType;
      return hasCore ? 'complete' : 'partial';
    }
    if (sec.key === 'tpa') {
      const t = data as TPAConfig;
      const hasCore = t.tpaName && t.adminFeeStructure;
      return hasCore ? 'complete' : 'partial';
    }
    if (sec.key === 'pbm') {
      const p = data as PBMConfig;
      const hasCore = p.pbmName && p.pricingModel;
      return hasCore ? 'complete' : 'partial';
    }
    if (sec.key === 'eligibility') {
      const e = data as EligibilityConfig;
      // Required: waiting period choice
      return e.waitingPeriod ? 'complete' : 'partial';
    }
    if (sec.key === 'carveouts') {
      // Carve-outs is always optional — being touched at all = complete
      return 'complete';
    }
    return 'partial';
  }

  // ============================================
  // Render
  // ============================================
  if (loading) {
    return (
      <div style={{ padding: 40, color: '#1e3a5f', fontFamily: 'Figtree, sans-serif' }}>
        Loading plan design...
      </div>
    );
  }

  if (loadError || !planDesign) {
    return (
      <div className="dash-layout">
        <BrokerSidebar
          active="plan-design"
          firstName={firstName}
          lastName={lastName}
          agencyName={agencyName}
          onLogout={handleLogout}
        />
        <main className="dash-main">
          <button style={backLink} onClick={() => router.push('/broker/plan-design')}>
            ← Back to plan designs
          </button>
          <div style={errorBanner}>
            <strong>Error:</strong> {loadError || 'Could not load plan design'}
          </div>
        </main>
      </div>
    );
  }

  const clientLabel =
    planDesign.clients?.employer_name?.trim() ||
    `${planDesign.clients?.first_name || ''} ${planDesign.clients?.last_name || ''}`.trim() ||
    'Unknown client';

  const fundingLabel = planDesign.funding_model === 'self_funded' ? 'Self-funded' : 'Level-funded';
  const fundingColor = planDesign.funding_model === 'self_funded' ? '#1e3a5f' : '#7a9b76';

  const statusLabel =
    planDesign.status === 'draft' ? 'Draft' :
    planDesign.status === 'finalized' ? 'Finalized' :
    'Archived';
  const statusColor =
    planDesign.status === 'draft' ? '#d97706' :
    planDesign.status === 'finalized' ? '#7a9b76' :
    '#94a3b8';

  const activeSec = SECTIONS[activeSection];
  const isLocked =
    planDesign.funding_model === 'level_funded' && activeSec.bundledForLevelFunded === true;

  return (
    <div className="dash-layout">
      <BrokerSidebar
        active="plan-design"
        firstName={firstName}
        lastName={lastName}
        agencyName={agencyName}
        onLogout={handleLogout}
      />

      <main className="dash-main" style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Top bar */}
        <div style={topBar}>
          <button style={backLink} onClick={() => router.push('/broker/plan-design')}>
            ← Back to plan designs
          </button>

          <div style={topBarRight}>
            <span style={saveIndicator(saveStatus)}>
              {saveStatus === 'saving' && '💾 Saving...'}
              {saveStatus === 'saved' && '✓ Saved'}
              {saveStatus === 'error' && '⚠ Save failed'}
              {saveStatus === 'idle' && ' '}
            </span>
            <button style={primaryBtn} onClick={() => router.push('/broker/plan-design')}>
              Save & exit
            </button>
          </div>
        </div>

        {/* Header */}
        <div style={designHeader}>
          <div style={{ flex: 1 }}>
            {editingName ? (
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                autoFocus
                style={nameInput}
              />
            ) : (
              <h1
                style={designTitle}
                onClick={() => setEditingName(true)}
                title="Click to rename"
              >
                {name || 'Untitled plan design'} <span style={editPencil}>✎</span>
              </h1>
            )}
            <div style={designMeta}>
              <span>👥 {clientLabel}</span>
              <span style={{ ...fundingPill, background: fundingColor + '15', color: fundingColor }}>
                {fundingLabel}
              </span>
              <span style={{ ...statusPill, background: statusColor + '22', color: statusColor }}>
                {statusLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Body: left rail + content */}
        <div style={bodyRow}>
          {/* Section nav */}
          <nav style={sectionNav}>
            {SECTIONS.map((sec, idx) => {
              const state = sectionState(sec);
              const isActive = idx === activeSection;
              return (
                <button
                  key={sec.key}
                  onClick={() => setActiveSection(idx)}
                  style={{
                    ...sectionNavItem,
                    background: isActive ? '#1e3a5f' : 'transparent',
                    color: isActive ? '#fff' : (state === 'locked' ? '#94a3b8' : '#3a4d68'),
                    fontWeight: isActive ? 600 : 500,
                  }}
                >
                  <span style={navMarker(state, isActive)}>
                    {state === 'locked' ? '🔒' :
                     state === 'complete' ? '●' :
                     state === 'partial' ? '◐' : '○'}
                  </span>
                  <span style={{ fontSize: 12, opacity: 0.6, marginRight: 4 }}>{idx + 1}.</span>
                  <span>{sec.shortTitle}</span>
                </button>
              );
            })}
          </nav>

          {/* Active section */}
          <div style={sectionContent}>
            <h2 style={sectionTitle}>{activeSec.title}</h2>
            <p style={sectionDesc}>{activeSec.description}</p>

            {isLocked ? (
              <div style={lockedNotice}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
                <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, color: '#1e3a5f', marginBottom: 6 }}>
                  Bundled by carrier
                </div>
                <p style={{ color: '#3a4d68', fontSize: 13, lineHeight: 1.5, margin: 0, maxWidth: 420 }}>
                  Because you chose <strong>level-funded</strong>, this is bundled into the carrier&apos;s package. The carrier
                  picks the {activeSec.shortTitle.toLowerCase()} as part of the level-funded program. You don&apos;t design
                  this directly — but it will still appear in the final proposal.
                </p>
              </div>
            ) : activeSec.key === 'group' ? (
              <SectionGroup
                data={design.group || {}}
                onChange={(next) => updateDesignSection('group', next)}
                prefilledMemberCount={planDesign.clients?.member_count ?? null}
                prefilledState={planDesign.clients?.state ?? null}
              />
            ) : activeSec.key === 'plan' ? (
              <SectionPlan
                data={design.plan || {}}
                onChange={(next) => updateDesignSection('plan', next)}
              />
            ) : activeSec.key === 'network' ? (
              <SectionNetwork
                data={design.network || {}}
                onChange={(next) => updateDesignSection('network', next)}
              />
            ) : activeSec.key === 'stoploss' ? (
              <SectionStopLoss
                data={design.stoploss || {}}
                onChange={(next) => updateDesignSection('stoploss', next)}
              />
            ) : activeSec.key === 'tpa' ? (
              <SectionTPA
                data={design.tpa || {}}
                onChange={(next) => updateDesignSection('tpa', next)}
              />
            ) : activeSec.key === 'pbm' ? (
              <SectionPBM
                data={design.pbm || {}}
                onChange={(next) => updateDesignSection('pbm', next)}
              />
            ) : activeSec.key === 'eligibility' ? (
              <SectionEligibility
                data={design.eligibility || {}}
                onChange={(next) => updateDesignSection('eligibility', next)}
              />
            ) : activeSec.key === 'carveouts' ? (
              <SectionCarveOuts
                data={design.carveouts || {}}
                onChange={(next) => updateDesignSection('carveouts', next)}
              />
            ) : (
              <div style={placeholderBox}>
                <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
                  Coming soon
                </div>
                <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, color: '#1e3a5f', marginBottom: 6 }}>
                  Section {activeSection + 1} — {activeSec.title}
                </div>
                <p style={{ color: '#3a4d68', fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                  This section&apos;s editor lands in a follow-up push. The autosave plumbing, navigation, and persistence are all in place — when the
                  fields go in, they&apos;ll save automatically as you type.
                </p>
              </div>
            )}

            {/* Footer nav */}
            <div style={footerNav}>
              <button
                style={activeSection === 0 ? secondaryBtnDisabled : secondaryBtn}
                disabled={activeSection === 0}
                onClick={() => setActiveSection(s => Math.max(0, s - 1))}
              >
                ← Previous
              </button>
              <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'Figtree, sans-serif' }}>
                Section {activeSection + 1} of {SECTIONS.length}
              </span>
              <button
                style={activeSection === SECTIONS.length - 1 ? primaryBtnDisabled : primaryBtn}
                disabled={activeSection === SECTIONS.length - 1}
                onClick={() => setActiveSection(s => Math.min(SECTIONS.length - 1, s + 1))}
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ============================================
// Styles
// ============================================
const backLink: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#3a4d68',
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
};

const topBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 16,
  flexWrap: 'wrap',
  gap: 12,
};

const topBarRight: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  fontFamily: 'Figtree, sans-serif',
};

const saveIndicator = (status: 'idle' | 'saving' | 'saved' | 'error'): React.CSSProperties => ({
  fontSize: 12,
  fontWeight: 500,
  color: status === 'error' ? '#991b1b' : status === 'saved' ? '#7a9b76' : '#94a3b8',
  minWidth: 80,
  textAlign: 'right',
  fontFamily: 'Figtree, sans-serif',
});

const designHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: 24,
  paddingBottom: 16,
  borderBottom: '1px solid #e2e8f0',
};

const designTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 28,
  color: '#1e3a5f',
  margin: '0 0 8px',
  cursor: 'pointer',
  display: 'inline-block',
};

const editPencil: React.CSSProperties = {
  fontSize: 16,
  color: '#94a3b8',
  marginLeft: 6,
};

const nameInput: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 28,
  color: '#1e3a5f',
  border: '1px solid #cbd5e0',
  borderRadius: 6,
  padding: '4px 10px',
  outline: 'none',
  width: '100%',
  maxWidth: 600,
  marginBottom: 8,
};

const designMeta: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  fontFamily: 'Figtree, sans-serif',
  color: '#3a4d68',
  fontSize: 13,
};

const fundingPill: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: '3px 10px',
  borderRadius: 999,
};

const statusPill: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: '3px 10px',
  borderRadius: 999,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

const bodyRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '240px 1fr',
  gap: 24,
  alignItems: 'flex-start',
};

const sectionNav: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  position: 'sticky',
  top: 16,
  fontFamily: 'Figtree, sans-serif',
};

const sectionNavItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '10px 12px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  textAlign: 'left',
  transition: 'background 0.15s',
};

const navMarker = (
  state: 'empty' | 'partial' | 'complete' | 'locked',
  isActive: boolean,
): React.CSSProperties => ({
  fontSize: 11,
  width: 16,
  display: 'inline-block',
  textAlign: 'center',
  color: state === 'locked' ? '#94a3b8' :
         state === 'complete' ? '#7a9b76' :
         state === 'partial' ? '#d97706' :
         (isActive ? '#fff' : '#cbd5e0'),
});

const sectionContent: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: 28,
  fontFamily: 'Figtree, sans-serif',
  minHeight: 400,
};

const sectionTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  color: '#1e3a5f',
  fontSize: 24,
  margin: '0 0 6px',
};

const sectionDesc: React.CSSProperties = {
  fontFamily: 'Figtree, sans-serif',
  color: '#3a4d68',
  fontSize: 14,
  margin: '0 0 20px',
  lineHeight: 1.5,
};

const placeholderBox: React.CSSProperties = {
  background: '#faf7f2',
  border: '1px dashed #d4dae2',
  borderRadius: 10,
  padding: 24,
  marginBottom: 24,
};

const lockedNotice: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: '32px 24px',
  textAlign: 'center',
  marginBottom: 24,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

const footerNav: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingTop: 24,
  marginTop: 24,
  borderTop: '1px solid #f1f5f9',
};

const primaryBtn: React.CSSProperties = {
  background: '#1e3a5f',
  color: '#fff',
  border: 'none',
  padding: '10px 18px',
  borderRadius: 8,
  fontFamily: 'Figtree, sans-serif',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
};

const primaryBtnDisabled: React.CSSProperties = {
  ...primaryBtn,
  background: '#cbd5e0',
  cursor: 'not-allowed',
};

const secondaryBtn: React.CSSProperties = {
  background: '#fff',
  color: '#3a4d68',
  border: '1px solid #cbd5e0',
  padding: '10px 18px',
  borderRadius: 8,
  fontFamily: 'Figtree, sans-serif',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
};

const secondaryBtnDisabled: React.CSSProperties = {
  ...secondaryBtn,
  color: '#cbd5e0',
  cursor: 'not-allowed',
};

const errorBanner: React.CSSProperties = {
  background: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#991b1b',
  borderRadius: 8,
  padding: '12px 16px',
  fontFamily: 'Figtree, sans-serif',
  fontSize: 14,
};