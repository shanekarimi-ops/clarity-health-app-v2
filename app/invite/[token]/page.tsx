'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '../../supabase';

type InviteData = {
  id: string;
  agency_id: string;
  agency_name: string;
  invited_email: string;
  invited_role: 'admin' | 'broker';
};

export default function InviteAcceptPage() {
  const router = useRouter();
  const params = useParams();
  const token = params?.token as string;

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null);
  const [emailMismatch, setEmailMismatch] = useState(false);

  useEffect(() => {
    if (!token) return;
    loadInvite();
  }, [token]);

  async function loadInvite() {
    setLoading(true);
    setError('');

    const res = await fetch(`/api/team/accept-invite?token=${encodeURIComponent(token)}`);
    if (!res.ok) {
      const body = await res.json();
      setError(body.error || 'This invite is no longer valid.');
      setLoading(false);
      return;
    }

    const body = await res.json();
    setInvite(body.invite);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUser({ id: user.id, email: user.email || '' });
      if ((user.email || '').toLowerCase() !== body.invite.invited_email.toLowerCase()) {
        setEmailMismatch(true);
      }
    }

    setLoading(false);
  }

  async function handleAccept() {
    if (!invite || !currentUser) return;
    setAccepting(true);
    setError('');

    const res = await fetch('/api/team/accept-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        user_id: currentUser.id,
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error || 'Failed to accept invite.');
      setAccepting(false);
      return;
    }

    router.push('/broker/dashboard');
  }

  async function handleSwitchAccount() {
    await supabase.auth.signOut();
    router.push(`/login?invite=${encodeURIComponent(token)}`);
  }

  function handleSignUp() {
    router.push(`/signup?invite=${encodeURIComponent(token)}`);
  }

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', color: '#7a8a9b', fontFamily: 'Figtree, sans-serif' }}>
            Loading invite...
          </div>
        </div>
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={logoRow}>
            <Image src="/logo.png" alt="Clarity Health" width={36} height={36} />
            <div style={logoText}>Clarity <em style={{ color: '#7a9b76', fontStyle: 'italic' }}>Health</em></div>
          </div>
          <h1 style={{ ...titleStyle, color: '#a04444' }}>Invite unavailable</h1>
          <div style={errorBox}>{error}</div>
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <Link href="/" style={{ color: '#7a9b76', fontFamily: 'Figtree, sans-serif', fontWeight: 600 }}>
              ← Back to homepage
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!invite) return null;

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={logoRow}>
          <Image src="/logo.png" alt="Clarity Health" width={36} height={36} />
          <div style={logoText}>Clarity <em style={{ color: '#7a9b76', fontStyle: 'italic' }}>Health</em></div>
        </div>

        <h1 style={titleStyle}>You've been invited</h1>

        <div style={inviteCard}>
          <div style={{ fontSize: 13, color: '#7a8a9b', marginBottom: 4 }}>Join</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1e3a5f', fontFamily: 'Playfair Display, serif', marginBottom: 8 }}>
            {invite.agency_name}
          </div>
          <div style={{ fontSize: 13, color: '#3a4d68' }}>
            as <strong style={{ textTransform: 'capitalize' }}>{invite.invited_role}</strong>
          </div>
          <div style={{ fontSize: 12, color: '#7a8a9b', marginTop: 8 }}>
            Invited: {invite.invited_email}
          </div>
        </div>

        {error && <div style={errorBox}>{error}</div>}

        {!currentUser && (
          <>
            <div style={{ fontSize: 14, color: '#3a4d68', textAlign: 'center', marginBottom: 16, lineHeight: 1.6 }}>
              To accept this invite, sign up with the email address it was sent to.
            </div>
            <button style={primaryBtn} onClick={handleSignUp}>
              Sign up to accept →
            </button>
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <button
                style={linkBtn}
                onClick={() => router.push(`/login?invite=${encodeURIComponent(token)}`)}
              >
                Already have an account? Log in
              </button>
            </div>
          </>
        )}

        {currentUser && emailMismatch && (
          <>
            <div style={dangerCallout}>
              <strong>Email mismatch.</strong> You're logged in as <strong>{currentUser.email}</strong>, but this invite was sent to <strong>{invite.invited_email}</strong>. Switch accounts to accept.
            </div>
            <button style={primaryBtn} onClick={handleSwitchAccount}>
              Sign out and switch accounts
            </button>
          </>
        )}

        {currentUser && !emailMismatch && (
          <>
            <div style={{ fontSize: 14, color: '#3a4d68', textAlign: 'center', marginBottom: 16, lineHeight: 1.6 }}>
              You're logged in as <strong>{currentUser.email}</strong>.
            </div>
            <button style={primaryBtn} onClick={handleAccept} disabled={accepting}>
              {accepting ? 'Accepting...' : `Accept and join ${invite.agency_name} →`}
            </button>
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <Link href="/" style={{ color: '#7a8a9b', fontSize: 13, fontFamily: 'Figtree, sans-serif' }}>
                Decline
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#faf7f2',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
};
const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 14,
  padding: 36,
  width: '100%',
  maxWidth: 480,
  boxShadow: '0 4px 24px rgba(30, 58, 95, 0.08)',
};
const logoRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  justifyContent: 'center',
  marginBottom: 20,
};
const logoText: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 22,
  fontWeight: 700,
  color: '#1e3a5f',
};
const titleStyle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 30,
  color: '#1e3a5f',
  margin: '0 0 20px',
  textAlign: 'center',
};
const inviteCard: React.CSSProperties = {
  background: '#faf7f2',
  border: '1px solid #e8e0d0',
  borderRadius: 10,
  padding: 18,
  marginBottom: 20,
  textAlign: 'center',
  fontFamily: 'Figtree, sans-serif',
};
const primaryBtn: React.CSSProperties = {
  background: '#7a9b76',
  color: '#fff',
  border: 'none',
  padding: '14px 22px',
  borderRadius: 8,
  fontFamily: 'Figtree, sans-serif',
  fontWeight: 600,
  fontSize: 15,
  cursor: 'pointer',
  width: '100%',
};
const linkBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#7a9b76',
  padding: 0,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  textDecoration: 'underline',
};
const errorBox: React.CSSProperties = {
  background: '#fef0f0',
  border: '1px solid #f0c8c8',
  borderRadius: 6,
  padding: '12px 14px',
  fontSize: 13,
  color: '#a04444',
  marginBottom: 16,
  fontFamily: 'Figtree, sans-serif',
};
const dangerCallout: React.CSSProperties = {
  background: '#fef0f0',
  border: '1px solid #f0c8c8',
  borderRadius: 8,
  padding: 14,
  fontSize: 13,
  color: '#7a3a3a',
  marginBottom: 16,
  lineHeight: 1.5,
  fontFamily: 'Figtree, sans-serif',
};