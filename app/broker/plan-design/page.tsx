'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';
import BrokerSidebar from '../../components/BrokerSidebar';

type PlanDesign = {
  id: string;
  client_id: string;
  agency_id: string;
  created_by_user_id: string;
  name: string;
  funding_model: 'level_funded' | 'self_funded';
  status: 'draft' | 'finalized' | 'archived';
  effective_date: string | null;
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

export default function BrokerPlanDesignPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [agencyId, setAgencyId] = useState('');

  const [designs, setDesigns] = useState<PlanDesign[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loadError, setLoadError] = useState('');

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

    if (!brokerRow) {
      setLoadError('No broker profile found for your account. Contact your agency admin.');
      setLoading(false);
      return;
    }

    setAgencyId(brokerRow.agency_id);

    if (brokerRow.agencies) {
      const agency: any = Array.isArray(brokerRow.agencies)
        ? brokerRow.agencies[0]
        : brokerRow.agencies;
      setAgencyName(agency?.name || '');
    }

    await loadDesigns();
    setLoading(false);
  }

  async function loadDesigns() {
    const { data, error } = await supabase
      .from('plan_designs')
      .select(`
        id, client_id, agency_id, created_by_user_id, name, funding_model,
        status, effective_date, created_at, updated_at,
        clients(id, employer_name, first_name, last_name, member_count, state)
      `)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Failed to load plan designs:', error);
      setLoadError('Could not load plan designs. ' + (error.message || ''));
      return;
    }

    setDesigns((data as any) || []);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  function handleNewDesign() {
    router.push('/broker/plan-design/new');
  }

  function handleOpenDesign(id: string) {
    router.push(`/broker/plan-design/${id}`);
  }

  // Group designs by status
  const drafts = designs.filter(d => d.status === 'draft');
  const finalized = designs.filter(d => d.status === 'finalized');
  const archived = designs.filter(d => d.status === 'archived');

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
        <div style={headerRow}>
          <div>
            <h1 style={pageTitle}>Plan Design</h1>
            <p style={pageSubtitle}>
              Design self-funded health plans for your group clients — model benefits, project costs, export proposals
            </p>
          </div>
          <button style={primaryBtn} onClick={handleNewDesign}>
            + New Plan Design
          </button>
        </div>

        {loadError && (
          <div style={errorBanner}>
            <strong>Error:</strong> {loadError}
          </div>
        )}

        {/* Empty state */}
        {!loadError && designs.length === 0 && (
          <div style={emptyStateCard}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>📐</div>
            <h2 style={emptyStateTitle}>Design your first self-funded plan</h2>
            <p style={emptyStateDesc}>
              Build a complete plan design from the ground up — pick a client, choose level-funded or full self-funded,
              and walk through deductibles, networks, stop-loss, TPA, PBM, eligibility, and carve-outs.
              When you&apos;re ready, our AI will project expected costs and you can export a polished proposal PDF.
            </p>
            <button style={primaryBtnLarge} onClick={handleNewDesign}>
              + Start a new plan design
            </button>
          </div>
        )}

        {/* Drafts */}
        {drafts.length > 0 && (
          <div style={sectionWrap}>
            <div style={sectionHeader}>
              <h2 style={sectionTitle}>Drafts</h2>
              <span style={countPill}>{drafts.length}</span>
            </div>
            <div style={cardGrid}>
              {drafts.map(d => (
                <DesignCard key={d.id} design={d} onOpen={() => handleOpenDesign(d.id)} />
              ))}
            </div>
          </div>
        )}

        {/* Finalized */}
        {finalized.length > 0 && (
          <div style={sectionWrap}>
            <div style={sectionHeader}>
              <h2 style={sectionTitle}>Finalized</h2>
              <span style={countPill}>{finalized.length}</span>
            </div>
            <div style={cardGrid}>
              {finalized.map(d => (
                <DesignCard key={d.id} design={d} onOpen={() => handleOpenDesign(d.id)} />
              ))}
            </div>
          </div>
        )}

        {/* Archived (collapsed by default) */}
        {archived.length > 0 && (
          <div style={sectionWrap}>
            <button
              style={archivedToggle}
              onClick={() => setShowArchived(s => !s)}
            >
              {showArchived ? '▼' : '▶'} Archived ({archived.length})
            </button>
            {showArchived && (
              <div style={{ ...cardGrid, marginTop: 12, opacity: 0.65 }}>
                {archived.map(d => (
                  <DesignCard key={d.id} design={d} onOpen={() => handleOpenDesign(d.id)} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================
// Design card component
// ============================================
function DesignCard({
  design,
  onOpen,
}: {
  design: PlanDesign;
  onOpen: () => void;
}) {
  const clientName =
    design.clients?.employer_name?.trim() ||
    `${design.clients?.first_name || ''} ${design.clients?.last_name || ''}`.trim() ||
    'Unknown client';

  const memberCount = design.clients?.member_count;
  const state = design.clients?.state;

  const fundingLabel = design.funding_model === 'self_funded' ? 'Self-funded' : 'Level-funded';
  const fundingColor = design.funding_model === 'self_funded' ? '#1e3a5f' : '#7a9b76';

  const statusLabel =
    design.status === 'draft' ? 'Draft' :
    design.status === 'finalized' ? 'Finalized' :
    'Archived';
  const statusColor =
    design.status === 'draft' ? '#d97706' :
    design.status === 'finalized' ? '#7a9b76' :
    '#94a3b8';

  const lastEdited = formatRelativeTime(design.updated_at);

  return (
    <div style={designCard} onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
    >
      <div style={cardTopRow}>
        <span style={{ ...statusPill, background: statusColor + '22', color: statusColor }}>
          {statusLabel}
        </span>
        <span style={{ ...fundingPill, background: fundingColor + '15', color: fundingColor }}>
          {fundingLabel}
        </span>
      </div>

      <h3 style={designName}>{design.name || 'Untitled plan design'}</h3>

      <div style={clientLine}>
        <span style={{ fontSize: 13, color: '#3a4d68' }}>👥 {clientName}</span>
      </div>

      <div style={metaLine}>
        {memberCount ? <span>{memberCount} members</span> : <span style={{ opacity: 0.5 }}>Members TBD</span>}
        {state ? <span>· {state}</span> : null}
      </div>

      <div style={cardFooter}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Updated {lastEdited}</span>
        <span style={openArrow}>Open →</span>
      </div>
    </div>
  );
}

// ============================================
// Helpers
// ============================================
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

// ============================================
// Styles
// ============================================
const headerRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  marginBottom: 24,
  flexWrap: 'wrap',
  gap: 16,
};

const pageTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 36,
  color: '#1e3a5f',
  margin: 0,
  marginBottom: 4,
};

const pageSubtitle: React.CSSProperties = {
  fontFamily: 'Figtree, sans-serif',
  color: '#3a4d68',
  margin: 0,
  fontSize: 15,
  maxWidth: 640,
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

const primaryBtnLarge: React.CSSProperties = {
  background: '#1e3a5f',
  color: '#fff',
  border: 'none',
  padding: '14px 28px',
  borderRadius: 8,
  fontFamily: 'Figtree, sans-serif',
  fontWeight: 600,
  fontSize: 15,
  cursor: 'pointer',
};

const errorBanner: React.CSSProperties = {
  background: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#991b1b',
  borderRadius: 8,
  padding: '12px 16px',
  marginBottom: 20,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 14,
};

const emptyStateCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: '48px 32px',
  textAlign: 'center',
  fontFamily: 'Figtree, sans-serif',
};

const emptyStateTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  color: '#1e3a5f',
  fontSize: 26,
  margin: '0 0 12px',
};

const emptyStateDesc: React.CSSProperties = {
  color: '#3a4d68',
  fontSize: 14,
  lineHeight: 1.6,
  margin: '0 auto 24px',
  maxWidth: 560,
};

const sectionWrap: React.CSSProperties = {
  marginBottom: 32,
};

const sectionHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 14,
};

const sectionTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  color: '#1e3a5f',
  fontSize: 22,
  margin: 0,
};

const countPill: React.CSSProperties = {
  background: '#f1f5f9',
  color: '#3a4d68',
  fontFamily: 'Figtree, sans-serif',
  fontSize: 12,
  fontWeight: 600,
  padding: '2px 10px',
  borderRadius: 999,
};

const cardGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 16,
};

const designCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 18,
  fontFamily: 'Figtree, sans-serif',
  cursor: 'pointer',
  transition: 'border-color 0.15s, transform 0.15s',
};

const cardTopRow: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  marginBottom: 12,
  flexWrap: 'wrap',
};

const statusPill: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: '3px 10px',
  borderRadius: 999,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

const fundingPill: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: '3px 10px',
  borderRadius: 999,
};

const designName: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  color: '#1e3a5f',
  fontSize: 18,
  margin: '0 0 6px',
  lineHeight: 1.3,
};

const clientLine: React.CSSProperties = {
  marginBottom: 4,
};

const metaLine: React.CSSProperties = {
  fontSize: 12,
  color: '#94a3b8',
  marginBottom: 14,
  display: 'flex',
  gap: 4,
  flexWrap: 'wrap',
};

const cardFooter: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderTop: '1px solid #f1f5f9',
  paddingTop: 10,
};

const openArrow: React.CSSProperties = {
  fontSize: 13,
  color: '#1e3a5f',
  fontWeight: 600,
};

const archivedToggle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#3a4d68',
  fontFamily: 'Figtree, sans-serif',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  padding: '6px 0',
};