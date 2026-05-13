'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';
import BrokerSidebar from '../../components/BrokerSidebar';

type QuoteRow = {
  id: string;
  rfp_id: string;
  carrier_id: string;
  monthly_cost: number | null;
  total_annual_cost: number | null;
  cost_change_pct: number | null;
  status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  carrier_name: string;
  carrier_logo_url: string | null;
  carrier_brand_color: string | null;
  rfp_name: string;
  client_employer_name: string;
};

type SortKey =
  | 'submitted_at'
  | 'carrier_name'
  | 'rfp_name'
  | 'client_employer_name'
  | 'total_annual_cost'
  | 'cost_change_pct'
  | 'status';
type SortDir = 'asc' | 'desc';

const STATUS_OPTIONS = ['submitted', 'reviewed', 'shortlisted', 'rejected', 'won', 'lost'];

const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  submitted:   { bg: '#e6f0fb', fg: '#1e3a5f', label: 'Submitted' },
  reviewed:    { bg: '#fff4e0', fg: '#8a5a00', label: 'Reviewed' },
  shortlisted: { bg: '#e6f4ea', fg: '#1e5631', label: 'Shortlisted' },
  rejected:    { bg: '#fdecec', fg: '#9b2c2c', label: 'Rejected' },
  won:         { bg: '#d4edda', fg: '#155724', label: 'Won' },
  lost:        { bg: '#e2e3e5', fg: '#383d41', label: 'Lost' },
};

