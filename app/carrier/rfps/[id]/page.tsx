'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/app/supabase';
import CarrierShell from '@/app/components/CarrierShell';
import { BENEFIT_LINE_LABELS, BenefitLineValue } from '@/app/lib/benefit-lines';
import {
  parsePlanDesign,
  tabsForRequestedBenefits,
  fmtMoney,
  fmtPct,
  fmtCopay,
  fmtAny,
  type ParsedPlanDesign,
  type PlanOption,
} from '@/app/lib/plan-design';

type RfpDetail = {
  rfp_carrier_id: string;
  rc_status: string;
  requested_benefits: string[];
  sent_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  rfp_id: string;
  rfp_name: string;
  rfp_type: string | null;
  effective_date: string | null;
  proposal_due_date: string | null;
  employee_lives: number | null;
  est_premium_volume: number | null;
  current_plan_doc_url: string | null;
  renewal_plan_doc_url: string | null;
  current_plan_design: any;
  client_name: string | null;
  client_state: string | null;
  agency_name: string;
};

const DECLINE_REASONS = [
  { code: 'group_too_small', label: 'Group too small' },
  { code: 'industry_not_appetite', label: 'Industry not in appetite' },
  { code: 'timeline_too_short', label: 'Timeline too short' },
  { code: 'state_not_supported', label: 'State not supported' },
  { code: 'other', label: 'Other' },
];

export default function CarrierRfpDetailPage() {
  return (
    <CarrierShell active="rfps">
      {(info) => <RfpDetailInner carrierUserId={info.carrier_user_id} carrierName={info.carrier_name} />}
    </CarrierShell>
  );
}

