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
  pros: string[];
  cons: string[];
  claimsInsight?: string | null;
  annualPremium?: number | null;
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
  annual_income: number;
  total_plans_available: number;
  overall_advice: string;
  plans: RankedPlan[];
  all_plans?: SimplePlan[] | null;
  coverage_scope?: string | null;
  utilization_level?: 'low' | 'moderate' | 'high' | null;
  expected_annual_medical_spend?: number | null;
};

type SortKey = 'cost_rank' | 'lowest_premium' | 'lowest_deductible';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'cost_rank', label: 'Cost rank (best value)' },
  { value: 'lowest_premium', label: 'Lowest monthly premium' },
  { value: 'lowest_deductible', label: 'Lowest deductible' },
];

const ALL_METAL_LEVELS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Catastrophic'];
const ALL_PLAN_TYPES = ['HMO', 'PPO', 'EPO', 'POS', 'Indemnity'];

export default function MyPlansPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'top' | 'all'>('top');

  // All-plans tab state
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedCarriers, setSelectedCarriers] = useState<string[]>([]);
  const [selectedMetalLevels, setSelectedMetalLevels] = useState<string[]>([]);
  const [selectedPlanTypes, setSelectedPlanTypes] = useState<string[]>([]);
  const [hsaOnly, setHsaOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('cost_rank');

  // AI rerank state
  const [rerankLoading, setRerankLoading] = useState(false);
  const [rerankError, setRerankError] = useState('');
  const [rerankedPlans, setRerankedPlans] = useState<RankedPlan[] | null>(null);
  const [rerankedAdvice, setRerankedAdvice] = useState<string>('');

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

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

  // Unique carriers, sorted alphabetically
  const allCarriers = useMemo(() => {
    const set = new Set<string>();
    allPlans.forEach((p) => {
      if (p.issuer) set.add(p.issuer);
    });
    return Array.from(set).sort();
  }, [allPlans]);

  // Filtered + sorted plans
  const filteredPlans = useMemo(() => {
    let list = [...allPlans];
    if (selectedCarriers.length > 0) {
      list = list.filter((p) => selectedCarriers.includes(p.issuer));
    }
    if (selectedMetalLevels.length > 0) {
      list = list.filter((p) => selectedMetalLevels.includes(p.metalLevel));
    }
    if (selectedPlanTypes.length > 0) {
      list = list.filter((p) => selectedPlanTypes.includes(p.type));
    }
    if (hsaOnly) {
      list = list.filter((p) => p.hsaEligible);
    }
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
    setRerankedPlans(null);
    setRerankedAdvice('');
    setRerankError('');
  }

  function toggleArrayItem(arr: string[], item: string, setter: (v: string[]) => void) {
    if (arr.includes(item)) {
      setter(arr.filter((x) => x !== item));
    } else {
      setter([...arr, item]);
    }
    // Clear rerank when filters change
    setRerankedPlans(null);
    setRerankedAdvice('');
    setRerankError('');
  }

  async function handleRerank() {
    if (!recommendation || !user || filteredPlans.length === 0) return;
    if (filteredPlans.length > 10) {
      setRerankError('Narrow filters to 10 or fewer plans before requesting AI ranking.');
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
          planIds: filteredPlans.map((p) => p.id),
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
      setRerankedPlans(data.rankedPlans as RankedPlan[]);
      setRerankedAdvice(data.overallAdvice || '');
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

  const hasClaimsInsights = !!recommendation?.plans?.some(
    (p) => p.claimsInsight && p.claimsInsight.trim().length > 0
  );

  const hasAllPlans = allPlans.length > 0;

  return (
    <div className="dash-layout">
      <Sidebar
        active="my-plans"
        firstName={firstName}
        lastName={lastName}
        role={role}
        onLogout={handleLogout}
      />

      <main className="dash-main">
        <div className="dash-header">
          <div>
            <div className="dash-greeting">My Plans</div>
            <div className="dash-date">Your AI-ranked insurance plan recommendations.</div>
          </div>
        </div>

        {!recommendation ? (
          /* ===== EMPTY STATE ===== */
          <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ padding: '60px 24px', textAlign: 'center', color: '#3a4d68' }}>
              <div style={{ fontSize: '56px', marginBottom: '16px' }}>🤖</div>
              <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '26px', color: '#1e3a5f', margin: '0 0 12px 0' }}>
                Ready when you are
              </h2>
              <p style={{ fontSize: '15px', lineHeight: '1.7', maxWidth: '480px', margin: '0 auto 24px auto', color: '#3a4d68' }}>
                Tell us a bit about your household and we'll pull live plans from the federal Marketplace and rank them for you.
              </p>
              <Link href="/find-plans" style={{ textDecoration: 'none' }}>
                <button className="btn-sm btn-accent">Find Plans →</button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Household banner */}
            {recommendation.coverage_scope && recommendation.utilization_level && (
              <HouseholdContextBanner
                coverageScope={recommendation.coverage_scope}
                householdSize={recommendation.household_size}
                utilizationLevel={recommendation.utilization_level}
                expectedSpend={recommendation.expected_annual_medical_spend ?? 0}
              />
            )}

            {/* Summary card */}
            <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
              <div className="dash-card-header">
                <div className="dash-card-title">Your Recommendations</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.85rem', color: '#6b7785' }}>
                  Based on a household of {recommendation.household_size} in {recommendation.county_name}, {recommendation.state} (ZIP {recommendation.zip_code}).
                  <br />
                  We found <strong style={{ color: '#1e3a5f' }}>{recommendation.total_plans_available}</strong> plans and ranked the top {recommendation.plans.length}.
                </div>
                <Link href="/find-plans" style={{ textDecoration: 'none' }}>
                  <button className="btn-sm btn-ghost-sm">Run again →</button>
                </Link>
              </div>

              {hasClaimsInsights && (
                <div style={{
                  background: '#ebf3ea',
                  border: '1px solid #c7d9c5',
                  borderRadius: '8px',
                  padding: '0.85rem 1.1rem',
                  fontSize: '0.875rem',
                  lineHeight: 1.5,
                  color: '#3a4d68',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.6rem',
                }}>
                  <span style={{ fontSize: '1.1rem', lineHeight: 1, flexShrink: 0, marginTop: '2px' }}>📄</span>
                  <div>
                    <strong style={{ color: '#5a7857' }}>Claims-aware ranking active.</strong>{' '}
                    We weighted these recommendations using insights from your uploaded claims. Expand any plan to see how your claims influenced its rank.
                  </div>
                </div>
              )}

              {recommendation.overall_advice && activeTab === 'top' && (
                <div style={{
                  background: '#faf7f2',
                  border: '1px solid #eef1f4',
                  borderRadius: '8px',
                  padding: '1rem 1.25rem',
                  fontSize: '0.9rem',
                  lineHeight: '1.6',
                  color: '#3a4d68',
                }}>
                  <div style={{ fontSize: '0.75rem', color: '#7a9b76', fontWeight: 600, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Overall guidance
                  </div>
                  {recommendation.overall_advice}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '1px solid #eef1f4' }}>
              <TabButton
                active={activeTab === 'top'}
                onClick={() => setActiveTab('top')}
                label={`Top picks (${recommendation.plans.length})`}
              />
              <TabButton
                active={activeTab === 'all'}
                onClick={() => setActiveTab('all')}
                label={`All plans (${allPlans.length})`}
                disabled={!hasAllPlans}
                disabledHint={!hasAllPlans ? 'Re-run /find-plans to load all plans for your area' : undefined}
              />
            </div>

            {/* TAB: Top picks */}
            {activeTab === 'top' && (
              <>
                {recommendation.plans.map((plan) => {
                  const isExpanded = expandedPlanId === plan.id;
                  const planHasClaimsInsight = plan.claimsInsight && plan.claimsInsight.trim().length > 0;
                  const planHasProjections =
                    plan.expectedAnnualCost != null && plan.worstCaseAnnualCost != null;
                  return (
                    <RankedPlanCard
                      key={plan.id}
                      plan={plan}
                      isExpanded={isExpanded}
                      onToggleExpand={() => setExpandedPlanId(isExpanded ? null : plan.id)}
                      planHasClaimsInsight={!!planHasClaimsInsight}
                      planHasProjections={planHasProjections}
                    />
                  );
                })}

                <div style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', margin: '2rem 0' }}>
                  Recommendation generated {new Date(recommendation.created_at).toLocaleDateString()} · Powered by federal Marketplace data + AI ranking
                </div>
              </>
            )}

            {/* TAB: All plans */}
            {activeTab === 'all' && hasAllPlans && (
              <>
                {/* Filter bar */}
                <div className="dash-card" style={{ marginBottom: '1rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                      cursor: 'pointer',
                    }}
                    onClick={() => setFiltersOpen(!filtersOpen)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div style={{ fontFamily: 'Playfair Display, serif', color: '#1e3a5f', fontSize: '1.05rem', fontWeight: 700 }}>
                        Filters
                      </div>
                      {filtersActive && (
                        <span style={{
                          fontSize: '0.7rem',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '999px',
                          backgroundColor: '#7a9b76',
                          color: '#fff',
                          fontWeight: 600,
                        }}>
                          Active
                        </span>
                      )}
                      <span style={{ fontSize: '0.85rem', color: '#6b7785' }}>
                        Showing <strong style={{ color: '#1e3a5f' }}>{filteredPlans.length}</strong> of {allPlans.length} plans
                        {' · '}
                        Sort: <strong style={{ color: '#1e3a5f' }}>{SORT_OPTIONS.find((o) => o.value === sortBy)?.label}</strong>
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {filtersActive && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClearFilters();
                          }}
                          className="btn-sm btn-ghost-sm"
                          style={{ fontSize: '0.8rem' }}
                        >
                          Clear all
                        </button>
                      )}
                      <span style={{ fontSize: '0.95rem', color: '#5b7a99' }}>
                        {filtersOpen ? '▲ Hide' : '▼ Show'}
                      </span>
                    </div>
                  </div>

                  {filtersOpen && (
                    <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      {/* Carriers */}
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

                      {/* Metal levels */}
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

                      {/* Plan types */}
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

                      {/* HSA toggle + Sort */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: '#1e3a5f' }}>
                          <input
                            type="checkbox"
                            checked={hsaOnly}
                            onChange={(e) => {
                              setHsaOnly(e.target.checked);
                              setRerankedPlans(null);
                              setRerankedAdvice('');
                            }}
                          />
                          HSA-eligible only
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <label style={{ fontSize: '0.85rem', color: '#6b7785', fontWeight: 600 }}>
                            Sort by:
                          </label>
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
                  )}
                </div>

                {/* AI rerank prompt — visible when filters narrow to ≤10 */}
                {filtersActive && filteredPlans.length > 0 && filteredPlans.length <= 10 && (
                  <div
                    className="dash-card"
                    style={{
                      marginBottom: '1rem',
                      backgroundColor: '#ebf3ea',
                      borderLeft: '3px solid #7a9b76',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                      <div style={{ flex: 1, minWidth: '240px' }}>
                        <div style={{ fontSize: '0.7rem', color: '#5a7857', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>
                          🤖 AI ranking available
                        </div>
                        <div style={{ fontSize: '0.9rem', color: '#1e3a5f' }}>
                          You've narrowed to {filteredPlans.length} {filteredPlans.length === 1 ? 'plan' : 'plans'}. Get AI rankings, pros & cons, and personalized summaries for these specific plans.
                        </div>
                      </div>
                      <button
                        className="btn-sm btn-accent"
                        onClick={handleRerank}
                        disabled={rerankLoading}
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        {rerankLoading ? 'Ranking...' : rerankedPlans ? '↻ Re-rank' : 'Get AI rankings →'}
                      </button>
                    </div>
                    {rerankError && (
                      <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.85rem', background: '#fde8e8', border: '1px solid #f5b8b8', borderRadius: '6px', fontSize: '0.8rem', color: '#8a3030' }}>
                        ⚠ {rerankError}
                      </div>
                    )}
                  </div>
                )}

                {/* AI rerank result advice */}
                {rerankedPlans && rerankedAdvice && (
                  <div
                    className="dash-card"
                    style={{
                      marginBottom: '1rem',
                      backgroundColor: '#faf7f2',
                      border: '1px solid #eef1f4',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: '#7a9b76', fontWeight: 600, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      AI guidance for your filtered set
                    </div>
                    <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#3a4d68' }}>
                      {rerankedAdvice}
                    </div>
                  </div>
                )}

                {/* Plan list */}
                {filteredPlans.length === 0 ? (
                  <div className="dash-card">
                    <div style={{ padding: '40px 24px', textAlign: 'center', color: '#6b7785' }}>
                      <div style={{ fontSize: '36px', marginBottom: '0.75rem' }}>🔍</div>
                      <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.15rem', color: '#1e3a5f', fontWeight: 700, marginBottom: '0.5rem' }}>
                        No plans match your filters
                      </div>
                      <p style={{ fontSize: '0.9rem', maxWidth: '380px', margin: '0 auto 1rem auto' }}>
                        Try removing some filters to see more options.
                      </p>
                      <button onClick={handleClearFilters} className="btn-sm btn-accent">
                        Clear filters
                      </button>
                    </div>
                  </div>
                ) : rerankedPlans ? (
                  /* Show AI-ranked filtered plans */
                  rerankedPlans.map((plan) => {
                    const isExpanded = expandedPlanId === plan.id;
                    const planHasClaimsInsight = plan.claimsInsight && plan.claimsInsight.trim().length > 0;
                    const planHasProjections =
                      plan.expectedAnnualCost != null && plan.worstCaseAnnualCost != null;
                    return (
                      <RankedPlanCard
                        key={plan.id}
                        plan={plan}
                        isExpanded={isExpanded}
                        onToggleExpand={() => setExpandedPlanId(isExpanded ? null : plan.id)}
                        planHasClaimsInsight={!!planHasClaimsInsight}
                        planHasProjections={planHasProjections}
                      />
                    );
                  })
                ) : (
                  /* Show simple plan cards (no AI fields) */
                  filteredPlans.map((plan) => (
                    <SimplePlanCard key={plan.id} plan={plan} />
                  ))
                )}

                <div style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', margin: '2rem 0' }}>
                  All plans pulled from the federal Marketplace · Cost projections based on your household profile
                </div>
              </>
            )}

            {/* TAB: All plans empty (no all_plans on this rec) */}
            {activeTab === 'all' && !hasAllPlans && (
              <div className="dash-card">
                <div style={{ padding: '40px 24px', textAlign: 'center', color: '#3a4d68' }}>
                  <div style={{ fontSize: '40px', marginBottom: '0.75rem' }}>📋</div>
                  <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.2rem', color: '#1e3a5f', fontWeight: 700, marginBottom: '0.5rem' }}>
                    All-plan view not available for this recommendation
                  </div>
                  <p style={{ fontSize: '0.9rem', maxWidth: '420px', margin: '0 auto 1rem auto', lineHeight: 1.5 }}>
                    This recommendation was generated before we started caching the full plan list. Re-run to see all plans for your area with filters.
                  </p>
                  <Link href="/find-plans" style={{ textDecoration: 'none' }}>
                    <button className="btn-sm btn-accent">Re-run Find Plans →</button>
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function TabButton({ active, onClick, label, disabled, disabledHint }: { active: boolean; onClick: () => void; label: string; disabled?: boolean; disabledHint?: string }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? disabledHint : undefined}
      style={{
        padding: '0.85rem 1.25rem',
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '3px solid #7a9b76' : '3px solid transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '0.95rem',
        fontWeight: active ? 700 : 500,
        color: disabled ? '#c4cdd5' : active ? '#1e3a5f' : '#6b7785',
        fontFamily: 'Figtree, system-ui, sans-serif',
        transition: 'border-color 0.15s ease, color 0.15s ease',
        marginBottom: '-1px',
      }}
    >
      {label}
    </button>
  );
}

function FilterGroup({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div style={{ fontSize: '0.75rem', color: '#7a9b76', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </div>
        {count > 0 && (
          <span style={{
            fontSize: '0.65rem',
            padding: '0.1rem 0.4rem',
            borderRadius: '999px',
            backgroundColor: '#7a9b76',
            color: '#fff',
            fontWeight: 600,
          }}>
            {count}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
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
        padding: '0.4rem 0.75rem',
        borderRadius: '999px',
        border: `1px solid ${active ? '#7a9b76' : '#e1e6eb'}`,
        backgroundColor: active ? '#ebf3ea' : '#fff',
        color: active ? '#5a7857' : '#3a4d68',
        fontSize: '0.8rem',
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

function SimplePlanCard({ plan }: { plan: SimplePlan }) {
  return (
    <div className="dash-card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Cost rank badge */}
        <div style={{
          flexShrink: 0,
          width: '52px',
          height: '52px',
          borderRadius: '8px',
          backgroundColor: plan.costRank === 1 ? '#7a9b76' : '#5b7a99',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
        }}>
          <div style={{ fontSize: '0.6rem', opacity: 0.85, lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Cost
          </div>
          <div style={{ fontSize: '1.05rem', lineHeight: 1.1, marginTop: '0.15rem' }}>#{plan.costRank ?? '—'}</div>
        </div>

        {/* Main plan info */}
        <div style={{ flex: 1, minWidth: '260px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
            <h3 style={{ margin: 0, color: '#1e3a5f', fontSize: '1.05rem', fontWeight: 700 }}>
              {plan.name}
            </h3>
            <MetalBadge level={plan.metalLevel} />
            {plan.hsaEligible && (
              <span style={{
                fontSize: '0.7rem',
                padding: '0.15rem 0.5rem',
                borderRadius: '4px',
                backgroundColor: '#ebf3ea',
                color: '#5a7857',
                fontWeight: 600,
              }}>
                HSA
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#6b7785' }}>
            {plan.issuer} · {plan.type}
          </div>
        </div>

        {/* Price (right side) */}
        <div style={{ flexShrink: 0, textAlign: 'right', minWidth: '120px' }}>
          <div style={{ fontSize: '0.7rem', color: '#6b7785', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Monthly
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e3a5f' }}>
            ${Math.round(plan.premiumWithCredit ?? plan.premium).toLocaleString()}
          </div>
          {plan.premiumWithCredit != null && plan.premiumWithCredit < plan.premium && (
            <div style={{ fontSize: '0.7rem', color: '#6b7785' }}>
              (was ${Math.round(plan.premium).toLocaleString()})
            </div>
          )}
        </div>
      </div>

      {/* Cost projections */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '0.6rem',
        marginTop: '0.85rem',
        paddingTop: '0.85rem',
        borderTop: '1px solid #eef1f4',
      }}>
        <ProjectionStat
          label="Expected annual cost"
          value={`$${Math.round(plan.expectedAnnualCost).toLocaleString()}`}
          sublabel="Premium + typical OOP"
          highlighted
        />
        <ProjectionStat
          label="Worst-case annual cost"
          value={`$${Math.round(plan.worstCaseAnnualCost).toLocaleString()}`}
          sublabel="Premium + OOP max hit"
        />
      </div>

      {/* Quick stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '0.6rem',
        marginTop: '0.6rem',
        paddingTop: '0.6rem',
        borderTop: '1px solid #eef1f4',
      }}>
        <Stat label="Deductible" value={plan.deductible != null ? `$${plan.deductible.toLocaleString()}` : '—'} />
        <Stat label="Max out-of-pocket" value={plan.maxOutOfPocket != null ? `$${plan.maxOutOfPocket.toLocaleString()}` : '—'} />
        <Stat label="Plan type" value={plan.type || '—'} />
      </div>
    </div>
  );
}

function RankedPlanCard({ plan, isExpanded, onToggleExpand, planHasClaimsInsight, planHasProjections }: { plan: RankedPlan; isExpanded: boolean; onToggleExpand: () => void; planHasClaimsInsight: boolean; planHasProjections: boolean }) {
  return (
    <div className="dash-card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Rank badge */}
        <div style={{
          flexShrink: 0,
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          backgroundColor: plan.rank === 1 ? '#7a9b76' : '#5b7a99',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
        }}>
          <div style={{ fontSize: '0.65rem', opacity: 0.85, lineHeight: 1 }}>#</div>
          <div style={{ fontSize: '1.25rem', lineHeight: 1 }}>{plan.rank}</div>
        </div>

        {/* Main plan info */}
        <div style={{ flex: 1, minWidth: '260px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
            <h3 style={{ margin: 0, color: '#1e3a5f', fontSize: '1.1rem', fontWeight: 700 }}>
              {plan.name}
            </h3>
            <MetalBadge level={plan.metalLevel} />
            {plan.hsaEligible && (
              <span style={{
                fontSize: '0.7rem',
                padding: '0.15rem 0.5rem',
                borderRadius: '4px',
                backgroundColor: '#ebf3ea',
                color: '#5a7857',
                fontWeight: 600,
              }}>
                HSA
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#6b7785', marginBottom: '0.75rem' }}>
            {plan.issuer} · {plan.type}
          </div>
          <p style={{ fontSize: '0.9rem', color: '#3a4d68', margin: '0 0 0.75rem 0', lineHeight: 1.5 }}>
            {plan.summary}
          </p>
        </div>

        {/* Match score + price (right side) */}
        <div style={{ flexShrink: 0, textAlign: 'right', minWidth: '160px' }}>
          {plan.costRank ? (
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', color: '#6b7785', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.15rem' }}>Match score</div>
                <div style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: plan.matchScore >= 80 ? '#7a9b76' : plan.matchScore >= 60 ? '#5b7a99' : '#9ca3af',
                  lineHeight: 1,
                }}>{plan.matchScore}</div>
              </div>
              <div style={{ width: '1px', backgroundColor: '#eef1f4' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', color: '#6b7785', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.15rem' }}>Cost rank</div>
                <div style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: plan.costRank === 1 ? '#7a9b76' : '#5b7a99',
                  lineHeight: 1,
                }}>#{plan.costRank}</div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: '0.7rem', color: '#6b7785', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>
                Match Score
              </div>
              <div style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                color: plan.matchScore >= 80 ? '#7a9b76' : plan.matchScore >= 60 ? '#5b7a99' : '#9ca3af',
                lineHeight: 1,
                marginBottom: '0.75rem',
              }}>
                {plan.matchScore}
              </div>
            </>
          )}
          <div style={{ fontSize: '0.7rem', color: '#6b7785', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Monthly
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e3a5f' }}>
            ${Math.round(plan.premiumWithCredit ?? plan.premium).toLocaleString()}
          </div>
          {plan.premiumWithCredit != null && plan.premiumWithCredit < plan.premium && (
            <div style={{ fontSize: '0.7rem', color: '#6b7785' }}>
              (was ${Math.round(plan.premium).toLocaleString()})
            </div>
          )}
        </div>
      </div>

      {/* Annual cost projections */}
      {planHasProjections && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem',
          marginTop: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid #eef1f4',
        }}>
          <ProjectionStat
            label="Expected annual cost"
            value={`$${Math.round(plan.expectedAnnualCost!).toLocaleString()}`}
            sublabel="Premium + typical OOP"
            highlighted
          />
          <ProjectionStat
            label="Worst-case annual cost"
            value={`$${Math.round(plan.worstCaseAnnualCost!).toLocaleString()}`}
            sublabel="Premium + OOP max hit"
          />
        </div>
      )}

      {/* Quick stats row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '0.75rem',
        marginTop: '1rem',
        paddingTop: '1rem',
        borderTop: '1px solid #eef1f4',
      }}>
        <Stat label="Deductible" value={plan.deductible != null ? `$${plan.deductible.toLocaleString()}` : '—'} />
        <Stat label="Max out-of-pocket" value={plan.maxOutOfPocket != null ? `$${plan.maxOutOfPocket.toLocaleString()}` : '—'} />
        <Stat label="Plan type" value={plan.type || '—'} />
      </div>

      {/* Expandable pros/cons */}
      <button
        onClick={onToggleExpand}
        style={{
          marginTop: '1rem',
          background: 'transparent',
          border: 'none',
          color: '#5b7a99',
          cursor: 'pointer',
          padding: 0,
          fontSize: '0.875rem',
          fontWeight: 600,
        }}
      >
        {isExpanded ? '▲ Hide details' : '▼ See pros & cons'}
      </button>

      {isExpanded && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
            marginTop: '1rem',
          }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#7a9b76', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                ✓ Pros
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.85rem', color: '#3a4d68', lineHeight: 1.6 }}>
                {plan.pros?.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#d95858', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                ⚠ Cons
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.85rem', color: '#3a4d68', lineHeight: 1.6 }}>
                {plan.cons?.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          </div>

          {planHasClaimsInsight && (
            <div style={{
              marginTop: '1rem',
              padding: '0.85rem 1rem',
              background: '#f5f8f4',
              border: '1px solid #d4e2d2',
              borderRadius: '6px',
              fontSize: '0.85rem',
              lineHeight: 1.5,
              color: '#3a4d68',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
            }}>
              <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '1px' }}>📄</span>
              <div>
                <strong style={{ color: '#5a7857', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.2rem' }}>
                  How your claims shaped this rank
                </strong>
                {plan.claimsInsight}
              </div>
            </div>
          )}
        </>
      )}
    </div>
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

function ProjectionStat({ label, value, sublabel, highlighted }: { label: string; value: string; sublabel: string; highlighted?: boolean }) {
  return (
    <div style={{
      padding: '0.85rem 1rem',
      backgroundColor: highlighted ? '#ebf3ea' : '#fafbfc',
      border: `1px solid ${highlighted ? '#c7d9c5' : '#eef1f4'}`,
      borderRadius: '8px',
    }}>
      <div style={{ fontSize: '0.65rem', color: '#6b7785', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: '0.25rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#1e3a5f', lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.2rem' }}>
        {sublabel}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '0.7rem', color: '#6b7785', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.2rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e3a5f' }}>
        {value}
      </div>
    </div>
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
      fontSize: '0.7rem',
      padding: '0.15rem 0.5rem',
      borderRadius: '4px',
      backgroundColor: style.bg,
      color: style.fg,
      fontWeight: 600,
    }}>
      {level}
    </span>
  );
}