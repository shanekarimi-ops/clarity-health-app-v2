'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '../supabase';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [validSession, setValidSession] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // When user arrives via the email link, Supabase auto-creates a recovery session.
    // We listen for it to confirm they're allowed to reset.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setValidSession(true);
        setChecking(false);
      }
    });

    // Also check if a session already exists (in case the event fired before we subscribed)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setValidSession(true);
      }
      setChecking(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setSuccessMsg('Password updated! Redirecting you to sign in...');

    // Sign them out so they have to log in fresh with the new password
    setTimeout(async () => {
      await supabase.auth.signOut();
      router.push('/login');
    }, 2000);
  }

  return (
    <div className="auth-screen">
      <div className="auth-left">
        <a href="/" className="logo-mark">
          <Image src="/logo.png" alt="Clarity Health logo" width={38} height={38} style={{filter: 'brightness(1.4)'}} />
          <span className="logo-text">Clarity <em>Health</em></span>
        </a>
        <div className="auth-left-body">
          <h2>Set a new <em>password</em></h2>
          <p>Almost there. Choose a strong password to keep your health data secure.</p>
          <div className="auth-left-bullets">
            <div className="auth-bullet"><div className="auth-bullet-dot"></div><div className="auth-bullet-text">At least 6 characters</div></div>
            <div className="auth-bullet"><div className="auth-bullet-dot"></div><div className="auth-bullet-text">Mix of letters and numbers recommended</div></div>
            <div className="auth-bullet"><div className="auth-bullet-dot"></div><div className="auth-bullet-text">Don't reuse old passwords</div></div>
          </div>
        </div>
        <div className="auth-left-footer">© 2026 Clarity Health · Privacy · Terms</div>
      </div>

      <div className="auth-right">
        <form className="auth-form-wrap" onSubmit={handleSubmit}>
          <div className="auth-form-title">New password</div>
          <div className="auth-form-sub">Enter your new password below.</div>

          {checking ? (
            <div style={{marginTop: '1.5rem', color: '#3a4d68', fontSize: '0.9rem'}}>
              Verifying reset link...
            </div>
          ) : !validSession ? (
            <div style={{marginTop: '1.5rem'}}>
              <div style={{color: '#d95858', fontSize: '0.9rem', marginBottom: '1rem'}}>
                This reset link is invalid or has expired.
              </div>
              <a href="/forgot-password" className="btn-full btn-accent" style={{display: 'block', textAlign: 'center', textDecoration: 'none'}}>
                Request a new link
              </a>
            </div>
          ) : (
            <>
              <div className="form-field">
                <label className="form-label">New password</label>
                <input className="form-input" type="password" placeholder="Enter new password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} required />
              </div>
              <div className="form-field">
                <label className="form-label">Confirm password</label>
                <input className="form-input" type="password" placeholder="Re-enter new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={loading} required />
              </div>

              {errorMsg && <div style={{color: '#d95858', fontSize: '0.85rem', marginTop: '0.75rem'}}>{errorMsg}</div>}
              {successMsg && <div style={{color: '#7a9b76', fontSize: '0.85rem', marginTop: '0.75rem'}}>{successMsg}</div>}

              <button type="submit" className="btn-full btn-accent" style={{marginTop: '0.75rem'}} disabled={loading}>
                {loading ? 'Updating...' : 'Update password →'}
              </button>
            </>
          )}

          <div className="auth-footer-note" style={{marginTop: '1.5rem'}}>
            Remember your password? <a href="/login">Sign in</a>
          </div>
        </form>
      </div>
    </div>
  );
}