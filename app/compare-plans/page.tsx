'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../supabase';
import Sidebar from '../components/Sidebar';

type RankedPlan = {
  id: string;
  name: string;
  issuer: string;
  type: string;
  metalLevel: string;
  premium: number;
  premiumWithCredit: number;
  deductible: number | null;
  maxOutOfPocket: number | null;
  hsaEligible: boolean;
  rank: number;
  matchScore: number;
  summary: string;
  pros?: string[];
  cons?: string[];
  expectedAnnualCost?: number | null;
  worstCaseAnnualCost?: number | null;
  costRank?: number | null;
};

type SimplePlan = {
  id: string;
  name: string;
  issuer: string;
  type: string;
  metalLevel: string;
  premium: number;
  premiumWithCredit: number;
  deductible: number | null;
  maxOutOfPocket: number | null;
  hsaEligible: boolean;
  annualPremium: number;
  expectedAnnualCost: number;
  worstCaseAnnualCost: number;
  costRank: number | null;
};

type Recommendation = {
  id: string;
  created_at: string;
  zip_code: string;
  county_name: string;
  state: string;
  household_size: number;
  plans: RankedPlan[];
  all_plans?: SimplePlan[] | null;
  coverage_scope?: string | null;
  utilization_level?: 'low' | 'moderate' | 'high' | null;
  expected_annual_medical_spend?: number | null;
};

type HouseholdStatus = 'missing' | 'incomplete' | 'complete';
type ComparisonMode = 'top3' | 'custom';
type SortKey = 'cost_rank' | 'lowest_premium' | 'lowest_deductible';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'cost_rank', label: 'Cost rank (best value)' },
  { value: 'lowest_premium', label: 'Lowest monthly premium' },
  { value: 'lowest_deductible', label: 'Lowest deductible' },
];

const ALL_METAL_LEVELS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Catastrophic'];
const ALL_PLAN_TYPES = ['HMO', 'PPO', 'EPO', 'POS', 'Indemnity'];
const MAX_PICKS = 3;
const MIN_PICKS = 2;

