'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../supabase';
import BrokerSidebar from '../../../components/BrokerSidebar';

// ----------------------------------------------------------------------------
// Types — match the shape returned by /api/broker/packages/[id]
// ----------------------------------------------------------------------------

type Package = {
  id: string;
  rfp_id: string;
  agency_id: string;
  name: string;
  description: string | null;
  notes: string | null;
  status: 'draft' | 'locked';
  is_recommended: boolean;
  is_current_plan: boolean;
  member_count_assumption: number | null;
  tier_breakdown: Record<string, number> | null;
  total_annual_cost: number | null;
  employer_annual_cost: number | null;
  employee_annual_cost: number | null;
  cost_change_vs_current_pct: number | null;
  costs_calculated_at: string | null;
  created_at: string;
  updated_at: string;
  rfp: {
    id: string;
    name: string;
    effective_date: string | null;
    current_annual_cost: number | null;
  } | null;
  client: { id: string; employer_name: string } | null;
};

type ContributionSplit = {
  split_mode: 'uniform' | 'per_tier';
  uniform?: { employer_pct: number; employee_pct: number };
  per_tier?: Record<string, { employer_pct: number; employee_pct: number }>;
};

type PackageLine = {
  id: string;
  package_id: string;
  quote_line_id: string;
  benefit_type: string;
  display_order: number;
  contribution_split: ContributionSplit | null;
  created_at: string;
  quote_line: {
    id: string;
    benefit_type: string;
    plan_name: string | null;
    monthly_premium: number | null;
    annual_cost: number | null;
    rate_structure: string | null;
    rates: Record<string, number | null> | null;
    plan_design: any;
    quote: {
      id: string;
      total_annual_cost: number | null;
      monthly_cost: number | null;
      cost_change_pct: number | null;
      carrier: {
        id: string;
        name: string;
        brand_color: string | null;
        logo_url: string | null;
      } | null;
    } | null;
  } | null;
};

type AvailableLine = {
  quote_line_id: string;
  benefit_type: string;
  plan_name: string | null;
  monthly_premium: number | null;
  annual_cost: number | null;
  rate_structure: string | null;
  rates: Record<string, number | null> | null;
  carrier_id: string;
  carrier_name: string;
  carrier_brand_color: string | null;
};

const BENEFIT_LABELS: Record<string, string> = {
  medical: 'Medical',
  dental: 'Dental',
  vision: 'Vision',
  life: 'Life',
  std: 'Short-Term Disability',
  ltd: 'Long-Term Disability',
};

// ----------------------------------------------------------------------------
// Formatters
// ----------------------------------------------------------------------------

const fmtMoney = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
};

const fmtMoneyDecimal = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
};

const fmtPct = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
};

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
};

const summarizeSplit = (split: ContributionSplit | null): string => {
  if (!split) return 'No contribution set';
  if (split.split_mode === 'uniform' && split.uniform) {
    return `Employer ${split.uniform.employer_pct}% / Employee ${split.uniform.employee_pct}%`;
  }
  if (split.split_mode === 'per_tier' && split.per_tier) {
    return 'Per-tier contribution';
  }
  return 'Custom';
};

// ============================================================================
// Component
// ============================================================================

