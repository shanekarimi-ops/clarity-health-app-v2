'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';
import BrokerSidebar from '../../components/BrokerSidebar';

export default function CarriersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agencyName, setAgencyName] = useState('');

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push('/login');
        return;
      }
      const meta = sessionData.session.user.user_metadata || {};
      setFirstName(meta.first_name || '');
      setLastName(meta.last_name || '');

      const { data: brokerRow } = await supabase
        .from('brokers')
        .select('agency_id, agencies(name)')
        .eq('user_id', sessionData.session.user.id)
        .maybeSingle();
      if (brokerRow?.agencies) {
        setAgencyName((brokerRow.agencies as any).name || '');
      }

      setLoading(false);
    }
    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (loading) return <div style={{ padding: 40, color: '#1e3a5f' }}>Loading...</div>;

  return (
    <div className="dash-layout">
      <BrokerSidebar
        active="carriers"
        firstName={firstName}
        lastName={lastName}
        agencyName={agencyName}
        onLogout={handleLogout}
      />
      <main className="dash-main">
        <ComingSoonCard
          title="Carriers"
          tagline="Manage your agency's carrier relationships and rep contacts."
          phase="Phase 4 (S33–S34)"
          features={[
            'View all carriers your agency works with',
            'Manage carrier rep contacts: emails, phone, regions',
            'Track engagement: opens, downloads, response times',
            'See win/loss history per carrier across all your RFPs',
          ]}
        />
      </main>
    </div>
  );
}

function ComingSoonCard({
  title,
  tagline,
  phase,
  features,
}: {
  title: string;
  tagline: string;
  phase: string;
  features: string[];
}) {
  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: '900px' }}>
      <div style={{ fontSize: '0.8rem', color: '#7a8a9b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
        Broker · Directory
      </div>
      <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '2.25rem', color: '#1e3a5f', margin: 0, marginBottom: '0.5rem' }}>
        {title}
      </h1>
      <p style={{ color: '#3a4d68', fontSize: '1.05rem', marginBottom: '2rem' }}>{tagline}</p>

      <div style={{
        background: '#faf7f2',
        border: '1px solid #e8e0d0',
        borderRadius: '12px',
        padding: '2rem',
      }}>
        <div style={{
          display: 'inline-block',
          background: '#1e3a5f',
          color: '#faf7f2',
          fontSize: '0.7rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          padding: '0.3rem 0.7rem',
          borderRadius: '4px',
          marginBottom: '1.25rem',
        }}>
          Coming in {phase}
        </div>
        <div style={{ fontSize: '0.95rem', color: '#3a4d68', marginBottom: '1rem' }}>What you'll be able to do:</div>
        <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#3a4d68', fontSize: '0.92rem', lineHeight: 1.7 }}>
          {features.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      </div>
    </div>
  );
}