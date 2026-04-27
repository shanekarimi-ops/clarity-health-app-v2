'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '../supabase';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/signup');
        return;
      }
      setUser(user);
      setLoading(false);
    }
    getUser();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <p>Loading...</p>
      </div>
    );
  }

  const firstName = user?.user_metadata?.first_name || 'there';
  const lastName = user?.user_metadata?.last_name || '';
  const role = user?.user_metadata?.role || 'Individual';

  return (
    <main>
      <nav className="hp-nav">
        <a href="/" className="logo-mark">
          <Image
            src="/logo.png"
            alt="Clarity Health logo"
            width={38}
            height={38}
          />
          <span className="logo-text">
            Clarity <em>Health</em>
          </span>
        </a>
        <div className="hp-nav-ctas">
          <button className="btn-sm btn-ghost-sm" onClick={handleLogout}>
            Log Out
          </button>
        </div>
      </nav>

      <section
        style={{ padding: '4rem 3rem', maxWidth: '900px', margin: '0 auto' }}
      >
        <div className="hp-hero-eyebrow">Welcome to Clarity Health</div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2.5rem',
            fontWeight: 800,
            marginBottom: '1rem',
            lineHeight: 1.2,
          }}
        >
          Hi {firstName} 👋
        </h1>
        <p
          style={{
            color: 'var(--ink2)',
            fontSize: '1.05rem',
            marginBottom: '2.5rem',
            maxWidth: '600px',
          }}
        >
          You&apos;re all set up. Next, we&apos;ll help you upload your claims
          data and find the plan that fits you best.
        </p>

        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '2rem',
            border: '1px solid var(--light-border)',
            marginBottom: '1.5rem',
          }}
        >
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.2rem',
              marginBottom: '1rem',
            }}
          >
            Your Profile
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              fontSize: '0.9rem',
            }}
          >
            <div>
              <div
                style={{
                  color: 'var(--muted)',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: '0.3rem',
                  fontWeight: 600,
                }}
              >
                Name
              </div>
              <div>
                {firstName} {lastName}
              </div>
            </div>
            <div>
              <div
                style={{
                  color: 'var(--muted)',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: '0.3rem',
                  fontWeight: 600,
                }}
              >
                Email
              </div>
              <div>{user.email}</div>
            </div>
            <div>
              <div
                style={{
                  color: 'var(--muted)',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: '0.3rem',
                  fontWeight: 600,
                }}
              >
                Account Type
              </div>
              <div>{role}</div>
            </div>
            <div>
              <div
                style={{
                  color: 'var(--muted)',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: '0.3rem',
                  fontWeight: 600,
                }}
              >
                Member Since
              </div>
              <div>{new Date(user.created_at).toLocaleDateString()}</div>
            </div>
          </div>
        </div>

        <div
          style={{
            background: 'var(--warm)',
            borderRadius: '12px',
            padding: '2rem',
            border: '1px solid var(--light-border)',
          }}
        >
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.2rem',
              marginBottom: '0.75rem',
            }}
          >
            Next steps
          </h3>
          <p
            style={{
              color: 'var(--ink2)',
              fontSize: '0.92rem',
              marginBottom: '1.5rem',
            }}
          >
            Upload your claims to start getting plan recommendations. (Coming
            soon — we&apos;re wiring this up next.)
          </p>
          <button
            className="btn-lg btn-accent-lg"
            disabled
            style={{ opacity: 0.5, cursor: 'not-allowed' }}
          >
            Upload Claims (coming soon)
          </button>
        </div>
      </section>
    </main>
  );
}
