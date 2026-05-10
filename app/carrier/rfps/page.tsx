'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/supabase';

type CarrierUserInfo = {
  email: string;
  full_name: string | null;
  carrier_id: string;
  carrier_name: string;
};

export default function CarrierRfpsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<CarrierUserInfo | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.replace('/carrier/login');
        return;
      }

      // Fetch the carrier_user record + carrier name
      const { data, error: fetchError } = await supabase
        .from('carrier_users')
        .select('email, full_name, carrier_id, carriers(name)')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (fetchError || !data) {
        console.error('[carrier/rfps] fetch error:', fetchError);
        setError('Could not load your account. Please try logging in again.');
        setLoading(false);
        return;
      }

      const carrierName = (data.carriers as any)?.name ?? 'Unknown carrier';

      setInfo({
        email: data.email,
        full_name: data.full_name,
        carrier_id: data.carrier_id,
        carrier_name: carrierName,
      });
      setLoading(false);
    };

    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/carrier/login');
  };

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ color: '#5a6c7d', fontSize: '15px' }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={headingStyle}>Account error</h1>
          <p style={bodyStyle}>{error}</p>
          <button onClick={handleLogout} style={buttonStyle}>Back to login</button>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: '48px', marginBottom: '8px' }}>✓</div>
        <h1 style={headingStyle}>You&apos;re signed in</h1>
        <p style={bodyStyle}>
          Welcome, {info?.full_name || info?.email}. You&apos;re logged in as a representative of{' '}
          <strong style={{ color: '#1e3a5f' }}>{info?.carrier_name}</strong>.
        </p>
        <p style={{ ...bodyStyle, marginTop: '16px', fontSize: '13px', color: '#8a98a8' }}>
          Your RFP inbox is coming soon. For now, this confirms your account is active.
        </p>
        <button onClick={handleLogout} style={buttonStyle}>
          Log out
        </button>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#faf7f2',
  padding: '24px',
  fontFamily: '"Figtree", -apple-system, BlinkMacSystemFont, sans-serif',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  padding: '48px 40px',
  boxShadow: '0 4px 24px rgba(30, 58, 95, 0.08)',
  maxWidth: '480px',
  width: '100%',
  textAlign: 'center',
};

const headingStyle: React.CSSProperties = {
  fontFamily: '"Playfair Display", Georgia, serif',
  fontSize: '24px',
  fontWeight: 600,
  color: '#1e3a5f',
  margin: '16px 0 12px 0',
};

const bodyStyle: React.CSSProperties = {
  fontSize: '15px',
  color: '#5a6c7d',
  lineHeight: 1.6,
  margin: 0,
};

const buttonStyle: React.CSSProperties = {
  marginTop: '24px',
  padding: '10px 20px',
  backgroundColor: '#1e3a5f',
  color: '#ffffff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};