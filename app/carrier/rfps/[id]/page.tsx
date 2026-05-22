'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
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

type SubmittedQuote = {
  id: string;
  submitted_at: string | null;
  proposal_doc_url: string | null;
  total_annual_cost: number | null;
  monthly_cost: number | null;
  notes: string | null;
  lines: Array<{
    id: string;
    benefit_type: string;
    plan_name: string | null;
    rate_structure: string | null;
    monthly_premium: number | null;
    annual_cost: number | null;
    rates: any;
    plan_design: any;
    display_order: number;
  }>;
};

const DECLINE_REASONS = [
  { code: 'group_too_small', label: 'Group too small' },
  { code: 'industry_not_appetite', label: 'Industry not in appetite' },
  { code: 'timeline_too_short', label: 'Timeline too short' },
  { code: 'state_not_supported', label: 'State not supported' },
  { code: 'other', label: 'Other' },
];

const BENEFIT_TYPE_OPTIONS: Array<{ value: BenefitTypeValue; label: string }> = [
  { value: 'medical', label: 'Medical' },
  { value: 'dental', label: 'Dental' },
  { value: 'vision', label: 'Vision' },
  { value: 'life', label: 'Life & AD&D' },
  { value: 'std', label: 'Short-Term Disability' },
  { value: 'ltd', label: 'Long-Term Disability' },
];

type BenefitTypeValue = 'medical' | 'dental' | 'vision' | 'life' | 'std' | 'ltd';

const RATE_STRUCTURE_OPTIONS = [
  { value: 'tiered_4', label: '4-tier (EE / EE+Sp / EE+Ch / Family)' },
  { value: 'tiered_2', label: '2-tier (EE / Family)' },
  { value: 'composite', label: 'Composite (single rate)' },
  { value: 'age_banded', label: 'Age-banded' },
];

