'use client';

import { useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/supabase';
import CarrierSidebar from './CarrierSidebar';

type CarrierUserInfo = {
  carrier_user_id: string;
  email: string;
  full_name: string | null;
  carrier_id: string;
  carrier_name: string;
  carrier_brand_color: string | null;
};

type CarrierShellProps = {
  active: 'rfps' | 'quotes' | 'settings';
  children: ReactNode | ((info: CarrierUserInfo) => ReactNode);
};

export default function CarrierShell({ active, children }: CarrierShellProps) {
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

      const { data, error: fetchError } = await supabase
        .from('carrier_users')
        .select('id, email, full_name, carrier_id, carriers(name, brand_color)')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (fetchError) {
        console.error('[CarrierShell] fetch error:', fetchError);
        setError('Could not load your account. Please try logging in again.');
        setLoading(false);
        return;
      }

      if (!data) {
        setError('No carrier account is linked to this user.');
        setLoading(false);
        return;
      }

      const carrier = (data.carriers as any) ?? {};
      setInfo({
        carrier_user_id: data.id,
        email: data.email,
        full_name: data.full_name,
        carrier_id: data.carrier_id,
        carrier_name: carrier.name ?? 'Unknown carrier',
        carrier_brand_color: carrier.brand_color ?? null,
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
      <div style={loadingPageStyle}>
        <div style={loadingTextStyle}>Loading…</div>
      </div>
    );
  }

  if (error || !info) {
    return (
      <div style={loadingPageStyle}>
        <div style={errorCardStyle}>
          <h1 style={errorHeadingStyle}>Account error</h1>
          <p style={errorBodyStyle}>{error || 'Unknown error.'}</p>
          <button onClick={handleLogout} style={errorButtonStyle}>
            Back to login
          </button>
        </div>
      </div>
    );
  }

  // Split full_name into first/last for the sidebar
  const nameParts = (info.full_name ?? info.email).trim().split(/\s+/);
  const firstName = nameParts[0] ?? '';
  const lastName = nameParts.slice(1).join(' ') || nameParts[0]?.charAt(1) || '';

  return (
    <div className="dash-layout">
      <CarrierSidebar
        active={active}
        firstName={firstName}
        lastName={lastName}
        carrierName={info.carrier_name}
        carrierBrandColor={info.carrier_brand_color}
        onLogout={handleLogout}
      />
      <main className="dash-main">
        {typeof children === 'function' ? children(info) : children}
      </main>
    </div>
  );
}

const loadingPageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#faf7f2',
  fontFamily: '"Figtree", -apple-system, BlinkMacSystemFont, sans-serif',
  padding: '24px',
};

const loadingTextStyle: React.CSSProperties = {
  color: '#5a6c7d',
  fontSize: '15px',
};

const errorCardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  padding: '48px 40px',
  boxShadow: '0 4px 24px rgba(30, 58, 95, 0.08)',
  maxWidth: '440px',
  width: '100%',
  textAlign: 'center',
};

const errorHeadingStyle: React.CSSProperties = {
  fontFamily: '"Playfair Display", Georgia, serif',
  fontSize: '24px',
  fontWeight: 600,
  color: '#1e3a5f',
  margin: '0 0 12px 0',
};

const errorBodyStyle: React.CSSProperties = {
  fontSize: '15px',
  color: '#5a6c7d',
  lineHeight: 1.6,
  margin: 0,
};

const errorButtonStyle: React.CSSProperties = {
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