function RfpDetailInner({ carrierUserId, carrierName }: { carrierUserId: string; carrierName: string }) {
  const params = useParams();
  const router = useRouter();
  const rfpId = (params?.id as string) ?? '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [detail, setDetail] = useState<RfpDetail | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string>('');
  const [showDeclineModal, setShowDeclineModal] = useState(false);

  const loadDetail = async () => {
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from('rfp_carriers')
      .select(`
        id,
        status,
        requested_benefits,
        sent_at,
        declined_at,
        decline_reason,
        rfps:rfp_id (
          id,
          name,
          rfp_type,
          effective_date,
          proposal_due_date,
          employee_lives,
          est_premium_volume,
          current_plan_doc_url,
          renewal_plan_doc_url,
          current_plan_design,
          agencies:agency_id ( name ),
          clients:client_id ( employer_name, state )
        )
      `)
      .eq('assigned_carrier_user_id', carrierUserId)
      .eq('rfp_id', rfpId)
      .maybeSingle();

    if (queryError) {
      console.error('[RfpDetailInner] query error:', queryError);
      setError('Could not load this RFP. Please try again or go back to your inbox.');
      setLoading(false);
      return;
    }

    if (!data || !data.rfps) {
      setError('RFP not found, or you no longer have access to it.');
      setLoading(false);
      return;
    }

    const rfp: any = data.rfps;
    setDetail({
      rfp_carrier_id: data.id,
      rc_status: data.status,
      requested_benefits: data.requested_benefits ?? [],
      sent_at: data.sent_at,
      declined_at: data.declined_at,
      decline_reason: data.decline_reason,
      rfp_id: rfp.id,
      rfp_name: rfp.name,
      rfp_type: rfp.rfp_type,
      effective_date: rfp.effective_date,
      proposal_due_date: rfp.proposal_due_date,
      employee_lives: rfp.employee_lives,
      est_premium_volume: rfp.est_premium_volume,
      current_plan_doc_url: rfp.current_plan_doc_url,
      renewal_plan_doc_url: rfp.renewal_plan_doc_url,
      current_plan_design: rfp.current_plan_design,
      client_name: rfp.clients?.employer_name ?? null,
      client_state: rfp.clients?.state ?? null,
      agency_name: rfp.agencies?.name ?? 'Unknown agency',
    });
    setLoading(false);
  };

  useEffect(() => {
    if (!rfpId) return;
    loadDetail();
  }, [rfpId, carrierUserId]);

  const handleDownload = async (docType: 'current' | 'renewal') => {
    setDownloading(true);
    setDownloadError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setDownloadError('Your session has expired. Please log in again.');
        setDownloading(false);
        return;
      }
      const res = await fetch(`/api/carrier/rfps/${rfpId}/download-spd`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ doc_type: docType }),
      });
      const body = await res.json();
      if (!res.ok) {
        setDownloadError(body.error || 'Could not start the download.');
        setDownloading(false);
        return;
      }
      window.open(body.signedUrl, '_blank');
    } catch (err) {
      console.error('[handleDownload] error:', err);
      setDownloadError('Network error. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const handleDeclineSuccess = async () => {
    setShowDeclineModal(false);
    await loadDetail();
  };

  if (loading) {
    return <div style={containerStyle}><div style={loadingStyle}>Loading RFP details…</div></div>;
  }

  if (error || !detail) {
    return (
      <div style={containerStyle}>
        <button onClick={() => router.push('/carrier/rfps')} style={backButtonStyle}>← Back to inbox</button>
        <div style={errorBannerStyle}><strong>Error:</strong> {error || 'Unknown error'}</div>
      </div>
    );
  }

  const planDesign = parsePlanDesign(detail.current_plan_design);
  const tabs = tabsForRequestedBenefits(detail.requested_benefits);

  const isDeclined = detail.rc_status === 'declined';
  const isLockedFromDecline = ['submitted', 'won', 'lost'].includes(detail.rc_status);
  const canDecline = !isDeclined && !isLockedFromDecline;
  const canUpload = !isDeclined && !isLockedFromDecline;

  return (
    <div style={containerStyle}>
      <button onClick={() => router.push('/carrier/rfps')} style={backButtonStyle}>← Back to inbox</button>

      {/* Header */}
      <div style={headerCardStyle}>
        <div style={headerTopRowStyle}>
          <div style={{ flex: 1 }}>
            <div style={clientNameStyle}>{detail.client_name || 'Unnamed client'}</div>
            <h1 style={rfpNameStyle}>{detail.rfp_name}</h1>
            <div style={agencyLineStyle}>From {detail.agency_name}</div>
          </div>
          <CarrierStatusPill status={detail.rc_status} />
        </div>

        <div style={metadataGridStyle}>
          <MetaItem label="Plan Year" value={planDesign.planYear ? String(planDesign.planYear) : '—'} />
          <MetaItem label="Type" value={detail.rfp_type === 'renewal' ? 'Renewal' : detail.rfp_type === 'new_business' ? 'New Business' : (detail.rfp_type ?? '—')} />
          <MetaItem label="Effective Date" value={detail.effective_date ? formatDate(detail.effective_date) : '—'} />
          <MetaItem label="Lives" value={detail.employee_lives ? detail.employee_lives.toLocaleString() : '—'} />
          <MetaItem label="State" value={detail.client_state ?? '—'} />
          <MetaItem
            label="Quote Due"
            value={detail.proposal_due_date ? formatDate(detail.proposal_due_date) : '—'}
            highlight={isUrgent(detail.proposal_due_date)}
          />
        </div>

        <div style={benefitChipsRowStyle}>
          <span style={chipsLabelStyle}>Requested benefit lines:</span>
          {detail.requested_benefits.map((b) => (
            <span key={b} style={benefitChipStyle}>
              {BENEFIT_LINE_LABELS[b as BenefitLineValue] ?? b}
            </span>
          ))}
        </div>
      </div>

      {/* Decline notice if already declined */}
      {isDeclined && detail.declined_at && (
        <div style={declinedNoticeStyle}>
          <div style={declinedNoticeHeaderStyle}>
            <span style={{ fontSize: '20px' }}>🚫</span>
            <strong>You declined this RFP on {formatDate(detail.declined_at)}.</strong>
          </div>
          {detail.decline_reason && (
            <div style={declinedReasonStyle}>
              <strong>Reason:</strong> {detail.decline_reason}
            </div>
          )}
        </div>
      )}

      {/* Plan Documents */}
      <div style={sectionCardStyle}>
        <h2 style={sectionTitleStyle}>Plan Documents</h2>
        <p style={sectionSubtitleStyle}>
          Download the broker&apos;s plan documents to inform your quote.
        </p>
        <div style={docsRowStyle}>
          {detail.current_plan_doc_url ? (
            <button onClick={() => handleDownload('current')} disabled={downloading} style={downloadButtonStyle}>
              📄 {downloading ? 'Preparing download…' : 'Download Current Plan Document'}
            </button>
          ) : (
            <div style={noDocStyle}>No current plan document provided</div>
          )}
          {detail.renewal_plan_doc_url && (
            <button onClick={() => handleDownload('renewal')} disabled={downloading} style={downloadButtonStyle}>
              📄 {downloading ? 'Preparing download…' : 'Download Renewal Plan Document'}
            </button>
          )}
        </div>
        {downloadError && (
          <div style={downloadErrorStyle}>{downloadError}</div>
        )}
      </div>

      {/* Plan Design Tabs */}
      {tabs.length > 0 && (
        <PlanDesignTabbed tabs={tabs} planDesign={planDesign} />
      )}

      {/* Submit a Quote section (NEW in Push 3) */}
      {canUpload && (
        <QuoteUploadSection
          rfpId={rfpId}
          requestedBenefits={detail.requested_benefits}
        />
      )}

      {/* Footer with Decline button */}
      {canDecline && (
        <div style={footerCardStyle}>
          <div style={footerNoteStyle}>
            Not a fit for your team? You can decline this RFP.
          </div>
          <button onClick={() => setShowDeclineModal(true)} style={declineButtonStyle}>
            Decline to quote
          </button>
        </div>
      )}

      {/* Decline Modal */}
      {showDeclineModal && (
        <DeclineModal
          rfpId={rfpId}
          rfpName={detail.rfp_name}
          clientName={detail.client_name || 'this employer'}
          onClose={() => setShowDeclineModal(false)}
          onSuccess={handleDeclineSuccess}
        />
      )}
    </div>
  );
}

