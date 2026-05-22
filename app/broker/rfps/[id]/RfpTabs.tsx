'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../supabase';

// =====================================================================
// RfpTabs — tab bar + the four non-Overview tab panels for the RFP hub.
// Overview lives in page.tsx; this file owns Quotes / Comparison /
// Presentations / Packages. Each panel loads that RFP's own data and
// links into the existing full pages.
// =====================================================================

export type RfpTabKey =
  | 'overview'
  | 'quotes'
  | 'comparison'
  | 'presentations'
  | 'packages';

const TAB_LABELS: { key: RfpTabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'comparison', label: 'Comparison' },
  { key: 'presentations', label: 'Presentations' },
  { key: 'packages', label: 'Packages' },
];

export function RfpTabBar({
  active,
  onChange,
}: {
  active: RfpTabKey;
  onChange: (key: RfpTabKey) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        borderBottom: '1px solid #e8e0d0',
        marginBottom: 24,
        flexWrap: 'wrap',
      }}
    >
      {TAB_LABELS.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: isActive ? '2px solid #1e3a5f' : '2px solid transparent',
              color: isActive ? '#1e3a5f' : '#7a8a9b',
              fontSize: 14,
              fontWeight: isActive ? 700 : 500,
              fontFamily: 'Figtree, sans-serif',
              padding: '10px 16px',
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// =====================================================================
// Shared small pieces
// =====================================================================

function PanelCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #eef1f4',
        borderRadius: 12,
        padding: 24,
        fontFamily: 'Figtree, sans-serif',
      }}
    >
      {children}
    </div>
  );
}

function PanelLoading() {
  return <div style={{ color: '#3a4d68', fontSize: 14 }}>Loading...</div>;
}

function PanelError({ message }: { message: string }) {
  return (
    <div
      style={{
        background: '#fdecec',
        border: '1px solid #f0baba',
        color: '#9a3a3a',
        padding: '0.85rem 1rem',
        borderRadius: 8,
        fontSize: 14,
      }}
    >
      {message}
    </div>
  );
}

function PanelEmpty({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div
      style={{
        background: '#faf7f2',
        border: '1px dashed #d4c8b0',
        borderRadius: 8,
        padding: '2.5rem 2rem',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '2rem', marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#1e3a5f', marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ color: '#7a8a9b', fontSize: 14, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  background: '#1e3a5f',
  color: '#faf7f2',
  border: 'none',
  padding: '10px 18px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'Figtree, sans-serif',
  textDecoration: 'none',
  display: 'inline-block',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 14px',
  fontSize: 11,
  color: '#7a8a9b',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  fontWeight: 600,
  borderBottom: '1px solid #e8e0d0',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: 13,
  color: '#3a4d68',
  borderBottom: '1px solid #f0eee8',
};

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return String(iso);
  }
}

function StatusChip({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span
      style={{
        background: bg,
        color: fg,
        padding: '3px 10px',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        display: 'inline-block',
      }}
    >
      {label}
    </span>
  );
}

// =====================================================================
// QUOTES TAB — this RFP's submitted quotes, with a link to the full
// comparison page.
// =====================================================================

type QuoteLite = {
  id: string;
  carrier_name: string;
  monthly_cost: number | null;
  total_annual_cost: number | null;
  status: string;
  submitted_at: string | null;
};

const QUOTE_STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  submitted: { bg: '#e6f0fb', fg: '#1e3a5f', label: 'Submitted' },
  reviewed: { bg: '#fff4e0', fg: '#8a5a00', label: 'Reviewed' },
  shortlisted: { bg: '#e6f4ea', fg: '#1e5631', label: 'Shortlisted' },
  rejected: { bg: '#fdecec', fg: '#9b2c2c', label: 'Rejected' },
  won: { bg: '#d4edda', fg: '#155724', label: 'Won' },
  lost: { bg: '#e2e3e5', fg: '#383d41', label: 'Lost' },
};

