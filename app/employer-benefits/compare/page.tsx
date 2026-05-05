'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../supabase';
import Sidebar from '../../components/Sidebar';

type CompareMode = 'employer-only' | 'employer-vs-marketplace';

type RankedEmployerPlan = {
  id: string;
  plan_name: string;
  plan_type: string | null;
  primary_care_copay: string | null;
  specialist_copay: string | null;
  hsa_eligible: boolean;
  highlights: string | null;
  rank: number;
  matchScore: number;
  summary: string;
  pros: string[];
  cons: string[];
  claimsInsight: string | null;
  tier_label: 'Single coverage' | 'Family coverage';
  tier_premium: number | null;
  tier_deductible: number | null;
  tier_oop_max: number | null;
  annual_premium: number | null;
  expected_annual_cost: number | null;
  worst_case_annual_cost: number | null;
  cost_rank: number;
  utilization_level: 'low' | 'moderate' | 'high';
};

type Verdict = {
  winner: 'employer' | 'marketplace' | 'tie';
  winnerPlanId: string;
  winnerPlanName: string;
  winnerSource: 'employer' | 'marketplace';
  summary: string;
  tradeoffs: string[];
  annualCostComparison: {
    employerBestPlan: { id: string; name: string; estimatedAnnualCost: number; worstCaseAnnualCost?: number };
    marketplaceBestPlan: { id: string; name: string; estimatedAnnualCost: number; worstCaseAnnualCost?: number };
  };
  claimsInsight: string | null;
};

// Cache version — bump when result shape changes
const CACHE_VERSION = 'v2';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

type CachedResult = {
  version: string;
  cachedAt: number;
  data: any;
};

function cacheKey(userId: string, mode: CompareMode): string {
  return `clarity-compare-${userId}-${mode}`;
}

function readCache(userId: string, mode: CompareMode): any | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(userId, mode));
    if (!raw) return null;
    const parsed: CachedResult = JSON.parse(raw);
    if (parsed.version !== CACHE_VERSION) return null;
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(userId: string, mode: CompareMode, data: any) {
  if (typeof window === 'undefined') return;
  try {
    const payload: CachedResult = {
      version: CACHE_VERSION,
      cachedAt: Date.now(),
      data,
    };
    sessionStorage.setItem(cacheKey(userId, mode), JSON.stringify(payload));
  } catch {
    // sessionStorage full or unavailable — silent failure is fine
  }
}

function clearCache(userId: string, mode: CompareMode) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(cacheKey(userId, mode));
  } catch {
    // ignore
  }
}

function CompareInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = (searchParams.get('mode') as CompareMode) || 'employer-only';

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [requiresMarketplaceRun, setRequiresMarketplaceRun] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [resultFromCache, setResultFromCache] = useState(false);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

      // Try cache before showing loading state
      const cached = readCache(user.id, mode);
      if (cached) {
        setResult(cached);
        setResultFromCache(true);
      }
      setLoading(false);
    }
    init();
  }, [router, mode]);

  const runComparison = useCallback(async (force = false) => {
    if (!user) return;
    setComparing(true);
    setErrorMsg('');
    setRequiresMarketplaceRun(false);
    if (force) {
      setResult(null);
      setResultFromCache(false);
      clearCache(user.id, mode);
    }
    setStatusMsg(
      mode === 'employer-only'
        ? 'Ranking your employer plans for your household...'
        : 'Comparing your employer plan against the federal Marketplace...'
    );

    try {
      const res = await fetch('/api/compare-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, mode }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.requiresMarketplaceRun) setRequiresMarketplaceRun(true);
        setErrorMsg(data.error || 'Something went wrong');
        setComparing(false);
        setStatusMsg('');
        return;
      }

      setResult(data);
      setResultFromCache(false);
      writeCache(user.id, mode, data);
      setComparing(false);
      setStatusMsg('');
    } catch (e: any) {
      setErrorMsg(`Network error: ${e.message}`);
      setComparing(false);
      setStatusMsg('');
    }
  }, [user, mode]);

  // Auto-run comparison once user is loaded — but ONLY if we don't have a cached result already
  useEffect(() => {
    if (user && !result && !comparing && !errorMsg) {
      runComparison(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
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

  const scopeLabel =
    mode === 'employer-only'
      ? `Comparing plans from ${result?.employer_name || 'your employer'}`
      : `Your employer plan vs. Marketplace`;

  return (
    <div className="dash-layout">
      <Sidebar
        active="employer-benefits"
        firstName={firstName}
        lastName={lastName}
        role={role}
        onLogout={handleLogout}
      />
      <main className="dash-main">
        <div className="dash-header">
          <div>
            <div style={{ fontSize: '0.75rem', color: '#7a9b76', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>
              {mode === 'employer-only' ? '🏢 Employer plans only' : '🌐 Employer vs. Marketplace'}
            </div>
            <div className="dash-greeting">{scopeLabel}</div>
            <div className="dash-date">
              <Link href="/employer-benefits" style={{ color: '#5b7a99', textDecoration: 'none' }}>
                ← Back to Employer Benefits
              </Link>
            </div>
          </div>
          {/* Re-run button — only shown when we have a result */}
          {result && !comparing && (
            <div className="dash-header-actions">
              <button
                onClick={() => runComparison(true)}
                className="btn-sm btn-ghost-sm"
                title="Re-run with the latest household data"
              >
                ↻ Re-run
              </button>
            </div>
          )}
        </div>

        {/* ===== HOUSEHOLD-AWARE BANNER ===== */}
        {result && (
          <HouseholdContextBanner
            coverageScopeLabel={result.coverage_scope_label}
            householdSize={result.household_size}
            utilizationLevel={result.utilization_level}
            expectedSpend={result.expected_annual_medical_spend}
          />
        )}

        {/* Cached result hint */}
        {resultFromCache && !comparing && (
          <div style={{
            marginBottom: '1rem',
            padding: '0.5rem 0.85rem',
            background: '#faf7f2',
            border: '1px solid #eef1f4',
            borderRadius: '6px',
            fontSize: '0.75rem',
            color: '#6b7785',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <span>💾</span>
            <span>Showing cached result. If you updated your household, click <strong style={{ color: '#1e3a5f' }}>↻ Re-run</strong> for fresh recommendations.</span>
          </div>
        )}

        {/* ===== LOADING STATE ===== */}
        {comparing && (
          <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ padding: '40px 24px', textAlign: 'center', color: '#3a4d68' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚖️</div>
              <h3 style={{ fontFamily: 'Playfair Display, serif', color: '#1e3a5f', margin: '0 0 8px 0' }}>
                Working on your comparison...
              </h3>
              <p style={{ fontSize: '14px', color: '#6b7785', maxWidth: '440px', margin: '0 auto' }}>
                {statusMsg}
              </p>
              <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '16px' }}>
                This usually takes 10-30 seconds.
              </p>
            </div>
          </div>
        )}

        {/* ===== ERROR STATE ===== */}
        {errorMsg && !comparing && (
          <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ padding: '32px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>⚠️</div>
              <h3 style={{ fontFamily: 'Playfair Display, serif', color: '#1e3a5f', margin: '0 0 8px 0' }}>
                We hit a snag
              </h3>
              <p style={{ fontSize: '14px', color: '#3a4d68', maxWidth: '500px', margin: '0 auto 16px auto', lineHeight: 1.6 }}>
                {errorMsg}
              </p>
              {requiresMarketplaceRun ? (
                <Link href="/find-plans">
                  <button className="btn-sm btn-accent">Run Find Plans first →</button>
                </Link>
              ) : (
                <button onClick={() => runComparison(true)} className="btn-sm btn-accent">Try again</button>
              )}
            </div>
          </div>
        )}

        {/* ===== RESULTS: EMPLOYER-ONLY MODE ===== */}
        {result && mode === 'employer-only' && (
          <>
            <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ background: '#eef3f0', border: '1px solid #c7d9c5', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#3a4d68', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1rem' }}>🏢</span>
                <div>
                  <strong style={{ color: '#5a7857' }}>Scope:</strong> Comparing {result.plans.length} medical plans offered by {result.employer_name || 'your employer'}{result.plan_year ? `, plan year ${result.plan_year}` : ''}.
                </div>
              </div>

              {result.overallAdvice && (
                <div style={{ background: '#faf7f2', border: '1px solid #eef1f4', borderRadius: '8px', padding: '1rem 1.25rem', fontSize: '0.9rem', lineHeight: 1.6, color: '#3a4d68' }}>
                  <div style={{ fontSize: '0.7rem', color: '#7a9b76', fontWeight: 600, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Our recommendation
                  </div>
                  {result.overallAdvice}
                </div>
              )}

              {result.claimsUsed > 0 && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#5a7857' }}>
                  📄 Weighted using {result.claimsUsed} claim document{result.claimsUsed === 1 ? '' : 's'} you've uploaded.
                </div>
              )}
            </div>

            {(result.plans as RankedEmployerPlan[]).map((plan) => (
              <RankedEmployerPlanCard key={plan.id} plan={plan} />
            ))}
          </>
        )}

        {/* ===== RESULTS: EMPLOYER-VS-MARKETPLACE MODE ===== */}
        {result && mode === 'employer-vs-marketplace' && (
          <VsMarketplaceResults result={result} />
        )}
      </main>
    </div>
  );
}

function HouseholdContextBanner({ coverageScopeLabel, householdSize, utilizationLevel, expectedSpend }: {
  coverageScopeLabel: string;
  householdSize: number;
  utilizationLevel: 'low' | 'moderate' | 'high';
  expectedSpend: number;
}) {
  const utilColor = utilizationLevel === 'high' ? '#d4863c' : utilizationLevel === 'moderate' ? '#5b7a99' : '#7a9b76';
  const utilLabel = utilizationLevel === 'high' ? 'High usage' : utilizationLevel === 'moderate' ? 'Moderate usage' : 'Low usage';
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
          <strong style={{ color: '#1e3a5f' }}>Coverage:</strong> {coverageScopeLabel}
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
          <span style={{ fontSize: '0.8rem', color: '#6b7785' }}>(~${expectedSpend.toLocaleString()}/yr in medical spend)</span>
        </div>
      </div>
      <Link href="/household" style={{ color: '#7a9b76', textDecoration: 'underline', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
        Edit household
      </Link>
    </div>
  );
}

function RankedEmployerPlanCard({ plan }: { plan: RankedEmployerPlan }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="dash-card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
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
        <div style={{ flex: 1, minWidth: '260px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
            <h3 style={{ margin: 0, color: '#1e3a5f', fontSize: '1.1rem', fontWeight: 700 }}>{plan.plan_name}</h3>
            {plan.plan_type && (
              <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: '#eef1f4', color: '#5b6c7d', fontWeight: 600 }}>{plan.plan_type}</span>
            )}
            {plan.hsa_eligible && (
              <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: '#ebf3ea', color: '#5a7857', fontWeight: 600 }}>HSA</span>
            )}
            <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: '#fff8e6', color: '#806c1e', fontWeight: 600 }}>
              {plan.tier_label}
            </span>
          </div>
          <p style={{ fontSize: '0.9rem', color: '#3a4d68', margin: '0 0 0.75rem 0', lineHeight: 1.5 }}>{plan.summary}</p>
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right', minWidth: '160px' }}>
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
                color: plan.cost_rank === 1 ? '#7a9b76' : '#5b7a99',
                lineHeight: 1,
              }}>#{plan.cost_rank}</div>
            </div>
          </div>
          {plan.tier_premium != null && (
            <>
              <div style={{ fontSize: '0.7rem', color: '#6b7785', textTransform: 'uppercase', letterSpacing: '0.5px' }}>You pay</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e3a5f' }}>
                ${Math.round(plan.tier_premium).toLocaleString()}<span style={{ fontSize: '0.7rem', fontWeight: 400, color: '#6b7785' }}> /mo</span>
              </div>
            </>
          )}
        </div>
      </div>

      {plan.expected_annual_cost != null && plan.worst_case_annual_cost != null && (
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
            value={`$${Math.round(plan.expected_annual_cost).toLocaleString()}`}
            sublabel="Premium + typical OOP"
            highlighted
          />
          <ProjectionStat
            label="Worst-case annual cost"
            value={`$${Math.round(plan.worst_case_annual_cost).toLocaleString()}`}
            sublabel="Premium + OOP max hit"
          />
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: '0.5rem',
        marginTop: '1rem',
        paddingTop: '1rem',
        borderTop: '1px solid #eef1f4',
      }}>
        <SmallStat label={`Deductible (${plan.tier_label === 'Family coverage' ? 'family' : 'indv'})`} value={plan.tier_deductible != null ? `$${plan.tier_deductible.toLocaleString()}` : '—'} />
        <SmallStat label={`OOP max (${plan.tier_label === 'Family coverage' ? 'family' : 'indv'})`} value={plan.tier_oop_max != null ? `$${plan.tier_oop_max.toLocaleString()}` : '—'} />
        <SmallStat label="Primary care" value={plan.primary_care_copay || '—'} />
        <SmallStat label="Specialist" value={plan.specialist_copay || '—'} />
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        style={{ marginTop: '1rem', background: 'transparent', border: 'none', color: '#5b7a99', cursor: 'pointer', padding: 0, fontSize: '0.875rem', fontWeight: 600 }}
      >
        {expanded ? '▲ Hide details' : '▼ See pros & cons'}
      </button>

      {expanded && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#7a9b76', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>✓ Pros</div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.85rem', color: '#3a4d68', lineHeight: 1.6 }}>
                {plan.pros?.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#d95858', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>⚠ Cons</div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.85rem', color: '#3a4d68', lineHeight: 1.6 }}>
                {plan.cons?.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          </div>

          {plan.claimsInsight && (
            <div style={{ marginTop: '1rem', padding: '0.85rem 1rem', background: '#f5f8f4', border: '1px solid #d4e2d2', borderRadius: '6px', fontSize: '0.85rem', lineHeight: 1.5, color: '#3a4d68', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
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

function VsMarketplaceResults({ result }: { result: any }) {
  const verdict: Verdict = result.verdict;
  const winnerColor = verdict.winnerSource === 'employer' ? '#7a9b76' : '#5b7a99';
  const winnerLabel = verdict.winnerSource === 'employer' ? '🏢 Your Employer' : '🌐 The Marketplace';

  return (
    <>
      <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ background: '#eef3f0', border: '1px solid #c7d9c5', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#3a4d68', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1rem' }}>🌐</span>
          <div>
            <strong style={{ color: '#5a7857' }}>Scope:</strong> Comparing {result.employer_name || 'your employer'}'s best medical plan against your top federal Marketplace match (based on your most recent Find Plans run).
          </div>
        </div>

        <div style={{
          padding: '1.25rem',
          background: '#fff',
          border: `2px solid ${winnerColor}`,
          borderRadius: '10px',
          marginBottom: '1rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7785', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.4rem' }}>
            Better deal for your household
          </div>
          <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.4rem', color: winnerColor, fontWeight: 700, marginBottom: '0.25rem' }}>
            {winnerLabel}
          </div>
          <div style={{ fontSize: '1rem', color: '#1e3a5f', fontWeight: 600 }}>
            {verdict.winnerPlanName}
          </div>
        </div>

        <div style={{ background: '#faf7f2', border: '1px solid #eef1f4', borderRadius: '8px', padding: '1rem 1.25rem', fontSize: '0.9rem', lineHeight: 1.6, color: '#3a4d68', marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.7rem', color: '#7a9b76', fontWeight: 600, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Why
          </div>
          {verdict.summary}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <div style={{ padding: '1rem 1.25rem', background: verdict.winnerSource === 'employer' ? '#f5f8f4' : '#fff', border: `1px solid ${verdict.winnerSource === 'employer' ? '#c7d9c5' : '#eef1f4'}`, borderRadius: '8px' }}>
            <div style={{ fontSize: '0.7rem', color: '#7a9b76', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.4rem' }}>
              🏢 Best employer plan
            </div>
            <div style={{ fontSize: '0.95rem', color: '#1e3a5f', fontWeight: 600, marginBottom: '0.5rem' }}>
              {verdict.annualCostComparison.employerBestPlan.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7785' }}>Expected annual cost</div>
            <div style={{ fontSize: '1.3rem', color: '#1e3a5f', fontWeight: 700, marginBottom: '0.4rem' }}>
              ${Math.round(verdict.annualCostComparison.employerBestPlan.estimatedAnnualCost).toLocaleString()}
            </div>
            {verdict.annualCostComparison.employerBestPlan.worstCaseAnnualCost != null && (
              <>
                <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Worst case</div>
                <div style={{ fontSize: '0.95rem', color: '#6b7785', fontWeight: 600 }}>
                  ${Math.round(verdict.annualCostComparison.employerBestPlan.worstCaseAnnualCost).toLocaleString()}
                </div>
              </>
            )}
          </div>
          <div style={{ padding: '1rem 1.25rem', background: verdict.winnerSource === 'marketplace' ? '#f0f4f7' : '#fff', border: `1px solid ${verdict.winnerSource === 'marketplace' ? '#c5d3df' : '#eef1f4'}`, borderRadius: '8px' }}>
            <div style={{ fontSize: '0.7rem', color: '#5b7a99', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.4rem' }}>
              🌐 Best Marketplace plan
            </div>
            <div style={{ fontSize: '0.95rem', color: '#1e3a5f', fontWeight: 600, marginBottom: '0.5rem' }}>
              {verdict.annualCostComparison.marketplaceBestPlan.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7785' }}>Expected annual cost</div>
            <div style={{ fontSize: '1.3rem', color: '#1e3a5f', fontWeight: 700, marginBottom: '0.4rem' }}>
              ${Math.round(verdict.annualCostComparison.marketplaceBestPlan.estimatedAnnualCost).toLocaleString()}
            </div>
            {verdict.annualCostComparison.marketplaceBestPlan.worstCaseAnnualCost != null && (
              <>
                <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Worst case</div>
                <div style={{ fontSize: '0.95rem', color: '#6b7785', fontWeight: 600 }}>
                  ${Math.round(verdict.annualCostComparison.marketplaceBestPlan.worstCaseAnnualCost).toLocaleString()}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {verdict.tradeoffs?.length > 0 && (
        <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
          <div className="dash-card-header">
            <div className="dash-card-title">Key trade-offs</div>
          </div>
          <ul style={{ margin: '0.75rem 0 0 0', paddingLeft: '1.25rem', fontSize: '0.9rem', color: '#3a4d68', lineHeight: 1.7 }}>
            {verdict.tradeoffs.map((t, i) => <li key={i} style={{ marginBottom: '0.4rem' }}>{t}</li>)}
          </ul>
        </div>
      )}

      {verdict.claimsInsight && (
        <div className="dash-card" style={{ marginBottom: '1.5rem', background: '#f5f8f4', border: '1px solid #d4e2d2' }}>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>📄</span>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#5a7857', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.3rem' }}>
                How your claims shaped this verdict
              </div>
              <div style={{ fontSize: '0.9rem', color: '#3a4d68', lineHeight: 1.6 }}>
                {verdict.claimsInsight}
              </div>
            </div>
          </div>
        </div>
      )}

      {result.claimsUsed === 0 && (
        <div style={{ fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center', margin: '1rem 0', fontStyle: 'italic' }}>
          No claims uploaded yet. Upload a claim or EOB on the dashboard for more personalized comparisons.
        </div>
      )}
    </>
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

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '0.65rem', color: '#6b7785', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.15rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e3a5f' }}>
        {value}
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p>Loading...</p>
      </div>
    }>
      <CompareInner />
    </Suspense>
  );
}