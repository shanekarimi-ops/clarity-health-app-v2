'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '../supabase';
import { getAccountType, dashboardPathFor } from '../lib/account';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    if (data.user) {
      const accountType = getAccountType(data.user);
      router.push(dashboardPathFor(accountType));
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-left">
        <a href="/" className="logo-mark">
          <Image src="/logo.png" alt="Clarity Health logo" width={38} height={38} style={{filter: 'brightness(1.4)'}} />
          <span className="logo-text">Clarity <em>Health</em></span>
        </a>
        <div className="auth-left-body">
          <h2>Welcome back to <em>Clarity</em></h2>
          <p>Sign in to view your personalized plan recommendations and manage your health data.</p>
          <div className="auth-left-bullets">
            <div className="auth-bullet"><div className="auth-bullet-dot"></div><div className="auth-bullet-text">Your saved plan rankings</div></div>
            <div className="auth-bullet"><div className="auth-bullet-dot"></div><div className="auth-bullet-text">Updated claims and recommendations</div></div>
            <div className="auth-bullet"><div className="auth-bullet-dot"></div><div className="auth-bullet-text">Profile and preferences</div></div>
            <div className="auth-bullet"><div className="auth-bullet-dot"></div><div className="auth-bullet-text">Secure, HIPAA-compliant access</div></div>
          </div>
        </div>
        <div className="auth-left-footer">© 2026 Clarity Health · Privacy · Terms</div>
      </div>

      <div className="auth-right">
        <form className="auth-form-wrap" onSubmit={handleLogin}>
          <div className="auth-form-title">Sign in</div>
          <div className="auth-form-sub">Welcome back — let's get you to your dashboard</div>

          <div className="form-field">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-field">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          {errorMsg && <div style={{color: '#d95858', fontSize: '0.85rem', marginTop: '0.75rem'}}>{errorMsg}</div>}

          <button type="submit" className="btn-full btn-accent" style={{marginTop: '0.75rem'}} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in →'}
          </button>

          <div className="auth-footer-note" style={{marginTop: '1.5rem'}}>
            Don't have an account? <a href="/signup">Sign up free</a>
          </div>
          <div className="auth-footer-note" style={{marginTop: '0.5rem', fontSize: '0.72rem'}}>
          <a href="/forgot-password">Forgot your password?</a>
          </div>
        </form>
      </div>
    </div>
  );
}