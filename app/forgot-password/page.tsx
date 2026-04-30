'use client';

import { useState } from 'react';
import Image from 'next/image';
import { supabase } from '../supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    if (!email.trim()) {
      setErrorMsg('Please enter your email address.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setSuccessMsg(
      'Check your email! If an account exists for that address, we just sent password reset instructions.'
    );
    setEmail('');
  }

  return (
    <div className="auth-screen">
      <div className="auth-left">
        <a href="/" className="logo-mark">
          <Image src="/logo.png" alt="Clarity Health logo" width={38} height={38} style={{filter: 'brightness(1.4)'}} />
          <span className="logo-text">Clarity <em>Health</em></span>
        </a>
        <div className="auth-left-body">
          <h2>Reset your <em>password</em></h2>
          <p>No worries — it happens. Enter your email and we'll send you a link to get back into your account.</p>
          <div className="auth-left-bullets">
            <div className="auth-bullet"><div className="auth-bullet-dot"></div><div className="auth-bullet-text">Secure password reset link</div></div>
            <div className="auth-bullet"><div className="auth-bullet-dot"></div><div className="auth-bullet-text">Link expires in 1 hour for safety</div></div>
            <div className="auth-bullet"><div className="auth-bullet-dot"></div><div className="auth-bullet-text">Back to your dashboard in minutes</div></div>
          </div>
        </div>
        <div className="auth-left-footer">© 2026 Clarity Health · Privacy · Terms</div>
      </div>

      <div className="auth-right">
        <form className="auth-form-wrap" onSubmit={handleSubmit}>
          <div className="auth-form-title">Forgot password</div>
          <div className="auth-form-sub">Enter the email associated with your account.</div>

          <div className="form-field">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} required />
          </div>

          {errorMsg && <div style={{color: '#d95858', fontSize: '0.85rem', marginTop: '0.75rem'}}>{errorMsg}</div>}
          {successMsg && <div style={{color: '#7a9b76', fontSize: '0.85rem', marginTop: '0.75rem'}}>{successMsg}</div>}

          <button type="submit" className="btn-full btn-accent" style={{marginTop: '0.75rem'}} disabled={loading}>
            {loading ? 'Sending...' : 'Send reset link →'}
          </button>

          <div className="auth-footer-note" style={{marginTop: '1.5rem'}}>
            Remember your password? <a href="/login">Sign in</a>
          </div>
          <div className="auth-footer-note" style={{marginTop: '0.5rem'}}>
            Don't have an account? <a href="/signup">Sign up free</a>
          </div>
        </form>
      </div>
    </div>
  );
}