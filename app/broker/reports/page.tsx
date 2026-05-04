'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';
import BrokerSidebar from '../../components/BrokerSidebar';

export default function BrokerReportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [userId, setUserId] = useState('');

  // Test PDF state (Push 1 — will be removed in Push 5)
  const [testGenerating, setTestGenerating] = useState(false);
  const [testStatus, setTestStatus] = useState<string>('');

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    setUserId(user.id);

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

  // ---- TEST PDF GENERATION (Push 1 verification — remove in Push 5) ----
  async function handleTestPDF() {
    if (!userId) {
      setTestStatus('❌ Not logged in');
      return;
    }

    setTestGenerating(true);
    setTestStatus('Generating test PDF...');

    try {
      const res = await fetch('/api/reports/test-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Test PDF error response:', errText);
        setTestStatus(`❌ Failed (${res.status}). Check console.`);
        setTestGenerating(false);
        return;
      }

      // Download the PDF
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'clarity-health-test.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setTestStatus('✅ Test PDF downloaded!');
    } catch (err: any) {
      console.error('Test PDF generation error:', err);
      setTestStatus(`❌ Error: ${err?.message || String(err)}`);
    } finally {
      setTestGenerating(false);
    }
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
        active="reports"
        firstName={firstName}
        lastName={lastName}
        agencyName={agencyName}
        onLogout={handleLogout}
      />

      <main className="dash-main">
        <div style={headerRow}>
          <div>
            <h1 style={pageTitle}>Reports</h1>
            <p style={pageSubtitle}>
              Generate white-label PDFs for clients and pull agency-wide analytics
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              style={testBtn}
              onClick={handleTestPDF}
              disabled={testGenerating}
              title="Test the PDF generation pipeline (will be removed)"
            >
              {testGenerating ? '⏳ Generating...' : '🧪 Test PDF'}
            </button>
            <button style={primaryBtnDisabled} disabled title="Coming in Session 24">
              + Generate Report
            </button>
          </div>
        </div>

        {testStatus && (
          <div style={testStatusRow}>
            {testStatus}
          </div>
        )}

        <div style={comingSoonBanner}>
          <span style={{ fontSize: 20, marginRight: 10 }}>🚧</span>
          <strong>Coming in Session 24</strong>
          <span style={{ marginLeft: 10, color: '#3a4d68' }}>
            — White-label PDF exports, agency dashboards, retention metrics, commission tracking
          </span>
        </div>

        <div style={statsRow}>
          <div style={statTile}>
            <div style={statLabel}>Total Clients</div>
            <div style={statValue}>5</div>
            <div style={statTrend}>—</div>
          </div>
          <div style={statTile}>
            <div style={statLabel}>Recommendations Run</div>
            <div style={statValue}>2</div>
            <div style={statTrend}>—</div>
          </div>
          <div style={statTile}>
            <div style={statLabel}>Active Plans</div>
            <div style={statValue}>—</div>
            <div style={statTrend}>—</div>
          </div>
          <div style={statTile}>
            <div style={statLabel}>Est. Annual Premium</div>
            <div style={statValue}>—</div>
            <div style={statTrend}>—</div>
          </div>
        </div>

        <div style={sectionTitle}>Available Reports</div>

        <div style={cardGrid}>
          <div style={mockCard}>
            <div style={cardIconWrap}>📄</div>
            <h3 style={mockCardTitle}>Client Recommendation PDF</h3>
            <p style={mockCardDesc}>
              White-labeled, agency-branded PDF showing top plan recommendations with claims insights
            </p>
            <button style={secondaryBtnDisabled} disabled>Generate</button>
          </div>

          <div style={mockCard}>
            <div style={cardIconWrap}>📊</div>
            <h3 style={mockCardTitle}>Agency Performance Dashboard</h3>
            <p style={mockCardDesc}>
              Monthly snapshot of clients added, recommendations run, plans sold, and commission earned
            </p>
            <button style={secondaryBtnDisabled} disabled>Generate</button>
          </div>

          <div style={mockCard}>
            <div style={cardIconWrap}>🎯</div>
            <h3 style={mockCardTitle}>Renewal Pipeline</h3>
            <p style={mockCardDesc}>
              Clients with renewals in the next 30, 60, or 90 days, sorted by group size
            </p>
            <button style={secondaryBtnDisabled} disabled>Generate</button>
          </div>

          <div style={mockCard}>
            <div style={cardIconWrap}>💰</div>
            <h3 style={mockCardTitle}>Commission Report</h3>
            <p style={mockCardDesc}>
              Track commissions by carrier, broker, and group across the agency book of business
            </p>
            <button style={secondaryBtnDisabled} disabled>Generate</button>
          </div>

          <div style={mockCard}>
            <div style={cardIconWrap}>📈</div>
            <h3 style={mockCardTitle}>Retention Analytics</h3>
            <p style={mockCardDesc}>
              Year-over-year client retention, churn reasons, and lifetime value by client segment
            </p>
            <button style={secondaryBtnDisabled} disabled>Generate</button>
          </div>

          <div style={mockCard}>
            <div style={cardIconWrap}>📋</div>
            <h3 style={mockCardTitle}>Compliance Summary</h3>
            <p style={mockCardDesc}>
              ACA reporting status, SBC distribution log, and 5500 filing tracker by group
            </p>
            <button style={secondaryBtnDisabled} disabled>Generate</button>
          </div>
        </div>

        <div style={featureListCard}>
          <h3 style={featureListTitle}>What you'll be able to do:</h3>
          <ul style={featureList}>
            <li>Export branded PDFs with your agency's logo and colors</li>
            <li>Schedule recurring reports (weekly, monthly, quarterly)</li>
            <li>Email reports directly to clients from the platform</li>
            <li>Track commission payouts by carrier and effective date</li>
            <li>Build custom report templates with your own fields</li>
            <li>Export raw data to CSV for accounting integration</li>
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

const testBtn: React.CSSProperties = {
  background: '#1e3a5f',
  color: '#fff',
  border: 'none',
  padding: '12px 18px',
  borderRadius: 8,
  fontFamily: 'Figtree, sans-serif',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
};

const testStatusRow: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #d4dae2',
  borderRadius: 8,
  padding: '10px 14px',
  marginBottom: 18,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  color: '#1e3a5f',
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

const statsRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 14,
  marginBottom: 28,
};

const statTile: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 18,
  fontFamily: 'Figtree, sans-serif',
};

const statLabel: React.CSSProperties = {
  fontSize: 12,
  color: '#7a8a9b',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 6,
};

const statValue: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  color: '#1e3a5f',
  fontFamily: 'Playfair Display, serif',
};

const statTrend: React.CSSProperties = {
  fontSize: 12,
  color: '#7a8a9b',
  marginTop: 4,
};

const sectionTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 22,
  color: '#1e3a5f',
  marginBottom: 14,
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