// === QUOTE UPLOAD SECTION (NEW in Push 3) ===

type UploadState =
  | { kind: 'choose' }
  | { kind: 'parsing'; filename: string }
  | { kind: 'parsed'; extracted_data: any; proposal_doc_url: string; filename: string; extraction_error: string | null }
  | { kind: 'manual' }
  | { kind: 'error'; message: string };

function QuoteUploadSection({
  rfpId,
  requestedBenefits,
}: {
  rfpId: string;
  requestedBenefits: string[];
}) {
  const [state, setState] = useState<UploadState>({ kind: 'choose' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePdfPicked = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setState({ kind: 'error', message: 'Please select a PDF file.' });
      return;
    }
    // Max 15 MB
    if (file.size > 15 * 1024 * 1024) {
      setState({ kind: 'error', message: 'PDF must be under 15 MB.' });
      return;
    }

    setState({ kind: 'parsing', filename: file.name });

    try {
      // Read file as base64
      const base64 = await fileToBase64(file);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setState({ kind: 'error', message: 'Your session has expired. Please log in again.' });
        return;
      }

      const res = await fetch(`/api/carrier/rfps/${rfpId}/parse-quote-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          pdf_base64: base64,
          filename: file.name,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        const debugSuffix = body.debug
          ? `\n\nDEBUG: ${JSON.stringify(body.debug, null, 2)}`
          : '';
        setState({ kind: 'error', message: (body.error || 'Could not parse the PDF.') + debugSuffix });
        return;
      }
      setState({
        kind: 'parsed',
        extracted_data: body.extracted_data,
        proposal_doc_url: body.proposal_doc_url,
        filename: file.name,
        extraction_error: body.extraction_error || null,
      });
    } catch (err: any) {
      console.error('[QuoteUploadSection] parse error:', err);
      setState({ kind: 'error', message: 'Network error. Please try again.' });
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handlePdfPicked(file);
    }
    // Reset input so the same file can be re-picked if needed
    e.target.value = '';
  };

  const handleReset = () => setState({ kind: 'choose' });

  return (
    <div style={uploadSectionCardStyle}>
      <h2 style={sectionTitleStyle}>Submit a Quote</h2>
      <p style={sectionSubtitleStyle}>
        Upload your quote proposal PDF and we&apos;ll extract the details automatically. You&apos;ll get to review everything before submitting.
      </p>

      {/* Hidden file input always rendered */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />

      {state.kind === 'choose' && (
        <div style={uploadChoiceRowStyle}>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={uploadPrimaryButtonStyle}
          >
            📄 Upload PDF
            <div style={uploadButtonSubtextStyle}>We&apos;ll auto-fill the form using AI</div>
          </button>
          <button
            onClick={() => setState({ kind: 'manual' })}
            style={uploadSecondaryButtonStyle}
          >
            ✍️ Enter manually
            <div style={uploadButtonSubtextStyle}>Type in the quote details by hand</div>
          </button>
        </div>
      )}

      {state.kind === 'parsing' && (
        <div style={parsingBoxStyle}>
          <div style={spinnerStyle} />
          <div>
            <div style={parsingTitleStyle}>Reading {state.filename}…</div>
            <div style={parsingSubtitleStyle}>This usually takes 15–30 seconds.</div>
          </div>
        </div>
      )}

      {state.kind === 'parsed' && (
        <div>
          {state.extraction_error || !state.extracted_data ? (
            <div style={extractionWarningStyle}>
              <strong>⚠️ We couldn&apos;t auto-extract the data from this PDF.</strong>
              <div style={{ marginTop: '6px', fontSize: '13px', color: '#7c2d12' }}>
                Your PDF was uploaded successfully ({state.filename}), but we couldn&apos;t parse it. You can still enter the quote details manually below.
              </div>
              <div style={{ marginTop: '12px' }}>
                <button onClick={() => setState({ kind: 'manual' })} style={uploadSecondaryButtonStyle}>
                  ✍️ Enter manually
                </button>
                <button onClick={handleReset} style={{ ...uploadTextButtonStyle, marginLeft: '10px' }}>
                  Try a different PDF
                </button>
              </div>
            </div>
          ) : (
            <div style={parsedSuccessBoxStyle}>
              <div style={parsedSuccessHeaderStyle}>
                <span style={{ fontSize: '20px' }}>✅</span>
                <strong>Parsed {state.filename}</strong>
              </div>
              <div style={parsedSuccessSubtextStyle}>
                The PDF is uploaded. The review-and-submit form is coming in Push 4.
              </div>
              <details style={{ marginTop: '14px' }}>
                <summary style={detailsSummaryStyle}>Show extracted data (debug)</summary>
                <pre style={extractedDataPreStyle}>
                  {JSON.stringify(state.extracted_data, null, 2)}
                </pre>
              </details>
              <div style={{ marginTop: '14px' }}>
                <button onClick={handleReset} style={uploadTextButtonStyle}>
                  Start over
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {state.kind === 'manual' && (
        <div style={manualPlaceholderStyle}>
          <strong>Manual entry form coming in Push 4.</strong>
          <div style={{ fontSize: '13px', color: '#5a6c7d', marginTop: '6px' }}>
            You&apos;ll be able to fill in plan details for: {requestedBenefits.map(b => BENEFIT_LINE_LABELS[b as BenefitLineValue] ?? b).join(', ')}.
          </div>
          <div style={{ marginTop: '14px' }}>
            <button onClick={handleReset} style={uploadTextButtonStyle}>
              ← Back
            </button>
          </div>
        </div>
      )}

      {state.kind === 'error' && (
        <div style={uploadErrorBoxStyle}>
          <strong>Something went wrong.</strong>
          <div style={{ marginTop: '6px', fontSize: '13px', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace' }}>{state.message}</div>
          <div style={{ marginTop: '12px' }}>
            <button onClick={handleReset} style={uploadTextButtonStyle}>
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Read a File as base64 (without the data: prefix)
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is like "data:application/pdf;base64,XXXX"
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// === DECLINE MODAL ===

function DeclineModal({
  rfpId,
  rfpName,
  clientName,
  onClose,
  onSuccess,
}: {
  rfpId: string;
  rfpName: string;
  clientName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reasonCode, setReasonCode] = useState<string>('');
  const [reasonNote, setReasonNote] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>('');

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setSubmitError('Your session has expired. Please log in again.');
        setSubmitting(false);
        return;
      }

      const res = await fetch(`/api/carrier/rfps/${rfpId}/decline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          reason_code: reasonCode || null,
          reason_note: reasonNote || null,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        setSubmitError(body.error || 'Could not submit decline.');
        setSubmitting(false);
        return;
      }

      onSuccess();
    } catch (err) {
      console.error('[DeclineModal] error:', err);
      setSubmitError('Network error. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div style={modalBackdropStyle} onClick={onClose}>
      <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={modalTitleStyle}>Decline to quote</h2>
        <p style={modalSubtitleStyle}>
          You&apos;re declining the <strong>{rfpName}</strong> RFP for {clientName}. The broker will be notified.
        </p>

        <label style={fieldLabelStyle}>Reason (optional)</label>
        <select
          value={reasonCode}
          onChange={(e) => setReasonCode(e.target.value)}
          style={selectStyle}
          disabled={submitting}
        >
          <option value="">— Select a reason —</option>
          {DECLINE_REASONS.map((r) => (
            <option key={r.code} value={r.code}>{r.label}</option>
          ))}
        </select>

        <label style={fieldLabelStyle}>Additional notes (optional)</label>
        <textarea
          value={reasonNote}
          onChange={(e) => setReasonNote(e.target.value)}
          placeholder="Anything else you'd like to share with the broker..."
          rows={3}
          maxLength={500}
          style={textareaStyle}
          disabled={submitting}
        />
        <div style={charCountStyle}>{reasonNote.length}/500</div>

        {submitError && (
          <div style={submitErrorStyle}>{submitError}</div>
        )}

        <div style={modalButtonsStyle}>
          <button onClick={onClose} disabled={submitting} style={cancelButtonStyle}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting} style={confirmDeclineStyle}>
            {submitting ? 'Submitting…' : 'Confirm decline'}
          </button>
        </div>
      </div>
    </div>
  );
}

