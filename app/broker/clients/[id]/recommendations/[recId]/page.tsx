'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../../../supabase';
import BrokerSidebar from '../../../../../components/BrokerSidebar';
import { getAccountType } from '../../../../../lib/account';

type Client = {
  id: string;
  first_name: string;
  last_name: string;
  employer_name: string | null;
  member_count: number | null;
  state: string | null;
};

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
  claimsInsight: string | null;
};

type Recommendation = {
  id: string;
  user_id: string;
  client_id: string | null;
  created_at: string;
  zip_code: string | null;
  county_name: string | null;
  state: string | null;
  household_size: number | null;
  annual_income: number | null;
  ages: number[] | null;
  uses_tobacco: boolean | null;
  total_plans_available: number | null;
  overall_advice: string | null;
  plans: RankedPlan[];
};

export default function RecommendationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const clientId = params?.id as string;
  const recId = params?.recId as string;

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [agencyName, setAgencyName] = useState('Your Agency');
  const [client, setClient] = useState<Client | null>(null);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, recId]);

  async function loadAll() {
    setLoading(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.push('/login');
      return;
    }

    if (getAccountType(user) !== 'broker') {
      router.push('/profile');
      return;
    }

    setUser(user);

    // Sidebar agency name
    const { data: brokerData } = await supabase
      .from('brokers')
      .select('agencies(name)')
      .eq('user_id', user.id)
      .single();

    if (brokerData?.agencies) {
      setAgencyName((brokerData.agencies as any).name || 'Your Agency');
    }

    // Load client (RLS will block if not in broker's agency)
    const { data: clientData, error: clientErr } = await supabase
      .from('clients')
      .select('id, first_name, last_name, employer_name, member_count, state')
      .eq('id', clientId)
      .single();

    if (clientErr || !clientData) {
      setError('Client not found or you do not have access.');
      setLoading(false);
      return;
    }
    setClient(clientData as Client);

    // Load the recommendation
    const { data: recData, error: recErr } = await supabase
      .from('recommendations')
      .select('*')
      .eq('id', recId)
      .single();

    if (recErr || !recData) {
      setError('Recommendation not found.');
      setLoading(false);
      return;
    }

    // Sanity check: rec must belong to this client
    if (recData.client_id !== clientId) {
      setError('This recommendation does not belong to this client.');
      setLoading(false);
      return;
    }

    setRec(recData as Recommendation);
    // Auto-expand the top plan for first impression
    if (Array.isArray(recData.plans) && recData.plans.length > 0) {
      setExpandedPlanId(recData.plans[0].id);
    }
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }

  function fmtMoney(n: number | null | undefined): string {
    if (n === null || n === undefined) return '—';
    return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#faf7f2' }}>
        <BrokerSidebar
          active="clients"
          firstName={user?.user_metadata?.first_name || ''}
          lastName={user?.user_metadata?.last_name || ''}
          agencyName={agencyName}
          onLogout={handleLogout}
        />
        <div style={{ flex: 1, padding: '40px', fontFamily: 'Figtree, sans-serif' }}>
          Loading recommendation...
        </div>
      </div>
    );
  }

  if (error || !rec || !client) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#faf7f2' }}>
        <BrokerSidebar
          active="clients"
          firstName={user?.user_metadata?.first_name || ''}
          lastName={user?.user_metadata?.last_name || ''}
          agencyName={agencyName}
          onLogout={handleLogout}
        />
        <div style={{ flex: 1, padding: '40px', fontFamily: 'Figtree, sans-serif' }}>
          <h1 style={{ fontFamily: 'Playfair Display, serif', color: '#1e3a5f' }}>
            Couldn't load recommendation
          </h1>
          <p style={{ color: '#3a4d68' }}>{error || 'Unknown error.'}</p>
          <Link href={`/broker/clients/${clientId}`} style={{ color: '#7a9b76', fontWeight: 600 }}>
            ← Back to client
          </Link>
        </div>
      </div>
    );
  }

  const plans = Array.isArray(rec.plans) ? rec.plans : [];
  const topPlan = plans[0];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#faf7f2' }}>
      <BrokerSidebar
        active="clients"
        firstName={user?.user_metadata?.first_name || ''}
        lastName={user?.user_metadata?.last_name || ''}
        agencyName={agencyName}
        onLogout={handleLogout}
      />

      <div style={{ flex: 1, padding: '40px', fontFamily: 'Figtree, sans-serif', maxWidth: '1100px' }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: '20px' }}>
          <Link
            href={`/broker/clients/${client.id}`}
            style={{ color: '#5b7a99', fontSize: '14px', textDecoration: 'none' }}
          >
            ← Back to {client.first_name} {client.last_name}
          </Link>
        </div>

        {/* Header */}
        <div style={{
          background: 'white',
          border: '1px solid #eef1f4',
          borderRadius: '12px',
          padding: '28px',
          marginBottom: '24px',
        }}>
          <div style={{
            fontSize: '12px',
            color: '#7a9b76',
            fontWeight: 700,
            letterSpacing: '0.5px',
            marginBottom: '8px',
          }}>
            RECOMMENDATION FOR
          </div>
          <h1 style={{
            fontFamily: 'Playfair Display, serif',
            fontSize: '32px',
            color: '#1e3a5f',
            margin: 0,
          }}>
            {client.first_name} {client.last_name}
          </h1>
          <div style={{ color: '#5b7a99', fontSize: '14px', marginTop: '6px' }}>
            {client.employer_name && <>{client.employer_name} · </>}
            Run on {formatDate(rec.created_at)}
          </div>

          {/* Run inputs summary */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
            marginTop: '20px',
            padding: '16px',
            background: '#faf7f2',
            borderRadius: '8px',
          }}>
            <div>
              <div style={inputLabel}>LOCATION</div>
              <div style={inputValue}>
                {rec.county_name || '—'}, {rec.state || ''} {rec.zip_code || ''}
              </div>
            </div>
            <div>
              <div style={inputLabel}>HOUSEHOLD</div>
              <div style={inputValue}>
                {rec.household_size || 1} {(rec.household_size || 1) === 1 ? 'person' : 'people'}
              </div>
            </div>
            <div>
              <div style={inputLabel}>INCOME</div>
              <div style={inputValue}>
                {rec.annual_income ? `$${rec.annual_income.toLocaleString()}` : '—'}/yr
              </div>
            </div>
            <div>
              <div style={inputLabel}>AGES</div>
              <div style={inputValue}>
                {Array.isArray(rec.ages) && rec.ages.length > 0 ? rec.ages.join(', ') : '—'}
              </div>
            </div>
            <div>
              <div style={inputLabel}>TOBACCO</div>
              <div style={inputValue}>{rec.uses_tobacco ? 'Yes' : 'No'}</div>
            </div>
            <div>
              <div style={inputLabel}>PLANS CONSIDERED</div>
              <div style={inputValue}>{rec.total_plans_available || 0} from CMS</div>
            </div>
          </div>
        </div>

        {/* Overall Advice */}
        {rec.overall_advice && (
          <div style={{
            background: 'linear-gradient(135deg, #f4f8f0 0%, #faf7f2 100%)',
            border: '1px solid #d8e2d4',
            borderRadius: '12px',
            padding: '24px',
            marginBottom: '24px',
          }}>
            <h3 style={{
              fontFamily: 'Playfair Display, serif',
              fontSize: '18px',
              color: '#1e3a5f',
              marginTop: 0,
              marginBottom: '12px',
            }}>
              Advisor Summary
            </h3>
            <div style={{ color: '#3a4d68', fontSize: '15px', lineHeight: '1.6' }}>
              {rec.overall_advice}
            </div>
          </div>
        )}

        {/* Top Pick Card */}
        {topPlan && (
          <div style={{
            background: 'white',
            border: '2px solid #7a9b76',
            borderRadius: '12px',
            padding: '28px',
            marginBottom: '24px',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute',
              top: '-12px',
              left: '24px',
              background: '#7a9b76',
              color: 'white',
              padding: '4px 12px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.5px',
            }}>
              ⭐ TOP MATCH
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ flex: 1, minWidth: '300px' }}>
                <h2 style={{
                  fontFamily: 'Playfair Display, serif',
                  fontSize: '24px',
                  color: '#1e3a5f',
                  margin: 0,
                }}>
                  {topPlan.name}
                </h2>
                <div style={{ color: '#5b7a99', fontSize: '14px', marginTop: '4px' }}>
                  {topPlan.issuer} · {topPlan.metalLevel} · {topPlan.type}
                  {topPlan.hsaEligible && <> · HSA-eligible</>}
                </div>
                <div style={{
                  fontSize: '15px',
                  color: '#3a4d68',
                  marginTop: '12px',
                  fontStyle: 'italic',
                }}>
                  "{topPlan.summary}"
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontSize: '32px',
                  fontFamily: 'Playfair Display, serif',
                  color: '#1e3a5f',
                  fontWeight: 600,
                }}>
                  {fmtMoney(topPlan.premiumWithCredit ?? topPlan.premium)}
                  <span style={{ fontSize: '14px', color: '#888', fontWeight: 400 }}>/mo</span>
                </div>
                <div style={{ fontSize: '12px', color: '#7a9b76', fontWeight: 600 }}>
                  Match score: {topPlan.matchScore}/100
                </div>
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: '12px',
              marginTop: '20px',
              paddingTop: '20px',
              borderTop: '1px solid #eef1f4',
            }}>
              <div>
                <div style={inputLabel}>DEDUCTIBLE</div>
                <div style={inputValue}>{fmtMoney(topPlan.deductible)}</div>
              </div>
              <div>
                <div style={inputLabel}>MAX OUT OF POCKET</div>
                <div style={inputValue}>{fmtMoney(topPlan.maxOutOfPocket)}</div>
              </div>
              <div>
                <div style={inputLabel}>FULL PREMIUM</div>
                <div style={inputValue}>{fmtMoney(topPlan.premium)}/mo</div>
              </div>
            </div>

            {topPlan.claimsInsight && (
              <div style={{
                marginTop: '16px',
                padding: '12px',
                background: '#fff8e8',
                borderRadius: '6px',
                fontSize: '13px',
                color: '#7a6500',
              }}>
                💡 <strong>Claims insight:</strong> {topPlan.claimsInsight}
              </div>
            )}
          </div>
        )}

        {/* Full ranking */}
        <h3 style={{
          fontFamily: 'Playfair Display, serif',
          fontSize: '20px',
          color: '#1e3a5f',
          marginTop: '32px',
          marginBottom: '16px',
        }}>
          Full Ranking ({plans.length} plans)
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {plans.map((plan) => {
            const expanded = expandedPlanId === plan.id;
            return (
              <div
                key={plan.id}
                style={{
                  background: 'white',
                  border: '1px solid #eef1f4',
                  borderRadius: '12px',
                  padding: '20px',
                }}
              >
                <div
                  onClick={() => setExpandedPlanId(expanded ? null : plan.id)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    gap: '16px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: '280px' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: plan.rank === 1 ? '#7a9b76' : '#eef1f4',
                      color: plan.rank === 1 ? 'white' : '#5b7a99',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}>
                      #{plan.rank}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '15px',
                        fontWeight: 600,
                        color: '#1e3a5f',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {plan.name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#5b7a99', marginTop: '2px' }}>
                        {plan.issuer} · {plan.metalLevel}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '16px', fontWeight: 600, color: '#1e3a5f' }}>
                        {fmtMoney(plan.premiumWithCredit ?? plan.premium)}/mo
                      </div>
                      <div style={{ fontSize: '11px', color: '#7a9b76', fontWeight: 600 }}>
                        {plan.matchScore}/100
                      </div>
                    </div>
                    <div style={{ color: '#5b7a99', fontSize: '14px' }}>
                      {expanded ? '▲' : '▼'}
                    </div>
                  </div>
                </div>

                {expanded && (
                  <div style={{
                    marginTop: '20px',
                    paddingTop: '20px',
                    borderTop: '1px solid #eef1f4',
                  }}>
                    <div style={{ color: '#3a4d68', fontSize: '14px', marginBottom: '16px', fontStyle: 'italic' }}>
                      "{plan.summary}"
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                      gap: '12px',
                      marginBottom: '16px',
                    }}>
                      <div>
                        <div style={inputLabel}>DEDUCTIBLE</div>
                        <div style={inputValue}>{fmtMoney(plan.deductible)}</div>
                      </div>
                      <div>
                        <div style={inputLabel}>MAX OUT OF POCKET</div>
                        <div style={inputValue}>{fmtMoney(plan.maxOutOfPocket)}</div>
                      </div>
                      <div>
                        <div style={inputLabel}>FULL PREMIUM</div>
                        <div style={inputValue}>{fmtMoney(plan.premium)}/mo</div>
                      </div>
                      <div>
                        <div style={inputLabel}>HSA</div>
                        <div style={inputValue}>{plan.hsaEligible ? 'Yes' : 'No'}</div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      <div>
                        <div style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#5a7857',
                          marginBottom: '8px',
                          letterSpacing: '0.5px',
                        }}>
                          PROS
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '18px', color: '#3a4d68', fontSize: '13px', lineHeight: '1.6' }}>
                          {(plan.pros || []).map((p, i) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#a44',
                          marginBottom: '8px',
                          letterSpacing: '0.5px',
                        }}>
                          CONS
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '18px', color: '#3a4d68', fontSize: '13px', lineHeight: '1.6' }}>
                          {(plan.cons || []).map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {plan.claimsInsight && (
                      <div style={{
                        marginTop: '16px',
                        padding: '12px',
                        background: '#fff8e8',
                        borderRadius: '6px',
                        fontSize: '13px',
                        color: '#7a6500',
                      }}>
                        💡 <strong>Claims insight:</strong> {plan.claimsInsight}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: '32px', textAlign: 'center' }}>
          <Link
            href={`/broker/clients/${client.id}`}
            style={{
              color: '#5b7a99',
              fontSize: '14px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            ← Back to {client.first_name}'s profile
          </Link>
        </div>
      </div>
    </div>
  );
}

const inputLabel: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 700,
  color: '#888',
  letterSpacing: '0.5px',
  marginBottom: '4px',
};

const inputValue: React.CSSProperties = {
  fontSize: '14px',
  color: '#1e3a5f',
  fontWeight: 600,
};