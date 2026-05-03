'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';
import BrokerSidebar from '../../components/BrokerSidebar';

export default function BrokerBillingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agencyName, setAgencyName] = useState('');

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    const meta = user.user_metadata || {};
    setFirstName(meta.first_name || '');
    setLastName(meta.last_name || '');

    const { data: brokerRow } = await supabase
      .from('brokers')
      .select('agency_id, agencies(name)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (brokerRow?.agencies) {
      const agency: any = Array.isArray(brokerRow.agencies)
        ? brokerRow.agencies[0]
        : brokerRow.agencies;
      setAgencyName(agency?.name || '');
    }

    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (loading) {
    return (
      <div style={{ padding: 40, color: '#1e3a5f', fontFamily: 'Figtree, sans-serif' }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="dash-shell">
      <BrokerSidebar
        active="billing"
        firstName={firstName}
        lastName={lastName}
        agencyName={agencyName}
        onLogout={handleLogout}
      />

      <main className="dash-main">
        <div style={headerRow}>
          <div>
            <h1 style={pageTitle}>Billing</h1>
            <p style={pageSubtitle}>
              Manage your Clarity Health subscription, payment method, and invoices
            </p>
          </div>
        </div>

        <div style={comingSoonBanner}>
          <span style={{ fontSize: 20, marginRight: 10 }}>🚧</span>
          <strong>Coming in Session 25</strong>
          <span style={{ marginLeft: 10, color: '#3a4d68' }}>
            — Stripe-powered subscription billing, invoice history, payment method management, plan upgrades
          </span>
        </div>

        <div style={trialBanner}>
          <div>
            <div style={trialLabel}>Current Plan</div>
            <div style={trialValue}>Beta Access</div>
            <div style={trialNote}>You're an early access user — billing isn't active yet</div>
          </div>
          <button style={primaryBtnDisabled} disabled>
            Upgrade to Pro
          </button>
        </div>

        <div style={planGrid}>
          <div style={planCard}>
            <div style={planHeader}>
              <div style={planName}>Starter</div>
              <div style={planPrice}>
                <span style={priceAmount}>$0</span>
                <span style={pricePeriod}>/month</span>
              </div>
            </div>
            <ul style={planFeatures}>
              <li>Up to 5 clients</li>
              <li>Manual claim uploads</li>
              <li>Basic recommendations</li>
              <li>1 broker seat</li>
              <li>Email support</li>
            </ul>
            <button style={secondaryBtnDisabled} disabled>Current Plan</button>
          </div>

          <div style={{ ...planCard, ...planCardFeatured }}>
            <div style={popularBadge}>Most Popular</div>
            <div style={planHeader}>
              <div style={planName}>Broker Pro</div>
              <div style={planPrice}>
                <span style={priceAmount}>$299</span>
                <span style={pricePeriod}>/month</span>
              </div>
            </div>
            <ul style={planFeatures}>
              <li>Unlimited clients</li>
              <li>AI claim parsing</li>
              <li>AI-ranked recommendations</li>
              <li>Up to 5 broker seats</li>
              <li>White-label PDFs</li>
              <li>Priority support</li>
              <li>API access</li>
            </ul>
            <button style={primaryBtnDisabled} disabled>Upgrade — $299/mo</button>
          </div>

          <div style={planCard}>
            <div style={planHeader}>
              <div style={planName}>Agency</div>
              <div style={planPrice}>
                <span style={priceAmount}>$799</span>
                <span style={pricePeriod}>/month</span>
              </div>
            </div>
            <ul style={planFeatures}>
              <li>Everything in Pro</li>
              <li>Unlimited broker seats</li>
              <li>Custom branding + domain</li>
              <li>Dedicated success manager</li>
              <li>SOC 2 + HIPAA BAA</li>
              <li>Custom integrations</li>
              <li>SLA guarantees</li>
            </ul>
            <button style={secondaryBtnDisabled} disabled>Contact Sales</button>
          </div>
        </div>

        <div style={sectionTitle}>Payment Method</div>
        <div style={paymentCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={cardIcon}>💳</div>
            <div>
              <div style={{ fontWeight: 600, color: '#1e3a5f' }}>No payment method on file</div>
              <div style={{ fontSize: 13, color: '#7a8a9b' }}>Add a card when you're ready to upgrade</div>
            </div>
          </div>
          <button style={secondaryBtnDisabled} disabled>+ Add Payment Method</button>
        </div>

        <div style={sectionTitle}>Invoice History</div>
        <div style={emptyCard}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
          <div style={{ fontWeight: 600, color: '#1e3a5f', marginBottom: 4 }}>No invoices yet</div>
          <div style={{ fontSize: 13, color: '#7a8a9b' }}>
            Once you upgrade, your invoices will appear here
          </div>
        </div>

        <div style={featureListCard}>
          <h3 style={featureListTitle}>What you'll be able to do:</h3>
          <ul style={featureList}>
            <li>Upgrade or downgrade plans with prorated billing</li>
            <li>Update payment method and billing address</li>
            <li>Download PDF invoices for accounting</li>
            <li>Add multiple cards and switch defaults</li>
            <li>Cancel anytime — keep access through end of paid period</li>
            <li>Pay annually for 2 months free</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

const headerRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  marginBottom: 24,
  flexWrap: 'wrap',
  gap: 16,
};

const pageTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 36,
  color: '#1e3a5f',
  margin: 0,
  marginBottom: 4,
};

const pageSubtitle: React.CSSProperties = {
  fontFamily: 'Figtree, sans-serif',
  color: '#3a4d68',
  margin: 0,
  fontSize: 15,
};

const primaryBtnDisabled: React.CSSProperties = {
  background: '#cbd5e0',
  color: '#fff',
  border: 'none',
  padding: '12px 22px',
  borderRadius: 8,
  fontFamily: 'Figtree, sans-serif',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'not-allowed',
  opacity: 0.7,
  width: '100%',
};

const secondaryBtnDisabled: React.CSSProperties = {
  background: '#fff',
  color: '#7a8a9b',
  border: '1px solid #e2e8f0',
  padding: '10px 16px',
  borderRadius: 6,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  cursor: 'not-allowed',
  width: '100%',
};

const comingSoonBanner: React.CSSProperties = {
  background: 'linear-gradient(135deg, #faf7f2 0%, #eef1f4 100%)',
  border: '1px solid #d4dae2',
  borderRadius: 10,
  padding: '14px 18px',
  marginBottom: 28,
  fontFamily: 'Figtree, sans-serif',
  color: '#1e3a5f',
  fontSize: 14,
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
};

const trialBanner: React.CSSProperties = {
  background: 'linear-gradient(135deg, #1e3a5f 0%, #3a4d68 100%)',
  borderRadius: 12,
  padding: '24px 28px',
  marginBottom: 32,
  fontFamily: 'Figtree, sans-serif',
  color: '#fff',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 16,
};

const trialLabel: React.CSSProperties = {
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  opacity: 0.8,
  marginBottom: 4,
};

const trialValue: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 28,
  fontWeight: 600,
  marginBottom: 6,
};

const trialNote: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.85,
};

const planGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 16,
  marginBottom: 32,
};

const planCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 24,
  fontFamily: 'Figtree, sans-serif',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
};

const planCardFeatured: React.CSSProperties = {
  border: '2px solid #7a9b76',
  boxShadow: '0 4px 16px rgba(122, 155, 118, 0.15)',
};

const popularBadge: React.CSSProperties = {
  position: 'absolute',
  top: -10,
  right: 20,
  background: '#7a9b76',
  color: '#fff',
  padding: '4px 12px',
  borderRadius: 12,
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const planHeader: React.CSSProperties = {
  marginBottom: 16,
  paddingBottom: 16,
  borderBottom: '1px solid #eef1f4',
};

const planName: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 22,
  color: '#1e3a5f',
  marginBottom: 8,
};

const planPrice: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 4,
};

const priceAmount: React.CSSProperties = {
  fontSize: 36,
  fontWeight: 700,
  color: '#1e3a5f',
  fontFamily: 'Playfair Display, serif',
};

const pricePeriod: React.CSSProperties = {
  fontSize: 14,
  color: '#7a8a9b',
};

const planFeatures: React.CSSProperties = {
  margin: '0 0 18px',
  paddingLeft: 20,
  color: '#3a4d68',
  fontSize: 13,
  lineHeight: 1.9,
  flex: 1,
};

const sectionTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 22,
  color: '#1e3a5f',
  marginBottom: 14,
  marginTop: 8,
};

const paymentCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 20,
  fontFamily: 'Figtree, sans-serif',
  marginBottom: 28,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 12,
};

const cardIcon: React.CSSProperties = {
  fontSize: 32,
};

const emptyCard: React.CSSProperties = {
  background: '#fff',
  border: '1px dashed #cbd5e0',
  borderRadius: 10,
  padding: '40px 20px',
  fontFamily: 'Figtree, sans-serif',
  textAlign: 'center',
  marginBottom: 28,
};

const featureListCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 24,
  fontFamily: 'Figtree, sans-serif',
};

const featureListTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  color: '#1e3a5f',
  fontSize: 20,
  margin: '0 0 14px',
};

const featureList: React.CSSProperties = {
  margin: 0,
  paddingLeft: 22,
  color: '#3a4d68',
  fontSize: 14,
  lineHeight: 1.9,
};