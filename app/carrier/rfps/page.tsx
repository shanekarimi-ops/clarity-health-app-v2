'use client';

import CarrierShell from '@/app/components/CarrierShell';

export default function CarrierRfpsPage() {
  return (
    <CarrierShell active="rfps">
      {(info) => (
        <div style={pageContainerStyle}>
          <div style={headerRowStyle}>
            <div>
              <h1 style={pageTitleStyle}>RFPs</h1>
              <p style={pageSubtitleStyle}>
                Quote requests sent to {info.carrier_name}
              </p>
            </div>
          </div>

          <div style={emptyStateCardStyle}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📥</div>
            <h2 style={emptyHeadingStyle}>RFP inbox coming soon</h2>
            <p style={emptyBodyStyle}>
              You&apos;re signed in as <strong style={{ color: '#1e3a5f' }}>{info.full_name || info.email}</strong>.
              <br />
              Your RFP inbox will show all quote requests sent to your carrier.
            </p>
            <p style={{ ...emptyBodyStyle, marginTop: '16px', fontSize: '13px', color: '#8a98a8' }}>
              We&apos;re building this out next. For now, this confirms your account is active and your sidebar navigation is wired up.
            </p>
          </div>
        </div>
      )}
    </CarrierShell>
  );
}

const pageContainerStyle: React.CSSProperties = {
  padding: '32px 40px',
  maxWidth: '1200px',
  margin: '0 auto',
  fontFamily: '"Figtree", -apple-system, BlinkMacSystemFont, sans-serif',
};

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  marginBottom: '24px',
};

const pageTitleStyle: React.CSSProperties = {
  fontFamily: '"Playfair Display", Georgia, serif',
  fontSize: '28px',
  fontWeight: 600,
  color: '#1e3a5f',
  margin: '0 0 4px 0',
};

const pageSubtitleStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#5a6c7d',
  margin: 0,
};

const emptyStateCardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  padding: '48px 32px',
  textAlign: 'center',
  border: '1px dashed #e8e2d4',
};

const emptyHeadingStyle: React.CSSProperties = {
  fontFamily: '"Playfair Display", Georgia, serif',
  fontSize: '20px',
  fontWeight: 600,
  color: '#1e3a5f',
  margin: '0 0 8px 0',
};

const emptyBodyStyle: React.CSSProperties = {
  fontSize: '15px',
  color: '#5a6c7d',
  lineHeight: 1.6,
  margin: 0,
};