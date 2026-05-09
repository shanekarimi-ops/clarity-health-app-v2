'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../supabase';
import BrokerSidebar from '../../../components/BrokerSidebar';
import { getAccountType } from '../../../lib/account';
import { BENEFIT_LINES, BENEFIT_LINE_LABELS, BenefitLineValue, filterValidBenefitLines } from '../../../lib/benefit-lines';

type Rfp = {
  id: string;
  agency_id: string;
  client_id: string;
  created_by_user_id: string;
  name: string;
  rfp_type: string;
  effective_date: string | null;
  status: string;
  current_plan_doc_url: string | null;
  current_plan_design: any | null;
  employee_lives: number | null;
  created_at: string;
  updated_at: string;
  clients?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    employer_name: string | null;
  } | null;
};

type DistributionRow = {
  id: string; // rfp_carriers.id
  carrier_id: string;
  assigned_carrier_user_id: string | null;
  requested_benefits: string[];
  status: string;
  sent_at: string | null;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
  downloaded_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  created_at: string;
  carrier: {
    id: string;
    name: string;
    brand_color: string | null;
  };
  carrier_user: {
    id: string;
    email: string;
    full_name: string | null;
    title: string | null;
  } | null;
};

type PrefillCarrier = {
  carrier_id: string;
  carrier_user_id: string;
  requested_benefits: BenefitLineValue[];
};

