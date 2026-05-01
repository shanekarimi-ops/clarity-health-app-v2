'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../supabase';
import Sidebar from '../components/Sidebar';

export default function HelpPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);
      setLoading(false);
    }
    loadUser();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  const faqs = [
    {
      q: 'How do I upload my claims?',
      a: 'Go to your Dashboard and use the upload widget, or visit the Claims & Profile page. You can drag and drop multiple PDFs or images at once. We accept PDF, JPG, and PNG files up to 10MB each.',
    },
    {
      q: 'Is my health data secure?',
      a: 'Yes. All files are stored in encrypted, private storage. Only you can access your uploads — our access policies enforce that at the database level. We never sell or share your data with third parties.',
    },
    {
      q: 'How does the AI recommendation engine work?',
      a: 'Once you upload claims and complete your health profile, our AI analyzes your usage patterns, medications, and priorities to rank insurance plans by fit and projected cost. The recommendation engine is currently in development and will be available soon.',
    },
    {
      q: 'Can I delete my uploaded files?',
      a: 'Yes. Visit the Uploaded Files page from your dashboard sidebar. Each file has a Delete button. Deletion is permanent and removes the file from both our database and storage.',
    },
    {
      q: 'What\'s the difference between Individual, HR, and Broker accounts?',
      a: 'Individual accounts are for people shopping for their own coverage. HR accounts manage benefits for a team or company. Broker accounts let insurance professionals manage multiple clients and access advanced comparison tools.',
    },
    {
      q: 'How do I change my password?',
      a: 'Go to Settings from the sidebar, then scroll to the Security section. You can update your password there. If you\'ve forgotten your current password, use the "Forgot Password" link on the login page.',
    },
    {
      q: 'Why am I seeing — on my dashboard stat cards?',
      a: 'The Top Match Score and Estimated Savings cards activate once the AI recommendation engine analyzes your data. Make sure you\'ve uploaded claims and completed your health profile, and these will populate when the engine launches.',
    },
    {
      q: 'How do I delete my account?',
      a: 'Go to Settings and scroll to the Danger Zone section at the bottom. Account deletion is permanent and removes all your data including uploads, profile, and claims.',
    },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p>Loading...</p>
      </div>
    );
  }

  const firstName = user?.user_metadata?.first_name || 'there';
  const lastName = user?.user_metadata?.last_name || '';
  const role = user?.user_metadata?.role || 'Individual';

  return (
    <div className="dash-layout">
      <Sidebar
        active="help"
        firstName={firstName}
        lastName={lastName}
        role={role}
        onLogout={handleLogout}
      />

      <main className="dash-main">
        <div className="dash-header">
          <div>
            <div className="dash-greeting">Help & Support</div>
            <div className="dash-date">Find answers to common questions or reach out — we&apos;re here to help.</div>
          </div>
        </div>

        {/* Getting Started */}
        <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
          <div className="dash-card-header">
            <div className="dash-card-title">Getting Started</div>
          </div>
          <ol style={{ color: '#3a4d68', lineHeight: '1.8', paddingLeft: '20px', margin: 0 }}>
            <li>Complete your <Link href="/claims-profile" style={{ color: '#7a9b76', textDecoration: 'underline' }}>health profile</Link> with age, household size, and ZIP code.</li>
            <li>Upload your recent claims (PDF or image) — we accept files up to 10MB.</li>
            <li>Set your priorities — low deductible, mental health coverage, dental/vision, network size.</li>
            <li>Review AI-ranked plan recommendations once the recommendation engine launches.</li>
          </ol>
        </div>

        {/* FAQ */}
        <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
          <div className="dash-card-header">
            <div className="dash-card-title">Frequently Asked Questions</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                style={{
                  borderBottom: idx === faqs.length - 1 ? 'none' : '1px solid #eef1f4',
                }}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    padding: '14px 0',
                    fontSize: '15px',
                    fontWeight: 600,
                    color: '#1e3a5f',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontFamily: 'inherit',
                  }}
                >
                  <span>{faq.q}</span>
                  <span style={{ color: '#7a9b76', fontSize: '20px', flexShrink: 0, marginLeft: '12px' }}>
                    {openFaq === idx ? '−' : '+'}
                  </span>
                </button>
                {openFaq === idx && (
                  <p
                    style={{
                      color: '#3a4d68',
                      fontSize: '14px',
                      lineHeight: '1.7',
                      padding: '0 0 14px 0',
                      margin: 0,
                    }}
                  >
                    {faq.a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Contact */}
        <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
          <div className="dash-card-header">
            <div className="dash-card-title">Still need help?</div>
          </div>
          <p style={{ color: '#6b7785', fontSize: '0.9rem', margin: '0 0 1.25rem 0' }}>
            Reach out and we&apos;ll get back to you within one business day.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <strong style={{ color: '#1e3a5f' }}>Email: </strong>
              <a href="mailto:support@clarityhealth.app" style={{ color: '#7a9b76', textDecoration: 'underline' }}>
                support@clarityhealth.app
              </a>
            </div>
            <div>
              <strong style={{ color: '#1e3a5f' }}>For brokers: </strong>
              <a href="mailto:brokers@clarityhealth.app" style={{ color: '#7a9b76', textDecoration: 'underline' }}>
                brokers@clarityhealth.app
              </a>
            </div>
          </div>
        </div>

        {/* Legal */}
        <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
          <div className="dash-card-header">
            <div className="dash-card-title">Legal</div>
          </div>
          <p style={{ color: '#6b7785', fontSize: '0.9rem', margin: '0 0 1.25rem 0' }}>
            Review our policies and terms.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <Link href="/privacy" style={{ color: '#7a9b76', textDecoration: 'underline' }}>
                Privacy Policy
              </Link>
              <span style={{ color: '#6b7785', fontSize: '0.85rem', marginLeft: '8px' }}>
                — How we collect, use, and protect your data
              </span>
            </div>
            <div>
              <Link href="/terms" style={{ color: '#7a9b76', textDecoration: 'underline' }}>
                Terms of Service
              </Link>
              <span style={{ color: '#6b7785', fontSize: '0.85rem', marginLeft: '8px' }}>
                — Your agreement with Clarity Health
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}