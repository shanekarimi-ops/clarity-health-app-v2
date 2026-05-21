'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '../../../../supabase';
import BrokerSidebar from '../../../../components/BrokerSidebar';

type QuoteLine = {
  id: string;
  benefit_type: string;
  plan_name: string | null;
  rate_structure: string | null;
  rates: Record<string, number | null> | null;
  monthly_premium: number | null;
  annual_cost: number | null;
  plan_design: Record<string, any> | null;
  display_order: number;
};

type Quote = {
  id: string;
  carrier_id: string;
  carrier_name: string;
  carrier_brand_color: string | null;
  monthly_cost: number | null;
  total_annual_cost: number | null;
  cost_change_pct: number | null;
  status: string;
  notes: string | null;
  submitted_at: string | null;
  lines: QuoteLine[];
};

type Rfp = {
  id: string;
  name: string;
  employer_name: string;
  current_plan_design: Record<string, any> | null;
  effective_date: string | null;
};

type Narrative = {
  id: string;
  bullets: string[];
  quotes_count: number;
  quote_ids: string[];
  model: string | null;
  generated_by_name: string | null;
  created_at: string;
};

type ReviewTarget = 'submitted' | 'reviewed' | 'shortlisted' | 'rejected' | 'won' | 'lost';

type TemplateChoice = 'standard' | 'executive' | 'detailed';

const BENEFIT_LABELS: Record<string, string> = {
  medical: 'Medical',
  dental: 'Dental',
  vision: 'Vision',
  life: 'Life',
  std: 'Short-term Disability',
  ltd: 'Long-term Disability',
};

const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  submitted:   { bg: '#e6f0fb', fg: '#1e3a5f', label: 'Submitted' },
  reviewed:    { bg: '#fff4e0', fg: '#8a5a00', label: 'Reviewed' },
  shortlisted: { bg: '#e6f4ea', fg: '#1e5631', label: 'Shortlisted' },
  rejected:    { bg: '#fdecec', fg: '#9b2c2c', label: 'Rejected' },
  won:         { bg: '#d4edda', fg: '#155724', label: 'Won' },
  lost:        { bg: '#e2e3e5', fg: '#383d41', label: 'Lost' },
};