export default function RFPDetailPage() {
  const router = useRouter();
  const params = useParams();
  const rfpId = params?.id as string | undefined;

  const [bootLoading, setBootLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [agencyId, setAgencyId] = useState<string>('');
  const [agencyName, setAgencyName] = useState('Your Agency');

  const [rfp, setRfp] = useState<Rfp | null>(null);
  const [rfpLoading, setRfpLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadLoading, setDownloadLoading] = useState(false);

  const [distributions, setDistributions] = useState<DistributionRow[]>([]);
  const [distributionsLoading, setDistributionsLoading] = useState(true);
  const [distributionsError, setDistributionsError] = useState<string | null>(null);

  const [showSendModal, setShowSendModal] = useState(false);
  const [prefillCarrier, setPrefillCarrier] = useState<PrefillCarrier | null>(null);

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (!rfpId || bootLoading) return;
    loadRfp();
    loadDistributions();
  }, [rfpId, bootLoading]);

  async function bootstrap() {
    setBootLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    if (getAccountType(user) !== 'broker') {
      router.push('/profile');
      return;
    }
    setUser(user);

    const { data: brokerData } = await supabase
      .from('brokers')
      .select('agency_id, agencies(name)')
      .eq('user_id', user.id)
      .single();

    if (brokerData?.agency_id) {
      setAgencyId(brokerData.agency_id);
    }
    if (brokerData?.agencies) {
      setAgencyName((brokerData.agencies as any).name || 'Your Agency');
    }

    setBootLoading(false);
  }

  async function loadRfp() {
    setRfpLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rfps/${rfpId}`);
      const result = await res.json();
      if (!res.ok || !result.success) {
        setError(result.message || result.error || 'Failed to load RFP.');
        setRfpLoading(false);
        return;
      }
      setRfp(result.rfp);
      setRfpLoading(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load RFP.';
      setError(msg);
      setRfpLoading(false);
    }
  }

  async function loadDistributions() {
    if (!rfpId) return;
    setDistributionsLoading(true);
    setDistributionsError(null);
    try {
      const { data, error: distErr } = await supabase
        .from('rfp_carriers')
        .select(`
          id,
          carrier_id,
          assigned_carrier_user_id,
          requested_benefits,
          status,
          sent_at,
          first_opened_at,
          last_opened_at,
          open_count,
          downloaded_at,
          declined_at,
          decline_reason,
          created_at,
          carrier:carriers (id, name, brand_color),
          carrier_user:carrier_users!rfp_carriers_assigned_carrier_user_id_fkey (id, email, full_name, title)
        `)
        .eq('rfp_id', rfpId)
        .order('sent_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (distErr) throw distErr;
      setDistributions((data || []) as unknown as DistributionRow[]);
    } catch (e: any) {
      setDistributionsError(e?.message || 'Failed to load distributions');
    } finally {
      setDistributionsLoading(false);
    }
  }

  async function handleDownloadSpd() {
    if (!rfp?.current_plan_doc_url) return;
    setDownloadLoading(true);
    try {
      const { data, error: signedErr } = await supabase.storage
        .from('rfp-documents')
        .createSignedUrl(rfp.current_plan_doc_url, 3600);

      if (signedErr) {
        alert(`Couldn't generate download link: ${signedErr.message}`);
        setDownloadLoading(false);
        return;
      }

      if (data?.signedUrl) {
        setDownloadUrl(data.signedUrl);
        window.open(data.signedUrl, '_blank');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed.';
      alert(`Couldn't generate download link: ${msg}`);
    } finally {
      setDownloadLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  function handleSendModalClose(refresh: boolean) {
    setShowSendModal(false);
    setPrefillCarrier(null);
    if (refresh) {
      loadRfp();
      loadDistributions();
    }
  }

  function handleResendClick(dist: DistributionRow) {
    if (!dist.assigned_carrier_user_id) return;
    const validBenefits = filterValidBenefitLines(dist.requested_benefits || []);
    setPrefillCarrier({
      carrier_id: dist.carrier_id,
      carrier_user_id: dist.assigned_carrier_user_id,
      requested_benefits: validBenefits,
    });
    setShowSendModal(true);
  }

  const planDesign = rfp?.current_plan_design || {};
  const planOptions: any[] = planDesign.planOptions || [];
  const rx = planDesign.rx;
  const dental = planDesign.dental;
  const vision = planDesign.vision;
  const life = planDesign.life;
  const planYear = planDesign.planYear;
  const extractedData = planDesign.extractedData;

  const clientLabel =
    rfp?.clients?.employer_name ||
    [rfp?.clients?.first_name, rfp?.clients?.last_name].filter(Boolean).join(' ') ||
    'Unknown client';

  const spdFilename = rfp?.current_plan_doc_url
    ? rfp.current_plan_doc_url.split('/').pop()
    : null;

  const canSend = !!rfp && rfp.status !== 'cancelled' && rfp.status !== 'won' && rfp.status !== 'lost';
  const isAlreadyDistributed = !!rfp && rfp.status !== 'draft';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#faf7f2' }}>
      <BrokerSidebar
        active="rfps"
        firstName={user?.user_metadata?.first_name || ''}
        lastName={user?.user_metadata?.last_name || ''}
        agencyName={agencyName}
        onLogout={handleLogout}
      />

      <div style={{ flex: 1, padding: 40, fontFamily: 'Figtree, sans-serif' }}>
        <div style={{ maxWidth: 1000 }}>
          <a
            href="/broker/rfps"
            style={{
              color: '#3a4d68',
              fontSize: 14,
              textDecoration: 'none',
              fontFamily: 'Figtree, sans-serif',
              display: 'inline-block',
              marginBottom: 16,
            }}
          >
            ← All RFPs
          </a>

          {(bootLoading || rfpLoading) && (
            <div style={{ color: '#3a4d68', fontSize: 14 }}>Loading...</div>
          )}

          {!bootLoading && !rfpLoading && error && (
            <div
              style={{
                marginTop: 24,
                padding: 14,
                background: '#fde8e8',
                border: '1px solid #f5b7b7',
                borderRadius: 8,
                color: '#9b2c2c',
                fontSize: 14,
              }}
            >
              <strong>Couldn't load this RFP:</strong> {error}
            </div>
          )}

          {!bootLoading && !rfpLoading && !error && !rfp && (
            <div
              style={{
                marginTop: 24,
                padding: 24,
                background: 'white',
                border: '1px solid #eef1f4',
                borderRadius: 12,
                fontSize: 14,
                color: '#3a4d68',
              }}
            >
              RFP not found.
            </div>
          )}

          {!bootLoading && !rfpLoading && rfp && (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 24,
                  gap: 24,
                }}
              >
                <div style={{ flex: 1 }}>
                  <h1
                    style={{
                      fontFamily: 'Playfair Display, serif',
                      fontSize: 36,
                      color: '#1e3a5f',
                      margin: '0 0 8px 0',
                    }}
                  >
                    {rfp.name}
                  </h1>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <StatusBadge status={rfp.status} />
                    <span style={{ color: '#3a4d68', fontSize: 14 }}>
                      For <strong style={{ color: '#1e3a5f' }}>{clientLabel}</strong>
                    </span>
                  </div>
                </div>
                <a
                  href={`/broker/rfps/${rfp.id}/edit`}
                  style={{
                    background: 'white',
                    color: '#1e3a5f',
                    border: '1px solid #1e3a5f',
                    padding: '10px 20px',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'Figtree, sans-serif',
                    textDecoration: 'none',
                    display: 'inline-block',
                  }}
                >
                  Edit RFP
                </a>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 12,
                  marginBottom: 24,
                }}
              >
                <FactCard label="Plan year" value={planYear ? String(planYear) : '—'} />
                <FactCard
                  label="Effective date"
                  value={rfp.effective_date ? new Date(rfp.effective_date).toLocaleDateString() : '—'}
                />
                <FactCard
                  label="Census"
                  value={rfp.employee_lives ? `${rfp.employee_lives} members` : '—'}
                />
                <FactCard
                  label="Plans / tiers"
                  value={
                    planOptions.length === 0
                      ? '—'
                      : `${planOptions.length} / ${planOptions.reduce(
                          (s: number, p: any) => s + (p.tiers?.length || 0),
                          0
                        )}`
                  }
                />
              </div>

              <SectionCard title="Source SPD">
                {spdFilename ? (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 16,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          background: '#faf7f2',
                          borderRadius: 8,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#1e3a5f',
                          fontSize: 18,
                        }}
                      >
                        📄
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1e3a5f' }}>
                          {spdFilename}
                        </div>
                        {extractedData?.employer_name && (
                          <div style={{ fontSize: 12, color: '#3a4d68' }}>
                            Employer: {extractedData.employer_name}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={handleDownloadSpd}
                      disabled={downloadLoading}
                      style={{
                        background: 'white',
                        color: '#1e3a5f',
                        border: '1px solid #d4d4d4',
                        padding: '8px 16px',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: downloadLoading ? 'not-allowed' : 'pointer',
                        fontFamily: 'Figtree, sans-serif',
                      }}
                    >
                      {downloadLoading ? 'Generating link...' : 'Download'}
                    </button>
                  </div>
                ) : (
                  <div style={{ color: '#3a4d68', fontSize: 13, fontStyle: 'italic' }}>
                    No SPD uploaded for this RFP.
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Plan design">
                {planOptions.length === 0 ? (
                  <div style={{ color: '#3a4d68', fontSize: 13, fontStyle: 'italic' }}>
                    No medical plans configured.
                  </div>
                ) : (
                  planOptions.map((plan: any, pi: number) => (
                    <PlanReadOnly key={pi} plan={plan} />
                  ))
                )}
              </SectionCard>

              <SectionCard title="Ancillary lines">
                <AncillaryReadOnly rx={rx} dental={dental} vision={vision} life={life} />
              </SectionCard>

              <SectionCard title="Send to carriers">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 16,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1e3a5f', marginBottom: 4 }}>
                      {isAlreadyDistributed ? 'Send to additional carriers' : 'Distribute this RFP'}
                    </div>
                    <div style={{ fontSize: 13, color: '#3a4d68' }}>
                      {isAlreadyDistributed
                        ? 'Add more carriers to this RFP, or resend to a rep who needs an updated invite.'
                        : 'Pick which carriers and reps should receive this RFP. They\'ll get an email with a magic link to review and quote.'}
                    </div>
                  </div>
                  <button
                    onClick={() => { setPrefillCarrier(null); setShowSendModal(true); }}
                    disabled={!canSend}
                    title={!canSend ? 'This RFP is closed and cannot be sent.' : 'Send to carriers'}
                    style={{
                      background: canSend ? '#7a9b76' : '#c5d1c2',
                      color: 'white',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: canSend ? 'pointer' : 'not-allowed',
                      fontFamily: 'Figtree, sans-serif',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isAlreadyDistributed ? 'Send to more carriers' : 'Send to carriers'}
                  </button>
                </div>
              </SectionCard>

              <SectionCard title="Distribution">
                <DistributionList
                  loading={distributionsLoading}
                  error={distributionsError}
                  rows={distributions}
                  onResend={handleResendClick}
                />
              </SectionCard>

              <div
                style={{
                  fontSize: 12,
                  color: '#7a8a9c',
                  marginTop: 16,
                  display: 'flex',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <span>Created {new Date(rfp.created_at).toLocaleString()}</span>
                {rfp.updated_at && rfp.updated_at !== rfp.created_at && (
                  <span>· Updated {new Date(rfp.updated_at).toLocaleString()}</span>
                )}
                <span>· ID: {rfp.id}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {showSendModal && rfp && (
        <SendCarriersModal
          rfpId={rfp.id}
          rfpName={rfp.name}
          rfp={rfp}
          agencyId={agencyId}
          prefillCarrier={prefillCarrier}
          onClose={handleSendModalClose}
        />
      )}
    </div>
  );
}

// =====================================================================
// Distribution list — shows every rfp_carriers row with status + resend
// =====================================================================
function DistributionList({
  loading,
  error,
  rows,
  onResend,
}: {
  loading: boolean;
  error: string | null;
  rows: DistributionRow[];
  onResend: (dist: DistributionRow) => void;
}) {
  if (loading) {
    return <div style={{ color: '#3a4d68', fontSize: 13, padding: '0.5rem 0' }}>Loading...</div>;
  }
  if (error) {
    return (
      <div style={{
        background: '#fdecec',
        border: '1px solid #f0baba',
        color: '#9a3a3a',
        padding: '0.65rem 0.85rem',
        borderRadius: 6,
        fontSize: 13,
      }}>
        Couldn't load distribution: {error}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div style={{
        background: '#faf7f2',
        border: '1px dashed #d4c8b0',
        borderRadius: 8,
        padding: '1.5rem',
        textAlign: 'center',
        color: '#3a4d68',
        fontSize: 13,
      }}>
        No carriers yet. Send this RFP to start tracking responses here.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((dist) => (
        <DistributionRowCard key={dist.id} dist={dist} onResend={onResend} />
      ))}
    </div>
  );
}

function DistributionRowCard({
  dist,
  onResend,
}: {
  dist: DistributionRow;
  onResend: (dist: DistributionRow) => void;
}) {
  const carrierName = dist.carrier?.name || 'Unknown carrier';
  const initials = carrierName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const brandColor = dist.carrier?.brand_color || '#1e3a5f';

  const repName = dist.carrier_user?.full_name || dist.carrier_user?.email?.split('@')[0] || '—';
  const repEmail = dist.carrier_user?.email || '—';

  // Pick the most informative timestamp to show
  const timeline = buildTimelineLabel(dist);

  // Humanize the benefit array
  const benefitLabels = (dist.requested_benefits || [])
    .filter(v => v in BENEFIT_LINE_LABELS)
    .map(v => BENEFIT_LINE_LABELS[v as BenefitLineValue])
    .join(' · ');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 14px',
        border: '1px solid #eef1f4',
        borderRadius: 8,
        background: '#fff',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: brandColor,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {initials}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1e3a5f' }}>
            {carrierName}
          </span>
          <CarrierStatusPill status={dist.status} />
        </div>
        <div style={{ fontSize: 12, color: '#3a4d68', marginTop: 2 }}>
          <span style={{ fontWeight: 500 }}>{repName}</span>
          {repEmail !== '—' && <span style={{ color: '#7a8a9b' }}> · {repEmail}</span>}
        </div>
        {benefitLabels && (
          <div style={{ fontSize: 11, color: '#7a8a9b', marginTop: 2 }}>
            {benefitLabels}
          </div>
        )}
        {timeline && (
          <div style={{ fontSize: 11, color: '#7a8a9b', marginTop: 4 }}>
            {timeline}
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0 }}>
        <button
          onClick={() => onResend(dist)}
          disabled={!dist.assigned_carrier_user_id}
          title={dist.assigned_carrier_user_id ? 'Send a fresh invite to this rep' : 'No rep assigned to resend'}
          style={{
            background: 'transparent',
            border: '1px solid #cbd5db',
            color: '#3a4d68',
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: dist.assigned_carrier_user_id ? 'pointer' : 'not-allowed',
            fontFamily: 'Figtree, sans-serif',
            opacity: dist.assigned_carrier_user_id ? 1 : 0.5,
          }}
        >
          Resend
        </button>
      </div>
    </div>
  );
}

