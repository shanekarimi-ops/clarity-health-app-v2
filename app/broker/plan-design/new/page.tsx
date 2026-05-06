'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../supabase';
import BrokerSidebar from '../../../components/BrokerSidebar';

type Client = {
  id: string;
  employer_name: string | null;
  first_name: string;
  last_name: string;
  member_count: number | null;
  state: string | null;
};

type FundingModel = 'level_funded' | 'self_funded';

export default function NewPlanDesignPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agencyName, setAgencyName] = useState('');

  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [fundingModel, setFundingModel] = useState<FundingModel | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    loadEverything();
  }, []);

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

    // Load active clients in the agency (RLS handles agency filtering)
    const { data: clientRows, error } = await supabase
      .from('clients')
      .select('id, employer_name, first_name, last_name, member_count, state')
      .eq('status', 'active')
      .order('employer_name', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('Failed to load clients:', error);
    } else {
      setClients((clientRows as any) || []);
    }

    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  function handleClientSelect(c: Client) {
    setSelectedClient(c);
    setStep(2);
  }

  async function handleCreate() {
    if (!selectedClient || !fundingModel) return;
    setSubmitting(true);
    setSubmitError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setSubmitError('Not authenticated. Please log in again.');
        setSubmitting(false);
        return;
      }

      const res = await fetch('/api/plan-designs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClient.id,
          fundingModel,
          accessToken: session.access_token,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json?.error || 'Failed to create plan design');
        setSubmitting(false);
        return;
      }

      // Redirect to the wizard (P11.4 will build this page)
      router.push(`/broker/plan-design/${json.id}`);
    } catch (e: any) {
      console.error(e);
      setSubmitError(e?.message || 'Unexpected error');
      setSubmitting(false);
    }
  }

  // Filter clients by search
  const filteredClients = clients.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const employer = (c.employer_name || '').toLowerCase();
    const fullName = `${c.first_name} ${c.last_name}`.toLowerCase();
    return employer.includes(q) || fullName.includes(q);
  });

  if (loading) {
    return (
      <div style={{ padding: 40, color: '#1e3a5f', fontFamily: 'Figtree, sans-serif' }}>
        Loading...
      </div>
    );
  }

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

        <h1 style={pageTitle}>New plan design</h1>

        {/* Step indicator */}
        <div style={stepRow}>
          <div style={step === 1 ? stepActive : stepInactive}>
            <span style={stepNumber(step === 1)}>1</span> Pick a client
          </div>
          <div style={stepDivider} />
          <div style={step === 2 ? stepActive : stepInactive}>
            <span style={stepNumber(step === 2)}>2</span> Choose funding model
          </div>
        </div>

        {/* Step 1: pick client */}
        {step === 1 && (
          <div>
            {clients.length === 0 ? (
              <div style={emptyCard}>
                <h2 style={emptyTitle}>No clients yet</h2>
                <p style={emptyDesc}>
                  You need at least one client before creating a plan design.
                </p>
                <button style={primaryBtn} onClick={() => router.push('/broker/clients')}>
                  Add a client →
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Search by employer name or contact..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={searchInput}
                />
                <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', fontFamily: 'Figtree, sans-serif' }}>
                  Showing {filteredClients.length} of {clients.length} clients
                </div>

                <div style={clientGrid}>
                  {filteredClients.map(c => (
                    <ClientCard key={c.id} client={c} onSelect={() => handleClientSelect(c)} />
                  ))}
                </div>

                {filteredClients.length === 0 && (
                  <div style={{ ...emptyCard, marginTop: 16 }}>
                    <p style={{ ...emptyDesc, marginBottom: 0 }}>
                      No clients match &quot;{search}&quot;. Try a different search.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 2: funding model */}
        {step === 2 && selectedClient && (
          <div>
            <div style={selectedClientBanner}>
              <div>
                <span style={{ fontSize: 12, color: '#7a9b76', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Designing for
                </span>
                <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, color: '#1e3a5f', marginTop: 2 }}>
                  {selectedClient.employer_name || `${selectedClient.first_name} ${selectedClient.last_name}`}
                </div>
                <div style={{ fontSize: 13, color: '#3a4d68', marginTop: 2 }}>
                  Contact: {selectedClient.first_name} {selectedClient.last_name}
                  {selectedClient.member_count ? ` · ${selectedClient.member_count} members` : ''}
                </div>
              </div>
              <button style={changeClientLink} onClick={() => { setStep(1); setSelectedClient(null); setFundingModel(null); }}>
                Change client
              </button>
            </div>

            <h2 style={sectionTitle}>Choose a funding model</h2>
            <p style={sectionDesc}>
              This determines what you design in the wizard. Level-funded is bundled by a carrier — you tune the plan
              but the carrier supplies the network, TPA, PBM, and stop-loss together. Full self-funded gives you
              control over every component.
            </p>

            <div style={fundingGrid}>
              <FundingCard
                value="level_funded"
                title="Level-funded"
                tagline="Carrier-bundled, simpler to design"
                bundled={['Network', 'TPA', 'PBM', 'Stop-loss']}
                designed={['Plan structure (deductible, OOP, copays)', 'Eligibility rules', 'Carve-outs (dental, vision, etc.)']}
                bestFor={[
                  'Groups under 100 lives',
                  'First-time self-insurers',
                  'Predictable monthly cost is a priority',
                  'You want a single carrier relationship',
                ]}
                selected={fundingModel === 'level_funded'}
                onSelect={() => setFundingModel('level_funded')}
              />

              <FundingCard
                value="self_funded"
                title="Full self-funded"
                tagline="You design every component"
                bundled={[]}
                designed={[
                  'Plan structure',
                  'Network (PPO rental — your choice)',
                  'Stop-loss (specific & aggregate, your carrier)',
                  'TPA (your choice)',
                  'PBM (your choice + rebate model)',
                  'Eligibility rules',
                  'Carve-outs',
                ]}
                bestFor={[
                  'Groups 100+ lives',
                  'Experienced self-insurers',
                  'Cost transparency is the priority',
                  'You want to capture rebates and trim layers',
                ]}
                selected={fundingModel === 'self_funded'}
                onSelect={() => setFundingModel('self_funded')}
              />
            </div>

            {submitError && (
              <div style={errorBanner}>
                <strong>Error:</strong> {submitError}
              </div>
            )}

            <div style={ctaRow}>
              <button style={secondaryBtn} onClick={() => { setStep(1); setFundingModel(null); }}>
                ← Back
              </button>
              <button
                style={fundingModel ? primaryBtn : primaryBtnDisabled}
                disabled={!fundingModel || submitting}
                onClick={handleCreate}
              >
                {submitting ? 'Creating...' : 'Create plan design →'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================
// Client card
// ============================================
function ClientCard({ client, onSelect }: { client: Client; onSelect: () => void }) {
  const employer = client.employer_name?.trim() || `${client.first_name} ${client.last_name}`;
  const contactName = `${client.first_name} ${client.last_name}`.trim();
  return (
    <div style={clientCard} onClick={onSelect} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(); }}
    >
      <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, color: '#1e3a5f', marginBottom: 4 }}>
        {employer}
      </div>
      <div style={{ fontSize: 13, color: '#3a4d68', marginBottom: 8 }}>
        Contact: {contactName}
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', gap: 6 }}>
        {client.member_count ? <span>{client.member_count} members</span> : <span>Members TBD</span>}
        {client.state ? <span>· {client.state}</span> : null}
      </div>
    </div>
  );
}

// ============================================
// Funding model card
// ============================================
function FundingCard({
  value, title, tagline, bundled, designed, bestFor, selected, onSelect,
}: {
  value: FundingModel;
  title: string;
  tagline: string;
  bundled: string[];
  designed: string[];
  bestFor: string[];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      style={{
        ...fundingCard,
        borderColor: selected ? '#7a9b76' : '#e2e8f0',
        background: selected ? '#f7faf6' : '#fff',
        boxShadow: selected ? '0 0 0 3px #7a9b7622' : 'none',
      }}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(); }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <h3 style={fundingTitle}>{title}</h3>
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          border: `2px solid ${selected ? '#7a9b76' : '#cbd5e0'}`,
          background: selected ? '#7a9b76' : '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 14, fontWeight: 600,
        }}>
          {selected ? '✓' : ''}
        </div>
      </div>
      <p style={fundingTagline}>{tagline}</p>

      {bundled.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={fundingLabel}>Bundled by carrier</div>
          <ul style={fundingList}>
            {bundled.map(b => <li key={b}>{b}</li>)}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <div style={fundingLabel}>You design</div>
        <ul style={fundingList}>
          {designed.map(d => <li key={d}>{d}</li>)}
        </ul>
      </div>

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
        <div style={fundingLabel}>Best for</div>
        <ul style={fundingList}>
          {bestFor.map(b => <li key={b}>{b}</li>)}
        </ul>
      </div>
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
  marginBottom: 16,
};

const pageTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 32,
  color: '#1e3a5f',
  margin: '0 0 24px',
};

const stepRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 28,
  fontFamily: 'Figtree, sans-serif',
};

const stepBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 14,
  fontWeight: 600,
};

