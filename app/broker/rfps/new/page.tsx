'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../supabase';
import BrokerSidebar from '../../../components/BrokerSidebar';
import { getAccountType } from '../../../lib/account';
import RFPWizard from './wizard';

type StartMode = 'chooser' | 'from-spd' | 'from-scratch';

export default function NewRFPPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [agencyName, setAgencyName] = useState('Your Agency');
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [brokerId, setBrokerId] = useState<string | null>(null);
  const [mode, setMode] = useState<StartMode>('chooser');

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
      .select('id, agency_id, agencies(name)')
      .eq('user_id', user.id)
      .single();

    if (brokerData) {
      setBrokerId(brokerData.id);
      setAgencyId(brokerData.agency_id);
      if (brokerData.agencies) {
        setAgencyName((brokerData.agencies as any).name || 'Your Agency');
      }
    }
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
          Loading...
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
        {mode === 'chooser' ? (
          <ChooserView
            onPick={(m) => setMode(m)}
            onCancel={() => router.push('/broker/rfps')}
          />
        ) : (
          <RFPWizard
            startMode={mode}
            user={user}
            agencyId={agencyId}
            brokerId={brokerId}
            onCancel={() => setMode('chooser')}
            onExit={() => router.push('/broker/rfps')}
          />
        )}
      </div>
    </div>
  );
}

function ChooserView({
  onPick,
  onCancel,
}: {
  onPick: (m: 'from-spd' | 'from-scratch') => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 32 }}>
        <button
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#3a4d68',
            cursor: 'pointer',
            fontSize: 14,
            padding: 0,
            marginBottom: 12,
            fontFamily: 'Figtree, sans-serif',
          }}
        >
          ← Back to RFPs
        </button>
        <h1
          style={{
            fontFamily: 'Playfair Display, serif',
            fontSize: 36,
            color: '#1e3a5f',
            margin: 0,
          }}
        >
          New RFP
        </h1>
        <p style={{ color: '#3a4d68', marginTop: 6, fontSize: 15 }}>
          How do you want to start?
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 20,
        }}
      >
        <ChoiceCard
          title="Start from an SPD"
          subtitle="Upload a Summary Plan Description and we'll extract the plan design with AI. Best for renewals."
          badge="Recommended"
          onClick={() => onPick('from-spd')}
        />
        <ChoiceCard
          title="Start from scratch"
          subtitle="Build the RFP manually. Best for new business or when no SPD is available."
          onClick={() => onPick('from-scratch')}
        />
      </div>
    </div>
  );
}

function ChoiceCard({
  title,
  subtitle,
  badge,
  onClick,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'white',
        border: '1px solid #eef1f4',
        borderRadius: 12,
        padding: 28,
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'Figtree, sans-serif',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#7a9b76';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(30, 58, 95, 0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#eef1f4';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {badge && (
        <span
          style={{
            display: 'inline-block',
            background: '#e8f0e6',
            color: '#5a7857',
            fontSize: 11,
            fontWeight: 600,
            padding: '3px 10px',
            borderRadius: 12,
            marginBottom: 12,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {badge}
        </span>
      )}
      <h3
        style={{
          fontFamily: 'Playfair Display, serif',
          fontSize: 22,
          color: '#1e3a5f',
          margin: '0 0 8px 0',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          color: '#3a4d68',
          fontSize: 14,
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {subtitle}
      </p>
    </button>
  );
}