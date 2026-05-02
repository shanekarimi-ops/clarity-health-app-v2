'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '../supabase';
import { dashboardPathFor } from '../lib/account';

export default function SignUpPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Individual');
  const [agencyName, setAgencyName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  function roleToAccountType(r: string): 'individual' | 'broker' | 'hr_employer' {
    if (r === 'Broker') return 'broker';
    if (r === 'HR') return 'hr_employer';
    return 'individual';
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();

    if (!agreed) {
      setErrorMsg('Please agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }

    if (role === 'Broker' && !agencyName.trim()) {
      setErrorMsg('Please enter your agency name.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    const accountType = roleToAccountType(role);

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

    // For brokers: call server-side route to bootstrap agency + broker records
    if (role === 'Broker' && data.user) {
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
    }

    setLoading(false);
    router.push(dashboardPathFor(accountType));
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
          <p>Join thousands of individuals, HR teams, and brokers who use Clarity Health to match plans to real health data — not guesswork.</p>
          <div className="auth-left-bullets">
            <div className="auth-bullet"><div className="auth-bullet-dot"></div><div className="auth-bullet-text">Claims-based matching — not averages</div></div>
            <div className="auth-bullet"><div className="auth-bullet-dot"></div><div className="auth-bullet-text">Live data from Healthcare.gov + group plans</div></div>
            <div className="auth-bullet"><div className="auth-bullet-dot"></div><div className="auth-bullet-text">HIPAA-compliant. Your data stays yours.</div></div>
            <div className="auth-bullet"><div className="auth-bullet-dot"></div><div className="auth-bullet-text">Free for individuals. Team plans available.</div></div>
          </div>
        </div>
        <div className="auth-left-footer">
          © 2026 Clarity Health · <Link href="/privacy" style={{ color: 'inherit' }}>Privacy</Link> · <Link href="/terms" style={{ color: 'inherit' }}>Terms</Link>
        </div>
      </div>

      <div className="auth-right">
        <form className="auth-form-wrap" onSubmit={handleSignUp}>
          <div className="auth-form-title">Get started free</div>
          <div className="auth-form-sub">No credit card required · Free for individuals</div>

          <div style={{marginBottom: '1.25rem'}}>
            <div className="form-label" style={{marginBottom: '0.6rem'}}>I am a…</div>
            <div className="role-picker">
              <div className={`role-btn ${role === 'Individual' ? 'selected' : ''}`} onClick={() => setRole('Individual')}>
                <div className="role-btn-icon">👤</div>
                <div className="role-btn-label">Individual</div>
              </div>
              <div className={`role-btn ${role === 'HR' ? 'selected' : ''}`} onClick={() => setRole('HR')}>
                <div className="role-btn-icon">🏢</div>
                <div className="role-btn-label">HR / Employer</div>
              </div>
              <div className={`role-btn ${role === 'Broker' ? 'selected' : ''}`} onClick={() => setRole('Broker')}>
                <div className="role-btn-icon">📋</div>
                <div className="role-btn-label">Broker</div>
              </div>
            </div>
          </div>

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

          {role === 'Broker' && (
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
            <input className="form-input" type="email" placeholder="jane@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-field">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="8+ characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>

          {/* Agreement checkbox */}
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
            {loading ? 'Creating account...' : 'Create my account →'}
          </button>

          <div className="auth-footer-note" style={{marginTop: '1.5rem'}}>
            Already have an account? <a href="/login">Log in</a>
          </div>
        </form>
      </div>
    </div>
  );
}