const stepActive: React.CSSProperties = {
  ...stepBase,
  color: '#1e3a5f',
};

const stepInactive: React.CSSProperties = {
  ...stepBase,
  color: '#94a3b8',
};

const stepNumber = (active: boolean): React.CSSProperties => ({
  width: 26,
  height: 26,
  borderRadius: '50%',
  background: active ? '#1e3a5f' : '#e2e8f0',
  color: active ? '#fff' : '#94a3b8',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 13,
});

const stepDivider: React.CSSProperties = {
  height: 1,
  width: 40,
  background: '#e2e8f0',
};

const searchInput: React.CSSProperties = {
  width: '100%',
  maxWidth: 480,
  padding: '12px 14px',
  border: '1px solid #cbd5e0',
  borderRadius: 8,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 14,
  color: '#1e3a5f',
  outline: 'none',
};

const clientGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 12,
  marginTop: 12,
};

const clientCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 16,
  fontFamily: 'Figtree, sans-serif',
  cursor: 'pointer',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

const emptyCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: '32px 24px',
  textAlign: 'center',
  fontFamily: 'Figtree, sans-serif',
};

const emptyTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  color: '#1e3a5f',
  fontSize: 22,
  margin: '0 0 8px',
};

const emptyDesc: React.CSSProperties = {
  color: '#3a4d68',
  fontSize: 14,
  lineHeight: 1.5,
  margin: '0 auto 16px',
  maxWidth: 480,
};

