'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '../supabase';

type AvailableProduct = 'individual' | 'broker' | 'carrier';

export default function SelectProductPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [available, setAvailable] = useState<AvailableProduct[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function loadAvailableProducts() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push('/login');
        return;
      }

      const userId = sessionData.session.user.id;

      // Find which products this user has access to.
      const products: AvailableProduct[] = [];

      // Always show individual (every user has the individual experience)
      products.push('individual');

      // Check brokers table
      const { data: brokerRow } = await supabase
        .from('brokers')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      if (brokerRow) products.push('broker');

      // Check carrier_users table
      const { data: carrierRow } = await supabase
        .from('carrier_users')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      if (carrierRow) products.push('carrier');

      setAvailable(products);
      setLoading(false);
    }

    loadAvailableProducts();
  }, [router]);

  async function chooseProduct(product: AvailableProduct) {
    setSaving(true);
    setErrorMsg('');

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      router.push('/login');
      return;
    }

    // Update profiles.active_product
    const { error } = await supabase
      .from('profiles')
      .update({ active_product: product })
      .eq('id', sessionData.session.user.id);

    if (error) {
      console.error('select-product update error', error);
      setSaving(false);
      setErrorMsg('Could not save your selection. Please try again.');
      return;
    }

    // Route to that product's dashboard
    if (product === 'broker') router.push('/broker/dashboard');
    else if (product === 'carrier') router.push('/carrier/dashboard');
    else router.push('/individual/profile');
  }

  if (loading) {
    return (
      <div className="auth-screen" style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{padding: '2rem', color: '#1e3a5f'}}>Loading...</div>
      </div>
    );
  }

  return (
    <div className="auth-screen" style={{flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '2rem'}}>
      <div style={{textAlign: 'center', marginBottom: '2.5rem'}}>
        <a href="/" className="logo-mark" style={{justifyContent: 'center', marginBottom: '1.5rem'}}>
          <Image src="/logo.png" alt="Clarity Health logo" width={42} height={42} />
          <span className="logo-text" style={{color: '#1e3a5f'}}>Clarity <em>Health</em></span>
        </a>
        <h1 style={{fontFamily: 'Playfair Display, serif', fontSize: '2rem', color: '#1e3a5f', marginBottom: '0.5rem'}}>
          Where would you like to go?
        </h1>
        <p style={{color: '#666', fontSize: '0.95rem'}}>
          You have access to multiple Clarity products. Choose where to start today.
        </p>
      </div>

      <div style={{display: 'flex', gap: '1.25rem', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '900px'}}>
        {available.includes('individual') && (
          <ProductCard
            title="Individual"
            description="View your plans, claims, and personalized recommendations."
            color="#7a9b76"
            onClick={() => chooseProduct('individual')}
            disabled={saving}
          />
        )}
        {available.includes('broker') && (
          <ProductCard
            title="Broker"
            description="Manage clients, run RFPs, compare quotes, and build presentations."
            color="#1e3a5f"
            onClick={() => chooseProduct('broker')}
            disabled={saving}
          />
        )}
        {available.includes('carrier') && (
          <ProductCard
            title="Carrier"
            description="View active RFPs and submit proposals for the brokers you work with."
            color="#8a6d3b"
            onClick={() => chooseProduct('carrier')}
            disabled={saving}
          />
        )}
      </div>

      {errorMsg && (
        <div style={{color: '#d95858', fontSize: '0.9rem', marginTop: '1.5rem'}}>{errorMsg}</div>
      )}

      <div style={{marginTop: '2rem', fontSize: '0.8rem', color: '#888'}}>
        You can switch later from the profile menu.
      </div>
    </div>
  );
}

function ProductCard({
  title,
  description,
  color,
  onClick,
  disabled,
}: {
  title: string;
  description: string;
  color: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '260px',
        padding: '2rem 1.5rem',
        background: '#faf7f2',
        border: `2px solid ${color}`,
        borderRadius: '12px',
        textAlign: 'left',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.08)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{
        fontFamily: 'Playfair Display, serif',
        fontSize: '1.4rem',
        color: color,
        marginBottom: '0.5rem',
        fontWeight: 600,
      }}>
        {title}
      </div>
      <div style={{
        fontSize: '0.85rem',
        color: '#555',
        lineHeight: 1.4,
      }}>
        {description}
      </div>
    </button>
  );
}