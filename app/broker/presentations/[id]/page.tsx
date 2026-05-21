'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '../../../supabase';
import BrokerSidebar from '../../../components/BrokerSidebar';

// CHANGED S42: client_id → group_id throughout; client envelope → group envelope
type Presentation = {
  id: string;
  agency_id: string;
  rfp_id: string;
  group_id: string;
  title: string;
  template: 'standard' | 'executive' | 'detailed';
  status: 'draft' | 'finalized' | 'sent';
  pdf_url: string | null;
  excel_url: string | null;
  included_quote_ids: string[];
  generated_by_name: string | null;
  finalized_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  rfp?: { id: string; name: string; effective_date: string | null } | null;
  group?: { id: string; name: string } | null;
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

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
};

export default function PresentationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const presentationId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [pdfSignedUrl, setPdfSignedUrl] = useState<string | null>(null);
  const [excelSignedUrl, setExcelSignedUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

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

      // CHANGED S42: client:clients(id, employer_name) → group:groups(id, name)
      const { data: pres, error: presError } = await supabase
        .from('broker_presentations')
        .select(`
          *,
          rfp:rfps(id, name, effective_date),
          group:groups(id, name)
        `)
        .eq('id', presentationId)
        .maybeSingle();

      if (presError || !pres) {
        setError(presError?.message || 'Presentation not found');
        setLoading(false);
        return;
      }

      setPresentation(pres as Presentation);

      if (pres.pdf_url || pres.excel_url) {
        await refreshSignedUrls(pres.pdf_url, pres.excel_url);
      }

      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentationId]);

  async function refreshSignedUrls(pdfPath: string | null, excelPath: string | null) {
    if (pdfPath) {
      const { data } = await supabase.storage.from('presentations').createSignedUrl(pdfPath, 60 * 60);
      setPdfSignedUrl(data?.signedUrl || null);
    }
    if (excelPath) {
      const { data } = await supabase.storage.from('presentations').createSignedUrl(excelPath, 60 * 60);
      setExcelSignedUrl(data?.signedUrl || null);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function handleGenerate() {
    if (!presentation) return;
    setGenerating(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push('/login');
        return;
      }
      const res = await fetch(`/api/broker/presentations/${presentation.id}/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          'Content-Type': 'application/json',
        },
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Generation failed');
        return;
      }
      setPresentation((prev) => prev ? { ...prev, pdf_url: json.presentation.pdf_url, excel_url: json.presentation.excel_url, updated_at: json.presentation.updated_at } : prev);
      setPdfSignedUrl(json.pdf_signed_url || null);
      setExcelSignedUrl(json.excel_signed_url || null);
    } catch (e: any) {
      setError(e?.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function handleFinalize() {
    if (!presentation) return;
    if (!presentation.pdf_url) {
      setError('Generate the presentation before finalizing.');
      return;
    }
    setFinalizing(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('broker_presentations')
        .update({ status: 'finalized', finalized_at: new Date().toISOString() })
        .eq('id', presentation.id);

      if (updateError) {
        setError(updateError.message);
        return;
      }
      setPresentation((prev) => prev ? { ...prev, status: 'finalized', finalized_at: new Date().toISOString() } : prev);
    } catch (e: any) {
      setError(e?.message || 'Finalize failed');
    } finally {
      setFinalizing(false);
    }
  }

  if (loading) return <div style={{ padding: 40, color: '#1e3a5f' }}>Loading...</div>;

  if (!presentation) {
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
          <div style={{ padding: '2rem 2.5rem' }}>
            <div style={{ padding: 16, background: '#fdf3f3', color: '#7a2a2a', borderRadius: 6, border: '1px solid #f3d4d4' }}>
              {error || 'Presentation not found'}
            </div>
          </div>
        </main>
      </div>
    );
  }

  const statusStyle = STATUS_STYLES[presentation.status] || STATUS_STYLES.draft;
  const isGenerated = !!presentation.pdf_url;

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
        <div style={{ padding: '2rem 2.5rem', maxWidth: 1100 }}>

          <div style={{ fontSize: 13, color: '#7a8a9b', marginBottom: 16 }}>
            <a href="/broker/presentations" style={{ color: '#1e3a5f', textDecoration: 'none' }}>← Presentations</a>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontSize: '0.8rem', color: '#7a8a9b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                {TEMPLATE_LABELS[presentation.template]} Presentation
              </div>
              <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '2rem', color: '#1e3a5f', margin: 0, marginBottom: 6 }}>
                {presentation.title}
              </h1>
              <div style={{ color: '#3a4d68', fontSize: 14 }}>
                {presentation.group?.name && <>For {presentation.group.name} · </>}
                {presentation.rfp?.name && <>{presentation.rfp.name} · </>}
                Created {fmtDate(presentation.created_at)}
              </div>
            </div>
            <span style={{
              background: statusStyle.bg,
              color: statusStyle.color,
              padding: '6px 14px',
              borderRadius: 14,
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              alignSelf: 'flex-start',
            }}>
              {statusStyle.label}
            </span>
          </div>

          {error && (
            <div style={{ padding: 12, background: '#fdf3f3', color: '#7a2a2a', borderRadius: 6, border: '1px solid #f3d4d4', marginTop: 16, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <div style={{
            background: '#faf7f2',
            border: '1px solid #e8e0d0',
            borderRadius: 12,
            padding: '1.75rem 2rem',
            marginTop: 24,
          }}>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.25rem', color: '#1e3a5f', margin: 0, marginBottom: 8 }}>
              {isGenerated ? 'Files ready' : 'Generate files'}
            </h2>
            <p style={{ color: '#3a4d68', fontSize: 14, marginTop: 0, marginBottom: 20 }}>
              {isGenerated
                ? 'Download the latest PDF and Excel below. You can regenerate at any time to pick up new quote data.'
                : 'Click below to render the PDF and Excel deliverables. Both files will be uploaded to your agency storage.'}
            </p>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{
                  padding: '0.7rem 1.25rem',
                  background: '#1e3a5f',
                  color: '#faf7f2',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: generating ? 'not-allowed' : 'pointer',
                  opacity: generating ? 0.6 : 1,
                }}
              >
                {generating ? 'Generating…' : isGenerated ? 'Regenerate' : 'Generate PDF + Excel'}
              </button>

              {pdfSignedUrl && (
                <a
                href={pdfSignedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '0.7rem 1.25rem',
                    background: 'white',
                    color: '#1e3a5f',
                    border: '1px solid #1e3a5f',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: 'none',
                    display: 'inline-block',
                  }}
                >
                  ↓ Download PDF
                </a>
              )}

              {excelSignedUrl && (
                <a
                  href={excelSignedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '0.7rem 1.25rem',
                    background: 'white',
                    color: '#1e3a5f',
                    border: '1px solid #1e3a5f',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: 'none',
                    display: 'inline-block',
                  }}
                >
                  ↓ Download Excel
                </a>
              )}

              {isGenerated && presentation.status === 'draft' && (
                <button
                  onClick={handleFinalize}
                  disabled={finalizing}
                  style={{
                    padding: '0.7rem 1.25rem',
                    background: 'white',
                    color: '#2d5016',
                    border: '1px solid #2d5016',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: finalizing ? 'not-allowed' : 'pointer',
                    opacity: finalizing ? 0.6 : 1,
                    marginLeft: 'auto',
                  }}
                >
                  {finalizing ? 'Finalizing…' : '✓ Mark Finalized'}
                </button>
              )}
            </div>
          </div>

          <div style={{ marginTop: 32, background: 'white', border: '1px solid #e8e0d0', borderRadius: 8, padding: '1.25rem 1.5rem' }}>
            <h3 style={{ fontSize: 14, color: '#7a8a9b', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0, marginBottom: 12, fontWeight: 600 }}>
              Details
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 13 }}>
              <div>
                <div style={{ color: '#7a8a9b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Template</div>
                <div style={{ color: '#1e3a5f', fontWeight: 500 }}>{TEMPLATE_LABELS[presentation.template]}</div>
              </div>
              <div>
                <div style={{ color: '#7a8a9b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Created By</div>
                <div style={{ color: '#1e3a5f', fontWeight: 500 }}>{presentation.generated_by_name || '—'}</div>
              </div>
              <div>
                <div style={{ color: '#7a8a9b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Quotes Included</div>
                <div style={{ color: '#1e3a5f', fontWeight: 500 }}>{presentation.included_quote_ids?.length || 0}</div>
              </div>
              <div>
                <div style={{ color: '#7a8a9b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Last Updated</div>
                <div style={{ color: '#1e3a5f', fontWeight: 500 }}>{fmtDate(presentation.updated_at)}</div>
              </div>
              {presentation.finalized_at && (
                <div>
                  <div style={{ color: '#7a8a9b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Finalized</div>
                  <div style={{ color: '#1e3a5f', fontWeight: 500 }}>{fmtDate(presentation.finalized_at)}</div>
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}