export default function ComparePlansPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [householdStatus, setHouseholdStatus] = useState<HouseholdStatus>('missing');

  // Comparison mode + custom-pick state
  const [mode, setMode] = useState<ComparisonMode>('top3');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Filter state for picker
  const [selectedCarriers, setSelectedCarriers] = useState<string[]>([]);
  const [selectedMetalLevels, setSelectedMetalLevels] = useState<string[]>([]);
  const [selectedPlanTypes, setSelectedPlanTypes] = useState<string[]>([]);
  const [hsaOnly, setHsaOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('cost_rank');

  // Custom comparison result
  const [customPlans, setCustomPlans] = useState<RankedPlan[] | null>(null);
  const [customAdvice, setCustomAdvice] = useState<string>('');
  const [rerankLoading, setRerankLoading] = useState(false);
  const [rerankError, setRerankError] = useState('');

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

      // Load household status
      const { data: hh } = await supabase
        .from('households')
        .select('id, zip_code, household_size, annual_income')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!hh) {
        setHouseholdStatus('missing');
      } else {
        const { data: memberRows } = await supabase
          .from('household_members')
          .select('age')
          .eq('household_id', hh.id);

        const memberCount = memberRows?.length ?? 0;
        const membersWithAge = (memberRows || []).filter((m: any) => m.age != null).length;
        const expectedSize = hh.household_size ?? 1;

        const isComplete =
          !!hh.zip_code &&
          !!hh.annual_income &&
          !!hh.household_size &&
          memberCount >= expectedSize &&
          membersWithAge >= expectedSize;

        setHouseholdStatus(isComplete ? 'complete' : 'incomplete');
      }

      const { data: recs } = await supabase
        .from('recommendations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (recs && recs.length > 0) {
        setRecommendation(recs[0] as Recommendation);
      }

      setLoading(false);
    }
    loadData();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  const allPlans: SimplePlan[] = useMemo(() => {
    return Array.isArray(recommendation?.all_plans) ? (recommendation!.all_plans as SimplePlan[]) : [];
  }, [recommendation]);

  const allCarriers = useMemo(() => {
    const set = new Set<string>();
    allPlans.forEach((p) => {
      if (p.issuer) set.add(p.issuer);
    });
    return Array.from(set).sort();
  }, [allPlans]);

  // Filtered plan list for the picker
  const filteredPlans = useMemo(() => {
    let list = [...allPlans];
    if (selectedCarriers.length > 0) list = list.filter((p) => selectedCarriers.includes(p.issuer));
    if (selectedMetalLevels.length > 0) list = list.filter((p) => selectedMetalLevels.includes(p.metalLevel));
    if (selectedPlanTypes.length > 0) list = list.filter((p) => selectedPlanTypes.includes(p.type));
    if (hsaOnly) list = list.filter((p) => p.hsaEligible);

    if (sortBy === 'cost_rank') {
      list.sort((a, b) => (a.costRank ?? 999) - (b.costRank ?? 999));
    } else if (sortBy === 'lowest_premium') {
      list.sort((a, b) => (a.premiumWithCredit ?? a.premium ?? 0) - (b.premiumWithCredit ?? b.premium ?? 0));
    } else if (sortBy === 'lowest_deductible') {
      list.sort((a, b) => (a.deductible ?? 999999) - (b.deductible ?? 999999));
    }
    return list;
  }, [allPlans, selectedCarriers, selectedMetalLevels, selectedPlanTypes, hsaOnly, sortBy]);

  const filtersActive =
    selectedCarriers.length > 0 ||
    selectedMetalLevels.length > 0 ||
    selectedPlanTypes.length > 0 ||
    hsaOnly;

  function handleClearFilters() {
    setSelectedCarriers([]);
    setSelectedMetalLevels([]);
    setSelectedPlanTypes([]);
    setHsaOnly(false);
  }

  function toggleArrayItem(arr: string[], item: string, setter: (v: string[]) => void) {
    if (arr.includes(item)) setter(arr.filter((x) => x !== item));
    else setter([...arr, item]);
  }

  function togglePlanSelection(planId: string) {
    if (selectedIds.includes(planId)) {
      setSelectedIds(selectedIds.filter((id) => id !== planId));
    } else if (selectedIds.length < MAX_PICKS) {
      setSelectedIds([...selectedIds, planId]);
    }
  }

  function handleOpenPicker() {
    setPickerOpen(true);
    setRerankError('');
    // Pre-fill with current top 3 ids if already in custom mode
    if (mode === 'custom' && customPlans) {
      setSelectedIds(customPlans.map((p) => p.id));
    } else {
      setSelectedIds([]);
    }
  }

  function handleCancelPicker() {
    setPickerOpen(false);
    setSelectedIds([]);
    setRerankError('');
  }

  function handleBackToTop3() {
    setMode('top3');
    setCustomPlans(null);
    setCustomAdvice('');
    setSelectedIds([]);
    setPickerOpen(false);
  }

  async function handleCompareThese() {
    if (!recommendation || !user) return;
    if (selectedIds.length < MIN_PICKS || selectedIds.length > MAX_PICKS) {
      setRerankError(`Pick ${MIN_PICKS} or ${MAX_PICKS} plans to compare.`);
      return;
    }
    setRerankLoading(true);
    setRerankError('');
    try {
      const res = await fetch('/api/rerank-filtered-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recommendationId: recommendation.id,
          planIds: selectedIds,
          userId: user.id,
        }),
      });
      if (!res.ok) {
        let msg = 'AI ranking failed.';
        try {
          const err = await res.json();
          if (err?.error) msg = err.error;
        } catch {
          // not JSON
        }
        setRerankError(msg);
        setRerankLoading(false);
        return;
      }
      const data = await res.json();
      if (!data?.success || !Array.isArray(data?.rankedPlans)) {
        setRerankError('Unexpected response from AI ranking.');
        setRerankLoading(false);
        return;
      }
      setCustomPlans(data.rankedPlans as RankedPlan[]);
      setCustomAdvice(data.overallAdvice || '');
      setMode('custom');
      setPickerOpen(false);
    } catch (e: any) {
      setRerankError(`Network error: ${e.message}`);
    } finally {
      setRerankLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p>Loading...</p>
      </div>
    );
  }

  const firstName = user?.user_metadata?.first_name || 'there';
  const lastName = user?.user_metadata?.last_name || '';
  const role = user?.user_metadata?.role || 'Individual';

  // Plans displayed in the comparison table
  const displayedPlans: RankedPlan[] =
    mode === 'custom' && customPlans
      ? customPlans
      : (recommendation?.plans?.slice(0, 3) || []);

  const hasProjections =
    !!displayedPlans[0]?.expectedAnnualCost && !!displayedPlans[0]?.worstCaseAnnualCost;
  const hasCostRank = !!displayedPlans[0]?.costRank;

  const rows: Array<{ label: string; render: (p: RankedPlan) => string; highlight?: boolean }> = [];

  if (hasProjections) {
    rows.push({
      label: 'Expected annual cost',
      render: (p) => (p.expectedAnnualCost != null ? `$${Math.round(p.expectedAnnualCost).toLocaleString()}` : '—'),
      highlight: true,
    });
    rows.push({
      label: 'Worst-case annual cost',
      render: (p) => (p.worstCaseAnnualCost != null ? `$${Math.round(p.worstCaseAnnualCost).toLocaleString()}` : '—'),
    });
  }

  rows.push({ label: 'Issuer', render: (p) => p.issuer || '—' });
  rows.push({ label: 'Plan Type', render: (p) => p.type || '—' });
  rows.push({ label: 'Metal Level', render: (p) => p.metalLevel || '—' });
  rows.push({ label: 'Monthly Premium', render: (p) => `$${Math.round(p.premiumWithCredit ?? p.premium).toLocaleString()}/mo` });
  rows.push({ label: 'Premium (no subsidy)', render: (p) => `$${Math.round(p.premium).toLocaleString()}/mo` });
  rows.push({ label: 'Deductible', render: (p) => (p.deductible != null ? `$${p.deductible.toLocaleString()}` : '—') });
  rows.push({ label: 'Max Out-of-Pocket', render: (p) => (p.maxOutOfPocket != null ? `$${p.maxOutOfPocket.toLocaleString()}` : '—') });
  rows.push({ label: 'HSA Eligible', render: (p) => (p.hsaEligible ? 'Yes' : 'No') });
  rows.push({ label: 'AI Match Score', render: (p) => `${p.matchScore} / 100` });

  if (hasCostRank) {
    rows.push({ label: 'Cost rank', render: (p) => (p.costRank ? `#${p.costRank}` : '—') });
  }

  // Empty state priority
  let emptyState: 'no_household' | 'incomplete_household' | 'no_recommendation' | null = null;
  if (householdStatus === 'missing') emptyState = 'no_household';
  else if (householdStatus === 'incomplete') emptyState = 'incomplete_household';
  else if ((recommendation?.plans?.length ?? 0) === 0) emptyState = 'no_recommendation';

  const hasAllPlans = allPlans.length > 0;

  return (
    <div className="dash-layout">
      <Sidebar
        active="compare-plans"
        firstName={firstName}
        lastName={lastName}
        role={role}
        onLogout={handleLogout}
      />

      <main className="dash-main">
        <div className="dash-header">
          <div>
            <div className="dash-greeting">Compare Plans</div>
            <div className="dash-date">Side-by-side comparison of your top-ranked plans.</div>
          </div>
        </div>

        {/* ===== EMPTY STATES ===== */}
        {emptyState === 'no_household' && (
          <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ padding: '60px 24px', textAlign: 'center', color: '#3a4d68' }}>
              <div style={{ fontSize: '56px', marginBottom: '16px' }}>👨‍👩‍👧</div>
              <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '26px', color: '#1e3a5f', margin: '0 0 12px 0' }}>
                Set up your household first
              </h2>
              <p style={{ fontSize: '15px', lineHeight: '1.7', maxWidth: '480px', margin: '0 auto 24px auto', color: '#3a4d68' }}>
                We need to know who you&apos;re covering and where you live before we can compare Marketplace plans for your household.
              </p>
              <Link href="/household" style={{ textDecoration: 'none' }}>
                <button className="btn-sm btn-accent">Set up Household →</button>
              </Link>
            </div>
          </div>
        )}

        {emptyState === 'incomplete_household' && (
          <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ padding: '60px 24px', textAlign: 'center', color: '#3a4d68' }}>
              <div style={{ fontSize: '56px', marginBottom: '16px' }}>👨‍👩‍👧</div>
              <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '26px', color: '#1e3a5f', margin: '0 0 12px 0' }}>
                Finish your household
              </h2>
              <p style={{ fontSize: '15px', lineHeight: '1.7', maxWidth: '480px', margin: '0 auto 24px auto', color: '#3a4d68' }}>
                You&apos;ve started your Household but a few details are missing. Complete it to unlock Marketplace plan comparisons.
              </p>
              <Link href="/household" style={{ textDecoration: 'none' }}>
                <button className="btn-sm btn-accent">Complete Household →</button>
              </Link>
            </div>
          </div>
        )}

        {emptyState === 'no_recommendation' && (
          <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ padding: '60px 24px', textAlign: 'center', color: '#3a4d68' }}>
              <div style={{ fontSize: '56px', marginBottom: '16px' }}>⚖️</div>
              <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '26px', color: '#1e3a5f', margin: '0 0 12px 0' }}>
                Nothing to compare yet
              </h2>
              <p style={{ fontSize: '15px', lineHeight: '1.7', maxWidth: '480px', margin: '0 auto 24px auto', color: '#3a4d68' }}>
                Your household is ready. Run a recommendation from Find Plans and your top 3 matches will appear here side-by-side.
              </p>
              <Link href="/find-plans" style={{ textDecoration: 'none' }}>
                <button className="btn-sm btn-accent">Find Plans →</button>
              </Link>
            </div>
          </div>
        )}

        {/* ===== RESULTS ===== */}
        {emptyState === null && displayedPlans.length > 0 && (
          <>
            {/* Household banner */}
            {recommendation?.coverage_scope && recommendation?.utilization_level && (
              <HouseholdContextBanner
                coverageScope={recommendation.coverage_scope}
                householdSize={recommendation.household_size}
                utilizationLevel={recommendation.utilization_level}
                expectedSpend={recommendation.expected_annual_medical_spend ?? 0}
              />
            )}

            {/* Mode banner */}
            <div style={{
              background: mode === 'custom' ? '#ebf3ea' : '#eef1f4',
              border: `1px solid ${mode === 'custom' ? '#c7d9c5' : '#5b7a99'}`,
              color: '#1e3a5f',
              padding: '14px 18px',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              fontSize: '14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}>
              <span>
                {mode === 'custom' ? (
                  <>
                    <strong>Comparing {displayedPlans.length} plans you picked</strong> for {recommendation?.county_name}, {recommendation?.state}.
                  </>
                ) : (
                  <>
                    Showing your <strong>top 3</strong> ranked plans for {recommendation?.county_name}, {recommendation?.state}.
                  </>
                )}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {mode === 'custom' && (
                  <button
                    onClick={handleBackToTop3}
                    className="btn-sm btn-ghost-sm"
                    style={{ fontSize: '13px' }}
                  >
                    ↻ Back to top 3
                  </button>
                )}
                <Link href="/my-plans" style={{ color: '#5b7a99', fontWeight: 600, textDecoration: 'none', fontSize: '13px' }}>
                  See all {recommendation?.plans?.length} →
                </Link>
              </div>
            </div>

            {/* AI guidance for custom comparison */}
            {mode === 'custom' && customAdvice && (
              <div
                className="dash-card"
                style={{
                  marginBottom: '1.5rem',
                  backgroundColor: '#faf7f2',
                  border: '1px solid #eef1f4',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#7a9b76', fontWeight: 600, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  AI guidance for your comparison
                </div>
                <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#3a4d68' }}>
                  {customAdvice}
                </div>
              </div>
            )}

            {/* Comparison table */}
            <div className="dash-card" style={{ marginBottom: '1.5rem', overflowX: 'auto' }}>
              <div className="dash-card-header">
                <div className="dash-card-title">Plan comparison</div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                <thead>
                  <tr>
                    <th style={{
                      textAlign: 'left',
                      padding: '14px 16px',
                      borderBottom: '2px solid #eef1f4',
                      color: '#3a4d68',
                      fontSize: '13px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      Feature
                    </th>
                    {displayedPlans.map((plan) => {
                      const isBestFit = plan.rank === 1;
                      return (
                        <th key={plan.id} style={{
                          textAlign: 'center',
                          padding: '14px 16px',
                          borderBottom: '2px solid #eef1f4',
                          background: isBestFit ? '#faf7f2' : 'transparent',
                          position: 'relative',
                          minWidth: '180px',
                        }}>
                          {isBestFit && (
                            <div style={{
                              position: 'absolute',
                              top: '-10px',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              background: '#7a9b76',
                              color: 'white',
                              padding: '2px 10px',
                              borderRadius: '12px',
                              fontSize: '10px',
                              fontWeight: 500,
                              whiteSpace: 'nowrap',
                            }}>
                              BEST FIT
                            </div>
                          )}
                          <div style={{
                            fontSize: '11px',
                            color: '#6b7785',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            marginBottom: '4px',
                          }}>
                            Rank #{plan.rank}
                          </div>
                          <div style={{
                            fontFamily: 'Playfair Display, serif',
                            fontSize: '17px',
                            color: '#1e3a5f',
                            fontWeight: 600,
                            lineHeight: 1.2,
                          }}>
                            {plan.name}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{
                      padding: '14px 16px',
                      borderBottom: '1px solid #eef1f4',
                      color: '#3a4d68',
                      fontSize: '14px',
                      fontWeight: 500,
                      verticalAlign: 'top',
                    }}>
                      Summary
                    </td>
                    {displayedPlans.map((plan) => {
                      const isBestFit = plan.rank === 1;
                      return (
                        <td key={plan.id} style={{
                          padding: '14px 16px',
                          borderBottom: '1px solid #eef1f4',
                          textAlign: 'center',
                          background: isBestFit ? '#faf7f2' : 'transparent',
                          color: '#3a4d68',
                          fontSize: '13px',
                          fontStyle: 'italic',
                          lineHeight: 1.5,
                        }}>
                          {plan.summary || '—'}
                        </td>
                      );
                    })}
                  </tr>

                  {rows.map((row) => (
                    <tr key={row.label}>
                      <td style={{
                        padding: '14px 16px',
                        borderBottom: '1px solid #eef1f4',
                        color: row.highlight ? '#1e3a5f' : '#3a4d68',
                        fontSize: '14px',
                        fontWeight: row.highlight ? 700 : 500,
                        backgroundColor: row.highlight ? '#ebf3ea' : 'transparent',
                      }}>
                        {row.label}
                      </td>
                      {displayedPlans.map((plan) => {
                        const isBestFit = plan.rank === 1;
                        return (
                          <td key={plan.id} style={{
                            padding: '14px 16px',
                            borderBottom: '1px solid #eef1f4',
                            textAlign: 'center',
                            background: row.highlight
                              ? (isBestFit ? '#dcebda' : '#ebf3ea')
                              : (isBestFit ? '#faf7f2' : 'transparent'),
                            color: '#1e3a5f',
                            fontSize: '14px',
                            fontWeight: row.highlight ? 700 : 400,
                          }}>
                            {row.render(plan)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  <tr>
                    <td style={{ padding: '14px 16px' }}></td>
                    {displayedPlans.map((plan) => {
                      const isBestFit = plan.rank === 1;
                      return (
                        <td key={plan.id} style={{
                          padding: '14px 16px',
                          textAlign: 'center',
                          background: isBestFit ? '#faf7f2' : 'transparent',
                        }}>
                          <button
                            disabled
                            style={{
                              padding: '8px 16px',
                              background: isBestFit ? '#7a9b76' : '#5b7a99',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '13px',
                              opacity: 0.5,
                              cursor: 'not-allowed',
                              fontFamily: 'inherit',
                            }}
                          >
                            Enroll (soon)
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Compare different plans CTA */}
            {!pickerOpen && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                <button
                  onClick={handleOpenPicker}
                  className="btn-sm btn-accent"
                  disabled={!hasAllPlans}
                  title={!hasAllPlans ? 'Re-run Find Plans to enable picking different plans' : undefined}
                  style={{ opacity: hasAllPlans ? 1 : 0.5, cursor: hasAllPlans ? 'pointer' : 'not-allowed' }}
                >
                  ✎ {mode === 'custom' ? 'Change my picks' : 'Compare different plans'}
                </button>
              </div>
            )}

            {/* Picker section */}
            {pickerOpen && (
              <PickerSection
                allPlans={allPlans}
                filteredPlans={filteredPlans}
                allCarriers={allCarriers}
                selectedIds={selectedIds}
                togglePlanSelection={togglePlanSelection}
                selectedCarriers={selectedCarriers}
                setSelectedCarriers={setSelectedCarriers}
                selectedMetalLevels={selectedMetalLevels}
                setSelectedMetalLevels={setSelectedMetalLevels}
                selectedPlanTypes={selectedPlanTypes}
                setSelectedPlanTypes={setSelectedPlanTypes}
                hsaOnly={hsaOnly}
                setHsaOnly={setHsaOnly}
                sortBy={sortBy}
                setSortBy={setSortBy}
                filtersActive={filtersActive}
                handleClearFilters={handleClearFilters}
                toggleArrayItem={toggleArrayItem}
                onCancel={handleCancelPicker}
                onCompare={handleCompareThese}
                rerankLoading={rerankLoading}
                rerankError={rerankError}
              />
            )}

            <div style={{
              textAlign: 'center',
              color: '#3a4d68',
              fontSize: '13px',
              opacity: 0.7,
              marginBottom: '1.5rem',
            }}>
              Showing real plans from the federal Marketplace, ranked by AI for your household.
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ============================================================
// PICKER SECTION
// ============================================================

function PickerSection(props: {
  allPlans: SimplePlan[];
  filteredPlans: SimplePlan[];
  allCarriers: string[];
  selectedIds: string[];
  togglePlanSelection: (id: string) => void;
  selectedCarriers: string[];
  setSelectedCarriers: (v: string[]) => void;
  selectedMetalLevels: string[];
  setSelectedMetalLevels: (v: string[]) => void;
  selectedPlanTypes: string[];
  setSelectedPlanTypes: (v: string[]) => void;
  hsaOnly: boolean;
  setHsaOnly: (v: boolean) => void;
  sortBy: SortKey;
  setSortBy: (v: SortKey) => void;
  filtersActive: boolean;
  handleClearFilters: () => void;
  toggleArrayItem: (arr: string[], item: string, setter: (v: string[]) => void) => void;
  onCancel: () => void;
  onCompare: () => void;
  rerankLoading: boolean;
  rerankError: string;
}) {
  const {
    allPlans,
    filteredPlans,
    allCarriers,
    selectedIds,
    togglePlanSelection,
    selectedCarriers,
    setSelectedCarriers,
    selectedMetalLevels,
    setSelectedMetalLevels,
    selectedPlanTypes,
    setSelectedPlanTypes,
    hsaOnly,
    setHsaOnly,
    sortBy,
    setSortBy,
    filtersActive,
    handleClearFilters,
    toggleArrayItem,
    onCancel,
    onCompare,
    rerankLoading,
    rerankError,
  } = props;

  const canCompare = selectedIds.length >= MIN_PICKS && selectedIds.length <= MAX_PICKS;
  const atMax = selectedIds.length >= MAX_PICKS;

  return (
    <div className="dash-card" style={{ marginBottom: '1.5rem', borderTop: '3px solid #7a9b76' }}>
      <div className="dash-card-header">
        <div className="dash-card-title">Build your own comparison</div>
      </div>
      <p style={{ fontSize: '0.875rem', color: '#6b7785', margin: '0 0 1.25rem 0', lineHeight: 1.5 }}>
        Pick {MIN_PICKS} or {MAX_PICKS} plans from the {allPlans.length} available in your area. We&apos;ll generate fresh AI rankings, summaries, and pros/cons tailored to comparing just these plans.
      </p>

      {/* Selection state bar */}
      <SelectionBar selectedCount={selectedIds.length} max={MAX_PICKS} canCompare={canCompare} />

      {/* Filters */}
      <div style={{ marginTop: '1.25rem', marginBottom: '1.25rem', padding: '1rem', backgroundColor: '#fafbfc', border: '1px solid #eef1f4', borderRadius: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '0.85rem', color: '#1e3a5f', fontWeight: 700 }}>
              Filters
            </div>
            {filtersActive && (
              <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '999px', backgroundColor: '#7a9b76', color: '#fff', fontWeight: 600 }}>
                Active
              </span>
            )}
            <span style={{ fontSize: '0.8rem', color: '#6b7785' }}>
              Showing <strong style={{ color: '#1e3a5f' }}>{filteredPlans.length}</strong> of {allPlans.length} plans
            </span>
          </div>
          {filtersActive && (
            <button onClick={handleClearFilters} className="btn-sm btn-ghost-sm" style={{ fontSize: '0.8rem' }}>
              Clear all
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <FilterGroup label="Carrier" count={selectedCarriers.length}>
            {allCarriers.map((c) => (
              <FilterChip
                key={c}
                label={c}
                active={selectedCarriers.includes(c)}
                onClick={() => toggleArrayItem(selectedCarriers, c, setSelectedCarriers)}
              />
            ))}
          </FilterGroup>
          <FilterGroup label="Metal level" count={selectedMetalLevels.length}>
            {ALL_METAL_LEVELS.map((m) => (
              <FilterChip
                key={m}
                label={m}
                active={selectedMetalLevels.includes(m)}
                onClick={() => toggleArrayItem(selectedMetalLevels, m, setSelectedMetalLevels)}
              />
            ))}
          </FilterGroup>
          <FilterGroup label="Plan type" count={selectedPlanTypes.length}>
            {ALL_PLAN_TYPES.map((t) => (
              <FilterChip
                key={t}
                label={t}
                active={selectedPlanTypes.includes(t)}
                onClick={() => toggleArrayItem(selectedPlanTypes, t, setSelectedPlanTypes)}
              />
            ))}
          </FilterGroup>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: '#1e3a5f' }}>
              <input
                type="checkbox"
                checked={hsaOnly}
                onChange={(e) => setHsaOnly(e.target.checked)}
              />
              HSA-eligible only
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', color: '#6b7785', fontWeight: 600 }}>Sort by:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                style={{
                  padding: '0.4rem 0.6rem',
                  border: '1px solid #e1e6eb',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontFamily: 'Figtree, system-ui, sans-serif',
                  color: '#1e3a5f',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                }}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Plan list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem', maxHeight: '500px', overflowY: 'auto', paddingRight: '0.25rem' }}>
        {filteredPlans.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7785', fontSize: '0.9rem' }}>
            No plans match your filters. <button onClick={handleClearFilters} style={{ background: 'none', border: 'none', color: '#7a9b76', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.9rem' }}>Clear filters</button>
          </div>
        ) : (
          filteredPlans.map((plan) => {
            const isSelected = selectedIds.includes(plan.id);
            const isDisabled = !isSelected && atMax;
            return (
              <SelectablePlanCard
                key={plan.id}
                plan={plan}
                isSelected={isSelected}
                isDisabled={isDisabled}
                onClick={() => togglePlanSelection(plan.id)}
              />
            );
          })
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={onCancel} className="btn-sm btn-ghost-sm" disabled={rerankLoading}>
          Cancel
        </button>
        <button
          onClick={onCompare}
          className="btn-sm btn-accent"
          disabled={!canCompare || rerankLoading}
          style={{ opacity: canCompare && !rerankLoading ? 1 : 0.5, cursor: canCompare && !rerankLoading ? 'pointer' : 'not-allowed' }}
        >
          {rerankLoading ? 'Generating comparison...' : `Compare these ${selectedIds.length > 0 ? selectedIds.length : ''} →`}
        </button>
      </div>
      {rerankError && (
        <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.85rem', background: '#fde8e8', border: '1px solid #f5b8b8', borderRadius: '6px', fontSize: '0.8rem', color: '#8a3030' }}>
          ⚠ {rerankError}
        </div>
      )}
    </div>
  );
}

function SelectionBar({ selectedCount, max, canCompare }: { selectedCount: number; max: number; canCompare: boolean }) {
  const fillPct = (selectedCount / max) * 100;
  return (
    <div style={{
      padding: '0.75rem 1rem',
      backgroundColor: canCompare ? '#ebf3ea' : '#fafbfc',
      border: `1px solid ${canCompare ? '#c7d9c5' : '#eef1f4'}`,
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '0.75rem',
    }}>
      <div style={{ flex: 1, minWidth: '200px' }}>
        <div style={{ fontSize: '0.8rem', color: '#1e3a5f', fontWeight: 600, marginBottom: '0.35rem' }}>
          Selected: <strong>{selectedCount}</strong> of {max} {max === 1 ? 'plan' : 'plans'}
        </div>
        <div style={{ height: '6px', background: '#fff', border: '1px solid #eef1f4', borderRadius: '999px', overflow: 'hidden' }}>
          <div style={{
            width: `${fillPct}%`,
            height: '100%',
            background: canCompare ? '#7a9b76' : '#5b7a99',
            transition: 'width 0.2s ease',
          }} />
        </div>
      </div>
      <div style={{ fontSize: '0.78rem', color: '#6b7785' }}>
        {selectedCount === 0 && 'Pick 2 or 3 plans to compare'}
        {selectedCount === 1 && 'Pick at least one more plan'}
        {selectedCount === 2 && 'Ready to compare 2 plans (or pick 1 more)'}
        {selectedCount === 3 && 'Maximum reached. Deselect to swap.'}
      </div>
    </div>
  );
}

function SelectablePlanCard({ plan, isSelected, isDisabled, onClick }: {
  plan: SimplePlan;
  isSelected: boolean;
  isDisabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      title={isDisabled ? 'Max 3 plans — deselect one to swap' : undefined}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '0.85rem 1rem',
        backgroundColor: isSelected ? '#ebf3ea' : '#fff',
        border: `2px solid ${isSelected ? '#7a9b76' : '#eef1f4'}`,
        borderRadius: '8px',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.5 : 1,
        fontFamily: 'Figtree, system-ui, sans-serif',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        {/* Checkbox */}
        <div style={{
          flexShrink: 0,
          width: '22px',
          height: '22px',
          borderRadius: '4px',
          border: `2px solid ${isSelected ? '#7a9b76' : '#d4dbe2'}`,
          backgroundColor: isSelected ? '#7a9b76' : '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: '0.85rem',
          fontWeight: 700,
          marginTop: '2px',
        }}>
          {isSelected && '✓'}
        </div>

        {/* Plan info */}
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
            <div style={{ color: '#1e3a5f', fontSize: '0.95rem', fontWeight: 700 }}>
              {plan.name}
            </div>
            <MetalBadge level={plan.metalLevel} />
            {plan.hsaEligible && (
              <span style={{
                fontSize: '0.65rem',
                padding: '0.1rem 0.4rem',
                borderRadius: '4px',
                backgroundColor: '#ebf3ea',
                color: '#5a7857',
                fontWeight: 600,
              }}>
                HSA
              </span>
            )}
            {plan.costRank && (
              <span style={{
                fontSize: '0.65rem',
                padding: '0.1rem 0.4rem',
                borderRadius: '4px',
                backgroundColor: plan.costRank === 1 ? '#7a9b76' : '#eef1f4',
                color: plan.costRank === 1 ? '#fff' : '#5b6c7d',
                fontWeight: 600,
              }}>
                Cost #{plan.costRank}
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#6b7785' }}>
            {plan.issuer} · {plan.type}
          </div>
        </div>

        {/* Cost summary */}
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{ fontSize: '0.65rem', color: '#6b7785', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Monthly
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e3a5f', lineHeight: 1.1 }}>
            ${Math.round(plan.premiumWithCredit ?? plan.premium).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#6b7785', marginTop: '0.15rem' }}>
            Exp: ${Math.round(plan.expectedAnnualCost).toLocaleString()}/yr
          </div>
        </div>
      </div>
    </button>
  );
}

// ============================================================
// SHARED SUB-COMPONENTS
// ============================================================

function FilterGroup({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
        <div style={{ fontSize: '0.7rem', color: '#7a9b76', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </div>
        {count > 0 && (
          <span style={{
            fontSize: '0.6rem',
            padding: '0.05rem 0.35rem',
            borderRadius: '999px',
            backgroundColor: '#7a9b76',
            color: '#fff',
            fontWeight: 600,
          }}>
            {count}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
        {children}
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.35rem 0.7rem',
        borderRadius: '999px',
        border: `1px solid ${active ? '#7a9b76' : '#e1e6eb'}`,
        backgroundColor: active ? '#ebf3ea' : '#fff',
        color: active ? '#5a7857' : '#3a4d68',
        fontSize: '0.78rem',
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        fontFamily: 'Figtree, system-ui, sans-serif',
        transition: 'all 0.15s ease',
      }}
    >
      {active ? '✓ ' : ''}{label}
    </button>
  );
}

function MetalBadge({ level }: { level: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    Bronze: { bg: '#f4e8da', fg: '#8a5a2b' },
    Silver: { bg: '#eef1f4', fg: '#5b6c7d' },
    Gold: { bg: '#faf3da', fg: '#8a7720' },
    Platinum: { bg: '#e8f0f4', fg: '#3a5d75' },
    Catastrophic: { bg: '#fde8e8', fg: '#a04848' },
  };
  const style = colors[level] || { bg: '#eef1f4', fg: '#5b6c7d' };
  return (
    <span style={{
      fontSize: '0.65rem',
      padding: '0.1rem 0.4rem',
      borderRadius: '4px',
      backgroundColor: style.bg,
      color: style.fg,
      fontWeight: 600,
    }}>
      {level}
    </span>
  );
}

function HouseholdContextBanner({ coverageScope, householdSize, utilizationLevel, expectedSpend }: {
  coverageScope: string;
  householdSize: number;
  utilizationLevel: 'low' | 'moderate' | 'high';
  expectedSpend: number;
}) {
  const utilColor = utilizationLevel === 'high' ? '#d4863c' : utilizationLevel === 'moderate' ? '#5b7a99' : '#7a9b76';
  const utilLabel = utilizationLevel === 'high' ? 'High usage' : utilizationLevel === 'moderate' ? 'Moderate usage' : 'Low usage';
  const scopeLabelMap: Record<string, string> = {
    individual: 'Just you (employee-only)',
    employee_plus_spouse: 'You + spouse',
    employee_plus_children: 'You + child(ren)',
    family: 'Whole family',
  };
  const scopeLabel = scopeLabelMap[coverageScope] || coverageScope;
  return (
    <div
      style={{
        marginBottom: '1.5rem',
        padding: '0.85rem 1.1rem',
        backgroundColor: '#ebf3ea',
        borderLeft: '3px solid #7a9b76',
        borderRadius: '6px',
        fontSize: '0.875rem',
        color: '#3a4d68',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <strong style={{ color: '#1e3a5f' }}>Coverage:</strong> {scopeLabel}
        </div>
        <div style={{ width: '1px', height: '14px', backgroundColor: '#c7d9c5' }} />
        <div>
          <strong style={{ color: '#1e3a5f' }}>Household:</strong> {householdSize} {householdSize === 1 ? 'person' : 'people'}
        </div>
        <div style={{ width: '1px', height: '14px', backgroundColor: '#c7d9c5' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <strong style={{ color: '#1e3a5f' }}>Expected use:</strong>
          <span style={{ padding: '0.1rem 0.5rem', backgroundColor: utilColor, color: '#fff', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }}>
            {utilLabel}
          </span>
          {expectedSpend > 0 && (
            <span style={{ fontSize: '0.8rem', color: '#6b7785' }}>(~${expectedSpend.toLocaleString()}/yr in medical spend)</span>
          )}
        </div>
      </div>
      <Link href="/household" style={{ color: '#7a9b76', textDecoration: 'underline', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
        Edit household
      </Link>
    </div>
  );
}