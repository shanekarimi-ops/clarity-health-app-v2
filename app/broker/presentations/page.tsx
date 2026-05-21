'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';
import BrokerSidebar from '../../components/BrokerSidebar';

type Presentation = {
  id: string;
  title: string;
  template: 'standard' | 'executive' | 'detailed';
  status: 'draft' | 'finalized' | 'sent';
  pdf_url: string | null;
  excel_url: string | null;
  created_at: string;
  generated_by_name: string | null;
  rfp: { id: string; name: string; effective_date: string | null } | null;
  // CHANGED S42: API returns group:groups(id, name), not client envelope
  group: { id: string; name: string } | null;
};

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  draft:     { bg: '#f0eee8', color: '#3a4d68', label: 'Draft' },
  finalized: { bg: '#dde4ee', color: '#1e3a5f', label: 'Finalized' },
  sent:      { bg: '#dcead4', color: '#2d5016', label: 'Sent' },
};

const TEMPLATE_LABELS: Record<string, string> = {
  standard: 'Standard',
  executive: 'Executive Summary',
  detailed: 'Detailed',
};

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
};

export default function PresentationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [templateFilter, setTemplateFilter] = useState<string>('all');

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
        const res = await fetch('/api/broker/presentations', {
          headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || 'Failed to load presentations');
        } else {
          setPresentations(json.presentations || []);
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to load presentations');
      }

      setLoading(false);
    }
    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const filtered = presentations.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (templateFilter !== 'all' && p.template !== templateFilter) return false;
    return true;
  });

  const stats = {
    total: presentations.length,
    draft: presentations.filter(p => p.status === 'draft').length,
    finalized: presentations.filter(p => p.status === 'finalized').length,
    sent: presentations.filter(p => p.status === 'sent').length,
  };

  if (loading) return <div style={{ padding: 40, color: '#1e3a5f' }}>Loading...</div>;

  return (
    <div className="dash-layout">
      <BrokerSidebar
        active="presentations"
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
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '2.25rem', color: '#1e3a5f', margin: 0, marginBottom: '0.5rem' }}>
            Presentations
          </h1>
          <p style={{ color: '#3a4d68', fontSize: '1.05rem', marginBottom: '2rem' }}>
            Branded client deliverables in PDF and Excel.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Total', value: stats.total, color: '#1e3a5f' },
              { label: 'Draft', value: stats.draft, color: '#3a4d68' },
              { label: 'Finalized', value: stats.finalized, color: '#1e3a5f' },
              { label: 'Sent', value: stats.sent, color: '#2d5016' },
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

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: '0.5rem 0.75rem', border: '1px solid #e8e0d0', borderRadius: 6, fontSize: 13, background: 'white', color: '#3a4d68' }}
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="finalized">Finalized</option>
              <option value="sent">Sent</option>
            </select>
            <select
              value={templateFilter}
              onChange={(e) => setTemplateFilter(e.target.value)}
              style={{ padding: '0.5rem 0.75rem', border: '1px solid #e8e0d0', borderRadius: 6, fontSize: 13, background: 'white', color: '#3a4d68' }}
            >
              <option value="all">All templates</option>
              <option value="standard">Standard</option>
              <option value="executive">Executive Summary</option>
              <option value="detailed">Detailed</option>
            </select>
            {(statusFilter !== 'all' || templateFilter !== 'all') && (
              <button
                onClick={() => { setStatusFilter('all'); setTemplateFilter('all'); }}
                style={{ background: 'none', border: 'none', color: '#1e3a5f', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Clear filters
              </button>
            )}
            <div style={{ marginLeft: 'auto', fontSize: 13, color: '#7a8a9b' }}>
              Showing {filtered.length} of {presentations.length}
            </div>
          </div>

          {error && (
            <div style={{ padding: 16, background: '#fdf3f3', color: '#7a2a2a', borderRadius: 6, marginBottom: 16, border: '1px solid #f3d4d4' }}>
              {error}
            </div>
          )}

          {presentations.length === 0 && !error && (
            <div style={{
              background: '#faf7f2',
              padding: '3rem 2rem',
              borderRadius: 12,
              border: '1px solid #e8e0d0',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e3a5f', marginBottom: 8, fontFamily: 'Playfair Display, serif' }}>
                No presentations yet
              </div>
              <div style={{ color: '#3a4d68', fontSize: 14 }}>
                Open an RFP's quote comparison and click "Create Presentation" to get started.
              </div>
            </div>
          )}

          {presentations.length > 0 && filtered.length === 0 && (
            <div style={{ background: '#faf7f2', padding: '2rem', borderRadius: 8, border: '1px solid #e8e0d0', textAlign: 'center', color: '#3a4d68' }}>
              No presentations match these filters.
            </div>
          )}

          {filtered.length > 0 && (
            <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e8e0d0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#faf7f2', borderBottom: '1px solid #e8e0d0' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, color: '#7a8a9b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Title</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, color: '#7a8a9b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Group</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, color: '#7a8a9b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Template</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, color: '#7a8a9b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, color: '#7a8a9b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Created</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, color: '#7a8a9b', textTransform: 'uppercase', letterSpacing: 0.5 }}>By</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const statusStyle = STATUS_STYLES[p.status] || STATUS_STYLES.draft;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => router.push(`/broker/presentations/${p.id}`)}
                        style={{ borderBottom: '1px solid #f0eee8', cursor: 'pointer' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#faf7f2')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                      >
                        <td style={{ padding: '14px 16px', fontWeight: 500, color: '#1e3a5f' }}>{p.title}</td>
                        <td style={{ padding: '14px 16px', color: '#3a4d68' }}>{p.group?.name || '—'}</td>
                        <td style={{ padding: '14px 16px', color: '#3a4d68' }}>{TEMPLATE_LABELS[p.template]}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{
                            background: statusStyle.bg,
                            color: statusStyle.color,
                            padding: '3px 10px',
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                          }}>
                            {statusStyle.label}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', color: '#3a4d68' }}>{fmtDate(p.created_at)}</td>
                        <td style={{ padding: '14px 16px', color: '#3a4d68' }}>{p.generated_by_name || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}