'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../supabase';
import BrokerSidebar from '../../components/BrokerSidebar';
import { getAccountType } from '../../lib/account';

type RFPRow = {
  id: string;
  name: string;
  plan_year: number | null;
  effective_date: string | null;
  status: string;
  created_at: string;
};

export default function RFPsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [agencyName, setAgencyName] = useState('Your Agency');
  const [rfps, setRfps] = useState<RFPRow[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
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

    const { data: brokerData } = await supabase
      .from('brokers')
      .select('agency_id, agencies(name)')
      .eq('user_id', user.id)
      .single();

    if (!brokerData) {
      setLoading(false);
      return;
    }

    if (brokerData.agencies) {
      setAgencyName((brokerData.agencies as any).name || 'Your Agency');
    }

    const { data: rfpData } = await supabase
      .from('rfps')
      .select('id, name, plan_year, effective_date, status, created_at')
      .eq('agency_id', brokerData.agency_id)
      .order('created_at', { ascending: false });

    setRfps(rfpData || []);
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#faf7f2' }}>
        <BrokerSidebar
          active="rfps"
          firstName={user?.user_metadata?.first_name || ''}
          lastName={user?.user_metadata?.last_name || ''}
          agencyName={agencyName}
          onLogout={handleLogout}
        />
        <div style={{ flex: 1, padding: '40px', fontFamily: 'Figtree, sans-serif' }}>
          Loading RFPs...
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#faf7f2' }}>
      <BrokerSidebar
        active="rfps"
        firstName={user?.user_metadata?.first_name || ''}
        lastName={user?.user_metadata?.last_name || ''}
        agencyName={agencyName}
        onLogout={handleLogout}
      />

      <div style={{ flex: 1, padding: '40px', fontFamily: 'Figtree, sans-serif' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: 'Playfair Display, serif',
                fontSize: 36,
                color: '#1e3a5f',
                margin: 0,
              }}
            >
              RFPs
            </h1>
            <p style={{ color: '#3a4d68', marginTop: 4 }}>
              {rfps.length} {rfps.length === 1 ? 'RFP' : 'RFPs'} in your agency
            </p>
          </div>

          <Link
            href="/broker/rfps/new"
            style={{
              background: '#7a9b76',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'Figtree, sans-serif',
              textDecoration: 'none',
            }}
          >
            + New RFP
          </Link>
        </div>

        {rfps.length === 0 ? (
          <div
            style={{
              background: 'white',
              border: '1px solid #eef1f4',
              borderRadius: 12,
              padding: '60px 40px',
              textAlign: 'center',
            }}
          >
            <h2
              style={{
                fontFamily: 'Playfair Display, serif',
                color: '#1e3a5f',
                fontSize: 24,
                marginBottom: 12,
              }}
            >
              No RFPs yet
            </h2>
            <p style={{ color: '#3a4d68', marginBottom: 24 }}>
              Create your first RFP. Upload an SPD and we'll extract the plan design with AI.
            </p>
            <Link
              href="/broker/rfps/new"
              style={{
                background: '#7a9b76',
                color: 'white',
                border: 'none',
                padding: '14px 28px',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'Figtree, sans-serif',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              + Create your first RFP
            </Link>
          </div>
        ) : (
          <div
            style={{
              background: 'white',
              border: '1px solid #eef1f4',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '3fr 1fr 1.5fr 1fr 1fr',
                padding: '14px 20px',
                background: '#faf7f2',
                borderBottom: '1px solid #eef1f4',
                fontSize: 13,
                fontWeight: 600,
                color: '#3a4d68',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              <div>RFP Name</div>
              <div>Plan Year</div>
              <div>Effective Date</div>
              <div>Status</div>
              <div>Created</div>
            </div>
            {rfps.map((rfp) => (
              <Link
                key={rfp.id}
                href={`/broker/rfps/${rfp.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '3fr 1fr 1.5fr 1fr 1fr',
                    padding: '16px 20px',
                    borderBottom: '1px solid #eef1f4',
                    fontSize: 14,
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#faf7f2')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                >
                  <div style={{ color: '#1e3a5f', fontWeight: 600 }}>{rfp.name}</div>
                  <div style={{ color: '#3a4d68' }}>{rfp.plan_year || '—'}</div>
                  <div style={{ color: '#3a4d68' }}>
                    {rfp.effective_date
                      ? new Date(rfp.effective_date).toLocaleDateString()
                      : '—'}
                  </div>
                  <div>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 600,
                        background: rfp.status === 'draft' ? '#f5f5f5' : '#e8f0e6',
                        color: rfp.status === 'draft' ? '#666' : '#5a7857',
                      }}
                    >
                      {rfp.status}
                    </span>
                  </div>
                  <div style={{ color: '#3a4d68', fontSize: 13 }}>
                    {new Date(rfp.created_at).toLocaleDateString()}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}