// rfp_carriers.status: pending | sent | opened | downloaded | in_progress | submitted | declined | won | lost
function CarrierStatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    pending: { bg: '#f5f5f5', fg: '#666', label: 'Pending' },
    sent: { bg: '#eef2f7', fg: '#1e3a5f', label: 'Sent' },
    opened: { bg: '#fef9ec', fg: '#7a5e1a', label: 'Opened' },
    downloaded: { bg: '#fef9ec', fg: '#7a5e1a', label: 'Downloaded' },
    in_progress: { bg: '#fef9ec', fg: '#7a5e1a', label: 'In Progress' },
    submitted: { bg: '#e8f0e6', fg: '#5a7a56', label: 'Quoted' },
    declined: { bg: '#fdecec', fg: '#9a3a3a', label: 'Declined' },
    won: { bg: '#dff0d8', fg: '#3c763d', label: 'Won' },
    lost: { bg: '#f2dede', fg: '#a94442', label: 'Lost' },
  };
  const c = map[status] || { bg: '#f5f5f5', fg: '#666', label: status };
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        fontSize: 10,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
      }}
    >
      {c.label}
    </span>
  );
}

// Build a single line summarizing the most recent meaningful event for a row
function buildTimelineLabel(dist: DistributionRow): string {
  if (dist.declined_at) return `Declined ${formatRelative(dist.declined_at)}${dist.decline_reason ? ` — ${dist.decline_reason}` : ''}`;
  if (dist.downloaded_at) return `Downloaded SPD ${formatRelative(dist.downloaded_at)}`;
  if (dist.last_opened_at) {
    const opens = dist.open_count || 1;
    return `Opened ${formatRelative(dist.last_opened_at)}${opens > 1 ? ` · ${opens} opens` : ''}`;
  }
  if (dist.sent_at) return `Sent ${formatRelative(dist.sent_at)}`;
  return '';
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`;
  if (diffHour < 24) return `${diffHour} hr${diffHour === 1 ? '' : 's'} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: now.getFullYear() === d.getFullYear() ? undefined : 'numeric' });
}

// =====================================================================
// Send Carriers Modal — multi-step wizard (Pushes 5-7)
// Push 8: prefillCarrier prop pre-loads state to a single carrier+rep
// =====================================================================

type AgencyCarrierRow = {
  id: string;
  carrier_id: string;
  is_favorite: boolean;
  carrier: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    brand_color: string | null;
    is_global: boolean;
  };
  rep_count: number;
};

type CarrierUserRow = {
  id: string;
  carrier_id: string;
  email: string;
  full_name: string | null;
  title: string | null;
  status: string;
};

type WizardStep = 1 | 2 | 3;

type SendApiResultRow = {
  rfp_carrier_id: string;
  carrier_id: string;
  carrier_user_id: string;
  email: string;
  status: 'sent' | 'resent' | 'failed';
  error?: string;
};

type SendApiResult = {
  success: boolean;
  sent: number;
  resent: number;
  failed: number;
  results: SendApiResultRow[];
};

function computeBenefitDefaults(rfp: Rfp): Set<BenefitLineValue> {
  const design = rfp.current_plan_design || {};
  const defaults = new Set<BenefitLineValue>();
  if (Array.isArray(design.planOptions) && design.planOptions.length > 0) {
    defaults.add('medical');
  }
  if (design.dental?.carrier) defaults.add('dental');
  if (design.vision?.carrier) defaults.add('vision');
  if (design.life?.carrier || design.life?.amount) defaults.add('basic_life_add');
  return defaults;
}

