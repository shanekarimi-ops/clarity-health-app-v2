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
};

type Recommendation = {
  id: string;
  created_at: string;
  zip_code: string;
  county_name: string;
  state: string;
  plans: RankedPlan[];
};

export default function ComparePlansPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);

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

  // Get top 3 plans for the comparison view
  const topPlans = recommendation?.plans?.slice(0, 3) || [];

  const rows = [
    { label: 'Issuer', render: (p: RankedPlan) => p.issuer || '—' },
    { label: 'Plan Type', render: (p: RankedPlan) => p.type || '—' },
    { label: 'Metal Level', render: (p: RankedPlan) => p.metalLevel || '—' },
    {
      label: 'Monthly Premium',
      render: (p: RankedPlan) => `$${Math.round(p.premiumWithCredit ?? p.premium).toLocaleString()}/mo`,
    },
    {
      label: 'Premium (no subsidy)',
      render: (p: RankedPlan) => `$${Math.round(p.premium).toLocaleString()}/mo`,
    },
    {
      label: 'Deductible',
      render: (p: RankedPlan) => (p.deductible != null ? `$${p.deductible.toLocaleString()}` : '—'),
    },
    {
      label: 'Max Out-of-Pocket',
      render: (p: RankedPlan) => (p.maxOutOfPocket != null ? `$${p.maxOutOfPocket.toLocaleString()}` : '—'),
    },
    { label: 'HSA Eligible', render: (p: RankedPlan) => (p.hsaEligible ? 'Yes' : 'No') },
    { label: 'Match Score', render: (p: RankedPlan) => `${p.matchScore} / 100` },
  ];

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

        {topPlans.length === 0 ? (
          /* ===== EMPTY STATE ===== */
          <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ padding: '60px 24px', textAlign: 'center', color: '#3a4d68' }}>
              <div style={{ fontSize: '56px', marginBottom: '16px' }}>⚖️</div>
              <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '26px', color: '#1e3a5f', margin: '0 0 12px 0' }}>
                Nothing to compare yet
              </h2>
              <p style={{ fontSize: '15px', lineHeight: '1.7', maxWidth: '480px', margin: '0 auto 24px auto', color: '#3a4d68' }}>
                Run a recommendation from Find Plans and your top 3 matches will appear here side-by-side.
              </p>
              <Link href="/find-plans" style={{ textDecoration: 'none' }}>
                <button className="btn-sm btn-accent">Find Plans →</button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Context banner */}
            <div style={{
              background: '#eef1f4',
              border: '1px solid #5b7a99',
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
                Showing your <strong>top 3</strong> ranked plans for {recommendation?.county_name}, {recommendation?.state}.
              </span>
              <Link href="/my-plans" style={{ color: '#5b7a99', fontWeight: 600, textDecoration: 'none', fontSize: '13px' }}>
                See all {recommendation?.plans?.length} →
              </Link>
            </div>

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
                    {topPlans.map((plan, idx) => {
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
                  {/* Summary row from Claude */}
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
                    {topPlans.map((plan) => {
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

                  {/* Standard rows */}
                  {rows.map((row) => (
                    <tr key={row.label}>
                      <td style={{
                        padding: '14px 16px',
                        borderBottom: '1px solid #eef1f4',
                        color: '#3a4d68',
                        fontSize: '14px',
                        fontWeight: 500,
                      }}>
                        {row.label}
                      </td>
                      {topPlans.map((plan) => {
                        const isBestFit = plan.rank === 1;
                        return (
                          <td key={plan.id} style={{
                            padding: '14px 16px',
                            borderBottom: '1px solid #eef1f4',
                            textAlign: 'center',
                            background: isBestFit ? '#faf7f2' : 'transparent',
                            color: '#1e3a5f',
                            fontSize: '14px',
                          }}>
                            {row.render(plan)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {/* Action row */}
                  <tr>
                    <td style={{ padding: '14px 16px' }}></td>
                    {topPlans.map((plan) => {
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