const PLAN_DESIGN_FIELDS: Record<string, { key: string; label: string; format?: 'currency' | 'percent' | 'text' }[]> = {
  medical: [
    { key: 'deductible_individual', label: 'Deductible (Ind)', format: 'currency' },
    { key: 'deductible_family', label: 'Deductible (Fam)', format: 'currency' },
    { key: 'oop_max_individual', label: 'OOP Max (Ind)', format: 'currency' },
    { key: 'oop_max_family', label: 'OOP Max (Fam)', format: 'currency' },
    { key: 'coinsurance_pct', label: 'Coinsurance %', format: 'percent' },
    { key: 'pcp_copay', label: 'PCP Copay', format: 'currency' },
    { key: 'specialist_copay', label: 'Specialist Copay', format: 'currency' },
    { key: 'urgent_care_copay', label: 'Urgent Care Copay', format: 'currency' },
    { key: 'telehealth_copay', label: 'Telehealth Copay', format: 'currency' },
    { key: 'er_copay', label: 'ER Copay', format: 'currency' },
    { key: 'rx_generic', label: 'Rx Generic', format: 'currency' },
    { key: 'rx_preferred_brand', label: 'Rx Preferred Brand', format: 'currency' },
    { key: 'rx_non_preferred_brand', label: 'Rx Non-Preferred Brand', format: 'currency' },
    { key: 'rx_specialty', label: 'Rx Specialty', format: 'currency' },
  ],
  dental: [
    { key: 'annual_max', label: 'Annual Max', format: 'currency' },
    { key: 'deductible_individual', label: 'Deductible (Ind)', format: 'currency' },
    { key: 'deductible_family', label: 'Deductible (Fam)', format: 'currency' },
    { key: 'preventive_coverage_pct', label: 'Preventive %', format: 'percent' },
    { key: 'basic_coverage_pct', label: 'Basic %', format: 'percent' },
    { key: 'major_coverage_pct', label: 'Major %', format: 'percent' },
    { key: 'ortho_coverage_pct', label: 'Ortho %', format: 'percent' },
    { key: 'ortho_lifetime_max', label: 'Ortho Lifetime Max', format: 'currency' },
    { key: 'ortho_covered', label: 'Ortho Covered', format: 'text' },
  ],
  vision: [
    { key: 'exam_copay', label: 'Exam Copay', format: 'currency' },
    { key: 'exam_frequency', label: 'Exam Frequency', format: 'text' },
    { key: 'frames_allowance', label: 'Frames Allowance', format: 'currency' },
    { key: 'frames_frequency', label: 'Frames Frequency', format: 'text' },
    { key: 'lenses_copay', label: 'Lenses Copay', format: 'currency' },
    { key: 'lenses_frequency', label: 'Lenses Frequency', format: 'text' },
    { key: 'contacts_allowance', label: 'Contacts Allowance', format: 'currency' },
    { key: 'contacts_frequency', label: 'Contacts Frequency', format: 'text' },
  ],
  life: [
    { key: 'benefit_amount', label: 'Benefit Amount', format: 'currency' },
    { key: 'salary_multiple', label: 'Salary Multiple', format: 'text' },
    { key: 'max_benefit', label: 'Max Benefit', format: 'currency' },
    { key: 'age_reduction_schedule', label: 'Age Reduction', format: 'text' },
  ],
  std: [
    { key: 'benefit_pct', label: 'Benefit %', format: 'percent' },
    { key: 'max_weekly_benefit', label: 'Max Weekly', format: 'currency' },
    { key: 'elimination_period_days', label: 'Elimination (days)', format: 'text' },
    { key: 'max_benefit_duration', label: 'Max Duration', format: 'text' },
  ],
  ltd: [
    { key: 'benefit_pct', label: 'Benefit %', format: 'percent' },
    { key: 'max_monthly_benefit', label: 'Max Monthly', format: 'currency' },
    { key: 'elimination_period_days', label: 'Elimination (days)', format: 'text' },
    { key: 'max_benefit_duration', label: 'Max Duration', format: 'text' },
  ],
};

const BENEFIT_ORDER = ['medical', 'dental', 'vision', 'life', 'std', 'ltd'];

