'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';
import BrokerSidebar from '../../components/BrokerSidebar';

export default function BrokerPlanDesignPage() {
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
              Model self-funded plans, build benefit structures, and run scenario analysis
            </p>
          </div>
          <button style={primaryBtnDisabled} disabled title="Coming in Sessions 22-23">
            + New Plan Design
          </button>
        </div>

        <div style={comingSoonBanner}>
          <span style={{ fontSize: 20, marginRight: 10 }}>🚧</span>
          <strong>Coming in Sessions 22-23</strong>
          <span style={{ marginLeft: 10, color: '#3a4d68' }}>
            — Build custom benefit designs, model self-funded vs fully-insured, run claims-based projections
          </span>
        </div>

        <div style={cardGrid}>
          <div style={mockCard}>
            <div style={cardIconWrap}>📐</div>
            <h3 style={mockCardTitle}>Plan Builder</h3>
            <p style={mockCardDesc}>
              Build custom plan designs with deductibles, copays, coinsurance, and OOP maximums
            </p>
            <button style={secondaryBtnDisabled} disabled>Build a Plan</button>
          </div>

          <div style={mockCard}>
            <div style={cardIconWrap}>📊</div>
            <h3 style={mockCardTitle}>Self-Funded Modeling</h3>
            <p style={mockCardDesc}>
              Project claim costs, stop-loss premiums, and break-even thresholds for self-insured groups
            </p>
            <button style={secondaryBtnDisabled} disabled>Run Model</button>
          </div>

          <div style={mockCard}>
            <div style={cardIconWrap}>🎯</div>
            <h3 style={mockCardTitle}>Scenario Analysis</h3>
            <p style={mockCardDesc}>
              Compare 3-5 plan designs side-by-side with projected employer + employee costs
            </p>
            <button style={secondaryBtnDisabled} disabled>Compare Scenarios</button>
          </div>

          <div style={mockCard}>
            <div style={cardIconWrap}>📈</div>
            <h3 style={mockCardTitle}>Renewal Projections</h3>
            <p style={mockCardDesc}>
              Forecast next-year rates based on current claims experience and trend factors
            </p>
            <button style={secondaryBtnDisabled} disabled>Project Renewal</button>
          </div>
        </div>

        <div style={featureListCard}>
          <h3 style={featureListTitle}>What you'll be able to do:</h3>
          <ul style={featureList}>
            <li>Build custom plan designs with full benefit structure</li>
            <li>Model fully-insured vs level-funded vs self-funded</li>
            <li>Project claim costs from group census data</li>
            <li>Calculate employer vs employee cost-share</li>
            <li>Run "what-if" scenarios for renewal strategy</li>
            <li>Export plan summaries as branded PDFs</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

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
  padding: '10px 16px',
  borderRadius: 6,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  cursor: 'not-allowed',
  width: '100%',
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
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 16,
  marginBottom: 32,
  opacity: 0.7,
};

const mockCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 22,
  fontFamily: 'Figtree, sans-serif',
};

const cardIconWrap: React.CSSProperties = {
  fontSize: 32,
  marginBottom: 10,
};

const mockCardTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  color: '#1e3a5f',
  fontSize: 20,
  margin: '0 0 8px',
};

const mockCardDesc: React.CSSProperties = {
  color: '#3a4d68',
  fontSize: 13,
  lineHeight: 1.5,
  margin: '0 0 14px',
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