function SendCarriersModal({
  rfpId,
  rfpName,
  rfp,
  agencyId,
  prefillCarrier,
  onClose,
}: {
  rfpId: string;
  rfpName: string;
  rfp: Rfp;
  agencyId: string;
  prefillCarrier: PrefillCarrier | null;
  onClose: (refresh: boolean) => void;
}) {
  // If prefillCarrier is set, jump straight to step 3 (review) — broker just wants to resend
  const [step, setStep] = useState<WizardStep>(prefillCarrier ? 3 : 1);

  const [agencyCarriers, setAgencyCarriers] = useState<AgencyCarrierRow[]>([]);
  const [loadingCarriers, setLoadingCarriers] = useState(true);
  const [carriersError, setCarriersError] = useState<string | null>(null);
  const [selectedCarrierIds, setSelectedCarrierIds] = useState<Set<string>>(
    prefillCarrier ? new Set([prefillCarrier.carrier_id]) : new Set()
  );
  const [showZeroRep, setShowZeroRep] = useState(false);

  const [reps, setReps] = useState<CarrierUserRow[]>([]);
  const [loadingReps, setLoadingReps] = useState(false);
  const [repsError, setRepsError] = useState<string | null>(null);
  const [selectedRepsByCarrier, setSelectedRepsByCarrier] = useState<Map<string, Set<string>>>(
    prefillCarrier
      ? new Map([[prefillCarrier.carrier_id, new Set([prefillCarrier.carrier_user_id])]])
      : new Map()
  );
  const [selectedBenefitsByCarrier, setSelectedBenefitsByCarrier] = useState<Map<string, Set<BenefitLineValue>>>(
    prefillCarrier
      ? new Map([[prefillCarrier.carrier_id, new Set(prefillCarrier.requested_benefits)]])
      : new Map()
  );

  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendApiResult | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const benefitDefaults = useMemo(() => computeBenefitDefaults(rfp), [rfp]);

  useEffect(() => {
    loadAgencyCarriers();
  }, [agencyId]);

  // If we got here from a Resend click, also load the reps for the prefilled carrier
  // so step 3 review can render the rep name properly
  useEffect(() => {
    if (prefillCarrier) {
      loadRepsForSelectedCarriers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAgencyCarriers() {
    if (!agencyId) return;
    setLoadingCarriers(true);
    setCarriersError(null);
    try {
      const { data: acData, error: acErr } = await supabase
        .from('agency_carriers')
        .select(`
          id,
          carrier_id,
          is_favorite,
          carrier:carriers (
            id, name, slug, logo_url, brand_color, is_global
          )
        `)
        .eq('agency_id', agencyId);

      if (acErr) throw acErr;

      const carrierIds = (acData || []).map((row: any) => row.carrier_id);

      let repCounts = new Map<string, number>();
      if (carrierIds.length > 0) {
        const { data: repsData, error: repsErr } = await supabase
          .from('carrier_users')
          .select('carrier_id')
          .in('carrier_id', carrierIds);
        if (repsErr) throw repsErr;
        for (const r of repsData || []) {
          repCounts.set(r.carrier_id, (repCounts.get(r.carrier_id) || 0) + 1);
        }
      }

      const rows: AgencyCarrierRow[] = (acData || []).map((row: any) => ({
        id: row.id,
        carrier_id: row.carrier_id,
        is_favorite: row.is_favorite,
        carrier: row.carrier,
        rep_count: repCounts.get(row.carrier_id) || 0,
      }));

      rows.sort((a, b) => {
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
        return a.carrier.name.localeCompare(b.carrier.name);
      });

      setAgencyCarriers(rows);
    } catch (e: any) {
      setCarriersError(e?.message || 'Failed to load carriers');
    } finally {
      setLoadingCarriers(false);
    }
  }

  async function loadRepsForSelectedCarriers() {
    const ids = Array.from(selectedCarrierIds);
    if (ids.length === 0) {
      setReps([]);
      return;
    }
    setLoadingReps(true);
    setRepsError(null);
    try {
      const { data, error: repsErr } = await supabase
        .from('carrier_users')
        .select('id, carrier_id, email, full_name, title, status')
        .in('carrier_id', ids)
        .order('full_name', { ascending: true, nullsFirst: false });
      if (repsErr) throw repsErr;
      setReps((data || []) as CarrierUserRow[]);

      setSelectedBenefitsByCarrier(prev => {
        const next = new Map(prev);
        for (const cid of ids) {
          if (!next.has(cid)) {
            next.set(cid, new Set(benefitDefaults));
          }
        }
        for (const existingCid of Array.from(next.keys())) {
          if (!selectedCarrierIds.has(existingCid)) next.delete(existingCid);
        }
        return next;
      });
      setSelectedRepsByCarrier(prev => {
        const next = new Map(prev);
        for (const cid of ids) {
          if (!next.has(cid)) {
            next.set(cid, new Set());
          }
        }
        for (const existingCid of Array.from(next.keys())) {
          if (!selectedCarrierIds.has(existingCid)) next.delete(existingCid);
        }
        return next;
      });
    } catch (e: any) {
      setRepsError(e?.message || 'Failed to load reps');
    } finally {
      setLoadingReps(false);
    }
  }

  function toggleCarrier(carrierId: string) {
    setSelectedCarrierIds(prev => {
      const next = new Set(prev);
      if (next.has(carrierId)) {
        next.delete(carrierId);
        setSelectedRepsByCarrier(p => {
          const m = new Map(p);
          m.delete(carrierId);
          return m;
        });
        setSelectedBenefitsByCarrier(p => {
          const m = new Map(p);
          m.delete(carrierId);
          return m;
        });
      } else {
        next.add(carrierId);
      }
      return next;
    });
  }

  function toggleRep(carrierId: string, repId: string) {
    setSelectedRepsByCarrier(prev => {
      const next = new Map(prev);
      const set = new Set(next.get(carrierId) || []);
      if (set.has(repId)) set.delete(repId);
      else set.add(repId);
      next.set(carrierId, set);
      return next;
    });
  }

  function toggleBenefit(carrierId: string, benefit: BenefitLineValue) {
    setSelectedBenefitsByCarrier(prev => {
      const next = new Map(prev);
      const set = new Set(next.get(carrierId) || []);
      if (set.has(benefit)) set.delete(benefit);
      else set.add(benefit);
      next.set(carrierId, set);
      return next;
    });
  }

  const visibleCarriers = showZeroRep
    ? agencyCarriers
    : agencyCarriers.filter(ac => ac.rep_count > 0 || selectedCarrierIds.has(ac.carrier_id));

  const zeroRepCount = agencyCarriers.filter(ac => ac.rep_count === 0).length;
  const canProceedFromStep1 = selectedCarrierIds.size > 0;

  const step2Issues: string[] = [];
  for (const cid of Array.from(selectedCarrierIds)) {
    const ac = agencyCarriers.find(a => a.carrier_id === cid);
    const carrierLabel = ac?.carrier.name || 'Carrier';
    const repsForCarrier = selectedRepsByCarrier.get(cid);
    const benefitsForCarrier = selectedBenefitsByCarrier.get(cid);
    if (!repsForCarrier || repsForCarrier.size === 0) {
      step2Issues.push(`${carrierLabel} needs at least one rep selected`);
    }
    if (!benefitsForCarrier || benefitsForCarrier.size === 0) {
      step2Issues.push(`${carrierLabel} needs at least one benefit line`);
    }
  }
  const canProceedFromStep2 = step2Issues.length === 0 && selectedCarrierIds.size > 0;

  const totalEmailCount = Array.from(selectedRepsByCarrier.values()).reduce((s, set) => s + set.size, 0);

  function handleNext() {
    if (step === 1 && canProceedFromStep1) {
      setStep(2);
      loadRepsForSelectedCarriers();
    } else if (step === 2 && canProceedFromStep2) {
      setStep(3);
    }
  }

  function handleBack() {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  }

  async function handleSend() {
    setSending(true);
    setSendError(null);
    setSendResult(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setSendError('Session expired. Please log in again.');
        setSending(false);
        return;
      }

      const recipients = Array.from(selectedCarrierIds).map(cid => {
        const repIds = Array.from(selectedRepsByCarrier.get(cid) || []);
        const benefits = Array.from(selectedBenefitsByCarrier.get(cid) || []);
        return {
          carrier_id: cid,
          carrier_user_ids: repIds,
          requested_benefits: benefits,
        };
      });

      const res = await fetch(`/api/rfps/${rfpId}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ recipients }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSendError(data.error || `HTTP ${res.status}`);
        setSending(false);
        return;
      }

      setSendResult(data as SendApiResult);
      setSending(false);
    } catch (e: any) {
      setSendError(e?.message || 'Network error');
      setSending(false);
    }
  }

  const showResultScreen = !!sendResult || !!sendError;

  return (
    <div style={modalOverlayStyle}>
      <div style={modalCardStyle}>
        <div style={{ padding: '1.5rem 1.75rem 1rem', borderBottom: '1px solid #e8e0d0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div>
              <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.4rem', color: '#1e3a5f', margin: 0 }}>
                {prefillCarrier && !showResultScreen ? 'Resend invite' : 'Send to carriers'}
              </h2>
              <div style={{ fontSize: '0.85rem', color: '#7a8a9b', marginTop: '0.25rem' }}>
                Distributing <strong style={{ color: '#3a4d68' }}>{rfpName}</strong>
              </div>
            </div>
            {!sending && (
              <button
                onClick={() => onClose(!!sendResult)}
                aria-label="Close"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#7a8a9b',
                  fontSize: '1.4rem',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            )}
          </div>

          {!showResultScreen && !prefillCarrier && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
              <Stepper num={1} label="Pick carriers" current={step} />
              <StepperLine done={step > 1} />
              <Stepper num={2} label="Reps & benefits" current={step} />
              <StepperLine done={step > 2} />
              <Stepper num={3} label="Review & send" current={step} />
            </div>
          )}
        </div>

        <div style={{ padding: '1.25rem 1.75rem', minHeight: 360 }}>
          {showResultScreen ? (
            <SendResultScreen
              result={sendResult}
              error={sendError}
              agencyCarriers={agencyCarriers}
            />
          ) : (
            <>
              {step === 1 && (
                <Step1PickCarriers
                  loading={loadingCarriers}
                  error={carriersError}
                  carriers={visibleCarriers}
                  selectedCarrierIds={selectedCarrierIds}
                  onToggle={toggleCarrier}
                  showZeroRep={showZeroRep}
                  onToggleShowZeroRep={() => setShowZeroRep(v => !v)}
                  zeroRepCount={zeroRepCount}
                  totalCount={agencyCarriers.length}
                />
              )}
              {step === 2 && (
                <Step2RepsBenefits
                  loading={loadingReps}
                  error={repsError}
                  selectedCarrierIds={selectedCarrierIds}
                  agencyCarriers={agencyCarriers}
                  reps={reps}
                  selectedRepsByCarrier={selectedRepsByCarrier}
                  selectedBenefitsByCarrier={selectedBenefitsByCarrier}
                  onToggleRep={toggleRep}
                  onToggleBenefit={toggleBenefit}
                />
              )}
              {step === 3 && (
                <Step3ReviewSend
                  selectedCarrierIds={selectedCarrierIds}
                  agencyCarriers={agencyCarriers}
                  reps={reps}
                  selectedRepsByCarrier={selectedRepsByCarrier}
                  selectedBenefitsByCarrier={selectedBenefitsByCarrier}
                  totalEmailCount={totalEmailCount}
                  isResend={!!prefillCarrier}
                />
              )}
            </>
          )}
        </div>

        <div
          style={{
            padding: '1rem 1.75rem 1.25rem',
            borderTop: '1px solid #e8e0d0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          {showResultScreen ? (
            <>
              <div />
              <button
                onClick={() => onClose(!!sendResult)}
                style={{
                  ...btnPrimaryStyle,
                  background: '#7a9b76',
                }}
              >
                Done
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: '#7a8a9b', maxWidth: 380 }}>
                {step === 1 && selectedCarrierIds.size > 0 && (
                  <>{selectedCarrierIds.size} carrier{selectedCarrierIds.size === 1 ? '' : 's'} selected</>
                )}
                {step === 2 && step2Issues.length > 0 && (
                  <span style={{ color: '#a94442' }}>{step2Issues[0]}</span>
                )}
                {step === 2 && step2Issues.length === 0 && selectedCarrierIds.size > 0 && (
                  <>Ready to review</>
                )}
                {step === 3 && (
                  <>{prefillCarrier ? 'Resending invite — click Send to refresh and re-email.' : 'Final review — click Send when ready.'}</>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                {step === 1 && !sending && (
                  <button onClick={() => onClose(false)} style={btnSecondaryStyle}>
                    Cancel
                  </button>
                )}
                {step > 1 && !prefillCarrier && !sending && (
                  <button onClick={handleBack} style={btnSecondaryStyle}>
                    ← Back
                  </button>
                )}
                {prefillCarrier && step === 3 && !sending && (
                  <button onClick={() => onClose(false)} style={btnSecondaryStyle}>
                    Cancel
                  </button>
                )}
                <button
                  onClick={step === 3 ? handleSend : handleNext}
                  disabled={
                    sending ||
                    (step === 1 && !canProceedFromStep1) ||
                    (step === 2 && !canProceedFromStep2)
                  }
                  style={{
                    ...btnPrimaryStyle,
                    background:
                      sending
                        ? '#c5d1c2'
                        : (step === 1 && !canProceedFromStep1) || (step === 2 && !canProceedFromStep2)
                        ? '#c5d1c2'
                        : '#7a9b76',
                    cursor:
                      sending
                        ? 'wait'
                        : (step === 1 && !canProceedFromStep1) || (step === 2 && !canProceedFromStep2)
                        ? 'not-allowed'
                        : 'pointer',
                  }}
                >
                  {sending
                    ? 'Sending...'
                    : step < 3
                    ? 'Next →'
                    : `Send ${totalEmailCount} email${totalEmailCount === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({ num, label, current }: { num: WizardStep; label: string; current: WizardStep }) {
  const isActive = current === num;
  const isDone = current > num;
  const bg = isDone ? '#7a9b76' : isActive ? '#1e3a5f' : '#e8e0d0';
  const fg = isDone || isActive ? '#fff' : '#7a8a9b';
  const labelColor = isActive ? '#1e3a5f' : '#7a8a9b';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: bg,
          color: fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {isDone ? '✓' : num}
      </div>
      <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 500, color: labelColor }}>
        {label}
      </span>
    </div>
  );
}

function StepperLine({ done }: { done: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        height: 2,
        background: done ? '#7a9b76' : '#e8e0d0',
        minWidth: 24,
      }}
    />
  );
}

function Step1PickCarriers({
  loading,
  error,
  carriers,
  selectedCarrierIds,
  onToggle,
  showZeroRep,
  onToggleShowZeroRep,
  zeroRepCount,
  totalCount,
}: {
  loading: boolean;
  error: string | null;
  carriers: AgencyCarrierRow[];
  selectedCarrierIds: Set<string>;
  onToggle: (carrierId: string) => void;
  showZeroRep: boolean;
  onToggleShowZeroRep: () => void;
  zeroRepCount: number;
  totalCount: number;
}) {
  if (loading) {
    return <div style={{ color: '#3a4d68', fontSize: 14, textAlign: 'center', padding: '2rem 0' }}>Loading carriers...</div>;
  }
  if (error) {
    return (
      <div style={{
        background: '#fdecec',
        border: '1px solid #f0baba',
        color: '#9a3a3a',
        padding: '0.85rem 1rem',
        borderRadius: 6,
        fontSize: 14,
      }}>
        Couldn't load carriers: {error}
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div style={{
        background: '#faf7f2',
        border: '1px dashed #d4c8b0',
        borderRadius: 8,
        padding: '2.5rem 2rem',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🏢</div>
        <h3 style={{ color: '#1e3a5f', fontFamily: 'Playfair Display, serif', margin: 0, marginBottom: '0.5rem', fontSize: 17 }}>
          No carriers in your agency yet
        </h3>
        <p style={{ color: '#3a4d68', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          Add carriers to your agency before sending RFPs.{' '}
          <a href="/broker/carriers" style={{ color: '#7a9b76', textDecoration: 'underline' }}>
            Go to Carriers
          </a>
        </p>
      </div>
    );
  }

  return (
    <>
      <div style={{ color: '#3a4d68', fontSize: 14, marginBottom: 16 }}>
        Pick which of your carriers should receive this RFP.
      </div>

      <div style={{ border: '1px solid #e8e0d0', borderRadius: 8, overflow: 'hidden' }}>
        {carriers.map((ac) => {
          const isSelected = selectedCarrierIds.has(ac.carrier_id);
          const noReps = ac.rep_count === 0;
          const initials = ac.carrier.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
          const brandColor = ac.carrier.brand_color || '#1e3a5f';

          return (
            <div
              key={ac.id}
              onClick={() => !noReps && onToggle(ac.carrier_id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 16px',
                borderBottom: '1px solid #f0e8d8',
                cursor: noReps ? 'not-allowed' : 'pointer',
                background: isSelected ? '#f4f7f3' : '#fff',
                opacity: noReps ? 0.55 : 1,
                transition: 'background 0.12s',
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                disabled={noReps}
                onChange={() => onToggle(ac.carrier_id)}
                onClick={(e) => e.stopPropagation()}
                style={{ width: 18, height: 18, cursor: noReps ? 'not-allowed' : 'pointer' }}
              />
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 8,
                  background: brandColor,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1e3a5f' }}>
                    {ac.carrier.name}
                  </span>
                  {ac.is_favorite && (
                    <span style={{ color: '#d4a017', fontSize: 14 }} title="Favorite">★</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#7a8a9b', marginTop: 2 }}>
                  {ac.rep_count === 0 ? (
                    <span style={{ color: '#a94442' }}>No reps — add a rep before sending</span>
                  ) : (
                    <>
                      {ac.rep_count} rep{ac.rep_count === 1 ? '' : 's'}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {zeroRepCount > 0 && (
        <div style={{ marginTop: 12, fontSize: 13, color: '#7a8a9b' }}>
          {showZeroRep ? (
            <>
              Showing {zeroRepCount} carrier{zeroRepCount === 1 ? '' : 's'} with no reps.{' '}
              <button onClick={onToggleShowZeroRep} style={inlineLinkBtnStyle}>
                Hide them
              </button>
            </>
          ) : (
            <>
              {zeroRepCount} carrier{zeroRepCount === 1 ? '' : 's'} with no reps hidden.{' '}
              <button onClick={onToggleShowZeroRep} style={inlineLinkBtnStyle}>
                Show anyway
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

function Step2RepsBenefits({
  loading,
  error,
  selectedCarrierIds,
  agencyCarriers,
  reps,
  selectedRepsByCarrier,
  selectedBenefitsByCarrier,
  onToggleRep,
  onToggleBenefit,
}: {
  loading: boolean;
  error: string | null;
  selectedCarrierIds: Set<string>;
  agencyCarriers: AgencyCarrierRow[];
  reps: CarrierUserRow[];
  selectedRepsByCarrier: Map<string, Set<string>>;
  selectedBenefitsByCarrier: Map<string, Set<BenefitLineValue>>;
  onToggleRep: (carrierId: string, repId: string) => void;
  onToggleBenefit: (carrierId: string, benefit: BenefitLineValue) => void;
}) {
  if (loading) {
    return <div style={{ color: '#3a4d68', fontSize: 14, textAlign: 'center', padding: '2rem 0' }}>Loading reps...</div>;
  }
  if (error) {
    return (
      <div style={{
        background: '#fdecec',
        border: '1px solid #f0baba',
        color: '#9a3a3a',
        padding: '0.85rem 1rem',
        borderRadius: 6,
        fontSize: 14,
      }}>
        Couldn't load reps: {error}
      </div>
    );
  }

  const orderedCarrierIds = Array.from(selectedCarrierIds);
  const carriersById = new Map(agencyCarriers.map(ac => [ac.carrier_id, ac]));

  return (
    <>
      <div style={{ color: '#3a4d68', fontSize: 14, marginBottom: 16 }}>
        For each carrier, pick which reps should receive the email and which benefit lines apply.
      </div>

      {orderedCarrierIds.map((cid) => {
        const ac = carriersById.get(cid);
        if (!ac) return null;
        const repsForCarrier = reps.filter(r => r.carrier_id === cid);
        const repsSelected = selectedRepsByCarrier.get(cid) || new Set<string>();
        const benefitsSelected = selectedBenefitsByCarrier.get(cid) || new Set<BenefitLineValue>();
        const initials = ac.carrier.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const brandColor = ac.carrier.brand_color || '#1e3a5f';

        return (
          <div
            key={cid}
            style={{
              border: '1px solid #e8e0d0',
              borderRadius: 8,
              marginBottom: 14,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                background: '#faf7f2',
                borderBottom: '1px solid #e8e0d0',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: brandColor,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1e3a5f' }}>
                {ac.carrier.name}
              </span>
            </div>

            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0e8d8' }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#3a4d68',
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                  marginBottom: 8,
                }}
              >
                Reps ({repsSelected.size}/{repsForCarrier.length})
              </div>
              {repsForCarrier.length === 0 ? (
                <div style={{ fontSize: 13, color: '#a94442' }}>
                  No reps for this carrier. Go back and remove this carrier or add reps first.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {repsForCarrier.map((rep) => {
                    const checked = repsSelected.has(rep.id);
                    const repLabel = rep.full_name || rep.email.split('@')[0];
                    return (
                      <label
                        key={rep.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 10px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: checked ? '#f4f7f3' : 'transparent',
                          transition: 'background 0.12s',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleRep(cid, rep.id)}
                          style={{ width: 16, height: 16, cursor: 'pointer' }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1e3a5f' }}>
                            {repLabel}
                          </div>
                          <div style={{ fontSize: 11, color: '#7a8a9b' }}>
                            {rep.email}{rep.title ? ` · ${rep.title}` : ''}
                          </div>
                        </div>
                        <RepStatusPill status={rep.status} />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ padding: '12px 16px' }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#3a4d68',
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                  marginBottom: 8,
                }}
              >
                Benefit lines ({benefitsSelected.size}/{BENEFIT_LINES.length})
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 6,
                }}
              >
                {BENEFIT_LINES.map((bl) => {
                  const checked = benefitsSelected.has(bl.value);
                  return (
                    <label
                      key={bl.value}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 10px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        background: checked ? '#f4f7f3' : 'transparent',
                        fontSize: 13,
                        color: '#1e3a5f',
                        transition: 'background 0.12s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleBenefit(cid, bl.value)}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                      {bl.label}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function RepStatusPill({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    invited: { bg: '#fef9ec', fg: '#7a5e1a' },
    active: { bg: '#e8f0e6', fg: '#5a7a56' },
    inactive: { bg: '#eef2f7', fg: '#7a8a9b' },
  };
  const c = colors[status] || colors.inactive;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      background: c.bg,
      color: c.fg,
      fontSize: 10,
      borderRadius: 4,
      fontWeight: 500,
      textTransform: 'capitalize',
      flexShrink: 0,
    }}>
      {status}
    </span>
  );
}

function Step3ReviewSend({
  selectedCarrierIds,
  agencyCarriers,
  reps,
  selectedRepsByCarrier,
  selectedBenefitsByCarrier,
  totalEmailCount,
  isResend,
}: {
  selectedCarrierIds: Set<string>;
  agencyCarriers: AgencyCarrierRow[];
  reps: CarrierUserRow[];
  selectedRepsByCarrier: Map<string, Set<string>>;
  selectedBenefitsByCarrier: Map<string, Set<BenefitLineValue>>;
  totalEmailCount: number;
  isResend: boolean;
}) {
  const orderedCarrierIds = Array.from(selectedCarrierIds);
  const carriersById = new Map(agencyCarriers.map(ac => [ac.carrier_id, ac]));
  const repsById = new Map(reps.map(r => [r.id, r]));

  const carrierCount = orderedCarrierIds.length;

  return (
    <>
      <div
        style={{
          background: '#f4f7f3',
          border: '1px solid #d4e0d2',
          borderRadius: 8,
          padding: '14px 16px',
          marginBottom: 16,
          fontSize: 14,
          color: '#3a4d68',
        }}
      >
        {isResend ? (
          <>
            You're resending the invite to <strong style={{ color: '#1e3a5f' }}>{totalEmailCount}</strong> rep{totalEmailCount === 1 ? '' : 's'}.
            <div style={{ fontSize: 12, color: '#7a8a9b', marginTop: 4 }}>
              The previous invite link will be replaced. The rep gets a fresh email with a new link.
            </div>
          </>
        ) : (
          <>
            You're about to send <strong style={{ color: '#1e3a5f' }}>{totalEmailCount}</strong> email{totalEmailCount === 1 ? '' : 's'}{' '}
            to <strong style={{ color: '#1e3a5f' }}>{totalEmailCount}</strong> rep{totalEmailCount === 1 ? '' : 's'}{' '}
            across <strong style={{ color: '#1e3a5f' }}>{carrierCount}</strong> carrier{carrierCount === 1 ? '' : 's'}.
            <div style={{ fontSize: 12, color: '#7a8a9b', marginTop: 4 }}>
              Click ← Back to make changes.
            </div>
          </>
        )}
      </div>

      {orderedCarrierIds.map((cid) => {
        const ac = carriersById.get(cid);
        if (!ac) return null;
        const repIds = Array.from(selectedRepsByCarrier.get(cid) || []);
        const benefitVals = Array.from(selectedBenefitsByCarrier.get(cid) || []);
        const initials = ac.carrier.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const brandColor = ac.carrier.brand_color || '#1e3a5f';

        return (
          <div
            key={cid}
            style={{
              border: '1px solid #e8e0d0',
              borderRadius: 8,
              marginBottom: 12,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                background: '#faf7f2',
                borderBottom: '1px solid #e8e0d0',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: brandColor,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1e3a5f' }}>
                {ac.carrier.name}
              </span>
            </div>

            <div style={{ padding: '12px 16px', fontSize: 13, color: '#3a4d68' }}>
              <div style={{ marginBottom: 10 }}>
                <span style={{ fontWeight: 600, color: '#1e3a5f' }}>
                  Sending to {repIds.length} rep{repIds.length === 1 ? '' : 's'}:
                </span>
                <div style={{ marginTop: 4, paddingLeft: 8 }}>
                  {repIds.map((rid, idx) => {
                    const rep = repsById.get(rid);
                    if (!rep) return (
                      <div key={rid} style={{ marginBottom: idx < repIds.length - 1 ? 4 : 0, color: '#7a8a9b' }}>
                        • Rep details loading...
                      </div>
                    );
                    const repLabel = rep.full_name || rep.email.split('@')[0];
                    return (
                      <div key={rid} style={{ marginBottom: idx < repIds.length - 1 ? 4 : 0 }}>
                        • <strong>{repLabel}</strong>{' '}
                        <span style={{ color: '#7a8a9b' }}>({rep.email})</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <span style={{ fontWeight: 600, color: '#1e3a5f' }}>Lines requested:</span>{' '}
                <span>
                  {benefitVals.map(b => BENEFIT_LINE_LABELS[b]).join(', ')}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function SendResultScreen({
  result,
  error,
  agencyCarriers,
}: {
  result: SendApiResult | null;
  error: string | null;
  agencyCarriers: AgencyCarrierRow[];
}) {
  if (error || !result) {
    return (
      <div
        style={{
          background: '#fdecec',
          border: '1px solid #f0baba',
          borderRadius: 8,
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>⚠️</div>
        <h3 style={{ color: '#9a3a3a', fontFamily: 'Playfair Display, serif', margin: 0, marginBottom: 8, fontSize: 18 }}>
          Send failed
        </h3>
        <p style={{ color: '#9a3a3a', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          {error || 'Something went wrong. No emails were sent.'}
        </p>
        <p style={{ color: '#3a4d68', fontSize: 12, marginTop: 14, lineHeight: 1.5 }}>
          Close this dialog and try again. If it keeps happening, check Vercel function logs.
        </p>
      </div>
    );
  }

  const { sent, resent, failed, results } = result;
  const totalSucceeded = sent + resent;
  const isPartial = failed > 0 && totalSucceeded > 0;
  const isAllFailed = failed > 0 && totalSucceeded === 0;
  const isAllSuccess = failed === 0 && totalSucceeded > 0;

  const carriersById = new Map(agencyCarriers.map(ac => [ac.carrier_id, ac]));
  const byCarrier = new Map<string, SendApiResultRow[]>();
  for (const r of results) {
    const arr = byCarrier.get(r.carrier_id) || [];
    arr.push(r);
    byCarrier.set(r.carrier_id, arr);
  }

  let bgColor: string;
  let borderColor: string;
  let icon: string;
  let title: string;
  let summaryColor: string;

  if (isAllSuccess) {
    bgColor = '#f4f7f3';
    borderColor = '#d4e0d2';
    icon = '✅';
    title = `Sent ${totalSucceeded} email${totalSucceeded === 1 ? '' : 's'}`;
    summaryColor = '#5a7a56';
  } else if (isAllFailed) {
    bgColor = '#fdecec';
    borderColor = '#f0baba';
    icon = '⚠️';
    title = `All ${failed} send${failed === 1 ? '' : 's'} failed`;
    summaryColor = '#9a3a3a';
  } else {
    bgColor = '#fef9ec';
    borderColor = '#f0d68a';
    icon = '⚠️';
    title = `Sent ${totalSucceeded}, ${failed} failed`;
    summaryColor = '#7a5e1a';
  }

  return (
    <>
      <div
        style={{
          background: bgColor,
          border: `1px solid ${borderColor}`,
          borderRadius: 8,
          padding: '1.25rem 1.5rem',
          marginBottom: 16,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '2rem', marginBottom: 4 }}>{icon}</div>
        <h3 style={{ color: summaryColor, fontFamily: 'Playfair Display, serif', margin: 0, marginBottom: 6, fontSize: 19 }}>
          {title}
        </h3>
        <p style={{ color: '#3a4d68', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
          {isAllSuccess && 'Carrier reps will receive their invites within a minute.'}
          {isPartial && 'Some emails went out, but others failed. See details below.'}
          {isAllFailed && 'No emails were dispatched. See details below.'}
        </p>
      </div>

      {Array.from(byCarrier.entries()).map(([cid, rows]) => {
        const ac = carriersById.get(cid);
        const carrierName = ac?.carrier.name || 'Unknown carrier';
        const initials = carrierName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const brandColor = ac?.carrier.brand_color || '#1e3a5f';

        return (
          <div
            key={cid}
            style={{
              border: '1px solid #e8e0d0',
              borderRadius: 8,
              marginBottom: 10,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                background: '#faf7f2',
                borderBottom: '1px solid #e8e0d0',
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 5,
                  background: brandColor,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1e3a5f' }}>
                {carrierName}
              </span>
            </div>
            <div style={{ padding: '8px 14px' }}>
              {rows.map((r, idx) => (
                <div
                  key={r.carrier_user_id + idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 0',
                    fontSize: 13,
                    color: '#3a4d68',
                    borderBottom: idx < rows.length - 1 ? '1px solid #f0e8d8' : 'none',
                  }}
                >
                  <span style={{ width: 16, flexShrink: 0 }}>
                    {r.status === 'sent' ? '✓' : r.status === 'resent' ? '↻' : '✗'}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.email}
                  </span>
                  <ResultStatusPill status={r.status} />
                  {r.error && (
                    <span style={{ color: '#9a3a3a', fontSize: 11, marginLeft: 8 }} title={r.error}>
                      ({r.error.length > 40 ? r.error.slice(0, 40) + '…' : r.error})
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function ResultStatusPill({ status }: { status: 'sent' | 'resent' | 'failed' }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    sent: { bg: '#e8f0e6', fg: '#5a7a56', label: 'Sent' },
    resent: { bg: '#eef2f7', fg: '#1e3a5f', label: 'Resent' },
    failed: { bg: '#fdecec', fg: '#9a3a3a', label: 'Failed' },
  };
  const c = map[status];
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      background: c.bg,
      color: c.fg,
      fontSize: 10,
      borderRadius: 4,
      fontWeight: 500,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      flexShrink: 0,
    }}>
      {c.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    draft: { bg: '#f5f5f5', fg: '#666', label: 'Draft' },
    distributed: { bg: '#e8f0e6', fg: '#5a7857', label: 'Distributed' },
    collecting_quotes: { bg: '#eef2f7', fg: '#1e3a5f', label: 'Collecting Quotes' },
    comparing: { bg: '#f4f1ea', fg: '#7a5e1a', label: 'Comparing' },
    won: { bg: '#dff0d8', fg: '#3c763d', label: 'Won' },
    lost: { bg: '#f2dede', fg: '#a94442', label: 'Lost' },
    cancelled: { bg: '#f5f5f5', fg: '#888', label: 'Cancelled' },
  };
  const c = map[status] || { bg: '#f5f5f5', fg: '#666', label: status };
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        fontSize: 11,
        fontWeight: 600,
        padding: '4px 12px',
        borderRadius: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {c.label}
    </span>
  );
}

function FactCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #eef1f4',
        borderRadius: 10,
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#3a4d68',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 15, color: '#1e3a5f', fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #eef1f4',
        borderRadius: 12,
        marginBottom: 16,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 20px',
          borderBottom: '1px solid #eef1f4',
          background: '#fdfcf9',
        }}
      >
        <h2
          style={{
            fontFamily: 'Playfair Display, serif',
            fontSize: 17,
            color: '#1e3a5f',
            margin: 0,
            fontWeight: 600,
          }}
        >
          {title}
        </h2>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

function PlanReadOnly({ plan }: { plan: any }) {
  const tiers: any[] = plan.tiers || [];
  return (
    <div
      style={{
        border: '1px solid #eef1f4',
        borderRadius: 8,
        marginBottom: 12,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          background: '#faf7f2',
          borderBottom: '1px solid #eef1f4',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1e3a5f' }}>
            {plan.name || 'Unnamed plan'}
          </div>
          <div style={{ fontSize: 12, color: '#3a4d68', marginTop: 2 }}>
            {plan.type || '—'}
            {plan.hsa_eligible === true && ' · HSA-eligible'}
          </div>
        </div>
      </div>
      {tiers.length === 0 ? (
        <div style={{ padding: 16, fontSize: 13, color: '#3a4d68', textAlign: 'center', fontStyle: 'italic' }}>
          No network tiers configured.
        </div>
      ) : (
        <div style={{ padding: 16 }}>
          {tiers.map((tier: any, ti: number) => (
            <TierReadOnly key={ti} tier={tier} />
          ))}
        </div>
      )}
    </div>
  );
}

function TierReadOnly({ tier }: { tier: any }) {
  return (
    <div
      style={{
        marginBottom: 12,
        paddingBottom: 12,
        borderBottom: '1px solid #eef1f4',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e3a5f', marginBottom: 8 }}>
        {tier.tier_name || 'Tier'}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          fontSize: 12,
        }}
      >
        <Fact label="Deductible (ind/fam)" value={pairDollar(tier.deductible_individual, tier.deductible_family)} />
        <Fact label="Coins. OOP (ind/fam)" value={pairDollar(tier.coinsurance_oop_individual, tier.coinsurance_oop_family)} />
        <Fact label="ACA OOP (ind/fam)" value={pairDollar(tier.aca_oop_individual, tier.aca_oop_family)} />
        <Fact label="PCP / Specialist" value={pairDollar(tier.office_visit_pcp_copay, tier.office_visit_specialist_copay)} />
        <Fact label="Telehealth / UC / ER" value={tripleDollar(tier.telehealth_copay, tier.urgent_care_copay, tier.er_copay)} />
        <Fact
          label="Inpatient coins."
          value={tier.inpatient_hospital_coinsurance_pct != null ? `${tier.inpatient_hospital_coinsurance_pct}%` : '—'}
        />
        <Fact label="Lifetime max" value={tier.lifetime_max ?? '—'} />
        <Fact
          label="Preventive 100%"
          value={
            tier.preventive_covered_100pct === true
              ? 'Yes'
              : tier.preventive_covered_100pct === false
              ? 'No'
              : '—'
          }
        />
      </div>
    </div>
  );
}

function AncillaryReadOnly({
  rx,
  dental,
  vision,
  life,
}: {
  rx: any;
  dental: any;
  vision: any;
  life: any;
}) {
  const sections: { title: string; render: React.ReactNode; show: boolean }[] = [
    {
      title: 'Pharmacy (Rx)',
      show: !!rx?.carrier,
      render: rx ? <RxReadOnly rx={rx} /> : null,
    },
    {
      title: 'Dental',
      show: !!dental?.carrier,
      render: dental ? <DentalReadOnly dental={dental} /> : null,
    },
    {
      title: 'Vision',
      show: !!vision?.carrier,
      render: vision ? <VisionReadOnly vision={vision} /> : null,
    },
    {
      title: 'Life & AD&D',
      show: !!(life?.carrier || life?.amount),
      render: life ? <LifeReadOnly life={life} /> : null,
    },
  ];

  const visible = sections.filter((s) => s.show);
  if (visible.length === 0) {
    return (
      <div style={{ color: '#3a4d68', fontSize: 13, fontStyle: 'italic' }}>
        No ancillary lines configured.
      </div>
    );
  }

  return (
    <>
      {visible.map((s, i) => (
        <div
          key={s.title}
          style={{
            marginBottom: i < visible.length - 1 ? 16 : 0,
            paddingBottom: i < visible.length - 1 ? 16 : 0,
            borderBottom: i < visible.length - 1 ? '1px solid #eef1f4' : 'none',
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#1e3a5f',
              marginBottom: 8,
            }}
          >
            {s.title}
          </div>
          {s.render}
        </div>
      ))}
    </>
  );
}

function RxReadOnly({ rx }: { rx: any }) {
  const retail = rx.retail_30day || {};
  const mail = rx.mail_90day || {};
  return (
    <div style={{ display: 'grid', gap: 10, fontSize: 12 }}>
      <Fact label="Carrier" value={rx.carrier || '—'} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <Fact label="Retail Generic" value={dollar(retail.generic)} />
        <Fact label="Retail Pref. brand" value={dollar(retail.preferred_brand)} />
        <Fact label="Retail Non-pref." value={dollar(retail.non_preferred_brand)} />
        <Fact label="Retail Specialty" value={dollar(retail.specialty)} />
        <Fact label="Mail Generic" value={dollar(mail.generic)} />
        <Fact label="Mail Pref. brand" value={dollar(mail.preferred_brand)} />
        <Fact label="Mail Non-pref." value={dollar(mail.non_preferred_brand)} />
        <Fact label="Mail Specialty" value={dollar(mail.specialty)} />
      </div>
    </div>
  );
}

function DentalReadOnly({ dental }: { dental: any }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, fontSize: 12 }}>
      <Fact label="Carrier" value={dental.carrier || '—'} />
      <Fact label="Deductible" value={dollar(dental.deductible_individual)} />
      <Fact label="Annual max" value={dollar(dental.annual_max)} />
      <Fact label="Ortho lifetime" value={dollar(dental.ortho_lifetime_max)} />
      <Fact label="Preventive" value={dental.preventive_coverage_pct != null ? `${dental.preventive_coverage_pct}%` : '—'} />
      <Fact label="Basic" value={dental.basic_coverage_pct != null ? `${dental.basic_coverage_pct}%` : '—'} />
      <Fact label="Major" value={dental.major_coverage_pct != null ? `${dental.major_coverage_pct}%` : '—'} />
      <div />
    </div>
  );
}

function VisionReadOnly({ vision }: { vision: any }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, fontSize: 12 }}>
      <Fact label="Carrier" value={vision.carrier || '—'} />
      <Fact label="Exam copay" value={dollar(vision.exam_copay)} />
      <Fact label="Frames" value={dollar(vision.frames_allowance)} />
      <Fact label="Contacts" value={dollar(vision.contacts_allowance)} />
      <Fact label="Exam frequency" value={vision.exam_frequency_months != null ? `${vision.exam_frequency_months} months` : '—'} />
    </div>
  );
}

function LifeReadOnly({ life }: { life: any }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, fontSize: 12 }}>
      <Fact label="Carrier" value={life.carrier || '—'} />
      <Fact label="Life amount" value={dollar(life.amount)} />
      <Fact label="AD&D amount" value={dollar(life.ad_d_amount)} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#3a4d68', fontWeight: 500, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ color: '#1e3a5f', fontWeight: 600 }}>
        {value === null || value === undefined || value === '' ? '—' : value}
      </div>
    </div>
  );
}

function dollar(v: any): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return `$${n.toLocaleString()}`;
}

function pairDollar(a: any, b: any): string {
  const av = a === null || a === undefined ? '—' : `$${Number(a).toLocaleString()}`;
  const bv = b === null || b === undefined ? '—' : `$${Number(b).toLocaleString()}`;
  if (av === '—' && bv === '—') return '—';
  return `${av} / ${bv}`;
}

function tripleDollar(a: any, b: any, c: any): string {
  const fmt = (v: any) =>
    v === null || v === undefined ? '—' : `$${Number(v).toLocaleString()}`;
  const out = [fmt(a), fmt(b), fmt(c)].join(' / ');
  return out === '— / — / —' ? '—' : out;
}

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(30, 58, 95, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '1rem',
};

const modalCardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  maxWidth: 640,
  width: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
};

const btnPrimaryStyle: React.CSSProperties = {
  background: '#7a9b76',
  color: '#fff',
  border: 'none',
  padding: '0.6rem 1.25rem',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const btnSecondaryStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #cbd5db',
  color: '#3a4d68',
  padding: '0.6rem 1.1rem',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const inlineLinkBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#7a9b76',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  padding: 0,
  textDecoration: 'underline',
  fontFamily: 'inherit',
};