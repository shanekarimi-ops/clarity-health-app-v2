'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../supabase';
import Sidebar from '../components/Sidebar';

export default function BillingPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showUpgradeAlert, setShowUpgradeAlert] = useState(false);

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

  function handleUpgradeClick() {
    setShowUpgradeAlert(true);
    setTimeout(() => setShowUpgradeAlert(false), 4000);
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

  // Role-based plan info
  const isBroker = role === 'Broker';
  const isHR = role === 'HR';
  const currentPlan = isBroker ? 'Broker Pro' : isHR ? 'HR Team' : 'Free';
  const currentPrice = isBroker ? '$299/mo' : isHR ? '$0 (Beta)' : '$0';
  const planDescription = isBroker
    ? 'Full access to AI plan recommendations for your clients.'
    : isHR
    ? 'Manage benefits for your team — currently in free beta.'
    : 'Personal benefits exploration with limited features.';

  return (
    <div className="dash-layout">
      <Sidebar
        active="billing"
        firstName={firstName}
        lastName={lastName}
        role={role}
        onLogout={handleLogout}
      />

      <main className="dash-main">
        <div className="dash-header">
          <div>
            <div className="dash-greeting">Billing</div>
            <div className="dash-date">Manage your subscription and payment details.</div>
          </div>
        </div>

        {showUpgradeAlert && (
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
            💡 Upgrades are coming soon! We&apos;ll notify you when paid plans launch.
          </div>
        )}

        {/* Current Plan */}
        <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
          <div className="dash-card-header">
            <div className="dash-card-title">Current Plan</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '24px', color: '#1e3a5f', marginBottom: '6px' }}>
                {currentPlan}
              </div>
              <p style={{ color: '#3a4d68', margin: '0 0 12px 0', fontSize: '14px' }}>
                {planDescription}
              </p>
              <span
                style={{
                  background: '#7a9b76',
                  color: 'white',
                  display: 'inline-block',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                ✓ Active
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '28px', fontWeight: 600, color: '#1e3a5f', fontFamily: 'Playfair Display, serif' }}>
                {currentPrice}
              </div>
            </div>
          </div>
        </div>

        {/* Upgrade Options — only shown to non-Brokers */}
        {!isBroker && (
          <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
            <div className="dash-card-header">
              <div className="dash-card-title">Upgrade your plan</div>
            </div>
            <p style={{ color: '#6b7785', fontSize: '0.9rem', margin: '0 0 1.25rem 0' }}>
              Unlock AI-powered recommendations and advanced features.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              {/* Individual Pro */}
              <div style={{ border: '1px solid #eef1f4', borderRadius: '10px', padding: '20px' }}>
                <div style={{ fontSize: '14px', color: '#3a4d68', marginBottom: '4px' }}>Individual Pro</div>
                <div style={{ fontSize: '24px', fontWeight: 600, color: '#1e3a5f', fontFamily: 'Playfair Display, serif' }}>
                  $19<span style={{ fontSize: '14px', fontWeight: 400, color: '#3a4d68' }}>/mo</span>
                </div>
                <ul style={{ fontSize: '13px', color: '#3a4d68', paddingLeft: '18px', marginTop: '12px', marginBottom: '16px', lineHeight: '1.7' }}>
                  <li>AI plan recommendations</li>
                  <li>Unlimited claims uploads</li>
                  <li>Priority support</li>
                </ul>
                <button
                  onClick={handleUpgradeClick}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    background: '#5b7a99',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                  }}
                >
                  Upgrade
                </button>
              </div>

              {/* Broker Pro */}
              <div style={{ border: '2px solid #7a9b76', borderRadius: '10px', padding: '20px', position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    top: '-10px',
                    right: '16px',
                    background: '#7a9b76',
                    color: 'white',
                    padding: '2px 10px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}
                >
                  POPULAR
                </div>
                <div style={{ fontSize: '14px', color: '#3a4d68', marginBottom: '4px' }}>Broker Pro</div>
                <div style={{ fontSize: '24px', fontWeight: 600, color: '#1e3a5f', fontFamily: 'Playfair Display, serif' }}>
                  $299<span style={{ fontSize: '14px', fontWeight: 400, color: '#3a4d68' }}>/mo</span>
                </div>
                <ul style={{ fontSize: '13px', color: '#3a4d68', paddingLeft: '18px', marginTop: '12px', marginBottom: '16px', lineHeight: '1.7' }}>
                  <li>Everything in Pro</li>
                  <li>Manage unlimited clients</li>
                  <li>White-label reports</li>
                </ul>
                <button
                  onClick={handleUpgradeClick}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    background: '#7a9b76',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                  }}
                >
                  Upgrade
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Payment Method */}
        <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
          <div className="dash-card-header">
            <div className="dash-card-title">Payment method</div>
          </div>
          <div
            style={{
              background: '#faf7f2',
              border: '1px dashed #5b7a99',
              borderRadius: '8px',
              padding: '24px',
              textAlign: 'center',
              color: '#3a4d68',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>💳</div>
            <p style={{ margin: 0, fontSize: '14px' }}>No payment method on file</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', opacity: 0.7 }}>
              You&apos;ll add a card when you upgrade to a paid plan.
            </p>
          </div>
        </div>

        {/* Billing History */}
        <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
          <div className="dash-card-header">
            <div className="dash-card-title">Billing history</div>
          </div>
          <div style={{ padding: '24px', textAlign: 'center', color: '#3a4d68', fontSize: '14px' }}>
            <p style={{ margin: 0 }}>No invoices yet</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', opacity: 0.7 }}>
              Your payment history will appear here.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}