// Map RFP benefit-line keys to canonical benefit_type values
function rfpBenefitToType(rfpBenefit: string): BenefitTypeValue | null {
  const lower = rfpBenefit.toLowerCase();
  if (lower.includes('medical')) return 'medical';
  if (lower.includes('dental')) return 'dental';
  if (lower.includes('vision')) return 'vision';
  if (lower.includes('life')) return 'life';
  if (lower.includes('short') || lower === 'std') return 'std';
  if (lower.includes('long') || lower === 'ltd') return 'ltd';
  return null;
}

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
  const [submittedQuote, setSubmittedQuote] = useState<SubmittedQuote | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string>('');
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [isRevising, setIsRevising] = useState(false);

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
          groups:group_id ( name, location )
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
      client_name: rfp.groups?.name ?? null,
      client_state: rfp.groups?.location ?? null,
      agency_name: rfp.agencies?.name ?? 'Unknown agency',
    });

    // If status is submitted, load the existing quote so we can display it
    if (data.status === 'submitted') {
      const { data: quoteRow } = await supabase
        .from('quotes')
        .select(`
          id,
          submitted_at,
          proposal_doc_url,
          total_annual_cost,
          monthly_cost,
          notes,
          quote_lines (
            id,
            benefit_type,
            plan_name,
            rate_structure,
            monthly_premium,
            annual_cost,
            rates,
            plan_design,
            display_order
          )
        `)
        .eq('rfp_carrier_id', data.id)
        .maybeSingle();
      if (quoteRow) {
        const lines = ((quoteRow as any).quote_lines || []) as SubmittedQuote['lines'];
        lines.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
        setSubmittedQuote({
          id: quoteRow.id,
          submitted_at: quoteRow.submitted_at,
          proposal_doc_url: quoteRow.proposal_doc_url,
          total_annual_cost: quoteRow.total_annual_cost,
          monthly_cost: quoteRow.monthly_cost,
          notes: quoteRow.notes,
          lines,
        });
      }
    } else {
      setSubmittedQuote(null);
    }

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

  const handleSubmitSuccess = async () => {
    setIsRevising(false);
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
  const isSubmitted = detail.rc_status === 'submitted';
  const isClosed = ['won', 'lost'].includes(detail.rc_status);
  const canUpload = !isDeclined && !isClosed && !isSubmitted;
  const canRevise = isSubmitted && !isClosed;

  return (
    <div style={containerStyle}>
      <button onClick={() => router.push('/carrier/rfps')} style={backButtonStyle}>← Back to inbox</button>

      {/* Header */}
      <div style={headerCardStyle}>
        <div style={headerTopRowStyle}>
          <div style={{ flex: 1 }}>
            <div style={clientNameStyle}>{detail.client_name || 'Unnamed group'}</div>
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

      {/* Submitted banner (read-only view) */}
      {isSubmitted && submittedQuote && !isRevising && (
        <SubmittedQuoteView
          quote={submittedQuote}
          canRevise={canRevise}
          onRevise={() => setIsRevising(true)}
        />
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

      {/* Quote upload + form (first submit OR revision) */}
      {(canUpload || isRevising) && (
        <QuoteUploadSection
          rfpId={rfpId}
          requestedBenefits={detail.requested_benefits}
          isRevision={isRevising}
          initialQuote={isRevising ? submittedQuote : null}
          onSubmitSuccess={handleSubmitSuccess}
          onCancelRevision={() => setIsRevising(false)}
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

// === SUBMITTED QUOTE VIEW (read-only) ===

function SubmittedQuoteView({
  quote,
  canRevise,
  onRevise,
}: {
  quote: SubmittedQuote;
  canRevise: boolean;
  onRevise: () => void;
}) {
  const submittedDate = quote.submitted_at ? formatDate(quote.submitted_at) : 'recently';
  return (
    <div style={submittedSuccessCardStyle}>
      <div style={submittedHeaderStyle}>
        <div>
          <div style={submittedTitleStyle}>
            <span style={{ fontSize: '22px', marginRight: '8px' }}>✅</span>
            Quote submitted on {submittedDate}
          </div>
          <div style={submittedSubtitleStyle}>
            The broker has been notified and your quote is now under review.
          </div>
        </div>
        {canRevise && (
          <button onClick={onRevise} style={reviseButtonStyle}>
            Submit a revised quote
          </button>
        )}
      </div>

      <div style={submittedTotalsRowStyle}>
        <div>
          <div style={metaLabelStyle}>Total Monthly</div>
          <div style={submittedTotalValueStyle}>{quote.monthly_cost ? fmtMoney(quote.monthly_cost) : '—'}</div>
        </div>
        <div>
          <div style={metaLabelStyle}>Total Annual</div>
          <div style={submittedTotalValueStyle}>{quote.total_annual_cost ? fmtMoney(quote.total_annual_cost) : '—'}</div>
        </div>
        <div>
          <div style={metaLabelStyle}>Benefit Lines</div>
          <div style={submittedTotalValueStyle}>{quote.lines.length}</div>
        </div>
      </div>

      <div style={submittedLinesListStyle}>
        {quote.lines.map((line) => (
          <div key={line.id} style={submittedLineRowStyle}>
            <div style={{ flex: 1 }}>
              <div style={submittedLineTitleStyle}>
                {BENEFIT_TYPE_OPTIONS.find(o => o.value === line.benefit_type)?.label ?? line.benefit_type}
                {line.plan_name && <span style={{ color: '#5a6c7d', fontWeight: 400, marginLeft: '8px' }}>· {line.plan_name}</span>}
              </div>
              <div style={submittedLineMetaStyle}>
                {line.rate_structure && <span>{RATE_STRUCTURE_OPTIONS.find(o => o.value === line.rate_structure)?.label.split(' ')[0]}</span>}
                {line.monthly_premium != null && <span> · Monthly {fmtMoney(line.monthly_premium)}</span>}
                {line.annual_cost != null && <span> · Annual {fmtMoney(line.annual_cost)}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {quote.notes && (
        <div style={submittedNotesStyle}>
          <strong>Notes:</strong> {quote.notes}
        </div>
      )}
    </div>
  );
}

// === QUOTE UPLOAD SECTION (NEW in Push 4) ===

type FormLine = {
  uiKey: string;                  // stable React key for this line
  benefit_type: BenefitTypeValue;
  plan_name: string;
  rate_structure: string;
  monthly_premium: string;        // strings while editing, parsed on submit
  annual_cost: string;
  rates: {
    employee_only: string;
    employee_spouse: string;
    employee_children: string;
    family: string;
  };
  plan_design: any;               // per-type shape; edited inline
};

type UploadState =
  | { kind: 'choose' }
  | { kind: 'parsing'; filename: string }
  | { kind: 'reviewing'; proposalDocUrl: string | null; extractedData: any; extractionStatus: 'extracted' | 'manual' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string };

function makeBlankLine(benefitType: BenefitTypeValue): FormLine {
  return {
    uiKey: `${benefitType}-${Math.random().toString(36).slice(2, 9)}`,
    benefit_type: benefitType,
    plan_name: '',
    rate_structure: 'tiered_4',
    monthly_premium: '',
    annual_cost: '',
    rates: {
      employee_only: '',
      employee_spouse: '',
      employee_children: '',
      family: '',
    },
    plan_design: defaultPlanDesignForType(benefitType),
  };
}

function defaultPlanDesignForType(benefitType: BenefitTypeValue): any {
  switch (benefitType) {
    case 'medical':
      return { deductible_individual: null, deductible_family: null, oop_max_individual: null, oop_max_family: null, coinsurance_pct: null, pcp_copay: null, specialist_copay: null, er_copay: null, urgent_care_copay: null, telehealth_copay: null, rx_generic: null, rx_preferred_brand: null, rx_non_preferred_brand: null, rx_specialty: null, rx_specialty_is_percentage: null, notes: null };
    case 'dental':
      return { annual_max: null, deductible_individual: null, deductible_family: null, preventive_coverage_pct: null, basic_coverage_pct: null, major_coverage_pct: null, ortho_coverage_pct: null, ortho_lifetime_max: null, ortho_covered: null, notes: null };
    case 'vision':
      return { exam_copay: null, exam_frequency_months: null, frames_allowance: null, frames_frequency_months: null, lenses_copay: null, lenses_frequency_months: null, contacts_allowance: null, contacts_frequency_months: null, notes: null };
    case 'life':
      return { benefit_amount: null, ad_d_amount: null, is_multiple_of_salary: null, salary_multiple: null, max_benefit: null, age_reduction_schedule: null, notes: null };
    case 'std':
      return { benefit_pct: null, max_weekly_benefit: null, elimination_period_days: null, max_benefit_duration_weeks: null, notes: null };
    case 'ltd':
      return { benefit_pct: null, max_monthly_benefit: null, elimination_period_days: null, max_benefit_duration: null, notes: null };
    default:
      return {};
  }
}

function lineFromExtracted(extractedLine: any): FormLine | null {
  if (!extractedLine || !ALLOWED_BENEFIT_TYPES.includes(extractedLine.benefit_type)) return null;
  const benefitType = extractedLine.benefit_type as BenefitTypeValue;
  const rates = extractedLine.rates || {};
  return {
    uiKey: `${benefitType}-${Math.random().toString(36).slice(2, 9)}`,
    benefit_type: benefitType,
    plan_name: extractedLine.plan_name || '',
    rate_structure: extractedLine.rate_structure || 'tiered_4',
    monthly_premium: extractedLine.monthly_premium != null ? String(extractedLine.monthly_premium) : '',
    annual_cost: extractedLine.annual_cost != null ? String(extractedLine.annual_cost) : '',
    rates: {
      employee_only: rates.employee_only != null ? String(rates.employee_only) : '',
      employee_spouse: rates.employee_spouse != null ? String(rates.employee_spouse) : '',
      employee_children: rates.employee_children != null ? String(rates.employee_children) : '',
      family: rates.family != null ? String(rates.family) : '',
    },
    plan_design: { ...defaultPlanDesignForType(benefitType), ...(extractedLine.plan_design || {}) },
  };
}

function lineFromExistingQuote(quoteLine: SubmittedQuote['lines'][number]): FormLine {
  const benefitType = ((ALLOWED_BENEFIT_TYPES as readonly string[]).includes(quoteLine.benefit_type) ? quoteLine.benefit_type : 'medical') as BenefitTypeValue;
  const rates = quoteLine.rates || {};
  return {
    uiKey: `${quoteLine.id}-${Math.random().toString(36).slice(2, 9)}`,
    benefit_type: benefitType,
    plan_name: quoteLine.plan_name || '',
    rate_structure: quoteLine.rate_structure || 'tiered_4',
    monthly_premium: quoteLine.monthly_premium != null ? String(quoteLine.monthly_premium) : '',
    annual_cost: quoteLine.annual_cost != null ? String(quoteLine.annual_cost) : '',
    rates: {
      employee_only: rates.employee_only != null ? String(rates.employee_only) : '',
      employee_spouse: rates.employee_spouse != null ? String(rates.employee_spouse) : '',
      employee_children: rates.employee_children != null ? String(rates.employee_children) : '',
      family: rates.family != null ? String(rates.family) : '',
    },
    plan_design: { ...defaultPlanDesignForType(benefitType), ...(quoteLine.plan_design || {}) },
  };
}

const ALLOWED_BENEFIT_TYPES: BenefitTypeValue[] = ['medical', 'dental', 'vision', 'life', 'std', 'ltd'];

function QuoteUploadSection({
  rfpId,
  requestedBenefits,
  isRevision,
  initialQuote,
  onSubmitSuccess,
  onCancelRevision,
}: {
  rfpId: string;
  requestedBenefits: string[];
  isRevision: boolean;
  initialQuote: SubmittedQuote | null;
  onSubmitSuccess: () => void;
  onCancelRevision: () => void;
}) {
  // If revising, seed state with reviewing+existing lines. Otherwise choose state.
  const initialState: UploadState = isRevision && initialQuote
    ? { kind: 'reviewing', proposalDocUrl: initialQuote.proposal_doc_url, extractedData: null, extractionStatus: 'manual' }
    : { kind: 'choose' };

  const [state, setState] = useState<UploadState>(initialState);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initial set of form lines
  const initialLines = useMemo<FormLine[]>(() => {
    if (isRevision && initialQuote) {
      return initialQuote.lines.map(lineFromExistingQuote);
    }
    return [];
  }, [isRevision, initialQuote]);

  const [lines, setLines] = useState<FormLine[]>(initialLines);
  const [carrierNameField, setCarrierNameField] = useState<string>('');
  const [effectiveDateField, setEffectiveDateField] = useState<string>(initialQuote ? '' : '');
  const [notesField, setNotesField] = useState<string>(initialQuote?.notes ?? '');
  const [submitError, setSubmitError] = useState<string>('');

  const handlePdfPicked = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setState({ kind: 'error', message: 'Please select a PDF file.' });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setState({ kind: 'error', message: 'PDF must be under 15 MB.' });
      return;
    }
    setState({ kind: 'parsing', filename: file.name });
    try {
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
        body: JSON.stringify({ pdf_base64: base64, filename: file.name }),
      });
      const body = await res.json();
      if (!res.ok) {
        const debugSuffix = body.debug ? `\n\nDEBUG: ${JSON.stringify(body.debug, null, 2)}` : '';
        setState({ kind: 'error', message: (body.error || 'Could not parse the PDF.') + debugSuffix });
        return;
      }

      // Build initial form lines from extraction
      const extracted = body.extracted_data;
      const extractedLines: FormLine[] = [];
      if (extracted && Array.isArray(extracted.lines)) {
        for (const el of extracted.lines) {
          const fl = lineFromExtracted(el);
          if (fl) extractedLines.push(fl);
        }
      }

      // For any requested benefit not represented in extraction, pre-create a blank line
      const seenTypes = new Set(extractedLines.map(l => l.benefit_type));
      for (const rb of requestedBenefits) {
        const typeMaybe = rfpBenefitToType(rb);
        if (typeMaybe && !seenTypes.has(typeMaybe)) {
          extractedLines.push(makeBlankLine(typeMaybe));
          seenTypes.add(typeMaybe);
        }
      }

      setLines(extractedLines);
      if (extracted) {
        if (extracted.carrier_name) setCarrierNameField(extracted.carrier_name);
        if (extracted.effective_date) setEffectiveDateField(extracted.effective_date);
      }
      setState({
        kind: 'reviewing',
        proposalDocUrl: body.proposal_doc_url || null,
        extractedData: extracted,
        extractionStatus: extracted ? 'extracted' : 'manual',
      });
    } catch (err: any) {
      console.error('[QuoteUploadSection] parse error:', err);
      setState({ kind: 'error', message: 'Network error. Please try again.' });
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handlePdfPicked(file);
    e.target.value = '';
  };

  const handleStartManual = () => {
    // Pre-create one blank line per requested benefit
    const blankLines: FormLine[] = [];
    for (const rb of requestedBenefits) {
      const typeMaybe = rfpBenefitToType(rb);
      if (typeMaybe) blankLines.push(makeBlankLine(typeMaybe));
    }
    if (blankLines.length === 0) blankLines.push(makeBlankLine('medical'));
    setLines(blankLines);
    setState({ kind: 'reviewing', proposalDocUrl: null, extractedData: null, extractionStatus: 'manual' });
  };

  const handleAddLine = () => {
    setLines([...lines, makeBlankLine('medical')]);
  };

  const handleRemoveLine = (uiKey: string) => {
    setLines(lines.filter(l => l.uiKey !== uiKey));
  };

  const handleUpdateLine = (uiKey: string, updates: Partial<FormLine>) => {
    setLines(lines.map(l => {
      if (l.uiKey !== uiKey) return l;
      // If benefit_type changed, also swap to default plan_design for that type
      if (updates.benefit_type && updates.benefit_type !== l.benefit_type) {
        return { ...l, ...updates, plan_design: defaultPlanDesignForType(updates.benefit_type) };
      }
      return { ...l, ...updates };
    }));
  };

  const handleUpdateLineRate = (uiKey: string, tier: keyof FormLine['rates'], value: string) => {
    setLines(lines.map(l => {
      if (l.uiKey !== uiKey) return l;
      return { ...l, rates: { ...l.rates, [tier]: value } };
    }));
  };

  const handleUpdatePlanDesign = (uiKey: string, field: string, value: any) => {
    setLines(lines.map(l => {
      if (l.uiKey !== uiKey) return l;
      return { ...l, plan_design: { ...l.plan_design, [field]: value } };
    }));
  };

  const handleSubmit = async () => {
    setSubmitError('');
    if (state.kind !== 'reviewing') return;
    setState({ kind: 'submitting' });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setSubmitError('Your session has expired. Please log in again.');
        setState({ kind: 'reviewing', proposalDocUrl: state.proposalDocUrl, extractedData: state.extractedData, extractionStatus: state.extractionStatus });
        return;
      }

      // Convert lines to API shape (parse number strings)
      const payloadLines = lines.map(l => ({
        benefit_type: l.benefit_type,
        plan_name: l.plan_name || null,
        rate_structure: l.rate_structure || null,
        monthly_premium: parseNumOrNull(l.monthly_premium),
        annual_cost: parseNumOrNull(l.annual_cost),
        rates: {
          employee_only: parseNumOrNull(l.rates.employee_only),
          employee_spouse: parseNumOrNull(l.rates.employee_spouse),
          employee_children: parseNumOrNull(l.rates.employee_children),
          family: parseNumOrNull(l.rates.family),
        },
        plan_design: l.plan_design,
      }));

      // Aggregate totals from lines if blank
      const sumMonthly = payloadLines.reduce((sum, l) => sum + (l.monthly_premium ?? 0), 0);
      const sumAnnual = payloadLines.reduce((sum, l) => sum + (l.annual_cost ?? 0), 0);

      const res = await fetch(`/api/carrier/rfps/${rfpId}/submit-quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          proposal_doc_url: (state as any).proposalDocUrl,
          extracted_data: (state as any).extractedData,
          carrier_name: carrierNameField || null,
          effective_date: effectiveDateField || null,
          total_annual_cost: sumAnnual > 0 ? sumAnnual : null,
          monthly_cost: sumMonthly > 0 ? sumMonthly : null,
          lines: payloadLines,
          notes: notesField || null,
          extraction_status: (state as any).extractionStatus,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSubmitError(body.error || 'Could not submit the quote.');
        setState({ kind: 'reviewing', proposalDocUrl: (state as any).proposalDocUrl, extractedData: (state as any).extractedData, extractionStatus: (state as any).extractionStatus });
        return;
      }
      onSubmitSuccess();
    } catch (err: any) {
      console.error('[QuoteUploadSection] submit error:', err);
      setSubmitError('Network error. Please try again.');
      setState({ kind: 'reviewing', proposalDocUrl: (state as any).proposalDocUrl, extractedData: (state as any).extractedData, extractionStatus: (state as any).extractionStatus });
    }
  };

  const handleReset = () => setState({ kind: 'choose' });

  // Reviewing mode UI is shown for both PDF-extracted and manual entry
  if (state.kind === 'reviewing' || state.kind === 'submitting') {
    return (
      <div style={uploadSectionCardStyle}>
        <div style={reviewHeaderRowStyle}>
          <div>
            <h2 style={sectionTitleStyle}>{isRevision ? 'Revise Your Quote' : 'Review & Submit Quote'}</h2>
            <p style={sectionSubtitleStyle}>
              {isRevision
                ? 'Edit any fields and submit to replace your previous quote.'
                : 'Review the extracted data, edit anything that needs correction, and submit when ready.'}
            </p>
          </div>
          {isRevision && (
            <button onClick={onCancelRevision} style={uploadTextButtonStyle}>
              Cancel revision
            </button>
          )}
        </div>

        {state.kind === 'reviewing' && state.extractedData == null && state.extractionStatus === 'manual' && !isRevision && (
          <div style={manualNoticeStyle}>
            <strong>📝 Manual entry</strong>
            <div style={{ fontSize: '13px', marginTop: '4px', color: '#5a6c7d' }}>
              You&apos;re entering the quote details by hand. All fields are optional — fill in what you have.
            </div>
          </div>
        )}

        {/* Top-level metadata */}
        <div style={formGridStyle}>
          <div>
            <label style={fieldLabelStyle}>Carrier name</label>
            <input
              type="text"
              value={carrierNameField}
              onChange={(e) => setCarrierNameField(e.target.value)}
              placeholder="e.g. Aetna, UHC, BCBS"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={fieldLabelStyle}>Effective date</label>
            <input
              type="date"
              value={effectiveDateField}
              onChange={(e) => setEffectiveDateField(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Per-line forms */}
        <div style={{ marginTop: '20px' }}>
          {lines.length === 0 && (
            <div style={emptyLinesStyle}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>📋</div>
              <div>No benefit lines yet. Click &quot;Add benefit line&quot; below to start.</div>
            </div>
          )}
          {lines.map((line) => (
            <BenefitLineEditor
              key={line.uiKey}
              line={line}
              onUpdate={(updates) => handleUpdateLine(line.uiKey, updates)}
              onUpdateRate={(tier, value) => handleUpdateLineRate(line.uiKey, tier, value)}
              onUpdatePlanDesign={(field, value) => handleUpdatePlanDesign(line.uiKey, field, value)}
              onRemove={() => handleRemoveLine(line.uiKey)}
            />
          ))}
        </div>

        <button onClick={handleAddLine} style={addLineButtonStyle}>
          + Add benefit line
        </button>

        {/* Notes */}
        <div style={{ marginTop: '24px' }}>
          <label style={fieldLabelStyle}>Notes for the broker (optional)</label>
          <textarea
            value={notesField}
            onChange={(e) => setNotesField(e.target.value)}
            placeholder="Anything else you'd like the broker to know about this quote..."
            rows={3}
            maxLength={1000}
            style={textareaInputStyle}
          />
        </div>

        {submitError && (
          <div style={submitErrorStyle}>{submitError}</div>
        )}

        {/* Submit row */}
        <div style={submitRowStyle}>
          {!isRevision && (
            <button onClick={handleReset} disabled={state.kind === 'submitting'} style={uploadTextButtonStyle}>
              ← Start over
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={state.kind === 'submitting'}
            style={submitButtonStyle}
          >
            {state.kind === 'submitting' ? 'Submitting…' : (isRevision ? 'Submit revised quote' : 'Submit quote')}
          </button>
        </div>
      </div>
    );
  }

  // Choose / parsing / error states
  return (
    <div style={uploadSectionCardStyle}>
      <h2 style={sectionTitleStyle}>Submit a Quote</h2>
      <p style={sectionSubtitleStyle}>
        Upload your quote proposal PDF and we&apos;ll extract the details automatically. You&apos;ll get to review everything before submitting.
      </p>

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
          <button onClick={handleStartManual} style={uploadSecondaryButtonStyle}>
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

// === BENEFIT LINE EDITOR ===

function BenefitLineEditor({
  line,
  onUpdate,
  onUpdateRate,
  onUpdatePlanDesign,
  onRemove,
}: {
  line: FormLine;
  onUpdate: (updates: Partial<FormLine>) => void;
  onUpdateRate: (tier: keyof FormLine['rates'], value: string) => void;
  onUpdatePlanDesign: (field: string, value: any) => void;
  onRemove: () => void;
}) {
  const showSpouse = line.rate_structure === 'tiered_4';
  const showChildren = line.rate_structure === 'tiered_4';
  const showFamily = ['tiered_4', 'tiered_2'].includes(line.rate_structure);

  return (
    <div style={lineCardStyle}>
      <div style={lineCardHeaderStyle}>
        <select
          value={line.benefit_type}
          onChange={(e) => onUpdate({ benefit_type: e.target.value as BenefitTypeValue })}
          style={lineBenefitSelectStyle}
        >
          {BENEFIT_TYPE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button onClick={onRemove} style={removeLineButtonStyle} title="Remove this benefit line">
          ✕ Remove
        </button>
      </div>

      <div style={formGridStyle}>
        <div>
          <label style={fieldLabelStyle}>Plan name</label>
          <input
            type="text"
            value={line.plan_name}
            onChange={(e) => onUpdate({ plan_name: e.target.value })}
            placeholder="e.g. PPO 2000"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={fieldLabelStyle}>Rate structure</label>
          <select
            value={line.rate_structure}
            onChange={(e) => onUpdate({ rate_structure: e.target.value })}
            style={inputStyle}
          >
            {RATE_STRUCTURE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginTop: '14px' }}>
        <div style={subsectionLabelStyle}>Premium totals</div>
        <div style={formGridStyle}>
          <div>
            <label style={fieldLabelStyle}>Total monthly premium</label>
            <input
              type="number"
              step="0.01"
              value={line.monthly_premium}
              onChange={(e) => onUpdate({ monthly_premium: e.target.value })}
              placeholder="0.00"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={fieldLabelStyle}>Total annual cost</label>
            <input
              type="number"
              step="0.01"
              value={line.annual_cost}
              onChange={(e) => onUpdate({ annual_cost: e.target.value })}
              placeholder="0.00"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      <div style={{ marginTop: '14px' }}>
        <div style={subsectionLabelStyle}>Tier rates (monthly)</div>
        <div style={ratesGridStyle}>
          <div>
            <label style={fieldLabelStyle}>Employee only</label>
            <input
              type="number"
              step="0.01"
              value={line.rates.employee_only}
              onChange={(e) => onUpdateRate('employee_only', e.target.value)}
              placeholder="0.00"
              style={inputStyle}
            />
          </div>
          {showSpouse && (
            <div>
              <label style={fieldLabelStyle}>EE + Spouse</label>
              <input
                type="number"
                step="0.01"
                value={line.rates.employee_spouse}
                onChange={(e) => onUpdateRate('employee_spouse', e.target.value)}
                placeholder="0.00"
                style={inputStyle}
              />
            </div>
          )}
          {showChildren && (
            <div>
              <label style={fieldLabelStyle}>EE + Children</label>
              <input
                type="number"
                step="0.01"
                value={line.rates.employee_children}
                onChange={(e) => onUpdateRate('employee_children', e.target.value)}
                placeholder="0.00"
                style={inputStyle}
              />
            </div>
          )}
          {showFamily && (
            <div>
              <label style={fieldLabelStyle}>Family</label>
              <input
                type="number"
                step="0.01"
                value={line.rates.family}
                onChange={(e) => onUpdateRate('family', e.target.value)}
                placeholder="0.00"
                style={inputStyle}
              />
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: '14px' }}>
        <div style={subsectionLabelStyle}>Plan design</div>
        <PlanDesignEditor benefitType={line.benefit_type} planDesign={line.plan_design} onUpdate={onUpdatePlanDesign} />
      </div>
    </div>
  );
}

// === PLAN DESIGN EDITOR (per-type field sets) ===

function PlanDesignEditor({
  benefitType,
  planDesign,
  onUpdate,
}: {
  benefitType: BenefitTypeValue;
  planDesign: any;
  onUpdate: (field: string, value: any) => void;
}) {
  const fields = PLAN_DESIGN_FIELDS[benefitType] || [];
  return (
    <div style={planDesignGridStyle}>
      {fields.map(f => (
        <PlanDesignField
          key={f.key}
          field={f}
          value={planDesign?.[f.key]}
          onChange={(v) => onUpdate(f.key, v)}
        />
      ))}
      <div style={{ gridColumn: '1 / -1' }}>
        <label style={fieldLabelStyle}>Notes</label>
        <textarea
          value={planDesign?.notes ?? ''}
          onChange={(e) => onUpdate('notes', e.target.value || null)}
          placeholder="Anything notable about this plan..."
          rows={2}
          style={textareaInputStyle}
        />
      </div>
    </div>
  );
}

type FieldDef = { key: string; label: string; type: 'number' | 'text' | 'select'; options?: string[]; placeholder?: string };

const PLAN_DESIGN_FIELDS: Record<BenefitTypeValue, FieldDef[]> = {
  medical: [
    { key: 'deductible_individual', label: 'Deductible (Individual)', type: 'number' },
    { key: 'deductible_family', label: 'Deductible (Family)', type: 'number' },
    { key: 'oop_max_individual', label: 'OOP Max (Individual)', type: 'number' },
    { key: 'oop_max_family', label: 'OOP Max (Family)', type: 'number' },
    { key: 'coinsurance_pct', label: 'Coinsurance %', type: 'number' },
    { key: 'pcp_copay', label: 'PCP Copay', type: 'number' },
    { key: 'specialist_copay', label: 'Specialist Copay', type: 'number' },
    { key: 'er_copay', label: 'ER Copay', type: 'number' },
    { key: 'urgent_care_copay', label: 'Urgent Care Copay', type: 'number' },
    { key: 'telehealth_copay', label: 'Telehealth Copay', type: 'number' },
    { key: 'rx_generic', label: 'Rx Generic', type: 'number' },
    { key: 'rx_preferred_brand', label: 'Rx Preferred Brand', type: 'number' },
    { key: 'rx_non_preferred_brand', label: 'Rx Non-Preferred Brand', type: 'number' },
    { key: 'rx_specialty', label: 'Rx Specialty (amount or cap)', type: 'number' },
  ],
  dental: [
    { key: 'annual_max', label: 'Annual Max (per person)', type: 'number' },
    { key: 'deductible_individual', label: 'Deductible (Individual)', type: 'number' },
    { key: 'deductible_family', label: 'Deductible (Family)', type: 'number' },
    { key: 'preventive_coverage_pct', label: 'Preventive Coverage %', type: 'number' },
    { key: 'basic_coverage_pct', label: 'Basic Coverage %', type: 'number' },
    { key: 'major_coverage_pct', label: 'Major Coverage %', type: 'number' },
    { key: 'ortho_coverage_pct', label: 'Ortho Coverage %', type: 'number' },
    { key: 'ortho_lifetime_max', label: 'Ortho Lifetime Max', type: 'number' },
    { key: 'ortho_covered', label: 'Ortho Coverage', type: 'select', options: ['', 'child_only', 'adult_and_child', 'none'] },
  ],
  vision: [
    { key: 'exam_copay', label: 'Exam Copay', type: 'number' },
    { key: 'exam_frequency_months', label: 'Exam Frequency (months)', type: 'number' },
    { key: 'frames_allowance', label: 'Frames Allowance', type: 'number' },
    { key: 'frames_frequency_months', label: 'Frames Frequency (months)', type: 'number' },
    { key: 'lenses_copay', label: 'Lenses Copay', type: 'number' },
    { key: 'lenses_frequency_months', label: 'Lenses Frequency (months)', type: 'number' },
    { key: 'contacts_allowance', label: 'Contacts Allowance', type: 'number' },
    { key: 'contacts_frequency_months', label: 'Contacts Frequency (months)', type: 'number' },
  ],
  life: [
    { key: 'benefit_amount', label: 'Benefit Amount (flat)', type: 'number' },
    { key: 'ad_d_amount', label: 'AD&D Amount', type: 'number' },
    { key: 'salary_multiple', label: 'Salary Multiple (if applicable)', type: 'number' },
    { key: 'max_benefit', label: 'Max Benefit Cap', type: 'number' },
    { key: 'age_reduction_schedule', label: 'Age Reduction Schedule', type: 'text', placeholder: 'e.g. 35% at 65, 50% at 70' },
  ],
  std: [
    { key: 'benefit_pct', label: 'Benefit % of Salary', type: 'number' },
    { key: 'max_weekly_benefit', label: 'Max Weekly Benefit', type: 'number' },
    { key: 'elimination_period_days', label: 'Elimination Period (days)', type: 'number' },
    { key: 'max_benefit_duration_weeks', label: 'Max Duration (weeks)', type: 'number' },
  ],
  ltd: [
    { key: 'benefit_pct', label: 'Benefit % of Salary', type: 'number' },
    { key: 'max_monthly_benefit', label: 'Max Monthly Benefit', type: 'number' },
    { key: 'elimination_period_days', label: 'Elimination Period (days)', type: 'number' },
    { key: 'max_benefit_duration', label: 'Max Duration', type: 'text', placeholder: 'e.g. to age 65, 5 years' },
  ],
};

function PlanDesignField({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: any;
  onChange: (v: any) => void;
}) {
  const displayValue = value == null ? '' : String(value);
  return (
    <div>
      <label style={fieldLabelStyle}>{field.label}</label>
      {field.type === 'select' ? (
        <select
          value={displayValue}
          onChange={(e) => onChange(e.target.value || null)}
          style={inputStyle}
        >
          {(field.options || []).map(opt => (
            <option key={opt} value={opt}>{opt || '— Not specified —'}</option>
          ))}
        </select>
      ) : (
        <input
          type={field.type}
          value={displayValue}
          onChange={(e) => {
            const raw = e.target.value;
            if (field.type === 'number') {
              if (raw === '') { onChange(null); return; }
              const n = parseFloat(raw);
              onChange(isNaN(n) ? null : n);
            } else {
              onChange(raw || null);
            }
          }}
          placeholder={field.placeholder || ''}
          style={inputStyle}
          step={field.type === 'number' ? '0.01' : undefined}
        />
      )}
    </div>
  );
}

// === HELPERS ===

function parseNumOrNull(s: string): number | null {
  if (s == null || s === '') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
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

// === PLAN DESIGN TABS (unchanged from earlier pushes) ===

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

// Upload + form styles
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
const uploadErrorBoxStyle: React.CSSProperties = { padding: '16px 20px', backgroundColor: '#fee2e2', border: '1px solid #fecaca', borderRadius: '10px', color: '#991b1b', fontSize: '14px' };

// Review form styles
const reviewHeaderRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' };
const manualNoticeStyle: React.CSSProperties = { padding: '12px 16px', backgroundColor: '#fef3c7', borderRadius: '8px', color: '#92400e', fontSize: '14px', marginBottom: '20px', border: '1px solid #fde68a' };
const formGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' };
const ratesGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px 16px' };
const planDesignGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px 16px' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid #e8e2d4', backgroundColor: '#ffffff', color: '#1e3a5f', fontFamily: 'inherit', boxSizing: 'border-box' };
const textareaInputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid #e8e2d4', backgroundColor: '#ffffff', color: '#1e3a5f', fontFamily: 'inherit', resize: 'vertical', minHeight: '60px', boxSizing: 'border-box' };
const subsectionLabelStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 600, color: '#5a6c7d', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' };
const lineCardStyle: React.CSSProperties = { backgroundColor: '#faf7f2', borderRadius: '10px', padding: '20px', border: '1px solid #f0ebe0', marginBottom: '14px' };
const lineCardHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid #e8e2d4' };
const lineBenefitSelectStyle: React.CSSProperties = { padding: '8px 12px', fontSize: '14px', fontWeight: 600, color: '#1e3a5f', backgroundColor: '#ffffff', border: '1px solid #e8e2d4', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit' };
const removeLineButtonStyle: React.CSSProperties = { padding: '6px 12px', background: 'transparent', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' };
const addLineButtonStyle: React.CSSProperties = { padding: '12px 20px', background: 'transparent', color: '#1e3a5f', border: '2px dashed #cbd5db', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%', marginTop: '4px' };
const emptyLinesStyle: React.CSSProperties = { textAlign: 'center', padding: '32px 16px', color: '#8a98a8', fontSize: '14px' };
const submitRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #f0ebe0' };
const submitButtonStyle: React.CSSProperties = { padding: '12px 28px', backgroundColor: '#7a9b76', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' };

// Submitted view styles
const submittedSuccessCardStyle: React.CSSProperties = { backgroundColor: '#f0fdf4', borderRadius: '12px', padding: '24px 28px', marginBottom: '20px', border: '1px solid #bbf7d0' };
const submittedHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' };
const submittedTitleStyle: React.CSSProperties = { fontFamily: '"Playfair Display", Georgia, serif', fontSize: '20px', fontWeight: 600, color: '#065f46', marginBottom: '4px' };
const submittedSubtitleStyle: React.CSSProperties = { fontSize: '14px', color: '#047857' };
const reviseButtonStyle: React.CSSProperties = { padding: '10px 18px', background: '#ffffff', color: '#065f46', border: '1px solid #86efac', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 };
const submittedTotalsRowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', padding: '16px 20px', backgroundColor: '#ffffff', borderRadius: '8px', marginBottom: '16px', border: '1px solid #bbf7d0' };
const submittedTotalValueStyle: React.CSSProperties = { fontFamily: '"Playfair Display", Georgia, serif', fontSize: '20px', fontWeight: 600, color: '#065f46', marginTop: '4px' };
const submittedLinesListStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '8px' };
const submittedLineRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #d1fae5' };
const submittedLineTitleStyle: React.CSSProperties = { fontSize: '14px', fontWeight: 600, color: '#065f46' };
const submittedLineMetaStyle: React.CSSProperties = { fontSize: '12px', color: '#047857', marginTop: '2px' };
const submittedNotesStyle: React.CSSProperties = { marginTop: '14px', padding: '12px 16px', backgroundColor: '#ffffff', borderRadius: '8px', fontSize: '13px', color: '#065f46', border: '1px solid #d1fae5' };

// Modal styles
const modalBackdropStyle: React.CSSProperties = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(30, 58, 95, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', zIndex: 1000 };
const modalContentStyle: React.CSSProperties = { backgroundColor: '#ffffff', borderRadius: '16px', padding: '32px', maxWidth: '520px', width: '100%', boxShadow: '0 12px 48px rgba(30, 58, 95, 0.25)' };
const modalTitleStyle: React.CSSProperties = { fontFamily: '"Playfair Display", Georgia, serif', fontSize: '22px', fontWeight: 600, color: '#1e3a5f', margin: '0 0 8px 0' };
const modalSubtitleStyle: React.CSSProperties = { fontSize: '14px', color: '#5a6c7d', margin: '0 0 20px 0', lineHeight: 1.5 };
const fieldLabelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#5a6c7d', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' };
const selectStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #e8e2d4', backgroundColor: '#ffffff', color: '#1e3a5f', fontFamily: 'inherit', cursor: 'pointer' };
const textareaStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #e8e2d4', backgroundColor: '#ffffff', color: '#1e3a5f', fontFamily: 'inherit', resize: 'vertical', minHeight: '70px', boxSizing: 'border-box' };
const charCountStyle: React.CSSProperties = { fontSize: '11px', color: '#8a98a8', textAlign: 'right', marginTop: '4px' };
const submitErrorStyle: React.CSSProperties = { marginTop: '12px', padding: '10px 12px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '6px', fontSize: '13px' };
const modalButtonsStyle: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' };
const cancelButtonStyle: React.CSSProperties = { padding: '10px 18px', background: 'transparent', color: '#5a6c7d', border: '1px solid #e8e2d4', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' };
const confirmDeclineStyle: React.CSSProperties = { padding: '10px 18px', backgroundColor: '#991b1b', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' };