const selectedClientBanner: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: '16px 18px',
  marginBottom: 24,
  fontFamily: 'Figtree, sans-serif',
};

const changeClientLink: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#7a9b76',
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
};

const sectionTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  color: '#1e3a5f',
  fontSize: 22,
  margin: '0 0 6px',
};

const sectionDesc: React.CSSProperties = {
  fontFamily: 'Figtree, sans-serif',
  color: '#3a4d68',
  fontSize: 14,
  lineHeight: 1.5,
  margin: '0 0 20px',
  maxWidth: 720,
};

const fundingGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: 16,
  marginBottom: 24,
};

const fundingCard: React.CSSProperties = {
  border: '2px solid #e2e8f0',
  borderRadius: 12,
  padding: 22,
  fontFamily: 'Figtree, sans-serif',
  cursor: 'pointer',
  transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
};

const fundingTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  color: '#1e3a5f',
  fontSize: 22,
  margin: 0,
};

const fundingTagline: React.CSSProperties = {
  color: '#3a4d68',
  fontSize: 13,
  margin: '4px 0 0',
};

const fundingLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#7a9b76',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 4,
};

const fundingList: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  color: '#3a4d68',
  fontSize: 13,
  lineHeight: 1.7,
};

const ctaRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: 8,
};

const primaryBtn: React.CSSProperties = {
  background: '#1e3a5f',
  color: '#fff',
  border: 'none',
  padding: '12px 22px',
  borderRadius: 8,
  fontFamily: 'Figtree, sans-serif',
  fontWeight: 600,
  fontSize: 14,
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
  padding: '12px 22px',
  borderRadius: 8,
  fontFamily: 'Figtree, sans-serif',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
};

const errorBanner: React.CSSProperties = {
  background: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#991b1b',
  borderRadius: 8,
  padding: '12px 16px',
  marginBottom: 16,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 14,
};