// === PLAN DESIGN TABS (unchanged from Push 4) ===

function PlanDesignTabbed({
  tabs,
  planDesign,
}: {
  tabs: Array<'medical' | 'dental' | 'vision' | 'life' | 'disability'>;
  planDesign: ParsedPlanDesign;
}) {
  const [activeTab, setActiveTab] = useState(tabs[0]);

  return (
    <div style={sectionCardStyle}>
      <h2 style={sectionTitleStyle}>Current Plan Design</h2>
      <p style={sectionSubtitleStyle}>
        These are the plan details to quote against.
      </p>

      <div style={tabsRowStyle}>
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              ...tabButtonStyle,
              ...(activeTab === tab ? tabButtonActiveStyle : {}),
            }}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div style={tabContentStyle}>
        {activeTab === 'medical' && <MedicalTab planDesign={planDesign} />}
        {activeTab === 'dental' && <DentalTab planDesign={planDesign} />}
        {activeTab === 'vision' && <VisionTab planDesign={planDesign} />}
        {activeTab === 'life' && <LifeTab planDesign={planDesign} />}
        {activeTab === 'disability' && <DisabilityTab />}
      </div>
    </div>
  );
}

const TAB_LABELS = {
  medical: 'Medical & Rx',
  dental: 'Dental',
  vision: 'Vision',
  life: 'Life & AD&D',
  disability: 'Disability',
};

function MedicalTab({ planDesign }: { planDesign: ParsedPlanDesign }) {
  const { planOptions, rx } = planDesign.medical;
  if (planOptions.length === 0 && !rx) {
    return <EmptyTab message="No medical plan information was provided." />;
  }
  return (
    <>
      {planOptions.map((plan, i) => (
        <PlanOptionCard key={i} plan={plan} />
      ))}
      {rx && <RxCard rx={rx} />}
    </>
  );
}

