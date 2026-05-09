'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../supabase';
import BrokerSidebar from '../../../components/BrokerSidebar';
import { getAccountType } from '../../../lib/account';

type Rfp = {
  id: string;
  name: string;
  status: string;
  effective_date: string | null;
  employee_lives: number | null;
  current_plan_doc_url: string | null;
  created_at: string;
};

export default function RfpDetailPlaceholder() {
  const router = useRouter();
  const params = useParams();
  const rfpId = params?.id as string | undefined;

  const [bootLoading, setBootLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [agencyName, setAgencyName] = useState('Your Agency');

  const [rfp, setRfp] = useState<Rfp | null>(null);
  const [rfpLoading, setRfpLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (!rfpId || bootLoading) return;
    loadRfp();
  }, [rfpId, bootLoading]);

  async function bootstrap() {
    setBootLoading(true);
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

    if (brokerData?.agencies) {
      setAgencyName((brokerData.agencies as any).name || 'Your Agency');
    }

    setBootLoading(false);
  }

  async function loadRfp() {
    setRfpLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('rfps')
      .select('id, name, status, effective_date, employee_lives, current_plan_doc_url, created_at')
      .eq('id', rfpId)
      .maybeSingle();

    if (err) {
      setError(err.message);
      setRfpLoading(false);
      return;
    }
    setRfp(data);
    setRfpLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
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

      <div style={{ flex: 1, padding: 40, fontFamily: 'Figtree, sans-serif' }}>
        <div style={{ maxWidth: 800 }}>
          <a
            href="/broker/rfps"
            style={{
              color: '#3a4d68',
              fontSize: 14,
              textDecoration: 'none',
              fontFamily: 'Figtree, sans-serif',
              display: 'inline-block',
              marginBottom: 16,
            }}
          >
            ← All RFPs
          </a>

          <h1
            style={{
              fontFamily: 'Playfair Display, serif',
              fontSize: 32,
              color: '#1e3a5f',
              margin: '0 0 8px 0',
            }}
          >
            {rfp?.name || 'RFP'}
          </h1>

          {(bootLoading || rfpLoading) && (
            <div style={{ color: '#3a4d68', fontSize: 14 }}>Loading...</div>
          )}

          {!bootLoading && !rfpLoading && error && (
            <div
              style={{
                marginTop: 24,
                padding: 14,
                background: '#fde8e8',
                border: '1px solid #f5b7b7',
                borderRadius: 8,
                color: '#9b2c2c',
                fontSize: 14,
              }}
            >
              <strong>Couldn't load this RFP:</strong> {error}
            </div>
          )}

          {!bootLoading && !rfpLoading && !error && !rfp && (
            <div
              style={{
                marginTop: 24,
                padding: 24,
                background: 'white',
                border: '1px solid #eef1f4',
                borderRadius: 12,
                fontSize: 14,
                color: '#3a4d68',
              }}
            >
              RFP not found.
            </div>
          )}

          {!bootLoading && !rfpLoading && rfp && (
            <>
              <div
                style={{
                  display: 'inline-block',
                  background: '#e8f0e6',
                  color: '#5a7857',
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: 10,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 24,
                }}
              >
                {rfp.status}
              </div>

              <div
                style={{
                  background: 'white',
                  border: '1px solid #eef1f4',
                  borderRadius: 12,
                  padding: 32,
                  marginBottom: 24,
                }}
              >
                <h2
                  style={{
                    fontFamily: 'Playfair Display, serif',
                    fontSize: 18,
                    color: '#1e3a5f',
                    margin: '0 0 16px 0',
                  }}
                >
                  Saved as draft
                </h2>
                <p style={{ color: '#3a4d68', fontSize: 14, lineHeight: 1.6, marginTop: 0 }}>
                  Your RFP has been saved. The full detail view is coming in the next push — you'll be able to see the complete plan design, ancillary lines, and send to carriers from here.
                </p>

                <div
                  style={{
                    marginTop: 20,
                    paddingTop: 20,
                    borderTop: '1px solid #eef1f4',
                    fontSize: 13,
                    color: '#3a4d68',
                    lineHeight: 1.8,
                  }}
                >
                  <div>
                    <strong style={{ color: '#1e3a5f' }}>Effective:</strong>{' '}
                    {rfp.effective_date || '—'}
                  </div>
                  <div>
                    <strong style={{ color: '#1e3a5f' }}>Census:</strong>{' '}
                    {rfp.employee_lives ? `${rfp.employee_lives} members` : '—'}
                  </div>
                  <div>
                    <strong style={{ color: '#1e3a5f' }}>SPD:</strong>{' '}
                    {rfp.current_plan_doc_url ? 'Uploaded' : '— (none)'}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: '#7a8a9c' }}>
                    ID: {rfp.id}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}