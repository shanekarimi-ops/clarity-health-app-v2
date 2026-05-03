'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';
import BrokerSidebar from '../../components/BrokerSidebar';

export default function BrokerGroupsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agencyName, setAgencyName] = useState('');

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
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

    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (loading) {
    return (
      <div style={{ padding: 40, color: '#1e3a5f', fontFamily: 'Figtree, sans-serif' }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="dash-shell">
      <BrokerSidebar
        active="groups"
        firstName={firstName}
        lastName={lastName}
        agencyName={agencyName}
        onLogout={handleLogout}
      />

      <main className="dash-main">
        <div style={headerRow}>
          <div>
            <h1 style={pageTitle}>Groups</h1>
            <p style={pageSubtitle}>
              Manage employer groups and run census-based recommendations
            </p>
          </div>
          <button style={primaryBtnDisabled} disabled title="Coming in Session 20">
            + Add Group
          </button>
        </div>

        <div style={comingSoonBanner}>
          <span style={{ fontSize: 20, marginRight: 10 }}>🚧</span>
          <strong>Coming in Sessions 20-21</strong>
          <span style={{ marginLeft: 10, color: '#3a4d68' }}>
            — Upload group census, get AI-ranked carrier recommendations, manage employer plans
          </span>
        </div>

        <div style={cardGrid}>
          {mockGroups.map((g, i) => (
            <div key={i} style={mockCard}>
              <div style={mockCardHeader}>
                <div style={mockBadge}>{g.industry}</div>
                <div style={statusPill(g.status)}>{g.status}</div>
              </div>
              <h3 style={mockCardTitle}>{g.name}</h3>
              <div style={mockCardMeta}>
                <span>👥 {g.members} members</span>
                <span>📍 {g.location}</span>
              </div>
              <div style={mockCardFooter}>
                <button style={secondaryBtnDisabled} disabled>View Census</button>
                <button style={secondaryBtnDisabled} disabled>Run Recommendation</button>
              </div>
            </div>
          ))}
        </div>

        <div style={featureListCard}>
          <h3 style={featureListTitle}>What you'll be able to do:</h3>
          <ul style={featureList}>
            <li>Upload group census (CSV or Excel)</li>
            <li>AI parses and validates member data</li>
            <li>Get carrier recommendations ranked by group fit</li>
            <li>Compare fully-insured vs self-funded options</li>
            <li>Generate broker-of-record letters</li>
            <li>Track renewals and rate changes year-over-year</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

const mockGroups = [
  { name: 'Mothman Corp', industry: 'Manufacturing', members: 47, location: 'Phoenix, AZ', status: 'Active' },
  { name: 'AJ Corp', industry: 'Tech', members: 12, location: 'Tempe, AZ', status: 'Renewal' },
  { name: 'Jens RE Group', industry: 'Real Estate', members: 23, location: 'Scottsdale, AZ', status: 'Active' },
];

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
};

const primaryBtnDisabled: React.CSSProperties = {
  background: '#cbd5e0',
  color: '#fff',
  border: 'none',
  padding: '12px 22px',
  borderRadius: 8,
  fontFamily: 'Figtree, sans-serif',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'not-allowed',
  opacity: 0.7,
};

const secondaryBtnDisabled: React.CSSProperties = {
  background: '#fff',
  color: '#7a8a9b',
  border: '1px solid #e2e8f0',
  padding: '8px 14px',
  borderRadius: 6,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  cursor: 'not-allowed',
  flex: 1,
};

const comingSoonBanner: React.CSSProperties = {
  background: 'linear-gradient(135deg, #faf7f2 0%, #eef1f4 100%)',
  border: '1px solid #d4dae2',
  borderRadius: 10,
  padding: '14px 18px',
  marginBottom: 28,
  fontFamily: 'Figtree, sans-serif',
  color: '#1e3a5f',
  fontSize: 14,
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
};

const cardGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: 16,
  marginBottom: 32,
  opacity: 0.7,
};

const mockCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 18,
  fontFamily: 'Figtree, sans-serif',
};

const mockCardHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: 10,
};

const mockBadge: React.CSSProperties = {
  background: '#eef1f4',
  color: '#3a4d68',
  padding: '4px 10px',
  borderRadius: 12,
  fontSize: 11,
  fontWeight: 600,
};

function statusPill(status: string): React.CSSProperties {
  const colors: Record<string, { bg: string; fg: string }> = {
    Active: { bg: '#e6f0e6', fg: '#5a7a56' },
    Renewal: { bg: '#fef3e6', fg: '#a06d2a' },
  };
  const c = colors[status] || { bg: '#eef1f4', fg: '#3a4d68' };
  return {
    background: c.bg,
    color: c.fg,
    padding: '4px 10px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
  };
}

const mockCardTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  color: '#1e3a5f',
  fontSize: 20,
  margin: '0 0 10px',
};

const mockCardMeta: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 13,
  color: '#3a4d68',
  marginBottom: 14,
};

const mockCardFooter: React.CSSProperties = {
  display: 'flex',
  gap: 8,
};

const featureListCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 24,
  fontFamily: 'Figtree, sans-serif',
};

const featureListTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  color: '#1e3a5f',
  fontSize: 20,
  margin: '0 0 14px',
};

const featureList: React.CSSProperties = {
  margin: 0,
  paddingLeft: 22,
  color: '#3a4d68',
  fontSize: 14,
  lineHeight: 1.9,
};