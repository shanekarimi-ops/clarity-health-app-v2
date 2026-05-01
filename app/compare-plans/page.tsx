'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../supabase';
import Sidebar from '../components/Sidebar';

export default function ComparePlansPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);
      setLoading(false);
    }
    loadUser();
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

  // Sample placeholder plans
  const samplePlans = [
    {
      name: 'Bronze HMO',
      carrier: 'BlueShield',
      premium: '$285/mo',
      deductible: '$6,500',
      outOfPocket: '$8,700',
      network: 'Regional',
      mentalHealth: 'Limited',
      dental: 'Add-on',
      highlight: false,
    },
    {
      name: 'Silver PPO',
      carrier: 'Aetna',
      premium: '$420/mo',
      deductible: '$3,200',
      outOfPocket: '$7,000',
      network: 'Nationwide',
      mentalHealth: 'Included',
      dental: 'Included',
      highlight: true,
    },
    {
      name: 'Gold PPO',
      carrier: 'United',
      premium: '$612/mo',
      deductible: '$1,500',
      outOfPocket: '$5,000',
      network: 'Nationwide',
      mentalHealth: 'Included',
      dental: 'Included',
      highlight: false,
    },
  ];

  const rows = [
    { label: 'Carrier', key: 'carrier' },
    { label: 'Monthly Premium', key: 'premium' },
    { label: 'Deductible', key: 'deductible' },
    { label: 'Out-of-Pocket Max', key: 'outOfPocket' },
    { label: 'Network', key: 'network' },
    { label: 'Mental Health', key: 'mentalHealth' },
    { label: 'Dental', key: 'dental' },
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
            <div className="dash-date">Side-by-side comparison of insurance plans.</div>
          </div>
        </div>

        {/* AI engine notice */}
        <div
          style={{
            background: '#eef1f4',
            border: '1px solid #5b7a99',
            color: '#1e3a5f',
            padding: '14px 18px',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            fontSize: '14px',
          }}
        >
          🤖 <strong>Sample comparison shown below.</strong> Once our AI engine launches, this view will populate with your top-ranked plans based on your claims and priorities.
        </div>

        {/* Comparison Table */}
        <div className="dash-card" style={{ marginBottom: '1.5rem', overflowX: 'auto' }}>
          <div className="dash-card-header">
            <div className="dash-card-title">Plan comparison</div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '14px 16px',
                    borderBottom: '2px solid #eef1f4',
                    color: '#3a4d68',
                    fontSize: '13px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Feature
                </th>
                {samplePlans.map((plan, idx) => (
                  <th
                    key={idx}
                    style={{
                      textAlign: 'center',
                      padding: '14px 16px',
                      borderBottom: '2px solid #eef1f4',
                      background: plan.highlight ? '#faf7f2' : 'transparent',
                      position: 'relative',
                    }}
                  >
                    {plan.highlight && (
                      <div
                        style={{
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
                        }}
                      >
                        BEST FIT
                      </div>
                    )}
                    <div
                      style={{
                        fontFamily: 'Playfair Display, serif',
                        fontSize: '18px',
                        color: '#1e3a5f',
                        fontWeight: 600,
                      }}
                    >
                      {plan.name}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ridx) => (
                <tr key={ridx}>
                  <td
                    style={{
                      padding: '14px 16px',
                      borderBottom: '1px solid #eef1f4',
                      color: '#3a4d68',
                      fontSize: '14px',
                      fontWeight: 500,
                    }}
                  >
                    {row.label}
                  </td>
                  {samplePlans.map((plan, pidx) => (
                    <td
                      key={pidx}
                      style={{
                        padding: '14px 16px',
                        borderBottom: '1px solid #eef1f4',
                        textAlign: 'center',
                        background: plan.highlight ? '#faf7f2' : 'transparent',
                        color: '#1e3a5f',
                        fontSize: '14px',
                      }}
                    >
                      {(plan as any)[row.key]}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td style={{ padding: '14px 16px' }}></td>
                {samplePlans.map((plan, pidx) => (
                  <td
                    key={pidx}
                    style={{
                      padding: '14px 16px',
                      textAlign: 'center',
                      background: plan.highlight ? '#faf7f2' : 'transparent',
                    }}
                  >
                    <button
                      disabled
                      style={{
                        padding: '8px 16px',
                        background: plan.highlight ? '#7a9b76' : '#5b7a99',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        opacity: 0.5,
                        cursor: 'not-allowed',
                        fontFamily: 'inherit',
                      }}
                    >
                      Select (soon)
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div
          style={{
            textAlign: 'center',
            color: '#3a4d68',
            fontSize: '13px',
            opacity: 0.7,
            marginBottom: '1.5rem',
          }}
        >
          Sample data shown for illustration. Real plans will appear when the AI engine launches.
        </div>
      </main>
    </div>
  );
}