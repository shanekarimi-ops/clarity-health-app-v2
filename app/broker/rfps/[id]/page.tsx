'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../supabase';
import BrokerSidebar from '../../../components/BrokerSidebar';
import { getAccountType } from '../../../lib/account';

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

  const [showSendModal, setShowSendModal] = useState(false);

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (!rfpId || bootLoading) return;
    loadRfp();
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
    if (refresh) {
      loadRfp();
    }
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
                    onClick={() => setShowSendModal(true)}
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
          agencyId={agencyId}
          onClose={handleSendModalClose}
        />
      )}
    </div>
  );
}

// =====================================================================
// Send Carriers Modal — multi-step wizard
// Step 1 = Pick carriers (this push)
// Step 2 = Pick reps + benefit lines (Push 6)
// Step 3 = Review + send (Push 7)
// =====================================================================

type AgencyCarrierRow = {
  id: string;                   // agency_carriers.id
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

type WizardStep = 1 | 2 | 3;

function SendCarriersModal({
  rfpId,
  rfpName,
  agencyId,
  onClose,
}: {
  rfpId: string;
  rfpName: string;
  agencyId: string;
  onClose: (refresh: boolean) => void;
}) {
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 state
  const [agencyCarriers, setAgencyCarriers] = useState<AgencyCarrierRow[]>([]);
  const [loadingCarriers, setLoadingCarriers] = useState(true);
  const [carriersError, setCarriersError] = useState<string | null>(null);
  const [selectedCarrierIds, setSelectedCarrierIds] = useState<Set<string>>(new Set());
  const [showZeroRep, setShowZeroRep] = useState(false);

  useEffect(() => {
    loadCarriers();
  }, [agencyId]);

  async function loadCarriers() {
    if (!agencyId) return;
    setLoadingCarriers(true);
    setCarriersError(null);
    try {
      // Fetch agency_carriers + their carrier details
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

      // Fetch rep counts per carrier
      let repCounts = new Map<string, number>();
      if (carrierIds.length > 0) {
        const { data: reps, error: repsErr } = await supabase
          .from('carrier_users')
          .select('carrier_id')
          .in('carrier_id', carrierIds);
        if (repsErr) throw repsErr;
        for (const r of reps || []) {
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

      // Sort: favorites first, then by name
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

  function toggleCarrier(carrierId: string) {
    setSelectedCarrierIds(prev => {
      const next = new Set(prev);
      if (next.has(carrierId)) next.delete(carrierId);
      else next.add(carrierId);
      return next;
    });
  }

  const visibleCarriers = showZeroRep
    ? agencyCarriers
    : agencyCarriers.filter(ac => ac.rep_count > 0 || selectedCarrierIds.has(ac.carrier_id));

  const zeroRepCount = agencyCarriers.filter(ac => ac.rep_count === 0).length;
  const canProceedFromStep1 = selectedCarrierIds.size > 0;

  function handleNext() {
    if (step === 1 && canProceedFromStep1) setStep(2);
    else if (step === 2) setStep(3);
  }

  function handleBack() {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  }

  return (
    <div style={modalOverlayStyle}>
      <div style={modalCardStyle}>
        {/* Header */}
        <div style={{ padding: '1.5rem 1.75rem 1rem', borderBottom: '1px solid #e8e0d0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div>
              <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.4rem', color: '#1e3a5f', margin: 0 }}>
                Send to carriers
              </h2>
              <div style={{ fontSize: '0.85rem', color: '#7a8a9b', marginTop: '0.25rem' }}>
                Distributing <strong style={{ color: '#3a4d68' }}>{rfpName}</strong>
              </div>
            </div>
            <button
              onClick={() => onClose(false)}
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
          </div>

          {/* Stepper */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
            <Stepper num={1} label="Pick carriers" current={step} />
            <StepperLine done={step > 1} />
            <Stepper num={2} label="Reps & benefits" current={step} />
            <StepperLine done={step > 2} />
            <Stepper num={3} label="Review & send" current={step} />
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem 1.75rem', minHeight: 320 }}>
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
          {step === 2 && <PlaceholderStep stepNum={2} />}
          {step === 3 && <PlaceholderStep stepNum={3} />}
        </div>

        {/* Footer */}
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
          <div style={{ fontSize: 12, color: '#7a8a9b' }}>
            {step === 1 && selectedCarrierIds.size > 0 && (
              <>
                {selectedCarrierIds.size} carrier{selectedCarrierIds.size === 1 ? '' : 's'} selected
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            {step === 1 && (
              <button onClick={() => onClose(false)} style={btnSecondaryStyle}>
                Cancel
              </button>
            )}
            {step > 1 && (
              <button onClick={handleBack} style={btnSecondaryStyle}>
                ← Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={step === 1 && !canProceedFromStep1}
              style={{
                ...btnPrimaryStyle,
                background: (step === 1 && !canProceedFromStep1) ? '#c5d1c2' : '#7a9b76',
                cursor: (step === 1 && !canProceedFromStep1) ? 'not-allowed' : 'pointer',
              }}
            >
              {step < 3 ? 'Next →' : 'Send'}
            </button>
          </div>
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

// =====================================================================
// Step 1 — Pick carriers
// =====================================================================
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

      {/* Toggle for zero-rep carriers */}
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

// =====================================================================
// Placeholder for Steps 2 & 3 (filled in Pushes 6 & 7)
// =====================================================================
function PlaceholderStep({ stepNum }: { stepNum: number }) {
  return (
    <div
      style={{
        background: '#faf7f2',
        border: '1px dashed #d4c8b0',
        borderRadius: 8,
        padding: '2.5rem 2rem',
        textAlign: 'center',
        color: '#3a4d68',
      }}
    >
      <div style={{ fontSize: '1.6rem', marginBottom: '0.5rem' }}>{stepNum === 2 ? '👥' : '📬'}</div>
      <h3 style={{ color: '#1e3a5f', fontFamily: 'Playfair Display, serif', margin: 0, marginBottom: '0.5rem', fontSize: 17 }}>
        Step {stepNum} coming in Push {stepNum + 4}
      </h3>
      <p style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>
        {stepNum === 2
          ? 'Per-carrier rep selection and benefit-line checkboxes'
          : 'Final review of the send + confirm button'}
      </p>
    </div>
  );
}

// =====================================================================
// StatusBadge — covers full DB vocabulary
// =====================================================================
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

// =====================================================================
// Shared modal styles
// =====================================================================
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