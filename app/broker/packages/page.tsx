// Surface 5 packages list page
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';
import BrokerSidebar from '../../components/BrokerSidebar';

type Package = {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'locked';
  is_recommended: boolean;
  is_current_plan: boolean;
  member_count_assumption: number | null;
  total_annual_cost: number | null;
  employer_annual_cost: number | null;
  employee_annual_cost: number | null;
  cost_change_vs_current_pct: number | null;
  line_count: number;
  created_at: string;
  rfp: { id: string; name: string; effective_date: string | null; current_annual_cost: number | null } | null;
};

type Rfp = {
  id: string;
  name: string;
  client_id: string;
  effective_date: string | null;
  current_annual_cost: number | null;
};

const fmtMoney = (n: number | null) => {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
};

const fmtPct = (n: number | null) => {
  if (n === null || n === undefined) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
};

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
};

export default function PackagesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [packages, setPackages] = useState<Package[]>([]);
  const [rfps, setRfps] = useState<Rfp[]>([]);
  const [rfpFilter, setRfpFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create modal state
  const [createRfpId, setCreateRfpId] = useState('');
  const [createName, setCreateName] = useState('');
  const [createIsCurrentPlan, setCreateIsCurrentPlan] = useState(false);
  const [createMemberCount, setCreateMemberCount] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push('/login');
        return;
      }
      const meta = sessionData.session.user.user_metadata || {};
      setFirstName(meta.first_name || '');
      setLastName(meta.last_name || '');

      const { data: brokerRow } = await supabase
        .from('brokers')
        .select('agency_id, agencies(name)')
        .eq('user_id', sessionData.session.user.id)
        .maybeSingle();
      if (brokerRow?.agencies) {
        setAgencyName((brokerRow.agencies as any).name || '');
      }

      try {
        const [pkgRes, rfpRes] = await Promise.all([
          fetch('/api/broker/packages', {
            headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
          }),
          // Load RFPs for the create-package dropdown.
          // Using Supabase client directly here since there isn't a dedicated GET endpoint we need.
          supabase
            .from('rfps')
            .select('id, name, client_id, effective_date, current_annual_cost')
            .order('created_at', { ascending: false })
            .limit(200),
        ]);

        const pkgJson = await pkgRes.json();
        if (!pkgRes.ok) {
          setError(pkgJson.error || 'Failed to load packages');
        } else {
          setPackages(pkgJson.packages || []);
        }

        if (rfpRes.data) {
          setRfps(rfpRes.data as Rfp[]);
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to load packages');
      }

      setLoading(false);
    }
    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function handleCreate() {
    setCreateError(null);

    if (!createRfpId) {
      setCreateError('Please select an RFP.');
      return;
    }

    setCreateSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push('/login');
        return;
      }

      const body: any = {
        rfp_id: createRfpId,
        name: createName.trim() || 'Untitled package',
        is_current_plan: createIsCurrentPlan,
      };
      if (createMemberCount.trim()) {
        const n = parseInt(createMemberCount, 10);
        if (!isNaN(n) && n >= 0) {
          body.member_count_assumption = n;
        }
      }

      const res = await fetch('/api/broker/packages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) {
        setCreateError(json.error || 'Failed to create package');
        setCreateSubmitting(false);
        return;
      }

      // Success — navigate to the new package's detail page
      router.push(`/broker/packages/${json.package.id}`);
    } catch (e: any) {
      setCreateError(e?.message || 'Failed to create package');
      setCreateSubmitting(false);
    }
  }

  const filtered = packages.filter(p => {
    if (rfpFilter !== 'all' && p.rfp?.id !== rfpFilter) return false;
    return true;
  });

  const stats = {
    total: packages.length,
    current_plans: packages.filter(p => p.is_current_plan).length,
    recommended: packages.filter(p => p.is_recommended).length,
    rfps_covered: new Set(packages.map(p => p.rfp?.id).filter(Boolean)).size,
  };

  if (loading) return <div style={{ padding: 40, color: '#1e3a5f' }}>Loading...</div>;

  return (
    <div className="dash-layout">
      <BrokerSidebar
        active="packages"
        firstName={firstName}
        lastName={lastName}
        agencyName={agencyName}
        onLogout={handleLogout}
      />
      <main className="dash-main">
        <div style={{ padding: '2rem 2.5rem', maxWidth: 1300 }}>
          <div style={{ fontSize: '0.8rem', color: '#7a8a9b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            Broker · Workflow
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: '0.5rem' }}>
            <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '2.25rem', color: '#1e3a5f', margin: 0 }}>
              Packages
            </h1>
            <button
              onClick={() => {
                setCreateRfpId('');
                setCreateName('');
                setCreateIsCurrentPlan(false);
                setCreateMemberCount('');
                setCreateError(null);
                setShowCreateModal(true);
              }}
              style={{
                background: '#1e3a5f',
                color: '#faf7f2',
                border: 'none',
                padding: '0.6rem 1.25rem',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              + Create Package
            </button>
          </div>

          <p style={{ color: '#3a4d68', fontSize: '1.05rem', marginBottom: '2rem' }}>
            Build what-if benefit packages and model real-time costs across carriers.
          </p>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Total Packages', value: stats.total, color: '#1e3a5f' },
              { label: 'Current Plans', value: stats.current_plans, color: '#3a4d68' },
              { label: 'Recommended', value: stats.recommended, color: '#1e3a5f' },
              { label: 'RFPs Covered', value: stats.rfps_covered, color: '#2d5016' },
            ].map(s => (
              <div key={s.label} style={{
                background: '#faf7f2',
                padding: '1rem 1.25rem',
                borderRadius: 8,
                border: '1px solid #e8e0d0',
              }}>
                <div style={{ fontSize: 11, color: '#7a8a9b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color, marginTop: 4, fontFamily: 'Playfair Display, serif' }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <select
              value={rfpFilter}
              onChange={(e) => setRfpFilter(e.target.value)}
              style={{ padding: '0.5rem 0.75rem', border: '1px solid #e8e0d0', borderRadius: 6, fontSize: 13, background: 'white', color: '#3a4d68' }}
            >
              <option value="all">All RFPs</option>
              {rfps.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            {rfpFilter !== 'all' && (
              <button
                onClick={() => setRfpFilter('all')}
                style={{ background: 'none', border: 'none', color: '#1e3a5f', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Clear filter
              </button>
            )}
            <div style={{ marginLeft: 'auto', fontSize: 13, color: '#7a8a9b' }}>
              Showing {filtered.length} of {packages.length}
            </div>
          </div>

          {error && (
            <div style={{ padding: 16, background: '#fdf3f3', color: '#7a2a2a', borderRadius: 6, marginBottom: 16, border: '1px solid #f3d4d4' }}>
              {error}
            </div>
          )}

          {packages.length === 0 && !error && (
            <div style={{
              background: '#faf7f2',
              padding: '3rem 2rem',
              borderRadius: 12,
              border: '1px solid #e8e0d0',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e3a5f', marginBottom: 8, fontFamily: 'Playfair Display, serif' }}>
                No packages yet
              </div>
              <div style={{ color: '#3a4d68', fontSize: 14, marginBottom: 16 }}>
                Build your first package to start modeling client benefit costs.
              </div>
            </div>
          )}

          {packages.length > 0 && filtered.length === 0 && (
            <div style={{ background: '#faf7f2', padding: '2rem', borderRadius: 8, border: '1px solid #e8e0d0', textAlign: 'center', color: '#3a4d68' }}>
              No packages match this filter.
            </div>
          )}

          {filtered.length > 0 && (
            <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e8e0d0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#faf7f2', borderBottom: '1px solid #e8e0d0' }}>
                    <th style={thStyle}>Package</th>
                    <th style={thStyle}>RFP</th>
                    <th style={thStyle}>Lines</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Annual Cost</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>vs Current</th>
                    <th style={thStyle}>Flags</th>
                    <th style={thStyle}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/broker/packages/${p.id}`)}
                      style={{ borderBottom: '1px solid #f0eee8', cursor: 'pointer' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#faf7f2')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                    >
                      <td style={{ padding: '14px 16px', fontWeight: 500, color: '#1e3a5f' }}>{p.name}</td>
                      <td style={{ padding: '14px 16px', color: '#3a4d68' }}>{p.rfp?.name || '—'}</td>
                      <td style={{ padding: '14px 16px', color: '#3a4d68' }}>{p.line_count}</td>
                      <td style={{ padding: '14px 16px', color: '#1e3a5f', fontWeight: 500, textAlign: 'right' }}>
                        {fmtMoney(p.total_annual_cost)}
                      </td>
                      <td style={{
                        padding: '14px 16px',
                        fontWeight: 500,
                        textAlign: 'right',
                        color: p.cost_change_vs_current_pct === null ? '#3a4d68'
                          : p.cost_change_vs_current_pct > 0 ? '#b91c1c'
                          : '#2d5016',
                      }}>
                        {fmtPct(p.cost_change_vs_current_pct)}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {p.is_current_plan && (
                            <span style={pillStyle('#dde4ee', '#1e3a5f')}>Current</span>
                          )}
                          {p.is_recommended && (
                            <span style={pillStyle('#dcead4', '#2d5016')}>Recommended</span>
                          )}
                          {!p.is_current_plan && !p.is_recommended && (
                            <span style={{ color: '#7a8a9b', fontSize: 12 }}>—</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', color: '#3a4d68' }}>{fmtDate(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Create Package Modal */}
      {showCreateModal && (
        <div
          onClick={() => !createSubmitting && setShowCreateModal(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(30, 58, 95, 0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 12, padding: '2rem',
              width: '90%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.5rem', color: '#1e3a5f', margin: 0, marginBottom: 8 }}>
              Create Package
            </h2>
            <p style={{ color: '#3a4d68', fontSize: 13, marginBottom: 20 }}>
              Build a benefit package for an RFP. You'll add carrier lines next.
            </p>

            <label style={labelStyle}>RFP</label>
            <select
              value={createRfpId}
              onChange={(e) => setCreateRfpId(e.target.value)}
              disabled={createSubmitting}
              style={inputStyle}
            >
              <option value="">Select an RFP...</option>
              {rfps.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>

            <label style={labelStyle}>Package Name</label>
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g., Aetna primary, status quo refresh"
              disabled={createSubmitting}
              style={inputStyle}
            />

            <label style={labelStyle}>Member Count Assumption</label>
            <input
              type="number"
              value={createMemberCount}
              onChange={(e) => setCreateMemberCount(e.target.value)}
              placeholder="e.g., 100"
              disabled={createSubmitting}
              min="0"
              style={inputStyle}
            />

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 20, fontSize: 13, color: '#3a4d68', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={createIsCurrentPlan}
                onChange={(e) => setCreateIsCurrentPlan(e.target.checked)}
                disabled={createSubmitting}
              />
              <span>This is the <strong>current plan</strong> (baseline for comparison)</span>
            </label>

            {createError && (
              <div style={{ padding: 12, background: '#fdf3f3', color: '#7a2a2a', borderRadius: 6, marginBottom: 16, border: '1px solid #f3d4d4', fontSize: 13 }}>
                {createError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                disabled={createSubmitting}
                style={{
                  background: 'white', color: '#3a4d68', border: '1px solid #e8e0d0',
                  padding: '0.6rem 1.25rem', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={createSubmitting || !createRfpId}
                style={{
                  background: createSubmitting || !createRfpId ? '#9aaabe' : '#1e3a5f',
                  color: '#faf7f2', border: 'none',
                  padding: '0.6rem 1.25rem', borderRadius: 6, fontSize: 13, fontWeight: 600,
                  cursor: createSubmitting || !createRfpId ? 'not-allowed' : 'pointer',
                }}
              >
                {createSubmitting ? 'Creating...' : 'Create Package'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Style helpers (kept inline for readability) ----------

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: 11,
  color: '#7a8a9b',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#3a4d68',
  fontWeight: 600,
  marginBottom: 6,
  marginTop: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  border: '1px solid #e8e0d0',
  borderRadius: 6,
  fontSize: 14,
  background: 'white',
  color: '#1e3a5f',
  boxSizing: 'border-box',
};

function pillStyle(bg: string, color: string): React.CSSProperties {
  return {
    background: bg,
    color,
    padding: '3px 10px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  };
}