export function QuotesTab({ rfpId }: { rfpId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quotes, setQuotes] = useState<QuoteLite[]>([]);

  useEffect(() => {
    async function load() {
      const { data, error: qErr } = await supabase
        .from('quotes')
        .select(`
          id,
          monthly_cost,
          total_annual_cost,
          status,
          submitted_at,
          carriers ( name )
        `)
        .eq('rfp_id', rfpId)
        .order('submitted_at', { ascending: false, nullsFirst: false });

      if (qErr) {
        setError('Could not load quotes: ' + qErr.message);
        setLoading(false);
        return;
      }

      const flat: QuoteLite[] = (data || []).map((q: any) => ({
        id: q.id,
        carrier_name: q.carriers?.name || 'Unknown carrier',
        monthly_cost: q.monthly_cost,
        total_annual_cost: q.total_annual_cost,
        status: q.status,
        submitted_at: q.submitted_at,
      }));
      setQuotes(flat);
      setLoading(false);
    }
    load();
  }, [rfpId]);

  return (
    <PanelCard>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h2
          style={{
            fontFamily: 'Playfair Display, serif',
            fontSize: 20,
            color: '#1e3a5f',
            margin: 0,
          }}
        >
          Carrier Quotes ({quotes.length})
        </h2>
        {quotes.length > 0 && (
          <a href={`/broker/rfps/${rfpId}/quotes`} style={primaryBtn}>
            Open full comparison →
          </a>
        )}
      </div>

      {loading ? (
        <PanelLoading />
      ) : error ? (
        <PanelError message={error} />
      ) : quotes.length === 0 ? (
        <PanelEmpty
          icon="💬"
          title="No quotes yet for this RFP"
          body="Once carriers submit proposals through the carrier portal, they'll appear here."
        />
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e8e0d0', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#faf7f2' }}>
                <th style={thStyle}>Carrier</th>
                <th style={thStyle}>Monthly</th>
                <th style={thStyle}>Annual</th>
                <th style={thStyle}>Submitted</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const st =
                  QUOTE_STATUS_STYLES[q.status] || {
                    bg: '#e2e3e5',
                    fg: '#383d41',
                    label: q.status,
                  };
                return (
                  <tr
                    key={q.id}
                    onClick={() => router.push(`/broker/rfps/${rfpId}/quotes`)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = '#faf7f2';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#1e3a5f' }}>
                      {q.carrier_name}
                    </td>
                    <td style={tdStyle}>{fmtMoney(q.monthly_cost)}</td>
                    <td style={tdStyle}>{fmtMoney(q.total_annual_cost)}</td>
                    <td style={tdStyle}>{fmtDate(q.submitted_at)}</td>
                    <td style={tdStyle}>
                      <StatusChip label={st.label} bg={st.bg} fg={st.fg} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PanelCard>
  );
}

// =====================================================================
// COMPARISON TAB — a pointer into the full side-by-side comparison page,
// which already has the AI summary + benefit-line breakdown.
// =====================================================================

export function ComparisonTab({ rfpId }: { rfpId: string }) {
  const [loading, setLoading] = useState(true);
  const [quoteCount, setQuoteCount] = useState(0);

  useEffect(() => {
    async function load() {
      const { count } = await supabase
        .from('quotes')
        .select('id', { count: 'exact', head: true })
        .eq('rfp_id', rfpId);
      setQuoteCount(count || 0);
      setLoading(false);
    }
    load();
  }, [rfpId]);

  return (
    <PanelCard>
      <h2
        style={{
          fontFamily: 'Playfair Display, serif',
          fontSize: 20,
          color: '#1e3a5f',
          margin: '0 0 8px',
        }}
      >
        Quote Comparison
      </h2>

      {loading ? (
        <PanelLoading />
      ) : quoteCount === 0 ? (
        <PanelEmpty
          icon="📊"
          title="Nothing to compare yet"
          body="The side-by-side comparison and AI summary become available once carriers submit quotes."
        />
      ) : (
        <>
          <p style={{ color: '#3a4d68', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
            {quoteCount} quote{quoteCount === 1 ? '' : 's'} on this RFP. The full comparison
            view shows a side-by-side breakdown by benefit line, an AI summary versus the
            current plan, and lets you shortlist or reject quotes.
          </p>
          <a href={`/broker/rfps/${rfpId}/quotes`} style={primaryBtn}>
            Open Quote Comparison →
          </a>
        </>
      )}
    </PanelCard>
  );
}

// =====================================================================
// PRESENTATIONS TAB — this RFP's presentations. The presentations API
// has no rfp_id param, so we fetch all and filter client-side.
// =====================================================================

type PresentationLite = {
  id: string;
  title: string;
  template: string;
  status: string;
  created_at: string;
  generated_by_name: string | null;
  rfp: { id: string } | null;
};

const PRES_STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  draft: { bg: '#f0eee8', fg: '#3a4d68', label: 'Draft' },
  finalized: { bg: '#dde4ee', fg: '#1e3a5f', label: 'Finalized' },
  sent: { bg: '#dcead4', fg: '#2d5016', label: 'Sent' },
};

const TEMPLATE_LABELS: Record<string, string> = {
  standard: 'Standard',
  executive: 'Executive Summary',
  detailed: 'Detailed',
};

export function PresentationsTab({ rfpId }: { rfpId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState<PresentationLite[]>([]);

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setError('Your session has expired. Please log in again.');
        setLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/broker/presentations', {
          headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || 'Failed to load presentations');
          setLoading(false);
          return;
        }
        const all: PresentationLite[] = json.presentations || [];
        setItems(all.filter((p) => p.rfp?.id === rfpId));
      } catch (e: any) {
        setError(e?.message || 'Failed to load presentations');
      }
      setLoading(false);
    }
    load();
  }, [rfpId]);

  return (
    <PanelCard>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h2
          style={{
            fontFamily: 'Playfair Display, serif',
            fontSize: 20,
            color: '#1e3a5f',
            margin: 0,
          }}
        >
          Presentations ({items.length})
        </h2>
        <a href={`/broker/rfps/${rfpId}/quotes`} style={primaryBtn}>
          Create from comparison →
        </a>
      </div>

      {loading ? (
        <PanelLoading />
      ) : error ? (
        <PanelError message={error} />
      ) : items.length === 0 ? (
        <PanelEmpty
          icon="📑"
          title="No presentations for this RFP yet"
          body="Open the Quote Comparison and use Create Presentation to generate a client-ready PDF and Excel."
        />
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e8e0d0', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#faf7f2' }}>
                <th style={thStyle}>Title</th>
                <th style={thStyle}>Template</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>By</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const st =
                  PRES_STATUS_STYLES[p.status] || PRES_STATUS_STYLES.draft;
                return (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/broker/presentations/${p.id}`)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = '#faf7f2';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#1e3a5f' }}>
                      {p.title}
                    </td>
                    <td style={tdStyle}>
                      {TEMPLATE_LABELS[p.template] || p.template}
                    </td>
                    <td style={tdStyle}>
                      <StatusChip label={st.label} bg={st.bg} fg={st.fg} />
                    </td>
                    <td style={tdStyle}>{fmtDate(p.created_at)}</td>
                    <td style={tdStyle}>{p.generated_by_name || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PanelCard>
  );
}

// =====================================================================
// PACKAGES TAB — this RFP's packages. The packages API DOES support an
// rfp_id query param, so we filter server-side.
// =====================================================================

type PackageLite = {
  id: string;
  name: string;
  status: string;
  is_recommended: boolean;
  is_current_plan: boolean;
  total_annual_cost: number | null;
  cost_change_vs_current_pct: number | null;
  line_count: number;
  created_at: string;
};

export function PackagesTab({ rfpId }: { rfpId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState<PackageLite[]>([]);

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setError('Your session has expired. Please log in again.');
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/broker/packages?rfp_id=${rfpId}`, {
          headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || 'Failed to load packages');
          setLoading(false);
          return;
        }
        setItems(json.packages || []);
      } catch (e: any) {
        setError(e?.message || 'Failed to load packages');
      }
      setLoading(false);
    }
    load();
  }, [rfpId]);

  return (
    <PanelCard>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h2
          style={{
            fontFamily: 'Playfair Display, serif',
            fontSize: 20,
            color: '#1e3a5f',
            margin: 0,
          }}
        >
          Packages ({items.length})
        </h2>
        <a href="/broker/packages" style={primaryBtn}>
          Open Packages →
        </a>
      </div>

      {loading ? (
        <PanelLoading />
      ) : error ? (
        <PanelError message={error} />
      ) : items.length === 0 ? (
        <PanelEmpty
          icon="📦"
          title="No packages for this RFP yet"
          body="Build a what-if benefit package to model real-time costs across carriers for this RFP."
        />
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e8e0d0', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#faf7f2' }}>
                <th style={thStyle}>Package</th>
                <th style={thStyle}>Lines</th>
                <th style={thStyle}>Annual Cost</th>
                <th style={thStyle}>vs Current</th>
                <th style={thStyle}>Flags</th>
                <th style={thStyle}>Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/broker/packages/${p.id}`)}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = '#faf7f2';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <td style={{ ...tdStyle, fontWeight: 600, color: '#1e3a5f' }}>
                    {p.name}
                  </td>
                  <td style={tdStyle}>{p.line_count}</td>
                  <td style={tdStyle}>{fmtMoney(p.total_annual_cost)}</td>
                  <td
                    style={{
                      ...tdStyle,
                      fontWeight: 600,
                      color:
                        p.cost_change_vs_current_pct === null
                          ? '#3a4d68'
                          : p.cost_change_vs_current_pct > 0
                          ? '#b91c1c'
                          : '#2d5016',
                    }}
                  >
                    {fmtPct(p.cost_change_vs_current_pct)}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {p.is_current_plan && (
                        <StatusChip label="Current" bg="#dde4ee" fg="#1e3a5f" />
                      )}
                      {p.is_recommended && (
                        <StatusChip label="Recommended" bg="#dcead4" fg="#2d5016" />
                      )}
                      {!p.is_current_plan && !p.is_recommended && (
                        <span style={{ color: '#7a8a9b', fontSize: 12 }}>—</span>
                      )}
                    </div>
                  </td>
                  <td style={tdStyle}>{fmtDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelCard>
  );
}