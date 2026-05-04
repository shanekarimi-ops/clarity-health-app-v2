'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';
import BrokerSidebar from '../../components/BrokerSidebar';

type ClientRow = {
  id: string;
  first_name: string;
  last_name: string;
  employer_name: string | null;
};

type RecRow = {
  id: string;
  created_at: string;
  client_id: string;
  plans: any[] | null;
};

export default function BrokerReportsPage() {
  const router = useRouter();

  // Auth/user state
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [userId, setUserId] = useState('');

  // Test PDF state (Push 1)
  const [testGenerating, setTestGenerating] = useState(false);
  const [testStatus, setTestStatus] = useState<string>('');

  // Client Rec PDF modal state (Push 2)
  const [showClientRecModal, setShowClientRecModal] = useState(false);
  const [modalClients, setModalClients] = useState<ClientRow[]>([]);
  const [modalRecs, setModalRecs] = useState<RecRow[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedRecId, setSelectedRecId] = useState<string>('');
  const [includeClaims, setIncludeClaims] = useState(true);
  const [includeReasoning, setIncludeReasoning] = useState(true);
  const [topN, setTopN] = useState(5);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string>('');
  const [generatingClientRec, setGeneratingClientRec] = useState(false);

  // Agency Perf PDF modal state (Push 3)
  const [showAgencyPerfModal, setShowAgencyPerfModal] = useState(false);
  const [agencyDaysBack, setAgencyDaysBack] = useState(90);
  const [agencyIncludeRoster, setAgencyIncludeRoster] = useState(true);
  const [agencyIncludeActivity, setAgencyIncludeActivity] = useState(true);
  const [agencyIncludeCarriers, setAgencyIncludeCarriers] = useState(true);
  const [agencyError, setAgencyError] = useState<string>('');
  const [generatingAgencyPerf, setGeneratingAgencyPerf] = useState(false);

  // Renewal Pipeline modal state (Push 4)
  const [showRenewalModal, setShowRenewalModal] = useState(false);
  const [renewalError, setRenewalError] = useState<string>('');
  const [generatingRenewal, setGeneratingRenewal] = useState(false);

  // Commission Report modal state (Push 4)
  const [showCommissionModal, setShowCommissionModal] = useState(false);
  const [commissionPeriod, setCommissionPeriod] = useState('ytd');
  const [commissionError, setCommissionError] = useState<string>('');
  const [generatingCommission, setGeneratingCommission] = useState(false);

  // Retention Analytics modal state (Session 21 Push 2)
  const [showRetentionModal, setShowRetentionModal] = useState(false);
  const [retentionPeriod, setRetentionPeriod] = useState('12m');
  const [retentionError, setRetentionError] = useState<string>('');
  const [generatingRetention, setGeneratingRetention] = useState(false);

  // Compliance Summary modal state (Session 21 Push 3)
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [compliancePeriod, setCompliancePeriod] = useState('current');
  const [complianceError, setComplianceError] = useState<string>('');
  const [generatingCompliance, setGeneratingCompliance] = useState(false);

  // Toast for successful generation
  const [toastMessage, setToastMessage] = useState<string>('');

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

  // ---- TEST PDF (Push 1 - will be removed in Push 4 of S21) ----
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

  // ---- CLIENT REC PDF MODAL (Push 2) ----

  async function openClientRecModal() {
    setShowClientRecModal(true);
    setSelectedClientId('');
    setSelectedRecId('');
    setModalRecs([]);
    setModalError('');
    setModalLoading(true);
    setIncludeClaims(true);
    setIncludeReasoning(true);
    setTopN(5);

    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, first_name, last_name, employer_name')
        .order('first_name', { ascending: true });

      if (error) {
        console.error('Load clients error:', error);
        setModalError('Could not load clients: ' + error.message);
      } else {
        setModalClients((data || []) as ClientRow[]);
      }
    } catch (err: any) {
      console.error('Load clients exception:', err);
      setModalError('Could not load clients: ' + (err?.message || String(err)));
    } finally {
      setModalLoading(false);
    }
  }

  async function handleClientChange(clientId: string) {
    setSelectedClientId(clientId);
    setSelectedRecId('');
    setModalRecs([]);
    setModalError('');

    if (!clientId) return;

    try {
      const { data, error } = await supabase
        .from('recommendations')
        .select('id, created_at, client_id, plans')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Load recs error:', error);
        setModalError('Could not load recommendations: ' + error.message);
      } else {
        const recs = (data || []) as RecRow[];
        setModalRecs(recs);
        if (recs.length === 0) {
          setModalError(
            'No recommendations have been run for this client yet.'
          );
        } else {
          setSelectedRecId(recs[0].id);
        }
      }
    } catch (err: any) {
      console.error('Load recs exception:', err);
      setModalError('Could not load recommendations: ' + (err?.message || String(err)));
    }
  }

  async function handleGenerateClientRec() {
    if (!userId || !selectedClientId || !selectedRecId) {
      setModalError('Please select a client and recommendation.');
      return;
    }

    setGeneratingClientRec(true);
    setModalError('');

    try {
      const res = await fetch('/api/reports/client-rec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          clientId: selectedClientId,
          recId: selectedRecId,
          includeClaims,
          includeReasoning,
          topN,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Client rec PDF error response:', errText);
        let errMsg = `Failed (${res.status})`;
        try {
          const errJson = JSON.parse(errText);
          if (errJson.error) errMsg = errJson.error;
          if (errJson.details) errMsg += ' — ' + errJson.details;
        } catch {}
        setModalError('❌ ' + errMsg);
        setGeneratingClientRec(false);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      const client = modalClients.find((c) => c.id === selectedClientId);
      const safe = client
        ? `${client.first_name}-${client.last_name}-recommendations.pdf`
            .toLowerCase()
            .replace(/[^a-z0-9.-]/g, '-')
        : 'client-recommendations.pdf';

      a.download = safe;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setShowClientRecModal(false);
      setToastMessage('✅ Client recommendation PDF generated!');
      setTimeout(() => setToastMessage(''), 4000);
    } catch (err: any) {
      console.error('Client rec generate exception:', err);
      setModalError('❌ ' + (err?.message || String(err)));
    } finally {
      setGeneratingClientRec(false);
    }
  }

  function closeClientRecModal() {
    if (generatingClientRec) return;
    setShowClientRecModal(false);
  }

  // ---- AGENCY PERF PDF MODAL (Push 3) ----

  function openAgencyPerfModal() {
    setShowAgencyPerfModal(true);
    setAgencyDaysBack(90);
    setAgencyIncludeRoster(true);
    setAgencyIncludeActivity(true);
    setAgencyIncludeCarriers(true);
    setAgencyError('');
  }

  function closeAgencyPerfModal() {
    if (generatingAgencyPerf) return;
    setShowAgencyPerfModal(false);
  }

  async function handleGenerateAgencyPerf() {
    if (!userId) {
      setAgencyError('Not logged in.');
      return;
    }

    setGeneratingAgencyPerf(true);
    setAgencyError('');

    try {
      const res = await fetch('/api/reports/agency-perf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          daysBack: agencyDaysBack,
          includeRoster: agencyIncludeRoster,
          includeActivity: agencyIncludeActivity,
          includeCarriers: agencyIncludeCarriers,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Agency perf PDF error response:', errText);
        let errMsg = `Failed (${res.status})`;
        try {
          const errJson = JSON.parse(errText);
          if (errJson.error) errMsg = errJson.error;
          if (errJson.details) errMsg += ' — ' + errJson.details;
        } catch {}
        setAgencyError('❌ ' + errMsg);
        setGeneratingAgencyPerf(false);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'agency-performance.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setShowAgencyPerfModal(false);
      setToastMessage('✅ Agency performance PDF generated!');
      setTimeout(() => setToastMessage(''), 4000);
    } catch (err: any) {
      console.error('Agency perf generate exception:', err);
      setAgencyError('❌ ' + (err?.message || String(err)));
    } finally {
      setGeneratingAgencyPerf(false);
    }
  }

  // ---- RENEWAL PIPELINE MODAL (Push 4) ----

  function openRenewalModal() {
    setShowRenewalModal(true);
    setRenewalError('');
  }

  function closeRenewalModal() {
    if (generatingRenewal) return;
    setShowRenewalModal(false);
  }

  async function handleGenerateRenewal() {
    if (!userId) {
      setRenewalError('Not logged in.');
      return;
    }

    setGeneratingRenewal(true);
    setRenewalError('');

    try {
      const res = await fetch('/api/reports/renewal-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Renewal pipeline PDF error response:', errText);
        let errMsg = `Failed (${res.status})`;
        try {
          const errJson = JSON.parse(errText);
          if (errJson.error) errMsg = errJson.error;
          if (errJson.details) errMsg += ' — ' + errJson.details;
        } catch {}
        setRenewalError('❌ ' + errMsg);
        setGeneratingRenewal(false);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'renewal-pipeline.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setShowRenewalModal(false);
      setToastMessage('✅ Renewal pipeline PDF generated!');
      setTimeout(() => setToastMessage(''), 4000);
    } catch (err: any) {
      console.error('Renewal generate exception:', err);
      setRenewalError('❌ ' + (err?.message || String(err)));
    } finally {
      setGeneratingRenewal(false);
    }
  }

  // ---- COMMISSION REPORT MODAL (Push 4) ----

  function openCommissionModal() {
    setShowCommissionModal(true);
    setCommissionPeriod('ytd');
    setCommissionError('');
  }

  function closeCommissionModal() {
    if (generatingCommission) return;
    setShowCommissionModal(false);
  }

  async function handleGenerateCommission() {
    if (!userId) {
      setCommissionError('Not logged in.');
      return;
    }

    setGeneratingCommission(true);
    setCommissionError('');

    try {
      const res = await fetch('/api/reports/commission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          period: commissionPeriod,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Commission PDF error response:', errText);
        let errMsg = `Failed (${res.status})`;
        try {
          const errJson = JSON.parse(errText);
          if (errJson.error) errMsg = errJson.error;
          if (errJson.details) errMsg += ' — ' + errJson.details;
        } catch {}
        setCommissionError('❌ ' + errMsg);
        setGeneratingCommission(false);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'commission-report.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setShowCommissionModal(false);
      setToastMessage('✅ Commission report PDF generated!');
      setTimeout(() => setToastMessage(''), 4000);
    } catch (err: any) {
      console.error('Commission generate exception:', err);
      setCommissionError('❌ ' + (err?.message || String(err)));
    } finally {
      setGeneratingCommission(false);
    }
  }

  // ---- RETENTION ANALYTICS MODAL (Session 21 Push 2) ----

  function openRetentionModal() {
    setShowRetentionModal(true);
    setRetentionPeriod('12m');
    setRetentionError('');
  }

  function closeRetentionModal() {
    if (generatingRetention) return;
    setShowRetentionModal(false);
  }

  async function handleGenerateRetention() {
    if (!userId) {
      setRetentionError('Not logged in.');
      return;
    }

    setGeneratingRetention(true);
    setRetentionError('');

    try {
      const res = await fetch('/api/reports/retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          periodKey: retentionPeriod,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Retention PDF error response:', errText);
        let errMsg = `Failed (${res.status})`;
        try {
          const errJson = JSON.parse(errText);
          if (errJson.error) errMsg = errJson.error;
          if (errJson.details) errMsg += ' — ' + errJson.details;
        } catch {}
        setRetentionError('❌ ' + errMsg);
        setGeneratingRetention(false);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `retention-analytics-${retentionPeriod}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setShowRetentionModal(false);
      setToastMessage('✅ Retention analytics PDF generated!');
      setTimeout(() => setToastMessage(''), 4000);
    } catch (err: any) {
      console.error('Retention generate exception:', err);
      setRetentionError('❌ ' + (err?.message || String(err)));
    } finally {
      setGeneratingRetention(false);
    }
  }

  // ---- COMPLIANCE SUMMARY MODAL (Session 21 Push 3) ----

  function openComplianceModal() {
    setShowComplianceModal(true);
    setCompliancePeriod('current');
    setComplianceError('');
  }

  function closeComplianceModal() {
    if (generatingCompliance) return;
    setShowComplianceModal(false);
  }

  async function handleGenerateCompliance() {
    if (!userId) {
      setComplianceError('Not logged in.');
      return;
    }

    setGeneratingCompliance(true);
    setComplianceError('');

    try {
      const res = await fetch('/api/reports/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          periodKey: compliancePeriod,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Compliance PDF error response:', errText);
        let errMsg = `Failed (${res.status})`;
        try {
          const errJson = JSON.parse(errText);
          if (errJson.error) errMsg = errJson.error;
          if (errJson.details) errMsg += ' — ' + errJson.details;
        } catch {}
        setComplianceError('❌ ' + errMsg);
        setGeneratingCompliance(false);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `compliance-summary-${compliancePeriod}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setShowComplianceModal(false);
      setToastMessage('✅ Compliance summary PDF generated!');
      setTimeout(() => setToastMessage(''), 4000);
    } catch (err: any) {
      console.error('Compliance generate exception:', err);
      setComplianceError('❌ ' + (err?.message || String(err)));
    } finally {
      setGeneratingCompliance(false);
    }
  }

  // ---- HELPERS ----

  function formatDateShort(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return iso;
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
          {/* CLIENT REC PDF — REAL */}
          <div style={liveCard}>
            <div style={cardIconWrap}>📄</div>
            <h3 style={mockCardTitle}>Client Recommendation PDF</h3>
            <p style={mockCardDesc}>
              White-labeled, agency-branded PDF showing top plan recommendations with claims insights
            </p>
            <button style={liveBtn} onClick={openClientRecModal}>
              Generate
            </button>
          </div>

          {/* AGENCY PERF PDF — REAL */}
          <div style={liveCard}>
            <div style={cardIconWrap}>📊</div>
            <h3 style={mockCardTitle}>Agency Performance Dashboard</h3>
            <p style={mockCardDesc}>
              Monthly snapshot of clients added, recommendations run, plans sold, and commission earned
            </p>
            <button style={liveBtn} onClick={openAgencyPerfModal}>
              Generate
            </button>
          </div>

          {/* RENEWAL PIPELINE — SAMPLE (auto-flips to real when renewal_date is set) */}
          <div style={liveCard}>
            <div style={sampleBadge}>SAMPLE</div>
            <div style={cardIconWrap}>🎯</div>
            <h3 style={mockCardTitle}>Renewal Pipeline</h3>
            <p style={mockCardDesc}>
              Clients with renewals in the next 30, 60, or 90 days, sorted by group size
            </p>
            <button style={liveBtn} onClick={openRenewalModal}>
              Generate
            </button>
          </div>

          {/* COMMISSION REPORT — SAMPLE */}
          <div style={liveCard}>
            <div style={sampleBadge}>SAMPLE</div>
            <div style={cardIconWrap}>💰</div>
            <h3 style={mockCardTitle}>Commission Report</h3>
            <p style={mockCardDesc}>
              Track commissions by carrier, broker, and group across the agency book of business
            </p>
            <button style={liveBtn} onClick={openCommissionModal}>
              Generate
            </button>
          </div>

          {/* RETENTION ANALYTICS — SAMPLE (Session 21 Push 2) */}
          <div style={liveCard}>
            <div style={sampleBadge}>SAMPLE</div>
            <div style={cardIconWrap}>📈</div>
            <h3 style={mockCardTitle}>Retention Analytics</h3>
            <p style={mockCardDesc}>
              Year-over-year client retention, churn reasons, and lifetime value by client segment
            </p>
            <button style={liveBtn} onClick={openRetentionModal}>
              Generate
            </button>
          </div>

          {/* COMPLIANCE SUMMARY — SAMPLE (Session 21 Push 3) */}
          <div style={liveCard}>
            <div style={sampleBadge}>SAMPLE</div>
            <div style={cardIconWrap}>📋</div>
            <h3 style={mockCardTitle}>Compliance Summary</h3>
            <p style={mockCardDesc}>
              ACA reporting status, SBC distribution log, and 5500 filing tracker by group
            </p>
            <button style={liveBtn} onClick={openComplianceModal}>
              Generate
            </button>
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

      {/* CLIENT REC MODAL */}
      {showClientRecModal && (
        <div style={modalOverlay} onClick={closeClientRecModal}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <h2 style={modalTitle}>📄 Generate Client Recommendation PDF</h2>
              <button
                style={modalCloseBtn}
                onClick={closeClientRecModal}
                disabled={generatingClientRec}
              >
                ✕
              </button>
            </div>

            <div style={modalBody}>
              {modalLoading ? (
                <div style={{ padding: 20, color: '#3a4d68' }}>
                  Loading clients...
                </div>
              ) : (
                <>
                  <div style={modalField}>
                    <label style={modalLabel}>Step 1: Choose client</label>
                    <select
                      value={selectedClientId}
                      onChange={(e) => handleClientChange(e.target.value)}
                      style={modalSelect}
                      disabled={generatingClientRec}
                    >
                      <option value="">— Select a client —</option>
                      {modalClients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.first_name} {c.last_name}
                          {c.employer_name ? ` (${c.employer_name})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedClientId && (
                    <div style={modalField}>
                      <label style={modalLabel}>Step 2: Choose recommendation</label>
                      {modalRecs.length === 0 ? (
                        <div style={modalEmpty}>
                          {modalError || 'Loading recommendations...'}
                        </div>
                      ) : (
                        <select
                          value={selectedRecId}
                          onChange={(e) => setSelectedRecId(e.target.value)}
                          style={modalSelect}
                          disabled={generatingClientRec}
                        >
                          {modalRecs.map((r) => (
                            <option key={r.id} value={r.id}>
                              Run from {formatDateShort(r.created_at)} (
                              {Array.isArray(r.plans) ? r.plans.length : 0} plans)
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {selectedRecId && (
                    <>
                      <div style={modalDivider} />
                      <div style={modalLabel}>Report options</div>

                      <label style={checkboxRow}>
                        <input
                          type="checkbox"
                          checked={includeClaims}
                          onChange={(e) => setIncludeClaims(e.target.checked)}
                          disabled={generatingClientRec}
                        />
                        <span>Include claims insights (conditions, prescriptions, providers)</span>
                      </label>

                      <label style={checkboxRow}>
                        <input
                          type="checkbox"
                          checked={includeReasoning}
                          onChange={(e) => setIncludeReasoning(e.target.checked)}
                          disabled={generatingClientRec}
                        />
                        <span>Include AI reasoning (pros/cons per plan)</span>
                      </label>

                      <div style={modalField}>
                        <label style={modalLabel}>Number of plans to show</label>
                        <select
                          value={topN}
                          onChange={(e) => setTopN(Number(e.target.value))}
                          style={modalSelect}
                          disabled={generatingClientRec}
                        >
                          <option value={3}>Top 3 plans</option>
                          <option value={5}>Top 5 plans</option>
                          <option value={10}>Top 10 plans</option>
                        </select>
                      </div>
                    </>
                  )}

                  {modalError && (
                    <div style={modalErrorBox}>{modalError}</div>
                  )}
                </>
              )}
            </div>

            <div style={modalFooter}>
              <button
                style={modalCancelBtn}
                onClick={closeClientRecModal}
                disabled={generatingClientRec}
              >
                Cancel
              </button>
              <button
                style={
                  selectedRecId && !generatingClientRec
                    ? modalGenerateBtn
                    : modalGenerateBtnDisabled
                }
                onClick={handleGenerateClientRec}
                disabled={!selectedRecId || generatingClientRec}
              >
                {generatingClientRec ? '⏳ Generating PDF...' : '📄 Generate PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AGENCY PERF MODAL */}
      {showAgencyPerfModal && (
        <div style={modalOverlay} onClick={closeAgencyPerfModal}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <h2 style={modalTitle}>📊 Generate Agency Performance Dashboard</h2>
              <button
                style={modalCloseBtn}
                onClick={closeAgencyPerfModal}
                disabled={generatingAgencyPerf}
              >
                ✕
              </button>
            </div>

            <div style={modalBody}>
              <div style={modalField}>
                <label style={modalLabel}>Time range</label>
                <select
                  value={agencyDaysBack}
                  onChange={(e) => setAgencyDaysBack(Number(e.target.value))}
                  style={modalSelect}
                  disabled={generatingAgencyPerf}
                >
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days (recommended)</option>
                  <option value={365}>Last 12 months</option>
                </select>
              </div>

              <div style={modalDivider} />
              <div style={modalLabel}>Sections to include</div>

              <label style={checkboxRow}>
                <input
                  type="checkbox"
                  checked={agencyIncludeCarriers}
                  onChange={(e) => setAgencyIncludeCarriers(e.target.checked)}
                  disabled={generatingAgencyPerf}
                />
                <span>Top Carriers Recommended</span>
              </label>

              <label style={checkboxRow}>
                <input
                  type="checkbox"
                  checked={agencyIncludeRoster}
                  onChange={(e) => setAgencyIncludeRoster(e.target.checked)}
                  disabled={generatingAgencyPerf}
                />
                <span>Client Roster</span>
              </label>

              <label style={checkboxRow}>
                <input
                  type="checkbox"
                  checked={agencyIncludeActivity}
                  onChange={(e) => setAgencyIncludeActivity(e.target.checked)}
                  disabled={generatingAgencyPerf}
                />
                <span>Recent Activity Log</span>
              </label>

              {agencyError && (
                <div style={modalErrorBox}>{agencyError}</div>
              )}
            </div>

            <div style={modalFooter}>
              <button
                style={modalCancelBtn}
                onClick={closeAgencyPerfModal}
                disabled={generatingAgencyPerf}
              >
                Cancel
              </button>
              <button
                style={
                  !generatingAgencyPerf
                    ? modalGenerateBtn
                    : modalGenerateBtnDisabled
                }
                onClick={handleGenerateAgencyPerf}
                disabled={generatingAgencyPerf}
              >
                {generatingAgencyPerf ? '⏳ Generating PDF...' : '📊 Generate PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENEWAL PIPELINE MODAL */}
      {showRenewalModal && (
        <div style={modalOverlay} onClick={closeRenewalModal}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <h2 style={modalTitle}>🎯 Generate Renewal Pipeline PDF</h2>
              <button
                style={modalCloseBtn}
                onClick={closeRenewalModal}
                disabled={generatingRenewal}
              >
                ✕
              </button>
            </div>

            <div style={modalBody}>
              <div style={sampleNotice}>
                <strong>⚠ Sample report:</strong> This report uses real client
                names with synthesized renewal dates. Once you set real renewal
                dates on your clients, this report will use those automatically.
              </div>

              <div style={{ fontSize: 13, color: '#3a4d68', lineHeight: 1.5 }}>
                Generates a PDF showing your clients bucketed by renewal window:
                <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                  <li>🚨 Urgent — Renewing in 30 days</li>
                  <li>⚠️ Renewing in 31–60 days</li>
                  <li>📅 Renewing in 61–90 days</li>
                </ul>
                Each row includes carrier, group size, renewal date, and estimated
                annual premium.
              </div>

              {renewalError && (
                <div style={modalErrorBox}>{renewalError}</div>
              )}
            </div>

            <div style={modalFooter}>
              <button
                style={modalCancelBtn}
                onClick={closeRenewalModal}
                disabled={generatingRenewal}
              >
                Cancel
              </button>
              <button
                style={
                  !generatingRenewal
                    ? modalGenerateBtn
                    : modalGenerateBtnDisabled
                }
                onClick={handleGenerateRenewal}
                disabled={generatingRenewal}
              >
                {generatingRenewal ? '⏳ Generating PDF...' : '🎯 Generate PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMMISSION REPORT MODAL */}
      {showCommissionModal && (
        <div style={modalOverlay} onClick={closeCommissionModal}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <h2 style={modalTitle}>💰 Generate Commission Report</h2>
              <button
                style={modalCloseBtn}
                onClick={closeCommissionModal}
                disabled={generatingCommission}
              >
                ✕
              </button>
            </div>

            <div style={modalBody}>
              <div style={sampleNotice}>
                <strong>⚠ Sample report:</strong> Commission tracking is not yet
                wired to real carrier statements. This report uses your real
                client roster with simulated commission figures based on standard
                industry rates.
              </div>

              <div style={modalField}>
                <label style={modalLabel}>Reporting period</label>
                <select
                  value={commissionPeriod}
                  onChange={(e) => setCommissionPeriod(e.target.value)}
                  style={modalSelect}
                  disabled={generatingCommission}
                >
                  <option value="ytd">Year-to-date</option>
                  <option value="last12">Last 12 months</option>
                  <option value="q1">Q1 only</option>
                </select>
              </div>

              {commissionError && (
                <div style={modalErrorBox}>{commissionError}</div>
              )}
            </div>

            <div style={modalFooter}>
              <button
                style={modalCancelBtn}
                onClick={closeCommissionModal}
                disabled={generatingCommission}
              >
                Cancel
              </button>
              <button
                style={
                  !generatingCommission
                    ? modalGenerateBtn
                    : modalGenerateBtnDisabled
                }
                onClick={handleGenerateCommission}
                disabled={generatingCommission}
              >
                {generatingCommission ? '⏳ Generating PDF...' : '💰 Generate PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RETENTION ANALYTICS MODAL (Session 21 Push 2) */}
      {showRetentionModal && (
        <div style={modalOverlay} onClick={closeRetentionModal}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <h2 style={modalTitle}>📈 Generate Retention Analytics</h2>
              <button
                style={modalCloseBtn}
                onClick={closeRetentionModal}
                disabled={generatingRetention}
              >
                ✕
              </button>
            </div>

            <div style={modalBody}>
              <div style={sampleNotice}>
                <strong>⚠ Sample report:</strong> Real retention tracking
                requires multiple renewal cycles of data. This report uses
                illustrative figures to demonstrate the format. Real retention
                analytics will become available as your agency accumulates
                client history.
              </div>

              <div style={modalField}>
                <label style={modalLabel}>Reporting period</label>
                <select
                  value={retentionPeriod}
                  onChange={(e) => setRetentionPeriod(e.target.value)}
                  style={modalSelect}
                  disabled={generatingRetention}
                >
                  <option value="12m">Last 12 months</option>
                  <option value="24m">Last 24 months</option>
                  <option value="36m">Last 36 months</option>
                  <option value="all">All time</option>
                </select>
              </div>

              <div style={{ fontSize: 13, color: '#3a4d68', lineHeight: 1.5 }}>
                The report includes:
                <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                  <li>Year-over-year retention rate (headline)</li>
                  <li>Cohort table by acquisition year</li>
                  <li>Churn reason breakdown</li>
                  <li>Lifetime value by client segment</li>
                </ul>
              </div>

              {retentionError && (
                <div style={modalErrorBox}>{retentionError}</div>
              )}
            </div>

            <div style={modalFooter}>
              <button
                style={modalCancelBtn}
                onClick={closeRetentionModal}
                disabled={generatingRetention}
              >
                Cancel
              </button>
              <button
                style={
                  !generatingRetention
                    ? modalGenerateBtn
                    : modalGenerateBtnDisabled
                }
                onClick={handleGenerateRetention}
                disabled={generatingRetention}
              >
                {generatingRetention ? '⏳ Generating PDF...' : '📈 Generate PDF'}
              </button>
              </div>
          </div>
        </div>
      )}

      {/* COMPLIANCE SUMMARY MODAL (Session 21 Push 3) */}
      {showComplianceModal && (
        <div style={modalOverlay} onClick={closeComplianceModal}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <h2 style={modalTitle}>📋 Generate Compliance Summary</h2>
              <button
                style={modalCloseBtn}
                onClick={closeComplianceModal}
                disabled={generatingCompliance}
              >
                ✕
              </button>
            </div>

            <div style={modalBody}>
              <div style={sampleNotice}>
                <strong>⚠ Sample report:</strong> Real compliance tracking
                requires direct integrations with carrier portals, IRS filing
                confirmations, and SBC distribution logs. This report uses your
                real client roster with simulated compliance statuses.
              </div>

              <div style={modalField}>
                <label style={modalLabel}>Reporting period</label>
                <select
                  value={compliancePeriod}
                  onChange={(e) => setCompliancePeriod(e.target.value)}
                  style={modalSelect}
                  disabled={generatingCompliance}
                >
                  <option value="current">Current Plan Year</option>
                  <option value="last">Last Plan Year</option>
                  <option value="forward">Looking Forward</option>
                </select>
              </div>

              <div style={{ fontSize: 13, color: '#3a4d68', lineHeight: 1.5 }}>
                The report includes:
                <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                  <li>On Track / Action Needed / Overdue summary</li>
                  <li>ACA Reporting Status (Form 1095-C)</li>
                  <li>SBC Distribution Log</li>
                  <li>Form 5500 Filing Tracker</li>
                </ul>
              </div>

              {complianceError && (
                <div style={modalErrorBox}>{complianceError}</div>
              )}
            </div>

            <div style={modalFooter}>
              <button
                style={modalCancelBtn}
                onClick={closeComplianceModal}
                disabled={generatingCompliance}
              >
                Cancel
              </button>
              <button
                style={
                  !generatingCompliance
                    ? modalGenerateBtn
                    : modalGenerateBtnDisabled
                }
                onClick={handleGenerateCompliance}
                disabled={generatingCompliance}
              >
                {generatingCompliance ? '⏳ Generating PDF...' : '📋 Generate PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toastMessage && (
        <div style={toastStyle}>
          {toastMessage}
        </div>
      )}
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

const liveBtn: React.CSSProperties = {
  background: '#7a9b76',
  color: '#fff',
  border: 'none',
  padding: '10px 16px',
  borderRadius: 6,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
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
};

const mockCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 22,
  fontFamily: 'Figtree, sans-serif',
  opacity: 0.7,
  display: 'flex',
  flexDirection: 'column',
};

const liveCard: React.CSSProperties = {
  background: '#fff',
  border: '2px solid #7a9b76',
  borderRadius: 10,
  padding: 22,
  fontFamily: 'Figtree, sans-serif',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
};

const sampleBadge: React.CSSProperties = {
  position: 'absolute',
  top: 10,
  right: 10,
  background: '#fff8e8',
  color: '#7a6500',
  border: '1px solid #e0c46a',
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: 0.5,
  padding: '3px 8px',
  borderRadius: 4,
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
  flex: 1,
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

const modalOverlay: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(30, 58, 95, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 16,
};

const modalBox: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  width: '100%',
  maxWidth: 520,
  maxHeight: '90vh',
  overflowY: 'auto',
  fontFamily: 'Figtree, sans-serif',
  boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
};

const modalHeader: React.CSSProperties = {
  padding: '18px 22px',
  borderBottom: '1px solid #e2e8f0',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const modalTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  color: '#1e3a5f',
  fontSize: 20,
  margin: 0,
};

const modalCloseBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  fontSize: 18,
  cursor: 'pointer',
  color: '#7a8a9b',
  padding: 4,
};

const modalBody: React.CSSProperties = {
  padding: '20px 22px',
};

const modalField: React.CSSProperties = {
  marginBottom: 16,
};

const modalLabel: React.CSSProperties = {
  display: 'block',
  fontFamily: 'Figtree, sans-serif',
  color: '#1e3a5f',
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
};

const modalSelect: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #d4dae2',
  borderRadius: 6,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 14,
  color: '#1e3a5f',
  background: '#fff',
};

const modalEmpty: React.CSSProperties = {
  background: '#faf7f2',
  border: '1px solid #d4dae2',
  borderRadius: 6,
  padding: '10px 12px',
  fontSize: 13,
  color: '#7a8a9b',
};

const modalDivider: React.CSSProperties = {
  height: 1,
  background: '#e2e8f0',
  margin: '20px 0 12px',
};

const checkboxRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 8,
  fontSize: 13,
  color: '#3a4d68',
  cursor: 'pointer',
};

const sampleNotice: React.CSSProperties = {
  background: '#fff8e8',
  border: '1px solid #e0c46a',
  borderRadius: 6,
  padding: '10px 12px',
  fontSize: 12,
  color: '#7a6500',
  marginBottom: 14,
  lineHeight: 1.5,
};

const modalErrorBox: React.CSSProperties = {
  background: '#fee',
  border: '1px solid #f8b4b4',
  borderRadius: 6,
  padding: '10px 12px',
  fontSize: 13,
  color: '#a44',
  marginTop: 12,
};

const modalFooter: React.CSSProperties = {
  padding: '14px 22px',
  borderTop: '1px solid #e2e8f0',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
};

const modalCancelBtn: React.CSSProperties = {
  background: '#fff',
  color: '#3a4d68',
  border: '1px solid #d4dae2',
  padding: '10px 18px',
  borderRadius: 6,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const modalGenerateBtn: React.CSSProperties = {
  background: '#7a9b76',
  color: '#fff',
  border: 'none',
  padding: '10px 18px',
  borderRadius: 6,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const modalGenerateBtnDisabled: React.CSSProperties = {
  background: '#c8d4c5',
  color: '#fff',
  border: 'none',
  padding: '10px 18px',
  borderRadius: 6,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'not-allowed',
};

const toastStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 24,
  right: 24,
  background: '#1e3a5f',
  color: '#fff',
  padding: '12px 18px',
  borderRadius: 8,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 14,
  fontWeight: 600,
  boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
  zIndex: 1100,
};