export default function PackageDetailPage() {
  const router = useRouter();
  const params = useParams();
  const packageId = params?.id as string | undefined;

  const [bootLoading, setBootLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agencyName, setAgencyName] = useState('');

  const [pkg, setPkg] = useState<Package | null>(null);
  const [lines, setLines] = useState<PackageLine[]>([]);
  const [availableLines, setAvailableLines] = useState<AvailableLine[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add Line modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedQuoteLineId, setSelectedQuoteLineId] = useState('');
  const [employerPct, setEmployerPct] = useState('80');
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Recommend toggle state
  const [recommendBusy, setRecommendBusy] = useState(false);
  const [recommendError, setRecommendError] = useState<string | null>(null);
  const [recommendConfirm, setRecommendConfirm] = useState<{
    action: 'set' | 'unset';
    willUnflagName?: string;
  } | null>(null);

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (!packageId || bootLoading) return;
    loadPackage();
  }, [packageId, bootLoading]);

  async function bootstrap() {
    setBootLoading(true);
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

    setBootLoading(false);
  }

  async function loadPackage() {
    setDataLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push('/login');
        return;
      }
      const res = await fetch(`/api/broker/packages/${packageId}`, {
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to load package');
        setDataLoading(false);
        return;
      }
      setPkg(json.package);
      setLines(json.lines || []);
      setAvailableLines(json.available_quote_lines || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load package');
    }
    setDataLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function handleAddLine() {
    setAddError(null);

    if (!selectedQuoteLineId) {
      setAddError('Please select a carrier line to add.');
      return;
    }

    const pct = parseFloat(employerPct);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setAddError('Employer contribution must be a number between 0 and 100.');
      return;
    }

    setAddSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push('/login');
        return;
      }

      const res = await fetch(`/api/broker/packages/${packageId}/lines`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quote_line_id: selectedQuoteLineId,
          display_order: lines.length,
          contribution_split: {
            split_mode: 'uniform',
            uniform: { employer_pct: pct, employee_pct: 100 - pct },
          },
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setAddError(json.error || 'Failed to add line');
        setAddSubmitting(false);
        return;
      }

      setShowAddModal(false);
      setSelectedQuoteLineId('');
      setEmployerPct('80');
      setAddSubmitting(false);
      loadPackage();
    } catch (e: any) {
      setAddError(e?.message || 'Failed to add line');
      setAddSubmitting(false);
    }
  }

  // ---- Recommend toggle ----

  // Step 1: user clicks the button. We decide whether to confirm or fire immediately.
  async function handleRecommendClick() {
    setRecommendError(null);
    if (!pkg) return;

    if (pkg.is_recommended) {
      // Already recommended → confirm before unsetting
      setRecommendConfirm({ action: 'unset' });
      return;
    }

    // Not recommended → check if another package on this RFP already is
    try {
      const { data: existing } = await supabase
        .from('packages')
        .select('id, name')
        .eq('rfp_id', pkg.rfp_id)
        .eq('is_recommended', true)
        .neq('id', pkg.id)
        .maybeSingle();

      if (existing) {
        setRecommendConfirm({ action: 'set', willUnflagName: existing.name });
      } else {
        // No conflict, fire immediately
        await performRecommendToggle(true);
      }
    } catch (e: any) {
      setRecommendError(e?.message || 'Failed to check existing recommended package');
    }
  }

  async function performRecommendToggle(newValue: boolean) {
    setRecommendBusy(true);
    setRecommendError(null);
    setRecommendConfirm(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push('/login');
        return;
      }

      const res = await fetch(`/api/broker/packages/${packageId}/recommend`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recommended: newValue }),
      });

      const json = await res.json();
      if (!res.ok) {
        setRecommendError(json.error || 'Failed to update recommended flag');
        setRecommendBusy(false);
        return;
      }

      setRecommendBusy(false);
      loadPackage();
    } catch (e: any) {
      setRecommendError(e?.message || 'Failed to update recommended flag');
      setRecommendBusy(false);
    }
  }

  // ---------- Loading / error / not-found ----------

  if (bootLoading || dataLoading) {
    return (
      <div className="dash-layout">
        <BrokerSidebar
          active="packages"
          firstName={firstName}
          lastName={lastName}
          agencyName={agencyName}
          onLogout={handleLogout}
        />
        <main className="dash-main">
          <div style={{ padding: 40, color: '#1e3a5f' }}>Loading...</div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dash-layout">
        <BrokerSidebar
          active="packages"
          firstName={firstName}
          lastName={lastName}
          agencyName={agencyName}
          onLogout={handleLogout}
        />
        <main className="dash-main">
          <div style={{ padding: 40 }}>
            <a href="/broker/packages" style={backLinkStyle}>← All Packages</a>
            <div style={errorBoxStyle}>
              <strong>Couldn't load this package:</strong> {error}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!pkg) {
    return (
      <div className="dash-layout">
        <BrokerSidebar
          active="packages"
          firstName={firstName}
          lastName={lastName}
          agencyName={agencyName}
          onLogout={handleLogout}
        />
        <main className="dash-main">
          <div style={{ padding: 40 }}>
            <a href="/broker/packages" style={backLinkStyle}>← All Packages</a>
            <div style={{ marginTop: 24, padding: 24, background: 'white', border: '1px solid #eef1f4', borderRadius: 12, fontSize: 14, color: '#3a4d68' }}>
              Package not found.
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ---------- Main render ----------

  const tierBreakdown = pkg.tier_breakdown || {};
  const tierBreakdownSummary = ['employee_only', 'employee_spouse', 'employee_children', 'family']
    .map(t => tierBreakdown[t])
    .filter(n => typeof n === 'number')
    .reduce((sum: number, n: any) => sum + n, 0);

  return (
    <div className="dash-layout">
      <BrokerSidebar
        active="packages"
        firstName={firstName}
        lastName={lastName}
        agencyName={agencyName}
        onLogout={handleLogout}
      />
      <main className="dash-main">
        <div style={{ padding: '2rem 2.5rem', maxWidth: 1100 }}>
          <a href="/broker/packages" style={backLinkStyle}>← All Packages</a>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 36, color: '#1e3a5f', margin: '0 0 8px 0' }}>
                {pkg.name}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {pkg.is_current_plan && <span style={pillStyle('#dde4ee', '#1e3a5f')}>Current Plan</span>}
                {pkg.is_recommended && <span style={pillStyle('#dcead4', '#2d5016')}>Recommended</span>}
                <span style={pillStyle('#f0eee8', '#3a4d68')}>{pkg.status === 'locked' ? 'Locked' : 'Draft'}</span>
                <span style={{ fontSize: 13, color: '#3a4d68' }}>
                  For <strong style={{ color: '#1e3a5f' }}>{pkg.client?.employer_name || pkg.rfp?.name || '—'}</strong>
                </span>
              </div>
            </div>

            {/* Recommend toggle button — only shown for non-current-plan packages */}
            {!pkg.is_current_plan && (
              <button
                onClick={handleRecommendClick}
                disabled={recommendBusy}
                style={{
                  background: pkg.is_recommended ? '#dcead4' : 'white',
                  color: pkg.is_recommended ? '#2d5016' : '#1e3a5f',
                  border: pkg.is_recommended ? '1px solid #b8d4a8' : '1px solid #1e3a5f',
                  padding: '0.55rem 1.1rem',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: recommendBusy ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {recommendBusy
                  ? 'Updating...'
                  : pkg.is_recommended
                  ? '✓ Recommended (click to remove)'
                  : 'Set as Recommended'}
              </button>
            )}
          </div>

          {recommendError && (
            <div style={{ padding: 12, background: '#fdf3f3', color: '#7a2a2a', borderRadius: 6, marginTop: 12, border: '1px solid #f3d4d4', fontSize: 13 }}>
              {recommendError}
            </div>
          )}

          {pkg.description && (
            <p style={{ color: '#3a4d68', fontSize: 14, marginBottom: 20, marginTop: 12 }}>
              {pkg.description}
            </p>
          )}

          {/* Fact cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 20, marginBottom: 24 }}>
            <FactCard label="RFP" value={pkg.rfp?.name || '—'} />
            <FactCard label="Effective" value={fmtDate(pkg.rfp?.effective_date)} />
            <FactCard
              label="Member count"
              value={pkg.member_count_assumption !== null ? `${pkg.member_count_assumption}` : '—'}
              sub={tierBreakdownSummary > 0 ? `Tiers sum to ${tierBreakdownSummary}` : undefined}
            />
            <FactCard label="Lines" value={`${lines.length}`} />
          </div>

          {/* Cost Snapshot */}
          <SectionCard title="Cost Snapshot">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              <CostBlock
                label="Total Annual"
                value={fmtMoney(pkg.total_annual_cost)}
                primary
              />
              <CostBlock
                label="Employer Annual"
                value={fmtMoney(pkg.employer_annual_cost)}
              />
              <CostBlock
                label="Employee Annual"
                value={fmtMoney(pkg.employee_annual_cost)}
              />
              <CostBlock
                label="vs Current"
                value={fmtPct(pkg.cost_change_vs_current_pct)}
                valueColor={
                  pkg.cost_change_vs_current_pct === null ? '#3a4d68'
                  : pkg.cost_change_vs_current_pct > 0 ? '#b91c1c'
                  : '#2d5016'
                }
              />
            </div>
            {pkg.costs_calculated_at && (
              <div style={{ fontSize: 11, color: '#7a8a9b', marginTop: 12, fontStyle: 'italic' }}>
                Last calculated {new Date(pkg.costs_calculated_at).toLocaleString()}
              </div>
            )}
            {pkg.rfp?.current_annual_cost && (
              <div style={{ fontSize: 12, color: '#3a4d68', marginTop: 6 }}>
                Compared against current annual cost of <strong>{fmtMoney(pkg.rfp.current_annual_cost)}</strong>.
              </div>
            )}
          </SectionCard>

          {/* Lines */}
          <SectionCard
            title="Package Lines"
            action={
              <button
                onClick={() => {
                  setSelectedQuoteLineId('');
                  setEmployerPct('80');
                  setAddError(null);
                  setShowAddModal(true);
                }}
                disabled={availableLines.length === 0}
                title={availableLines.length === 0 ? 'No more carrier lines available for this RFP' : 'Add a carrier line to this package'}
                style={{
                  background: availableLines.length === 0 ? '#9aaabe' : '#1e3a5f',
                  color: '#faf7f2',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: availableLines.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                + Add Line
              </button>
            }
          >
            {lines.length === 0 ? (
              <div style={{
                background: '#faf7f2',
                border: '1px dashed #d4c8b0',
                borderRadius: 8,
                padding: '2rem 1.5rem',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 14, color: '#1e3a5f', fontWeight: 600, marginBottom: 4 }}>
                  No lines in this package yet
                </div>
                <div style={{ fontSize: 13, color: '#3a4d68' }}>
                  Add a carrier line to start building the package.{' '}
                  {availableLines.length === 0 && (
                    <span style={{ color: '#a94442' }}>No submitted quotes are available on this RFP yet.</span>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lines.map(line => {
                  const ql = line.quote_line;
                  const carrier = ql?.quote?.carrier;
                  const brandColor = carrier?.brand_color || '#1e3a5f';
                  const initials = (carrier?.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

                  return (
                    <div
                      key={line.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '12px 14px',
                        border: '1px solid #eef1f4',
                        borderRadius: 8,
                        background: 'white',
                      }}
                    >
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 8,
                          background: brandColor,
                          color: 'white',
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
                          <span style={pillStyle('#eef2f7', '#1e3a5f')}>
                            {BENEFIT_LABELS[line.benefit_type] || line.benefit_type}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#1e3a5f' }}>
                            {carrier?.name || 'Unknown carrier'}
                          </span>
                          {ql?.plan_name && (
                            <span style={{ fontSize: 13, color: '#3a4d68' }}>
                              · {ql.plan_name}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: '#7a8a9b', marginTop: 4 }}>
                          {summarizeSplit(line.contribution_split)}
                          {ql?.monthly_premium && (
                            <> · {fmtMoneyDecimal(ql.monthly_premium)}/mo composite</>
                          )}
                        </div>
                      </div>

                      {ql?.annual_cost !== null && ql?.annual_cost !== undefined && (
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#1e3a5f' }}>
                            {fmtMoney(ql.annual_cost)}
                          </div>
                          <div style={{ fontSize: 11, color: '#7a8a9b' }}>
                            quote annual
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* Notes */}
          {pkg.notes && (
            <SectionCard title="Notes">
              <div style={{ fontSize: 13, color: '#3a4d68', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {pkg.notes}
              </div>
            </SectionCard>
          )}

          {/* Footer meta */}
          <div style={{ fontSize: 12, color: '#7a8a9b', marginTop: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span>Created {new Date(pkg.created_at).toLocaleString()}</span>
            {pkg.updated_at !== pkg.created_at && (
              <span>· Updated {new Date(pkg.updated_at).toLocaleString()}</span>
            )}
            <span>· ID: {pkg.id}</span>
          </div>
        </div>
      </main>

      {/* Add Line Modal */}
      {showAddModal && (
        <div
          onClick={() => !addSubmitting && setShowAddModal(false)}
          style={modalOverlayStyle}
        >
          <div onClick={(e) => e.stopPropagation()} style={modalCardStyle}>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.5rem', color: '#1e3a5f', margin: 0, marginBottom: 8 }}>
              Add Carrier Line
            </h2>
            <p style={{ color: '#3a4d68', fontSize: 13, marginBottom: 20 }}>
              Pick a quoted line from this RFP to add to the package.
            </p>

            <label style={labelStyle}>Carrier Line</label>
            <select
              value={selectedQuoteLineId}
              onChange={(e) => setSelectedQuoteLineId(e.target.value)}
              disabled={addSubmitting}
              style={inputStyle}
            >
              <option value="">Select a line...</option>
              {availableLines.map(ql => (
                <option key={ql.quote_line_id} value={ql.quote_line_id}>
                  {BENEFIT_LABELS[ql.benefit_type] || ql.benefit_type} · {ql.carrier_name}
                  {ql.plan_name ? ` — ${ql.plan_name}` : ''}
                </option>
              ))}
            </select>

            <label style={labelStyle}>Employer Contribution %</label>
            <input
              type="number"
              value={employerPct}
              onChange={(e) => setEmployerPct(e.target.value)}
              placeholder="80"
              min="0"
              max="100"
              disabled={addSubmitting}
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: '#7a8a9b', marginTop: 4 }}>
              Employee will be charged the remaining {Math.max(0, Math.min(100, 100 - parseFloat(employerPct || '0'))).toFixed(0)}%.
            </div>

            {addError && (
              <div style={{ padding: 12, background: '#fdf3f3', color: '#7a2a2a', borderRadius: 6, marginTop: 16, marginBottom: 8, border: '1px solid #f3d4d4', fontSize: 13 }}>
                {addError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                onClick={() => setShowAddModal(false)}
                disabled={addSubmitting}
                style={btnSecondaryStyle}
              >
                Cancel
              </button>
              <button
                onClick={handleAddLine}
                disabled={addSubmitting || !selectedQuoteLineId}
                style={{
                  ...btnPrimaryStyle,
                  background: addSubmitting || !selectedQuoteLineId ? '#9aaabe' : '#1e3a5f',
                  cursor: addSubmitting || !selectedQuoteLineId ? 'not-allowed' : 'pointer',
                }}
              >
                {addSubmitting ? 'Adding...' : 'Add Line'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recommend Confirmation Modal */}
      {recommendConfirm && pkg && (
        <div
          onClick={() => !recommendBusy && setRecommendConfirm(null)}
          style={modalOverlayStyle}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ ...modalCardStyle, maxWidth: 460 }}>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.5rem', color: '#1e3a5f', margin: 0, marginBottom: 12 }}>
              {recommendConfirm.action === 'set'
                ? 'Replace recommended package?'
                : 'Remove recommended flag?'}
            </h2>
            <p style={{ color: '#3a4d68', fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
              {recommendConfirm.action === 'set' && recommendConfirm.willUnflagName ? (
                <>
                  <strong style={{ color: '#1e3a5f' }}>"{recommendConfirm.willUnflagName}"</strong> is currently the recommended package for this RFP. Setting <strong style={{ color: '#1e3a5f' }}>"{pkg.name}"</strong> as recommended will unflag the previous one. Continue?
                </>
              ) : (
                <>
                  This will remove the recommended flag from <strong style={{ color: '#1e3a5f' }}>"{pkg.name}"</strong>. The RFP will have no recommended package until you set one.
                </>
              )}
            </p>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setRecommendConfirm(null)}
                disabled={recommendBusy}
                style={btnSecondaryStyle}
              >
                Cancel
              </button>
              <button
                onClick={() => performRecommendToggle(recommendConfirm.action === 'set')}
                disabled={recommendBusy}
                style={{
                  ...btnPrimaryStyle,
                  background: recommendBusy ? '#9aaabe' : '#1e3a5f',
                  cursor: recommendBusy ? 'not-allowed' : 'pointer',
                }}
              >
                {recommendBusy
                  ? 'Updating...'
                  : recommendConfirm.action === 'set'
                  ? 'Yes, replace'
                  : 'Yes, remove flag'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Subcomponents and style helpers
// ----------------------------------------------------------------------------

function FactCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'white', border: '1px solid #eef1f4', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#3a4d68', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, color: '#1e3a5f', fontWeight: 600 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#7a8a9b', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function CostBlock({
  label,
  value,
  primary,
  valueColor,
}: {
  label: string;
  value: string;
  primary?: boolean;
  valueColor?: string;
}) {
  return (
    <div style={{
      background: primary ? '#1e3a5f' : '#faf7f2',
      border: primary ? 'none' : '1px solid #e8e0d0',
      borderRadius: 8,
      padding: '16px 18px',
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        color: primary ? '#c5d1de' : '#7a8a9b',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 22,
        fontWeight: 700,
        color: primary ? '#faf7f2' : (valueColor || '#1e3a5f'),
        fontFamily: 'Playfair Display, serif',
      }}>
        {value}
      </div>
    </div>
  );
}

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: 'white', border: '1px solid #eef1f4', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid #eef1f4',
        background: '#fdfcf9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 17, color: '#1e3a5f', margin: 0, fontWeight: 600 }}>
          {title}
        </h2>
        {action}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

function pillStyle(bg: string, color: string): React.CSSProperties {
  return {
    background: bg,
    color,
    padding: '3px 10px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  };
}

const backLinkStyle: React.CSSProperties = {
  color: '#3a4d68',
  fontSize: 14,
  textDecoration: 'none',
  display: 'inline-block',
  marginBottom: 16,
};

const errorBoxStyle: React.CSSProperties = {
  marginTop: 24,
  padding: 14,
  background: '#fde8e8',
  border: '1px solid #f5b7b7',
  borderRadius: 8,
  color: '#9b2c2c',
  fontSize: 14,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#3a4d68',
  fontWeight: 600,
  marginBottom: 6,
  marginTop: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  border: '1px solid #e8e0d0',
  borderRadius: 6,
  fontSize: 14,
  background: 'white',
  color: '#1e3a5f',
  boxSizing: 'border-box',
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(30, 58, 95, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
};

const modalCardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: 12,
  padding: '2rem',
  width: '90%',
  maxWidth: 520,
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
};

const btnPrimaryStyle: React.CSSProperties = {
  background: '#1e3a5f',
  color: '#faf7f2',
  border: 'none',
  padding: '0.6rem 1.25rem',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondaryStyle: React.CSSProperties = {
  background: 'white',
  color: '#3a4d68',
  border: '1px solid #e8e0d0',
  padding: '0.6rem 1.25rem',
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
};