'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';

type Status = 'loading' | 'no_token' | 'invalid' | 'expired' | 'success' | 'error';

function CarrierLoginInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setStatus('no_token');
      return;
    }

    const acceptInvite = async () => {
      try {
        const res = await fetch('/api/carrier/accept-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (data.code === 'EXPIRED') {
            setStatus('expired');
          } else if (data.code === 'INVALID_TOKEN' || res.status === 404) {
            setStatus('invalid');
          } else {
            setStatus('error');
            setErrorMessage(data.error || 'Something went wrong.');
          }
          return;
        }

        if (data.success && data.magicLinkUrl) {
          setStatus('success');
          // Brief delay so user sees confirmation, then redirect
          setTimeout(() => {
            window.location.href = data.magicLinkUrl;
          }, 800);
        } else {
          setStatus('error');
          setErrorMessage('Unexpected response from server.');
        }
      } catch (err) {
        console.error('[carrier-login] fetch error:', err);
        setStatus('error');
        setErrorMessage('Network error. Please try again.');
      }
    };

    acceptInvite();
  }, [searchParams]);

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={logoRowStyle}>
          <Image src="/logo.png" alt="Clarity Health" width={48} height={48} />
          <div style={logoTextStyle}>
            Clarity <em style={{ color: '#7a9b76' }}>Health</em>
          </div>
        </div>

        {status === 'loading' && (
          <>
            <div style={spinnerStyle} />
            <h1 style={headingStyle}>Activating your account…</h1>
            <p style={bodyStyle}>One moment while we sign you in.</p>
          </>
        )}

        {status === 'no_token' && (
          <>
            <div style={iconStyle}>🔗</div>
            <h1 style={headingStyle}>No invite link found</h1>
            <p style={bodyStyle}>
              This page requires a valid invite link. Please check the email from your broker and click the link there.
            </p>
          </>
        )}

        {status === 'invalid' && (
          <>
            <div style={iconStyle}>⚠️</div>
            <h1 style={headingStyle}>Invite link not valid</h1>
            <p style={bodyStyle}>
              This invite link is no longer valid. It may have already been used. If you need a new invitation, please contact the broker who sent it.
            </p>
          </>
        )}

        {status === 'expired' && (
          <>
            <div style={iconStyle}>⏱️</div>
            <h1 style={headingStyle}>Invite link expired</h1>
            <p style={bodyStyle}>
              This invitation has expired. Please ask the broker who sent it to resend you a new invite.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ ...iconStyle, color: '#7a9b76' }}>✓</div>
            <h1 style={headingStyle}>You&apos;re in!</h1>
            <p style={bodyStyle}>Redirecting you to your RFP inbox…</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={iconStyle}>⚠️</div>
            <h1 style={headingStyle}>Something went wrong</h1>
            <p style={bodyStyle}>{errorMessage || 'Please try again, or contact your broker.'}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function CarrierLoginPage() {
  return (
    <Suspense
      fallback={
        <div style={pageStyle}>
          <div style={cardStyle}>
            <div style={spinnerStyle} />
            <h1 style={headingStyle}>Loading…</h1>
          </div>
        </div>
      }
    >
      <CarrierLoginInner />
    </Suspense>
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
  maxWidth: '440px',
  width: '100%',
  textAlign: 'center',
};

const logoRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '12px',
  marginBottom: '32px',
};

const logoTextStyle: React.CSSProperties = {
  fontFamily: '"Playfair Display", Georgia, serif',
  fontSize: '24px',
  fontWeight: 600,
  color: '#1e3a5f',
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

const iconStyle: React.CSSProperties = {
  fontSize: '48px',
  marginBottom: '8px',
};

const spinnerStyle: React.CSSProperties = {
  width: '40px',
  height: '40px',
  margin: '0 auto 16px auto',
  border: '3px solid #e8e2d4',
  borderTopColor: '#1e3a5f',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
};