export default function QuotesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agencyName, setAgencyName] = useState('');

  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [carrierFilter, setCarrierFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('submitted_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [errorMsg, setErrorMsg] = useState<string>('');

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

      const { data: brokerRow, error: brokerErr } = await supabase
        .from('brokers')
        .select('agency_id, agencies(name)')
        .eq('user_id', sessionData.session.user.id)
        .maybeSingle();

      if (brokerErr || !brokerRow) {
        setErrorMsg('Could not load broker profile.');
        setLoading(false);
        return;
      }
      if (brokerRow.agencies) {
        setAgencyName((brokerRow.agencies as any).name || '');
      }

      // Fetch all quotes for the agency.
      // RLS already scopes to the agency, but we still join through rfps to get rfp_name + client.
      const { data: quoteRows, error: quotesErr } = await supabase
        .from('quotes')
        .select(`
          id,
          rfp_id,
          carrier_id,
          monthly_cost,
          total_annual_cost,
          cost_change_pct,
          status,
          submitted_at,
          reviewed_at,
          created_at,
          carriers ( name, logo_url, brand_color ),
          rfps ( name, client_id, clients ( employer_name ) )
        `)
        .order('submitted_at', { ascending: false, nullsFirst: false });

      if (quotesErr) {
        setErrorMsg('Error loading quotes: ' + quotesErr.message);
        setLoading(false);
        return;
      }

      const flat: QuoteRow[] = (quoteRows || []).map((q: any) => ({
        id: q.id,
        rfp_id: q.rfp_id,
        carrier_id: q.carrier_id,
        monthly_cost: q.monthly_cost,
        total_annual_cost: q.total_annual_cost,
        cost_change_pct: q.cost_change_pct,
        status: q.status,
        submitted_at: q.submitted_at,
        reviewed_at: q.reviewed_at,
        created_at: q.created_at,
        carrier_name: q.carriers?.name || 'Unknown carrier',
        carrier_logo_url: q.carriers?.logo_url || null,
        carrier_brand_color: q.carriers?.brand_color || null,
        rfp_name: q.rfps?.name || 'Untitled RFP',
        client_employer_name: q.rfps?.clients?.employer_name || '—',
      }));

      setQuotes(flat);
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  // Carrier filter options (unique carriers present in the data)
  const carrierOptions = useMemo(() => {
    const seen = new Map<string, string>();
    quotes.forEach((q) => {
      if (!seen.has(q.carrier_id)) seen.set(q.carrier_id, q.carrier_name);
    });
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [quotes]);

  // Stats (computed BEFORE filtering so the row reflects all quotes)
  const stats = useMemo(() => {
    const total = quotes.length;
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const submittedThisWeek = quotes.filter(
      (q) => q.submitted_at && new Date(q.submitted_at).getTime() >= oneWeekAgo
    ).length;
    const underReview = quotes.filter((q) =>
      ['submitted', 'reviewed'].includes(q.status)
    ).length;
    const shortlisted = quotes.filter((q) => q.status === 'shortlisted').length;
    return { total, submittedThisWeek, underReview, shortlisted };
  }, [quotes]);

  // Apply filters + sort
  const visibleQuotes = useMemo(() => {
    let rows = quotes;
    if (carrierFilter !== 'all') {
      rows = rows.filter((q) => q.carrier_id === carrierFilter);
    }
    if (statusFilter !== 'all') {
      rows = rows.filter((q) => q.status === statusFilter);
    }
    const sorted = [...rows].sort((a, b) => {
      const va = (a as any)[sortKey];
      const vb = (b as any)[sortKey];
      // Null/undefined go to the bottom regardless of direction
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      let cmp = 0;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [quotes, carrierFilter, statusFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'total_annual_cost' || key === 'submitted_at' ? 'desc' : 'asc');
    }
  }

  if (loading) return <div style={{ padding: 40, color: '#1e3a5f' }}>Loading...</div>;

  return (
    <div className="dash-layout">
      <BrokerSidebar
        active="quotes"
        firstName={firstName}
        lastName={lastName}
        agencyName={agencyName}
        onLogout={handleLogout}
      />
      <main className="dash-main">
        <div style={{ padding: '2rem 2.5rem', maxWidth: '1400px' }}>
          {/* Header */}
          <div style={{ fontSize: '0.8rem', color: '#7a8a9b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            Broker · Workflow
          </div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '2.25rem', color: '#1e3a5f', margin: 0, marginBottom: '0.5rem' }}>
            Quotes
          </h1>
          <p style={{ color: '#3a4d68', fontSize: '1.05rem', marginBottom: '2rem' }}>
            All carrier proposals submitted across your RFPs.
          </p>

          {errorMsg && (
            <div style={{
              background: '#fdecec',
              border: '1px solid #f5c6cb',
              color: '#9b2c2c',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              fontSize: '0.9rem',
            }}>
              {errorMsg}
            </div>
          )}

          {/* Stat row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1rem',
            marginBottom: '2rem',
          }}>
            <StatCard label="Total quotes" value={stats.total} />
            <StatCard label="Submitted this week" value={stats.submittedThisWeek} />
            <StatCard label="Under review" value={stats.underReview} />
            <StatCard label="Shortlisted" value={stats.shortlisted} />
          </div>

          {/* Filters */}
          <div style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            marginBottom: '1.25rem',
            flexWrap: 'wrap',
          }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#7a8a9b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                Carrier
              </label>
              <select
                value={carrierFilter}
                onChange={(e) => setCarrierFilter(e.target.value)}
                style={selectStyle}
              >
                <option value="all">All carriers</option>
                {carrierOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#7a8a9b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={selectStyle}
              >
                <option value="all">All statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_STYLES[s]?.label || s}
                  </option>
                ))}
              </select>
            </div>
            {(carrierFilter !== 'all' || statusFilter !== 'all') && (
              <button
                onClick={() => { setCarrierFilter('all'); setStatusFilter('all'); }}
                style={{
                  marginTop: '1.25rem',
                  background: 'transparent',
                  border: 'none',
                  color: '#7a9b76',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Clear filters
              </button>
            )}
            <div style={{
              marginLeft: 'auto',
              marginTop: '1.25rem',
              fontSize: '0.85rem',
              color: '#7a8a9b',
            }}>
              Showing {visibleQuotes.length} of {quotes.length}
            </div>
          </div>

          {/* Table */}
          {quotes.length === 0 ? (
            <EmptyState />
          ) : visibleQuotes.length === 0 ? (
            <NoMatchState onClear={() => { setCarrierFilter('all'); setStatusFilter('all'); }} />
          ) : (
            <div style={{
              background: '#faf7f2',
              border: '1px solid #e8e0d0',
              borderRadius: '12px',
              overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: '#f0ebe0', borderBottom: '1px solid #e8e0d0' }}>
                    <Th label="Carrier" sortKey="carrier_name" current={sortKey} dir={sortDir} onSort={toggleSort} />
                    <Th label="RFP" sortKey="rfp_name" current={sortKey} dir={sortDir} onSort={toggleSort} />
                    <Th label="Client" sortKey="client_employer_name" current={sortKey} dir={sortDir} onSort={toggleSort} />
                    <Th label="Submitted" sortKey="submitted_at" current={sortKey} dir={sortDir} onSort={toggleSort} />
                    <Th label="Annual cost" sortKey="total_annual_cost" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                    <Th label="Δ vs current" sortKey="cost_change_pct" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                    <Th label="Status" sortKey="status" current={sortKey} dir={sortDir} onSort={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {visibleQuotes.map((q) => (
                    <tr
                      key={q.id}
                      onClick={() => router.push(`/broker/rfps/${q.rfp_id}/quotes`)}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid #e8e0d0',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f5efe0')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <div style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: q.carrier_brand_color || '#1e3a5f',
                            color: '#fff',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {q.carrier_name.charAt(0).toUpperCase()}
                          </div>
                          <span style={{ color: '#1e3a5f', fontWeight: 500 }}>{q.carrier_name}</span>
                        </div>
                      </td>
                      <td style={{ ...tdStyle, color: '#3a4d68' }}>{q.rfp_name}</td>
                      <td style={{ ...tdStyle, color: '#3a4d68' }}>{q.client_employer_name}</td>
                      <td style={{ ...tdStyle, color: '#7a8a9b', fontSize: '0.85rem' }}>
                        {formatDate(q.submitted_at)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#1e3a5f', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(q.total_annual_cost)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {formatChangePct(q.cost_change_pct)}
                      </td>
                      <td style={tdStyle}>
                        <StatusPill status={q.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ----- Small components -----

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      background: '#faf7f2',
      border: '1px solid #e8e0d0',
      borderRadius: '12px',
      padding: '1.25rem',
    }}>
      <div style={{ fontSize: '0.75rem', color: '#7a8a9b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 600, color: '#1e3a5f', fontFamily: 'Playfair Display, serif' }}>
        {value}
      </div>
    </div>
  );
}

function Th({
  label,
  sortKey,
  current,
  dir,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: 'right';
}) {
  const isActive = current === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        padding: '0.85rem 1rem',
        textAlign: align || 'left',
        fontSize: '0.75rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: isActive ? '#1e3a5f' : '#7a8a9b',
        fontWeight: 600,
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      {isActive && (
        <span style={{ marginLeft: '0.3rem', fontSize: '0.7rem' }}>
          {dir === 'asc' ? '▲' : '▼'}
        </span>
      )}
    </th>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || { bg: '#e2e3e5', fg: '#383d41', label: status };
  return (
    <span style={{
      display: 'inline-block',
      background: s.bg,
      color: s.fg,
      fontSize: '0.75rem',
      fontWeight: 600,
      padding: '0.25rem 0.6rem',
      borderRadius: '12px',
      letterSpacing: '0.02em',
    }}>
      {s.label}
    </span>
  );
}

function EmptyState() {
  return (
    <div style={{
      background: '#faf7f2',
      border: '1px dashed #d4cab8',
      borderRadius: '12px',
      padding: '3rem 2rem',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📭</div>
      <div style={{ fontSize: '1.1rem', color: '#1e3a5f', fontWeight: 500, marginBottom: '0.4rem' }}>
        No quotes yet
      </div>
      <div style={{ color: '#7a8a9b', fontSize: '0.9rem' }}>
        Carrier proposals will appear here once submitted through your RFPs.
      </div>
    </div>
  );
}

function NoMatchState({ onClear }: { onClear: () => void }) {
  return (
    <div style={{
      background: '#faf7f2',
      border: '1px dashed #d4cab8',
      borderRadius: '12px',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <div style={{ color: '#3a4d68', fontSize: '0.95rem', marginBottom: '0.75rem' }}>
        No quotes match the current filters.
      </div>
      <button
        onClick={onClear}
        style={{
          background: '#7a9b76',
          color: '#faf7f2',
          border: 'none',
          padding: '0.5rem 1rem',
          borderRadius: '6px',
          fontSize: '0.85rem',
          cursor: 'pointer',
          fontWeight: 500,
        }}
      >
        Clear filters
      </button>
    </div>
  );
}

// ----- Formatting helpers -----

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function formatChangePct(n: number | null): string {
  if (n == null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

// ----- Inline styles -----

const tdStyle: React.CSSProperties = {
  padding: '0.85rem 1rem',
  verticalAlign: 'middle',
};

const selectStyle: React.CSSProperties = {
  background: '#faf7f2',
  border: '1px solid #d4cab8',
  borderRadius: '6px',
  padding: '0.5rem 0.75rem',
  fontSize: '0.9rem',
  color: '#1e3a5f',
  cursor: 'pointer',
  minWidth: '180px',
};