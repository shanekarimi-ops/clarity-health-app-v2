'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../supabase';
import Sidebar from '../components/Sidebar';

export default function MyPlansPage() {
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

        {/* Empty state — AI engine coming soon */}
        <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
          <div
            style={{
              padding: '60px 24px',
              textAlign: 'center',
              color: '#3a4d68',
            }}
          >
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>🤖</div>
            <h2
              style={{
                fontFamily: 'Playfair Display, serif',
                fontSize: '26px',
                color: '#1e3a5f',
                margin: '0 0 12px 0',
              }}
            >
              AI engine coming soon
            </h2>
            <p
              style={{
                fontSize: '15px',
                lineHeight: '1.7',
                maxWidth: '480px',
                margin: '0 auto 24px auto',
                color: '#3a4d68',
              }}
            >
              Once our recommendation engine launches, your top-ranked insurance plans will appear here — sorted by fit, projected cost, and your priorities.
            </p>

            <div
              style={{
                background: '#faf7f2',
                border: '1px solid #eef1f4',
                borderRadius: '10px',
                padding: '20px',
                maxWidth: '440px',
                margin: '0 auto',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  fontSize: '13px',
                  color: '#1e3a5f',
                  fontWeight: 600,
                  marginBottom: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Get ready
              </div>
              <ol
                style={{
                  fontSize: '14px',
                  color: '#3a4d68',
                  lineHeight: '1.8',
                  paddingLeft: '20px',
                  margin: 0,
                }}
              >
                <li>
                  Complete your{' '}
                  <Link href="/claims-profile" style={{ color: '#7a9b76', textDecoration: 'underline' }}>
                    health profile
                  </Link>
                </li>
                <li>
                  Upload your recent{' '}
                  <Link href="/uploaded-files" style={{ color: '#7a9b76', textDecoration: 'underline' }}>
                    claims
                  </Link>
                </li>
                <li>Set your priorities (deductible, network, etc.)</li>
              </ol>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}