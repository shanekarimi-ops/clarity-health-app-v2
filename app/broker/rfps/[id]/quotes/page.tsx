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

// Plan design field labels per benefit type (which fields to show when expanded)
const PLAN_DESIGN_FIELDS: Record<string, { key: string; label: string; format?: 'currency' | 'percent' | 'text' }[]> = {
  medical: [
    { key: 'deductible_individual', label: 'Deductible (Ind)', format: 'currency' },
    { key: 'deductible_family', label: 'Deductible (Fam)', format: 'currency' },
    { key: 'oop_max_individual', label: 'OOP Max (Ind)', format: 'currency' },
    { key: 'oop_max_family', label: 'OOP Max (Fam)', format: 'currency' },
    { key: 'pcp_copay', label: 'PCP Copay', format: 'currency' },
    { key: 'specialist_copay', label: 'Specialist Copay', format: 'currency' },
    { key: 'er_copay', label: 'ER Copay', format: 'currency' },
    { key: 'rx_tier_1', label: 'Rx Tier 1', format: 'currency' },
    { key: 'rx_tier_2', label: 'Rx Tier 2', format: 'currency' },
    { key: 'rx_tier_3', label: 'Rx Tier 3', format: 'currency' },
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

      // Fetch RFP
      const { data: rfpRow, error: rfpErr } = await supabase
        .from('rfps')
        .select('id, name, client_id, current_plan_design, effective_date, clients(employer_name)')
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
        employer_name: (rfpRow.clients as any)?.employer_name || '—',
        current_plan_design: rfpRow.current_plan_design,
        effective_date: rfpRow.effective_date,
      });

      // Fetch quotes for this RFP with lines
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
      setLoading(false);
    }
    load();
  }, [router, rfpId]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  // Determine which benefit types to show as rows (union of all benefits across all quotes)
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

  // Find lowest monthly_premium across carriers for a benefit type (for highlighting "best price")
  function lowestPremiumCarrierId(benefitType: string): string | null {
    let lowest: { id: string; val: number } | null = null;
    quotes.forEach((q) => {
      const ln = getLineForCarrier(q, benefitType);
      if (ln?.monthly_premium != null) {
        if (!lowest || ln.monthly_premium < lowest.val) {
          lowest = { id: q.carrier_id, val: ln.monthly_premium };
        }
      }
    });
    return lowest ? lowest.id : null;
  }

  function lowestTotalCarrierId(): string | null {
    let lowest: { id: string; val: number } | null = null;
    quotes.forEach((q) => {
      if (q.total_annual_cost != null) {
        if (!lowest || q.total_annual_cost < lowest.val) {
          lowest = { id: q.carrier_id, val: q.total_annual_cost };
        }
      }
    });
    return lowest ? lowest.id : null;
  }

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
          {/* Breadcrumb */}
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

          {/* Header */}
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '2rem', color: '#1e3a5f', margin: 0, marginBottom: '0.4rem' }}>
            Quote Comparison
          </h1>
          <p style={{ color: '#3a4d68', fontSize: '1rem', marginBottom: '2rem' }}>
            {rfp?.employer_name} · {rfp?.name}
            {rfp?.effective_date && (
              <> · Effective {new Date(rfp.effective_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
            )}
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
                {/* Carrier header row */}
                <thead>
                  <tr style={{ background: '#f0ebe0', borderBottom: '2px solid #d4cab8' }}>
                    <th style={{ ...thStyle, width: '200px', minWidth: '200px' }}>
                      <span style={{ fontSize: '0.7rem', color: '#7a8a9b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Benefit
                      </span>
                    </th>
                    {quotes.map((q) => (
                      <th key={q.id} style={{ ...thStyle, minWidth: '220px', textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
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
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {/* TOP TOTALS ROW */}
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

                  {/* BENEFIT ROWS */}
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

                        {/* EXPANDED PLAN DESIGN DETAIL */}
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

                  {/* NOTES ROW (only if any carrier has notes) */}
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

// ----- Small components -----

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

// ----- Formatting helpers -----

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

// ----- Inline styles -----

const thStyle: React.CSSProperties = {
  padding: '1rem',
  textAlign: 'left',
  verticalAlign: 'top',
};

const tdStyle: React.CSSProperties = {
  padding: '1rem',
  verticalAlign: 'middle',
};