'use client';

import { useState, useEffect } from 'react';
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
};

export default function MyPlansPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

      // Load most recent recommendation
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

  // Derive whether any of the ranked plans have claims insights (means claims were used)
  const hasClaimsInsights = !!recommendation?.plans?.some(
    (p) => p.claimsInsight && p.claimsInsight.trim().length > 0
  );

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
          /* ===== RESULTS VIEW ===== */
          <>
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

              {/* Claims-aware ranking banner — shown only when claims insights are present */}
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
                    We weighted these recommendations using insights from your uploaded claims. Expand any plan below to see how your claims influenced its rank.
                  </div>
                </div>
              )}

              {recommendation.overall_advice && (
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

            {/* Plan cards */}
            {recommendation.plans.map((plan) => {
              const isExpanded = expandedPlanId === plan.id;
              const planHasClaimsInsight = plan.claimsInsight && plan.claimsInsight.trim().length > 0;
              return (
                <div key={plan.id} className="dash-card" style={{ marginBottom: '1rem' }}>
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
                    <div style={{ flexShrink: 0, textAlign: 'right', minWidth: '140px' }}>
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
                    onClick={() => setExpandedPlanId(isExpanded ? null : plan.id)}
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

                      {/* Per-plan claims insight */}
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
            })}

            <div style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', margin: '2rem 0' }}>
              Recommendation generated {new Date(recommendation.created_at).toLocaleDateString()} · Powered by federal Marketplace data + AI ranking
            </div>
          </>
        )}
      </main>
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