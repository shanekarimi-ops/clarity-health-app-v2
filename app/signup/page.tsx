'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '../supabase';

export default function SignUpPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Individual');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          role: role,
        },
      },
    });

    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    router.push('/profile');
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
        <div className="auth-left-footer">© 2026 Clarity Health · Privacy · Terms</div>
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
          <div className="form-field">
            <label className="form-label">Work Email</label>
            <input className="form-input" type="email" placeholder="jane@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-field">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="8+ characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>

          {errorMsg && <div style={{color: '#d95858', fontSize: '0.85rem', marginTop: '0.75rem'}}>{errorMsg}</div>}

          <button type="submit" className="btn-full btn-accent" style={{marginTop: '0.75rem'}} disabled={loading}>
            {loading ? 'Creating account...' : 'Create my account →'}
          </button>

          <div className="auth-footer-note" style={{marginTop: '1.5rem'}}>
            Already have an account? <a href="/login">Log in</a>
          </div>
          <div className="auth-footer-note" style={{marginTop: '0.5rem', fontSize: '0.72rem'}}>
            By signing up you agree to our <a href="#">Terms</a> and <a href="#">Privacy Policy</a>
          </div>
        </form>
      </div>
    </div>
  );
}