function PlanOptionCard({ plan }: { plan: PlanOption }) {
  return (
    <div style={planCardStyle}>
      <div style={planCardHeaderStyle}>
        <div style={planNameStyle}>{plan.name}</div>
        <div style={planTypeStyle}>{plan.type}{plan.hsa_eligible === true ? ' • HSA-eligible' : ''}</div>
      </div>
      <div style={tiersTableWrapperStyle}>
        <table style={tiersTableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Benefit</th>
              {plan.tiers.map((tier, i) => (
                <th key={i} style={thStyle}>{tier.tier_name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <TierRow label="Deductible (Individual)" values={plan.tiers.map(t => fmtMoney(t.deductible_individual))} />
            <TierRow label="Deductible (Family)" values={plan.tiers.map(t => fmtMoney(t.deductible_family))} />
            <TierRow label="ACA OOP Max (Individual)" values={plan.tiers.map(t => fmtMoney(t.aca_oop_individual))} />
            <TierRow label="ACA OOP Max (Family)" values={plan.tiers.map(t => fmtMoney(t.aca_oop_family))} />
            <TierRow label="Coinsurance OOP (Individual)" values={plan.tiers.map(t => fmtMoney(t.coinsurance_oop_individual))} />
            <TierRow label="Coinsurance OOP (Family)" values={plan.tiers.map(t => fmtMoney(t.coinsurance_oop_family))} />
            <TierRow label="Inpatient Hospital Coinsurance" values={plan.tiers.map(t => fmtPct(t.inpatient_hospital_coinsurance_pct))} />
            <TierRow label="PCP Office Visit Copay" values={plan.tiers.map(t => fmtCopay(t.office_visit_pcp_copay))} />
            <TierRow label="Specialist Office Visit Copay" values={plan.tiers.map(t => fmtCopay(t.office_visit_specialist_copay))} />
            <TierRow label="Telehealth Copay" values={plan.tiers.map(t => fmtCopay(t.telehealth_copay))} />
            <TierRow label="Urgent Care Copay" values={plan.tiers.map(t => fmtCopay(t.urgent_care_copay))} />
            <TierRow label="ER Copay" values={plan.tiers.map(t => fmtCopay(t.er_copay))} />
            <TierRow label="Preventive 100% Covered" values={plan.tiers.map(t => t.preventive_covered_100pct === null ? '—' : t.preventive_covered_100pct ? 'Yes' : 'No')} />
            <TierRow label="Lifetime Max" values={plan.tiers.map(t => fmtAny(t.lifetime_max))} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TierRow({ label, values }: { label: string; values: string[] }) {
  return (
    <tr>
      <td style={tdLabelStyle}>{label}</td>
      {values.map((v, i) => <td key={i} style={tdValueStyle}>{v}</td>)}
    </tr>
  );
}

function RxCard({ rx }: { rx: NonNullable<ParsedPlanDesign['medical']['rx']> }) {
  return (
    <div style={planCardStyle}>
      <div style={planCardHeaderStyle}>
        <div style={planNameStyle}>Pharmacy (Rx)</div>
        <div style={planTypeStyle}>{rx.carrier ?? 'Carrier not specified'}</div>
      </div>
      <div style={tiersTableWrapperStyle}>
        <table style={tiersTableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Tier</th>
              <th style={thStyle}>Retail (30-day)</th>
              <th style={thStyle}>Mail Order (90-day)</th>
            </tr>
          </thead>
          <tbody>
            <TierRow label="Generic" values={[fmtCopay(rx.retail_30day?.generic ?? null), fmtCopay(rx.mail_90day?.generic ?? null)]} />
            <TierRow label="Preferred Brand" values={[fmtCopay(rx.retail_30day?.preferred_brand ?? null), fmtCopay(rx.mail_90day?.preferred_brand ?? null)]} />
            <TierRow label="Non-Preferred Brand" values={[fmtCopay(rx.retail_30day?.non_preferred_brand ?? null), fmtCopay(rx.mail_90day?.non_preferred_brand ?? null)]} />
            <TierRow label="Specialty" values={[fmtCopay(rx.retail_30day?.specialty ?? null), fmtCopay(rx.mail_90day?.specialty ?? null)]} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DentalTab({ planDesign }: { planDesign: ParsedPlanDesign }) {
  const dental = planDesign.dental;
  if (!dental) return <EmptyTab message="No dental plan information was provided." />;
  return (
    <div style={planCardStyle}>
      <div style={planCardHeaderStyle}>
        <div style={planNameStyle}>Dental</div>
        <div style={planTypeStyle}>{dental.carrier ?? 'Carrier not specified'}</div>
      </div>
      <div style={kvListStyle}>
        <KvRow label="Annual Maximum" value={fmtMoney(dental.annual_max)} />
        <KvRow label="Individual Deductible" value={fmtMoney(dental.deductible_individual)} />
        <KvRow label="Preventive Coverage" value={fmtPct(dental.preventive_coverage_pct)} />
        <KvRow label="Basic Coverage" value={fmtPct(dental.basic_coverage_pct)} />
        <KvRow label="Major Coverage" value={fmtPct(dental.major_coverage_pct)} />
        <KvRow label="Orthodontia Lifetime Max" value={fmtMoney(dental.ortho_lifetime_max)} />
      </div>
    </div>
  );
}

function VisionTab({ planDesign }: { planDesign: ParsedPlanDesign }) {
  const vision = planDesign.vision;
  if (!vision) return <EmptyTab message="No vision plan information was provided." />;
  return (
    <div style={planCardStyle}>
      <div style={planCardHeaderStyle}>
        <div style={planNameStyle}>Vision</div>
        <div style={planTypeStyle}>{vision.carrier ?? 'Carrier not specified'}</div>
      </div>
      <div style={kvListStyle}>
        <KvRow label="Exam Copay" value={fmtCopay(vision.exam_copay)} />
        <KvRow label="Exam Frequency" value={vision.exam_frequency_months ? `Every ${vision.exam_frequency_months} months` : '—'} />
        <KvRow label="Frames Allowance" value={fmtMoney(vision.frames_allowance)} />
        <KvRow label="Contacts Allowance" value={fmtMoney(vision.contacts_allowance)} />
      </div>
    </div>
  );
}

function LifeTab({ planDesign }: { planDesign: ParsedPlanDesign }) {
  const life = planDesign.life;
  if (!life) return <EmptyTab message="No life insurance information was provided." />;
  return (
    <div style={planCardStyle}>
      <div style={planCardHeaderStyle}>
        <div style={planNameStyle}>Life & AD&amp;D</div>
        <div style={planTypeStyle}>{life.carrier ?? 'Carrier not specified'}</div>
      </div>
      <div style={kvListStyle}>
        <KvRow label="Life Benefit Amount" value={fmtMoney(life.amount)} />
        <KvRow label="AD&D Benefit Amount" value={fmtMoney(life.ad_d_amount)} />
      </div>
    </div>
  );
}

function DisabilityTab() {
  return <EmptyTab message="The current plan design does not include disability information. Please refer to the plan documents for STD/LTD details." />;
}

function EmptyTab({ message }: { message: string }) {
  return (
    <div style={emptyTabStyle}>
      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
      <p style={{ margin: 0, color: '#5a6c7d', fontSize: '14px', lineHeight: 1.6 }}>{message}</p>
    </div>
  );
}

function MetaItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div style={metaLabelStyle}>{label}</div>
      <div style={{ ...metaValueStyle, color: highlight ? '#c2410c' : '#1e3a5f', fontWeight: highlight ? 600 : 500 }}>{value}</div>
    </div>
  );
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={kvRowStyle}>
      <span style={kvLabelStyle}>{label}</span>
      <span style={kvValueStyle}>{value}</span>
    </div>
  );
}

function CarrierStatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    pending: { bg: '#f3f4f6', fg: '#6b7280', label: 'Pending' },
    sent: { bg: '#dbeafe', fg: '#1e3a5f', label: 'New' },
    opened: { bg: '#fef3c7', fg: '#92400e', label: 'Viewed' },
    downloaded: { bg: '#fed7aa', fg: '#9a3412', label: 'Downloaded' },
    in_progress: { bg: '#e0e7ff', fg: '#3730a3', label: 'In Progress' },
    submitted: { bg: '#d1fae5', fg: '#065f46', label: 'Quoted' },
    declined: { bg: '#fee2e2', fg: '#991b1b', label: 'Declined' },
    won: { bg: '#dcfce7', fg: '#166534', label: 'Won' },
    lost: { bg: '#f3f4f6', fg: '#6b7280', label: 'Lost' },
  };
  const config = map[status] ?? { bg: '#f3f4f6', fg: '#6b7280', label: status };
  return (
    <span style={{
      backgroundColor: config.bg,
      color: config.fg,
      padding: '6px 14px',
      borderRadius: '14px',
      fontSize: '13px',
      fontWeight: 600,
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }}>
      {config.label}
    </span>
  );
}

// === HELPERS ===
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isUrgent(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const due = new Date(dateStr);
  const now = new Date();
  const days = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return days <= 7;
}

// === STYLES ===
const containerStyle: React.CSSProperties = { padding: '32px 40px', maxWidth: '1100px', margin: '0 auto', fontFamily: '"Figtree", -apple-system, sans-serif' };
const loadingStyle: React.CSSProperties = { textAlign: 'center', padding: '48px', color: '#5a6c7d' };
const errorBannerStyle: React.CSSProperties = { backgroundColor: '#fee2e2', color: '#991b1b', padding: '14px 18px', borderRadius: '8px', fontSize: '14px', marginTop: '16px' };
const backButtonStyle: React.CSSProperties = { background: 'none', border: 'none', color: '#5a6c7d', fontSize: '14px', cursor: 'pointer', marginBottom: '16px', padding: '4px 0', fontFamily: 'inherit' };
const headerCardStyle: React.CSSProperties = { backgroundColor: '#ffffff', borderRadius: '12px', padding: '28px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(30,58,95,0.06)', border: '1px solid #f0ebe0' };
const headerTopRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' };
const clientNameStyle: React.CSSProperties = { fontSize: '13px', color: '#8a98a8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', fontWeight: 600 };
const rfpNameStyle: React.CSSProperties = { fontFamily: '"Playfair Display", Georgia, serif', fontSize: '28px', fontWeight: 600, color: '#1e3a5f', margin: '0 0 6px 0' };
const agencyLineStyle: React.CSSProperties = { fontSize: '14px', color: '#5a6c7d' };
const metadataGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '20px 24px', padding: '20px 0', borderTop: '1px solid #f0ebe0', borderBottom: '1px solid #f0ebe0', marginBottom: '20px' };
const metaLabelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a98a8', marginBottom: '4px' };
const metaValueStyle: React.CSSProperties = { fontSize: '15px', fontWeight: 500 };
const benefitChipsRowStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' };
const chipsLabelStyle: React.CSSProperties = { fontSize: '13px', color: '#5a6c7d', marginRight: '4px' };
const benefitChipStyle: React.CSSProperties = { backgroundColor: '#f5f1e8', color: '#5a6c7d', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 500 };
const sectionCardStyle: React.CSSProperties = { backgroundColor: '#ffffff', borderRadius: '12px', padding: '28px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(30,58,95,0.06)', border: '1px solid #f0ebe0' };
const sectionTitleStyle: React.CSSProperties = { fontFamily: '"Playfair Display", Georgia, serif', fontSize: '20px', fontWeight: 600, color: '#1e3a5f', margin: '0 0 4px 0' };
const sectionSubtitleStyle: React.CSSProperties = { fontSize: '13px', color: '#8a98a8', margin: '0 0 16px 0' };
const docsRowStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '10px' };
const downloadButtonStyle: React.CSSProperties = { padding: '12px 20px', backgroundColor: '#1e3a5f', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' };
const noDocStyle: React.CSSProperties = { padding: '12px 16px', backgroundColor: '#f5f1e8', borderRadius: '8px', color: '#8a98a8', fontSize: '13px', fontStyle: 'italic' };
const downloadErrorStyle: React.CSSProperties = { marginTop: '10px', color: '#991b1b', fontSize: '13px' };
const tabsRowStyle: React.CSSProperties = { display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid #e8e2d4', paddingBottom: '0' };
const tabButtonStyle: React.CSSProperties = { padding: '10px 16px', background: 'none', border: 'none', borderBottom: '2px solid transparent', color: '#8a98a8', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', marginBottom: '-1px' };
const tabButtonActiveStyle: React.CSSProperties = { color: '#1e3a5f', borderBottomColor: '#1e3a5f', fontWeight: 600 };
const tabContentStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '16px' };
const planCardStyle: React.CSSProperties = { backgroundColor: '#faf7f2', borderRadius: '8px', padding: '20px', border: '1px solid #f0ebe0' };
const planCardHeaderStyle: React.CSSProperties = { marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #e8e2d4' };
const planNameStyle: React.CSSProperties = { fontFamily: '"Playfair Display", Georgia, serif', fontSize: '17px', fontWeight: 600, color: '#1e3a5f' };
const planTypeStyle: React.CSSProperties = { fontSize: '12px', color: '#7a9b76', fontWeight: 500, marginTop: '2px' };
const tiersTableWrapperStyle: React.CSSProperties = { overflowX: 'auto' };
const tiersTableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '13px' };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e8e2d4', color: '#5a6c7d', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdLabelStyle: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid #f0ebe0', color: '#5a6c7d', fontWeight: 500 };
const tdValueStyle: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid #f0ebe0', color: '#1e3a5f' };
const kvListStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column' };
const kvRowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0ebe0', fontSize: '14px' };
const kvLabelStyle: React.CSSProperties = { color: '#5a6c7d' };
const kvValueStyle: React.CSSProperties = { color: '#1e3a5f', fontWeight: 500 };
const emptyTabStyle: React.CSSProperties = { textAlign: 'center', padding: '32px 16px', backgroundColor: '#faf7f2', borderRadius: '8px' };

const declinedNoticeStyle: React.CSSProperties = { backgroundColor: '#fee2e2', borderRadius: '12px', padding: '20px 24px', marginBottom: '20px', border: '1px solid #fecaca' };
const declinedNoticeHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '10px', color: '#991b1b', fontSize: '15px', marginBottom: '6px' };
const declinedReasonStyle: React.CSSProperties = { color: '#7f1d1d', fontSize: '14px', marginLeft: '30px', lineHeight: 1.5 };

const footerCardStyle: React.CSSProperties = { backgroundColor: '#ffffff', borderRadius: '12px', padding: '20px 28px', marginBottom: '40px', boxShadow: '0 2px 8px rgba(30,58,95,0.06)', border: '1px solid #f0ebe0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' };
const footerNoteStyle: React.CSSProperties = { color: '#8a98a8', fontSize: '13px', fontStyle: 'italic' };
const declineButtonStyle: React.CSSProperties = { padding: '10px 18px', background: 'transparent', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' };

// === UPLOAD SECTION STYLES (NEW in Push 3) ===
const uploadSectionCardStyle: React.CSSProperties = { backgroundColor: '#ffffff', borderRadius: '12px', padding: '28px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(30,58,95,0.06)', border: '1px solid #f0ebe0' };
const uploadChoiceRowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' };
const uploadPrimaryButtonStyle: React.CSSProperties = { padding: '20px 24px', backgroundColor: '#1e3a5f', color: '#ffffff', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' };
const uploadSecondaryButtonStyle: React.CSSProperties = { padding: '20px 24px', backgroundColor: '#faf7f2', color: '#1e3a5f', border: '1px solid #e8e2d4', borderRadius: '10px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' };
const uploadButtonSubtextStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 400, marginTop: '4px', opacity: 0.85 };
const uploadTextButtonStyle: React.CSSProperties = { padding: '8px 14px', background: 'transparent', color: '#5a6c7d', border: '1px solid #e8e2d4', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' };
const parsingBoxStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '16px', padding: '20px 22px', backgroundColor: '#faf7f2', border: '1px solid #f0ebe0', borderRadius: '10px' };
const spinnerStyle: React.CSSProperties = { width: '24px', height: '24px', border: '3px solid #e8e2d4', borderTopColor: '#1e3a5f', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 };
const parsingTitleStyle: React.CSSProperties = { fontSize: '15px', fontWeight: 600, color: '#1e3a5f' };
const parsingSubtitleStyle: React.CSSProperties = { fontSize: '13px', color: '#5a6c7d', marginTop: '2px' };
const parsedSuccessBoxStyle: React.CSSProperties = { padding: '20px 22px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px' };
const parsedSuccessHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '10px', color: '#065f46', fontSize: '15px' };
const parsedSuccessSubtextStyle: React.CSSProperties = { fontSize: '13px', color: '#047857', marginTop: '6px', marginLeft: '30px' };
const detailsSummaryStyle: React.CSSProperties = { cursor: 'pointer', fontSize: '13px', color: '#5a6c7d', fontWeight: 500, marginLeft: '30px' };
const extractedDataPreStyle: React.CSSProperties = { marginTop: '10px', padding: '14px', backgroundColor: '#ffffff', border: '1px solid #e8e2d4', borderRadius: '6px', fontSize: '12px', color: '#1e3a5f', overflow: 'auto', maxHeight: '400px', fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace' };
const extractionWarningStyle: React.CSSProperties = { padding: '18px 22px', backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', color: '#9a3412', fontSize: '14px' };
const manualPlaceholderStyle: React.CSSProperties = { padding: '20px 22px', backgroundColor: '#faf7f2', border: '1px dashed #e8e2d4', borderRadius: '10px', color: '#1e3a5f', fontSize: '14px' };
const uploadErrorBoxStyle: React.CSSProperties = { padding: '16px 20px', backgroundColor: '#fee2e2', border: '1px solid #fecaca', borderRadius: '10px', color: '#991b1b', fontSize: '14px' };

// === MODAL STYLES ===
const modalBackdropStyle: React.CSSProperties = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(30, 58, 95, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', zIndex: 1000 };
const modalContentStyle: React.CSSProperties = { backgroundColor: '#ffffff', borderRadius: '16px', padding: '32px', maxWidth: '520px', width: '100%', boxShadow: '0 12px 48px rgba(30, 58, 95, 0.25)' };
const modalTitleStyle: React.CSSProperties = { fontFamily: '"Playfair Display", Georgia, serif', fontSize: '22px', fontWeight: 600, color: '#1e3a5f', margin: '0 0 8px 0' };
const modalSubtitleStyle: React.CSSProperties = { fontSize: '14px', color: '#5a6c7d', margin: '0 0 20px 0', lineHeight: 1.5 };
const fieldLabelStyle: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: 600, color: '#1e3a5f', marginTop: '12px', marginBottom: '6px' };
const selectStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #e8e2d4', backgroundColor: '#ffffff', color: '#1e3a5f', fontFamily: 'inherit', cursor: 'pointer' };
const textareaStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #e8e2d4', backgroundColor: '#ffffff', color: '#1e3a5f', fontFamily: 'inherit', resize: 'vertical', minHeight: '70px', boxSizing: 'border-box' };
const charCountStyle: React.CSSProperties = { fontSize: '11px', color: '#8a98a8', textAlign: 'right', marginTop: '4px' };
const submitErrorStyle: React.CSSProperties = { marginTop: '12px', padding: '10px 12px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '6px', fontSize: '13px' };
const modalButtonsStyle: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' };
const cancelButtonStyle: React.CSSProperties = { padding: '10px 18px', background: 'transparent', color: '#5a6c7d', border: '1px solid #e8e2d4', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' };
const confirmDeclineStyle: React.CSSProperties = { padding: '10px 18px', backgroundColor: '#991b1b', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' };