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
    <div style={{ maxWidth: 900, margin: '0 auto', paddingTop: 40 }}>
      <button
        onClick={onCancel}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#3a4d68',
          cursor: 'pointer',
          fontSize: 14,
          padding: 0,
          marginBottom: 24,
          fontFamily: 'Figtree, sans-serif',
        }}
      >
        ← Back to RFPs
      </button>

      <h1
        style={{
          fontFamily: 'Playfair Display, serif',
          fontSize: 42,
          color: '#1e3a5f',
          margin: '0 0 8px 0',
          textAlign: 'center',
          fontWeight: 600,
        }}
      >
        Start a new RFP
      </h1>
      <p
        style={{
          color: '#3a4d68',
          fontSize: 16,
          textAlign: 'center',
          margin: '0 0 48px 0',
        }}
      >
        How would you like to begin?
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 24,
        }}
      >
        <ChoiceCard
          title="Start from an SPD"
          subtitle="Upload a Summary Plan Description and we'll extract the plan design with AI. Best for renewals."
          badge="Recommended"
          recommended
          icon="upload"
          onClick={() => onPick('from-spd')}
        />
        <ChoiceCard
          title="Start from scratch"
          subtitle="Build the RFP manually. Best for new business or when no SPD is available."
          icon="document"
          onClick={() => onPick('from-scratch')}
        />
      </div>

      <p
        style={{
          color: '#3a4d68',
          fontSize: 13,
          textAlign: 'center',
          margin: '32px 0 0 0',
        }}
      >
        You can switch between methods later — the wizard works the same either way.
      </p>
    </div>
  );
}

function ChoiceCard({
  title,
  subtitle,
  badge,
  recommended,
  icon,
  onClick,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  recommended?: boolean;
  icon: 'upload' | 'document';
  onClick: () => void;
}) {
  const borderColor = recommended ? '#7a9b76' : '#eef1f4';
  const iconBg = recommended ? '#e8f0e6' : '#faf7f2';
  const iconColor = recommended ? '#5a7857' : '#1e3a5f';

  return (
    <button
      onClick={onClick}
      style={{
        background: 'white',
        border: `2px solid ${borderColor}`,
        borderRadius: 16,
        padding: '40px 32px',
        textAlign: 'center',
        cursor: 'pointer',
        fontFamily: 'Figtree, sans-serif',
        position: 'relative',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 8px 20px rgba(30, 58, 95, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {badge && (
        <span
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: '#e8f0e6',
            color: '#5a7857',
            fontSize: 11,
            fontWeight: 500,
            padding: '4px 12px',
            borderRadius: 12,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {badge}
        </span>
      )}

      <div
        style={{
          width: 64,
          height: 64,
          background: iconBg,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
        }}
      >
        {icon === 'upload' ? (
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1={12} y1={3} x2={12} y2={15} />
          </svg>
        ) : (
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1={12} y1={18} x2={12} y2={12} />
            <line x1={9} y1={15} x2={15} y2={15} />
          </svg>
        )}
      </div>

      <h3
        style={{
          fontFamily: 'Playfair Display, serif',
          fontSize: 24,
          color: '#1e3a5f',
          margin: '0 0 12px 0',
          fontWeight: 600,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          color: '#3a4d68',
          fontSize: 14,
          margin: 0,
          lineHeight: 1.6,
        }}
      >
        {subtitle}
      </p>
    </button>
  );
}