export default function RfpQuotesPage() {
  const router = useRouter();
  const params = useParams();
  const rfpId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [rfp, setRfp] = useState<Rfp | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState('');
  const [reviewLoading, setReviewLoading] = useState<{ quoteId: string; target: ReviewTarget } | null>(null);
  const [reviewError, setReviewError] = useState<string>('');

  const [narrative, setNarrative] = useState<Narrative | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [narrativeError, setNarrativeError] = useState<string>('');

  const [presentationMenuOpen, setPresentationMenuOpen] = useState(false);
  const [presentationCreating, setPresentationCreating] = useState(false);
  const [presentationError, setPresentationError] = useState<string>('');

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

      // CHANGED S42: rfps.client_id → rfps.group_id, clients(employer_name) → groups(name)
      const { data: rfpRow, error: rfpErr } = await supabase
        .from('rfps')
        .select('id, name, group_id, current_plan_design, effective_date, groups(name)')
        .eq('id', rfpId)
        .maybeSingle();

      if (rfpErr || !rfpRow) {
        setErrorMsg('RFP not found.');
        setLoading(false);
        return;
      }

      setRfp({
        id: rfpRow.id,
        name: rfpRow.name,
        // CHANGED S42: read from groups(name) instead of clients(employer_name).
        // We keep the field name "employer_name" on our local Rfp type so the
        // rest of this file doesn't need to be touched.
        employer_name: (rfpRow.groups as any)?.name || '—',
        current_plan_design: rfpRow.current_plan_design,
        effective_date: rfpRow.effective_date,
      });

      const { data: quoteRows, error: quotesErr } = await supabase
        .from('quotes')
        .select(`
          id,
          carrier_id,
          monthly_cost,
          total_annual_cost,
          cost_change_pct,
          status,
          notes,
          submitted_at,
          carriers ( name, brand_color ),
          quote_lines (
            id,
            benefit_type,
            plan_name,
            rate_structure,
            rates,
            monthly_premium,
            annual_cost,
            plan_design,
            display_order
          )
        `)
        .eq('rfp_id', rfpId)
        .order('submitted_at', { ascending: true, nullsFirst: false });

      if (quotesErr) {
        setErrorMsg('Error loading quotes: ' + quotesErr.message);
        setLoading(false);
        return;
      }

      const flat: Quote[] = (quoteRows || []).map((q: any) => ({
        id: q.id,
        carrier_id: q.carrier_id,
        carrier_name: q.carriers?.name || 'Unknown carrier',
        carrier_brand_color: q.carriers?.brand_color || null,
        monthly_cost: q.monthly_cost,
        total_annual_cost: q.total_annual_cost,
        cost_change_pct: q.cost_change_pct,
        status: q.status,
        notes: q.notes,
        submitted_at: q.submitted_at,
        lines: (q.quote_lines || []).sort(
          (a: QuoteLine, b: QuoteLine) => a.display_order - b.display_order
        ),
      }));

      setQuotes(flat);

      const { data: narrativeRow } = await supabase
        .from('rfp_ai_narratives')
        .select('id, bullets, quotes_count, quote_ids, model, generated_by_name, created_at')
        .eq('rfp_id', rfpId)
        .maybeSingle();

      if (narrativeRow) {
        setNarrative({
          id: narrativeRow.id,
          bullets: narrativeRow.bullets || [],
          quotes_count: narrativeRow.quotes_count,
          quote_ids: narrativeRow.quote_ids || [],
          model: narrativeRow.model,
          generated_by_name: narrativeRow.generated_by_name,
          created_at: narrativeRow.created_at,
        });
      }

      setLoading(false);
    }
    load();
  }, [router, rfpId]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  const benefitRows = useMemo(() => {
    const types = new Set<string>();
    quotes.forEach((q) => q.lines.forEach((ln) => types.add(ln.benefit_type)));
    return BENEFIT_ORDER.filter((t) => types.has(t));
  }, [quotes]);

  function getLineForCarrier(quote: Quote, benefitType: string): QuoteLine | null {
    return quote.lines.find((ln) => ln.benefit_type === benefitType) || null;
  }

  function toggleRow(benefitType: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(benefitType)) next.delete(benefitType);
      else next.add(benefitType);
      return next;
    });
  }

  function lowestPremiumCarrierId(benefitType: string): string | null {
    type Best = { id: string; val: number };
    let lowest: Best | null = null;
    quotes.forEach((q) => {
      const ln = getLineForCarrier(q, benefitType);
      if (ln?.monthly_premium != null) {
        if (lowest === null || ln.monthly_premium < lowest.val) {
          lowest = { id: q.carrier_id, val: ln.monthly_premium };
        }
      }
    });
    return lowest ? (lowest as Best).id : null;
  }

  function lowestTotalCarrierId(): string | null {
    type Best = { id: string; val: number };
    let lowest: Best | null = null;
    quotes.forEach((q) => {
      if (q.total_annual_cost != null) {
        if (lowest === null || q.total_annual_cost < lowest.val) {
          lowest = { id: q.carrier_id, val: q.total_annual_cost };
        }
      }
    });
    return lowest ? (lowest as Best).id : null;
  }

  async function handleReviewAction(quoteId: string, target: ReviewTarget) {
    setReviewError('');
    setReviewLoading({ quoteId, target });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push('/login');
        return;
      }
      const res = await fetch(`/api/broker/quotes/${quoteId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({ status: target }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        setReviewError(result.error || 'Could not update quote status.');
        if (result.debug) console.error('Review API debug:', result.debug);
        setReviewLoading(null);
        return;
      }
      setQuotes((prev) => prev.map((q) => (q.id === quoteId ? { ...q, status: target } : q)));
      setReviewLoading(null);
    } catch (err: any) {
      setReviewError('Network error: ' + (err?.message || String(err)));
      setReviewLoading(null);
    }
  }

  async function handleGenerateNarrative() {
    setNarrativeError('');
    setNarrativeLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push('/login');
        return;
      }
      const res = await fetch(`/api/broker/rfps/${rfpId}/generate-narrative`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        setNarrativeError(result.error || 'Could not generate narrative.');
        if (result.debug) console.error('Narrative API debug:', result.debug);
        setNarrativeLoading(false);
        return;
      }
      const n = result.narrative;
      setNarrative({
        id: n.id,
        bullets: n.bullets || [],
        quotes_count: n.quotes_count,
        quote_ids: n.quote_ids || [],
        model: n.model,
        generated_by_name: n.generated_by_name,
        created_at: n.created_at,
      });
      setNarrativeLoading(false);
    } catch (err: any) {
      setNarrativeError('Network error: ' + (err?.message || String(err)));
      setNarrativeLoading(false);
    }
  }

  async function handleCreatePresentation(template: TemplateChoice) {
    setPresentationMenuOpen(false);
    setPresentationError('');
    setPresentationCreating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push('/login');
        return;
      }
      const res = await fetch('/api/broker/presentations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          rfp_id: rfpId,
          template,
          title: rfp?.name || 'Presentation',
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        setPresentationError(result.error || 'Could not create presentation.');
        if (result.debug) console.error('Presentation API debug:', result.debug);
        setPresentationCreating(false);
        return;
      }
      router.push(`/broker/presentations/${result.presentation.id}`);
    } catch (err: any) {
      setPresentationError('Network error: ' + (err?.message || String(err)));
      setPresentationCreating(false);
    }
  }

  const narrativeIsStale = useMemo(() => {
    if (!narrative) return false;
    const cachedIds = new Set(narrative.quote_ids);
    const currentIds = new Set(quotes.map((q) => q.id));
    if (cachedIds.size !== currentIds.size) return true;
    let stale = false;
    cachedIds.forEach((id) => { if (!currentIds.has(id)) stale = true; });
    if (stale) return true;
    return false;
  }, [narrative, quotes]);

  if (loading) return <div style={{ padding: 40, color: '#1e3a5f' }}>Loading...</div>;

  const bestTotal = lowestTotalCarrierId();

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
        <div style={{ padding: '2rem 2.5rem', maxWidth: '1600px' }}>
          <div style={{ fontSize: '0.85rem', color: '#7a8a9b', marginBottom: '0.5rem' }}>
            <span
              onClick={() => router.push('/broker/quotes')}
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
            >
              Quotes
            </span>
            {' › '}
            <span>{rfp?.name || '—'}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '2rem', color: '#1e3a5f', margin: 0, marginBottom: '0.4rem' }}>
                Quote Comparison
              </h1>
              <p style={{ color: '#3a4d68', fontSize: '1rem', marginBottom: '2rem' }}>
                {rfp?.employer_name} · {rfp?.name}
                {rfp?.effective_date && (
                  <> · Effective {new Date(rfp.effective_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                )}
              </p>
            </div>

            {quotes.length > 0 && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setPresentationMenuOpen((v) => !v)}
                  disabled={presentationCreating}
                  style={{
                    background: '#1e3a5f',
                    color: '#faf7f2',
                    border: 'none',
                    padding: '0.6rem 1.1rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: presentationCreating ? 'wait' : 'pointer',
                    opacity: presentationCreating ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  {presentationCreating ? 'Creating…' : '📑 Create Presentation'}
                  {!presentationCreating && (
                    <span style={{ fontSize: '0.7rem', marginLeft: '0.2rem' }}>▾</span>
                  )}
                </button>

                {presentationMenuOpen && !presentationCreating && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    right: 0,
                    background: 'white',
                    border: '1px solid #e8e0d0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(30, 58, 95, 0.1)',
                    minWidth: '220px',
                    zIndex: 10,
                    overflow: 'hidden',
                  }}>
                    {[
                      { value: 'standard',  label: 'Standard',         desc: 'Balanced summary + detail' },
                      { value: 'executive', label: 'Executive Summary', desc: 'Top-level cost view' },
                      { value: 'detailed',  label: 'Detailed',          desc: 'Full plan design tables' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => handleCreatePresentation(opt.value as TemplateChoice)}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '0.7rem 1rem',
                          background: 'transparent',
                          border: 'none',
                          borderBottom: '1px solid #f0eee8',
                          cursor: 'pointer',
                          color: '#1e3a5f',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#faf7f2')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{opt.label}</div>
                        <div style={{ fontSize: '0.75rem', color: '#7a8a9b', marginTop: '0.1rem' }}>{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {presentationError && (
            <div style={{
              background: '#fdecec',
              border: '1px solid #f5c6cb',
              color: '#9b2c2c',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              fontSize: '0.9rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>{presentationError}</span>
              <button
                onClick={() => setPresentationError('')}
                style={{ background: 'transparent', border: 'none', color: '#9b2c2c', cursor: 'pointer', fontWeight: 600, fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>
          )}

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

          {reviewError && (
            <div style={{
              background: '#fdecec',
              border: '1px solid #f5c6cb',
              color: '#9b2c2c',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              fontSize: '0.9rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>{reviewError}</span>
              <button
                onClick={() => setReviewError('')}
                style={{ background: 'transparent', border: 'none', color: '#9b2c2c', cursor: 'pointer', fontWeight: 600, fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>
          )}

          {quotes.length > 0 && (
            <NarrativePanel
              narrative={narrative}
              isStale={narrativeIsStale}
              loading={narrativeLoading}
              error={narrativeError}
              onGenerate={handleGenerateNarrative}
              onDismissError={() => setNarrativeError('')}
            />
          )}

          {quotes.length === 0 ? (
            <EmptyState />
          ) : (
            <div style={{
              background: '#faf7f2',
              border: '1px solid #e8e0d0',
              borderRadius: '12px',
              overflow: 'hidden',
              overflowX: 'auto',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', minWidth: '720px' }}>
                <thead>
                  <tr style={{ background: '#f0ebe0', borderBottom: '2px solid #d4cab8' }}>
                    <th style={{ ...thStyle, width: '200px', minWidth: '200px' }}>
                      <span style={{ fontSize: '0.7rem', color: '#7a8a9b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Benefit
                      </span>
                    </th>
                    {quotes.map((q) => (
                      <th key={q.id} style={{ ...thStyle, minWidth: '240px', textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' }}>
                          <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: q.carrier_brand_color || '#1e3a5f',
                            color: '#fff',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {q.carrier_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ color: '#1e3a5f', fontSize: '1rem', fontWeight: 600 }}>{q.carrier_name}</div>
                            <StatusPill status={q.status} />
                          </div>
                        </div>
                        <ReviewActions
                          quote={q}
                          loading={reviewLoading}
                          onAction={handleReviewAction}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  <tr style={{ background: '#fef9ed', borderBottom: '2px solid #d4cab8' }}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#1e3a5f', fontSize: '0.95rem' }}>
                      <div>Total Annual Cost</div>
                      <div style={{ fontSize: '0.75rem', color: '#7a8a9b', fontWeight: 400, marginTop: '0.2rem' }}>
                        Monthly · Δ vs current
                      </div>
                    </td>
                    {quotes.map((q) => {
                      const isBest = bestTotal === q.carrier_id;
                      return (
                        <td key={q.id} style={{
                          ...tdStyle,
                          background: isBest ? '#e6f4ea' : 'transparent',
                          verticalAlign: 'top',
                        }}>
                          <div style={{
                            fontSize: '1.4rem',
                            fontWeight: 600,
                            color: '#1e3a5f',
                            fontVariantNumeric: 'tabular-nums',
                            fontFamily: 'Playfair Display, serif',
                          }}>
                            {formatCurrency(q.total_annual_cost)}
                            {isBest && (
                              <span style={{
                                marginLeft: '0.5rem',
                                fontSize: '0.7rem',
                                background: '#1e5631',
                                color: '#fff',
                                padding: '0.15rem 0.4rem',
                                borderRadius: '4px',
                                fontFamily: 'Figtree, sans-serif',
                                fontWeight: 600,
                                verticalAlign: 'middle',
                              }}>
                                LOWEST
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#7a8a9b', marginTop: '0.3rem', fontVariantNumeric: 'tabular-nums' }}>
                            {formatCurrency(q.monthly_cost)}/mo · {formatChangePct(q.cost_change_pct)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>

                  {benefitRows.map((bt) => {
                    const isExpanded = expandedRows.has(bt);
                    const bestPremiumCarrier = lowestPremiumCarrierId(bt);
                    return (
                      <>
                        <tr
                          key={bt}
                          onClick={() => toggleRow(bt)}
                          style={{
                            cursor: 'pointer',
                            borderBottom: isExpanded ? '1px solid #e8e0d0' : '1px solid #e8e0d0',
                            transition: 'background 0.1s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#f5efe0')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ ...tdStyle, fontWeight: 500, color: '#1e3a5f' }}>
                            <span style={{ marginRight: '0.5rem', fontSize: '0.7rem', color: '#7a8a9b' }}>
                              {isExpanded ? '▼' : '▶'}
                            </span>
                            {BENEFIT_LABELS[bt] || bt}
                          </td>
                          {quotes.map((q) => {
                            const line = getLineForCarrier(q, bt);
                            const notQuoted = !line || (line.monthly_premium == null && line.annual_cost == null && !line.plan_name);
                            const isBest = !notQuoted && bestPremiumCarrier === q.carrier_id;
                            return (
                              <td key={q.id} style={{
                                ...tdStyle,
                                background: isBest ? '#f0f8f1' : 'transparent',
                                verticalAlign: 'top',
                              }}>
                                {notQuoted ? (
                                  <span style={{ color: '#a8b0bc', fontStyle: 'italic', fontSize: '0.85rem' }}>
                                    Not quoted
                                  </span>
                                ) : (
                                  <>
                                    <div style={{ fontSize: '0.85rem', color: '#7a8a9b', marginBottom: '0.2rem' }}>
                                      {line!.plan_name || '—'}
                                    </div>
                                    <div style={{
                                      fontWeight: 600,
                                      color: '#1e3a5f',
                                      fontVariantNumeric: 'tabular-nums',
                                      fontSize: '1rem',
                                    }}>
                                      {formatCurrency(line!.monthly_premium)}/mo
                                      {isBest && (
                                        <span style={{
                                          marginLeft: '0.4rem',
                                          fontSize: '0.65rem',
                                          background: '#1e5631',
                                          color: '#fff',
                                          padding: '0.1rem 0.35rem',
                                          borderRadius: '3px',
                                          fontWeight: 600,
                                          verticalAlign: 'middle',
                                        }}>
                                          LOW
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#7a8a9b', marginTop: '0.15rem', fontVariantNumeric: 'tabular-nums' }}>
                                      {formatCurrency(line!.annual_cost)}/yr
                                    </div>
                                  </>
                                )}
                              </td>
                            );
                          })}
                        </tr>

                        {isExpanded && (
                          <tr style={{ background: '#fafaf6', borderBottom: '1px solid #e8e0d0' }}>
                            <td style={{ ...tdStyle, paddingLeft: '2.5rem', verticalAlign: 'top' }}>
                              <div style={{ fontSize: '0.75rem', color: '#7a8a9b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                Plan Design
                              </div>
                              <div style={{ fontSize: '0.8rem', color: '#7a8a9b', lineHeight: 1.5 }}>
                                {(PLAN_DESIGN_FIELDS[bt] || []).map((f) => (
                                  <div key={f.key} style={{ marginBottom: '0.3rem' }}>{f.label}</div>
                                ))}
                                <div style={{ marginTop: '0.5rem', fontStyle: 'italic' }}>Rates (tier)</div>
                              </div>
                            </td>
                            {quotes.map((q) => {
                              const line = getLineForCarrier(q, bt);
                              if (!line || (line.monthly_premium == null && !line.plan_name && !line.plan_design)) {
                                return (
                                  <td key={q.id} style={{ ...tdStyle, verticalAlign: 'top' }}>
                                    <span style={{ color: '#a8b0bc', fontSize: '0.85rem', fontStyle: 'italic' }}>—</span>
                                  </td>
                                );
                              }
                              return (
                                <td key={q.id} style={{ ...tdStyle, verticalAlign: 'top', fontSize: '0.85rem', color: '#3a4d68' }}>
                                  {(PLAN_DESIGN_FIELDS[bt] || []).map((f) => {
                                    const raw = line.plan_design?.[f.key];
                                    return (
                                      <div key={f.key} style={{ marginBottom: '0.3rem', fontVariantNumeric: 'tabular-nums' }}>
                                        {formatPlanDesignValue(raw, f.format)}
                                      </div>
                                    );
                                  })}
                                  <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed #d4cab8', fontVariantNumeric: 'tabular-nums', fontSize: '0.8rem' }}>
                                    {formatRates(line.rates, line.rate_structure)}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        )}
                      </>
                    );
                  })}

                  {quotes.some((q) => q.notes) && (
                    <tr style={{ background: '#fef9ed' }}>
                      <td style={{ ...tdStyle, fontWeight: 500, color: '#1e3a5f' }}>Carrier Notes</td>
                      {quotes.map((q) => (
                        <td key={q.id} style={{ ...tdStyle, fontSize: '0.85rem', color: '#3a4d68', verticalAlign: 'top' }}>
                          {q.notes || <span style={{ color: '#a8b0bc', fontStyle: 'italic' }}>—</span>}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function NarrativePanel({
  narrative,
  isStale,
  loading,
  error,
  onGenerate,
  onDismissError,
}: {
  narrative: Narrative | null;
  isStale: boolean;
  loading: boolean;
  error: string;
  onGenerate: () => void;
  onDismissError: () => void;
}) {
  const hasNarrative = !!narrative;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #faf7f2 0%, #f5efe0 100%)',
      border: '1px solid #e8e0d0',
      borderRadius: '12px',
      padding: '1.25rem 1.5rem',
      marginBottom: '1.5rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: hasNarrative ? '1rem' : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: '#1e3a5f',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.85rem',
            fontWeight: 600,
            fontFamily: 'Playfair Display, serif',
          }}>
            ✦
          </div>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e3a5f' }}>
              AI Summary
            </div>
            {hasNarrative && (
              <div style={{ fontSize: '0.72rem', color: '#7a8a9b', marginTop: '0.1rem' }}>
                Generated {formatRelativeTime(narrative.created_at)}
                {narrative.generated_by_name ? ` by ${narrative.generated_by_name}` : ''}
                {isStale && ' · New quotes since'}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onGenerate}
          disabled={loading}
          style={{
            background: isStale || !hasNarrative ? '#7a9b76' : 'transparent',
            color: isStale || !hasNarrative ? '#fff' : '#7a9b76',
            border: isStale || !hasNarrative ? 'none' : '1px solid #7a9b76',
            padding: '0.45rem 0.9rem',
            borderRadius: '6px',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Generating…' : !hasNarrative ? 'Generate AI summary' : isStale ? 'Regenerate' : 'Regenerate'}
        </button>
      </div>

      {error && (
        <div style={{
          background: '#fdecec',
          border: '1px solid #f5c6cb',
          color: '#9b2c2c',
          padding: '0.6rem 0.85rem',
          borderRadius: '6px',
          fontSize: '0.85rem',
          marginBottom: hasNarrative ? '0.75rem' : 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>{error}</span>
          <button
            onClick={onDismissError}
            style={{ background: 'transparent', border: 'none', color: '#9b2c2c', cursor: 'pointer', fontWeight: 600 }}
          >
            ✕
          </button>
        </div>
      )}

      {hasNarrative && (
        <ul style={{
          margin: 0,
          paddingLeft: '1.25rem',
          color: '#3a4d68',
          fontSize: '0.9rem',
          lineHeight: 1.6,
        }}>
          {narrative.bullets.map((b, i) => (
            <li key={i} style={{ marginBottom: '0.35rem' }}>{b}</li>
          ))}
        </ul>
      )}

      {!hasNarrative && !error && (
        <div style={{ fontSize: '0.85rem', color: '#7a8a9b', marginTop: '0.4rem' }}>
          Click "Generate AI summary" to get a quick read on how the submitted quote{narrative ? '' : 's'} compare to the current plan.
        </div>
      )}
    </div>
  );
}

function ReviewActions({
  quote,
  loading,
  onAction,
}: {
  quote: Quote;
  loading: { quoteId: string; target: ReviewTarget } | null;
  onAction: (quoteId: string, target: ReviewTarget) => void;
}) {
  const isLoadingFor = (target: ReviewTarget) =>
    loading && loading.quoteId === quote.id && loading.target === target;
  const anyLoadingForThisQuote = loading && loading.quoteId === quote.id;

  const buttons: { target: ReviewTarget; label: string; activeBg: string; activeFg: string }[] = [
    { target: 'reviewed',    label: 'Reviewed',   activeBg: '#fff4e0', activeFg: '#8a5a00' },
    { target: 'shortlisted', label: 'Shortlist',  activeBg: '#e6f4ea', activeFg: '#1e5631' },
    { target: 'rejected',    label: 'Reject',     activeBg: '#fdecec', activeFg: '#9b2c2c' },
  ];

  return (
    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
      {buttons.map((b) => {
        const isActive = quote.status === b.target;
        const loading_ = isLoadingFor(b.target);
        return (
          <button
            key={b.target}
            onClick={(e) => {
              e.stopPropagation();
              if (!anyLoadingForThisQuote) onAction(quote.id, b.target);
            }}
            disabled={!!anyLoadingForThisQuote}
            style={{
              fontSize: '0.7rem',
              fontWeight: 600,
              padding: '0.3rem 0.55rem',
              borderRadius: '5px',
              border: isActive ? `1px solid ${b.activeFg}` : '1px solid #d4cab8',
              background: isActive ? b.activeBg : '#faf7f2',
              color: isActive ? b.activeFg : '#3a4d68',
              cursor: anyLoadingForThisQuote ? 'wait' : 'pointer',
              opacity: anyLoadingForThisQuote && !loading_ ? 0.5 : 1,
              transition: 'all 0.1s',
            }}
          >
            {loading_ ? '…' : b.label}
          </button>
        );
      })}
      {quote.status !== 'submitted' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!anyLoadingForThisQuote) onAction(quote.id, 'submitted');
          }}
          disabled={!!anyLoadingForThisQuote}
          style={{
            fontSize: '0.7rem',
            fontWeight: 500,
            padding: '0.3rem 0.55rem',
            borderRadius: '5px',
            border: '1px solid transparent',
            background: 'transparent',
            color: '#7a8a9b',
            cursor: anyLoadingForThisQuote ? 'wait' : 'pointer',
            textDecoration: 'underline',
          }}
        >
          {isLoadingFor('submitted') ? '…' : 'Reset'}
        </button>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || { bg: '#e2e3e5', fg: '#383d41', label: status };
  return (
    <span style={{
      display: 'inline-block',
      background: s.bg,
      color: s.fg,
      fontSize: '0.7rem',
      fontWeight: 600,
      padding: '0.15rem 0.5rem',
      borderRadius: '10px',
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
      <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</div>
      <div style={{ fontSize: '1.1rem', color: '#1e3a5f', fontWeight: 500, marginBottom: '0.4rem' }}>
        No quotes yet for this RFP
      </div>
      <div style={{ color: '#7a8a9b', fontSize: '0.9rem' }}>
        Once carriers submit proposals through the carrier portal, they'll appear here for comparison.
      </div>
    </div>
  );
}

function formatCurrency(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function formatChangePct(n: number | null | undefined): string {
  if (n == null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}% vs current`;
}

function formatPlanDesignValue(raw: any, format?: 'currency' | 'percent' | 'text'): string {
  if (raw == null || raw === '') return '—';
  if (format === 'currency' && typeof raw === 'number') {
    return raw.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }
  if (format === 'percent' && typeof raw === 'number') {
    return `${raw}%`;
  }
  return String(raw);
}

function formatRates(rates: Record<string, number | null> | null, structure: string | null): string {
  if (!rates) return '—';
  const labels: Record<string, string> = {
    employee_only: 'EE',
    employee_spouse: 'EE+S',
    employee_children: 'EE+C',
    family: 'Fam',
  };
  const parts: string[] = [];
  Object.entries(rates).forEach(([k, v]) => {
    if (v != null && typeof v === 'number') {
      parts.push(`${labels[k] || k}: $${v.toFixed(0)}`);
    }
  });
  return parts.length > 0 ? parts.join(' · ') : '—';
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const thStyle: React.CSSProperties = {
  padding: '1rem',
  textAlign: 'left',
  verticalAlign: 'top',
};

const tdStyle: React.CSSProperties = {
  padding: '1rem',
  verticalAlign: 'middle',
};