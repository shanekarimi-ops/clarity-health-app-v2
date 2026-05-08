'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '../supabase';

function SignUpInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'Individual' | 'Broker'>('Individual');
  const [agencyName, setAgencyName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteData, setInviteData] = useState<{
    agency_name: string;
    invited_email: string;
    invited_role: 'admin' | 'broker';
  } | null>(null);
  const [inviteError, setInviteError] = useState('');

  useEffect(() => {
    if (!inviteToken) return;
    validateInvite();
  }, [inviteToken]);

  async function validateInvite() {
    setInviteLoading(true);
    setInviteError('');

    const res = await fetch(`/api/team/accept-invite?token=${encodeURIComponent(inviteToken!)}`);
    if (!res.ok) {
      const body = await res.json();
      setInviteError(body.error || 'This invite is no longer valid.');
      setInviteLoading(false);
      return;
    }

    const body = await res.json();
    setInviteData({
      agency_name: body.invite.agency_name,
      invited_email: body.invite.invited_email,
      invited_role: body.invite.invited_role,
    });
    setRole('Broker');
    setEmail(body.invite.invited_email);
    setInviteLoading(false);
  }

  async function ensureIndividualProfile(userId: string, userEmail: string, fullName: string) {
    // For individual signups: create a profiles row directly.
    // (Broker signups use /api/signup-broker which handles this server-side.)
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email: userEmail,
        full_name: fullName,
        user_type: 'individual',
        active_product: 'individual',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (error) {
      console.error('individual profile upsert error', error);
      // Non-fatal: route-user will lazily create the profile on next login.
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();

    if (!agreed) {
      setErrorMsg('Please agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }

    if (inviteData && email.toLowerCase().trim() !== inviteData.invited_email.toLowerCase()) {
      setErrorMsg(`This invite was sent to ${inviteData.invited_email}. Use that email to accept.`);
      return;
    }

    if (role === 'Broker' && !inviteData && !agencyName.trim()) {
      setErrorMsg('Please enter your agency name.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    const accountType: 'individual' | 'broker' = role === 'Broker' ? 'broker' : 'individual';

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          role: role,
          account_type: accountType,
        },
      },
    });

    if (error) {
      setLoading(false);
      setErrorMsg(error.message);
      return;
    }

    if (!data.user) {
      setLoading(false);
      setErrorMsg('Account created, but we could not sign you in. Please try logging in.');
      return;
    }

    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || email;

    // Branch 1: invite-based broker signup
    if (inviteData) {
      try {
        const res = await fetch('/api/team/accept-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: inviteToken,
            user_id: data.user.id,
          }),
        });

        const body = await res.json();
        if (!res.ok || !body?.success) {
          setLoading(false);
          setErrorMsg(body?.error || 'Failed to join agency.');
          return;
        }

        // Note: accept-invite should handle the broker + profiles rows.
        // We don't insert profiles here to avoid stepping on its logic.
      } catch (apiErr: any) {
        setLoading(false);
        setErrorMsg('Failed to join agency: ' + (apiErr?.message || 'network error'));
        return;
      }

      setLoading(false);
      router.push('/broker/dashboard');
      return;
    }

    // Branch 2: standalone broker signup (creates new agency)
    if (role === 'Broker') {
      try {
        const res = await fetch('/api/signup-broker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: data.user.id,
            agency_name: agencyName.trim(),
          }),
        });

        const body = await res.json();
        if (!res.ok || !body?.success) {
          setLoading(false);
          setErrorMsg(body?.error || 'Broker setup failed.');
          return;
        }
      } catch (apiErr: any) {
        setLoading(false);
        setErrorMsg('Broker setup failed: ' + (apiErr?.message || 'network error'));
        return;
      }

      setLoading(false);
      router.push('/broker/dashboard');
      return;
    }

    // Branch 3: individual signup
    await ensureIndividualProfile(data.user.id, email, fullName);
    setLoading(false);
    router.push('/individual/dashboard');
  }

  if (inviteToken && inviteError) {
    return (
      <div className="auth-screen">
        <div className="auth-right" style={{ width: '100%' }}>
          <div className="auth-form-wrap" style={{ textAlign: 'center' }}>
            <div className="auth-form-title" style={{ color: '#a04444' }}>Invite unavailable</div>
            <div style={{ color: '#3a4d68', fontSize: 14, marginTop: 12, marginBottom: 20 }}>{inviteError}</div>
            <Link href="/signup" style={{ color: '#7a9b76', fontWeight: 600 }}>
              Continue without invite →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (inviteToken && inviteLoading) {
    return (
      <div className="auth-screen">
        <div className="auth-right" style={{ width: '100%' }}>
          <div className="auth-form-wrap" style={{ textAlign: 'center', color: '#7a8a9b' }}>
            Loading invite...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-left">
        <a href="/" className="logo-mark">
          <Image src="/logo.png" alt="Clarity Health logo" width={38} height={38} style={{filter: 'brightness(1.4)'}} />
          <span className="logo-text">Clarity <em>Health</em></span>
        </a>
        <div className="auth-left-body">
          <h2>The smarter way to pick a <em>health plan</em></h2>
          <p>Join individuals and benefits brokers who use Clarity Health to match plans to real health data — not guesswork.</p>
          <div className="auth-left-bullets">
            <div className="auth-bullet"><div className="auth-bullet-dot"></div><div className="auth-bullet-text">Claims-based matching — not averages</div></div>
            <div className="auth-bullet"><div className="auth-bullet-dot"></div><div className="auth-bullet-text">Live data from Healthcare.gov + group plans</div></div>
            <div className="auth-bullet"><div className="auth-bullet-dot"></div><div className="auth-bullet-text">HIPAA-compliant. Your data stays yours.</div></div>
            <div className="auth-bullet"><div className="auth-bullet-dot"></div><div className="auth-bullet-text">Free for individuals. Broker plans available.</div></div>
          </div>
        </div>
        <div className="auth-left-footer">
          © 2026 Clarity Health · <Link href="/privacy" style={{ color: 'inherit' }}>Privacy</Link> · <Link href="/terms" style={{ color: 'inherit' }}>Terms</Link>
        </div>
      </div>

      <div className="auth-right">
        <form className="auth-form-wrap" onSubmit={handleSignUp}>
          {inviteData ? (
            <>
              <div className="auth-form-title">Join {inviteData.agency_name}</div>
              <div className="auth-form-sub">
                You've been invited as <strong style={{ textTransform: 'capitalize' }}>{inviteData.invited_role}</strong>
              </div>

              <div style={{
                background: '#faf7f2',
                border: '1px solid #e8e0d0',
                borderRadius: 8,
                padding: 12,
                marginBottom: 20,
                marginTop: 12,
                fontSize: 13,
                color: '#3a4d68',
              }}>
                Sign up with <strong>{inviteData.invited_email}</strong> to accept this invite.
              </div>
            </>
          ) : (
            <>
              <div className="auth-form-title">Get started free</div>
              <div className="auth-form-sub">No credit card required · Free for individuals</div>

              <div style={{marginBottom: '1.25rem'}}>
                <div className="form-label" style={{marginBottom: '0.6rem'}}>I am a…</div>
                <div className="role-picker">
                  <div className={`role-btn ${role === 'Individual' ? 'selected' : ''}`} onClick={() => setRole('Individual')}>
                    <div className="role-btn-icon">👤</div>
                    <div className="role-btn-label">Individual</div>
                  </div>
                  <div className={`role-btn ${role === 'Broker' ? 'selected' : ''}`} onClick={() => setRole('Broker')}>
                    <div className="role-btn-icon">📋</div>
                    <div className="role-btn-label">Broker</div>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="form-row">
            <div className="form-field">
              <label className="form-label">First Name</label>
              <input className="form-input" placeholder="Jane" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="form-field">
              <label className="form-label">Last Name</label>
              <input className="form-input" placeholder="Smith" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>

          {role === 'Broker' && !inviteData && (
            <div className="form-field">
              <label className="form-label">Agency Name</label>
              <input
                className="form-input"
                placeholder="Karimi Benefits Group"
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-field">
            <label className="form-label">Work Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="jane@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              readOnly={!!inviteData}
              style={inviteData ? { background: '#f5f5f5', cursor: 'not-allowed' } : undefined}
            />
          </div>
          <div className="form-field">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="8+ characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              marginTop: '1.25rem',
              padding: '12px 14px',
              background: '#faf7f2',
              border: '1px solid #eef1f4',
              borderRadius: '8px',
            }}
          >
            <input
              type="checkbox"
              id="agree"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{
                marginTop: '3px',
                cursor: 'pointer',
                width: '16px',
                height: '16px',
                accentColor: '#7a9b76',
                flexShrink: 0,
              }}
            />
            <label
              htmlFor="agree"
              style={{
                fontSize: '0.82rem',
                color: '#3a4d68',
                lineHeight: '1.5',
                cursor: 'pointer',
              }}
            >
              I agree to the{' '}
              <Link href="/terms" target="_blank" style={{ color: '#7a9b76', textDecoration: 'underline' }}>
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" target="_blank" style={{ color: '#7a9b76', textDecoration: 'underline' }}>
                Privacy Policy
              </Link>
              .
            </label>
          </div>

          {errorMsg && <div style={{color: '#d95858', fontSize: '0.85rem', marginTop: '0.75rem'}}>{errorMsg}</div>}

          <button type="submit" className="btn-full btn-accent" style={{marginTop: '0.75rem'}} disabled={loading || !agreed}>
            {loading
              ? (inviteData ? 'Joining...' : 'Creating account...')
              : (inviteData ? `Join ${inviteData.agency_name} →` : 'Create my account →')
            }
          </button>

          <div className="auth-footer-note" style={{marginTop: '1.5rem'}}>
            Already have an account?{' '}
            <a href={inviteToken ? `/login?invite=${encodeURIComponent(inviteToken)}` : '/login'}>Log in</a>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: '#1e3a5f' }}>Loading...</div>}>
      <SignUpInner />
    </Suspense>
  );
}