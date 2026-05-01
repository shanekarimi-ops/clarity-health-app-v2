'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../supabase';
import ClaimsUpload from '../components/ClaimsUpload';
import Sidebar from '../components/Sidebar';

type Claim = {
  id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  uploaded_at: string;
};

type RankedPlan = {
  id: string;
  name: string;
  rank: number;
  matchScore: number;
  premium: number;
  premiumWithCredit: number;
};

type Recommendation = {
  id: string;
  created_at: string;
  county_name: string;
  state: string;
  plans: RankedPlan[];
};

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/signup');
        return;
      }
      setUser(user);
      setLoading(false);
    }
    getUser();
  }, [router]);

  const fetchClaims = useCallback(async () => {
    if (!user) return;
    setClaimsLoading(true);
    const { data, error } = await supabase
      .from('claims')
      .select('*')
      .eq('user_id', user.id)
      .order('uploaded_at', { ascending: false });

    if (!error && data) {
      setClaims(data);
    }
    setClaimsLoading(false);
  }, [user]);

  const fetchRecommendation = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('recommendations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      setRecommendation(data[0] as Recommendation);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchClaims();
      fetchRecommendation();
    }
  }, [user, fetchClaims, fetchRecommendation]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  async function handleDeleteClaim(claim: Claim) {
    const confirmed = window.confirm(`Delete "${claim.file_name}"? This cannot be undone.`);
    if (!confirmed) return;

    const { error: storageError } = await supabase.storage
      .from('claims')
      .remove([claim.file_path]);

    if (storageError) {
      alert(`Failed to delete file: ${storageError.message}`);
      return;
    }

    const { error: dbError } = await supabase
      .from('claims')
      .delete()
      .eq('id', claim.id);

    if (dbError) {
      alert(`Failed to remove record: ${dbError.message}`);
      return;
    }

    fetchClaims();
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getFileIcon(fileType: string): string {
    if (fileType === 'application/pdf') return '📄';
    if (fileType.startsWith('image/')) return '🖼️';
    return '📎';
  }

  function scrollToUpload() {
    const el = document.getElementById('upload-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  const firstName = user?.user_metadata?.first_name || 'there';
  const lastName = user?.user_metadata?.last_name || '';
  const role = user?.user_metadata?.role || 'Individual';

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

  const claimsCount = claims.length;

  // Compute recommendation-derived stats
  const topPlan = recommendation?.plans?.find((p) => p.rank === 1);
  const topMatchScore = topPlan?.matchScore ?? null;
  const monthlySavings =
    topPlan && topPlan.premium != null && topPlan.premiumWithCredit != null
      ? Math.max(0, Math.round(topPlan.premium - topPlan.premiumWithCredit))
      : null;
  const hasRecommendation = !!recommendation;

  return (
    <div className="dash-layout">
      <Sidebar
        active="dashboard"
        firstName={firstName}
        lastName={lastName}
        role={role}
        onLogout={handleLogout}
      />

      <main className="dash-main">
        <div className="dash-header">
          <div>
            <div className="dash-greeting">Welcome, {firstName} 👋</div>
            <div className="dash-date">{dateStr}</div>
          </div>
          <div className="dash-header-actions">
            <button className="btn-sm btn-ghost-sm" disabled>📤 Export Report</button>
            <button className="btn-sm btn-accent" onClick={scrollToUpload}>+ Upload Claims</button>
          </div>
        </div>

        {hasRecommendation ? (
          <div className="welcome-banner" style={{ background: '#ebf3ea', borderColor: '#7a9b76' }}>
            <div className="welcome-banner-icon">🎯</div>
            <div style={{ flex: 1 }}>
              <div className="welcome-banner-title">
                Your top match: {topPlan?.name}
              </div>
              <div className="welcome-banner-desc">
                Ranked #1 of {recommendation?.plans?.length ?? 0} plans for your household.{' '}
                <Link href="/my-plans" style={{ color: '#5a7857', fontWeight: 600 }}>
                  See full results →
                </Link>
              </div>
            </div>
          </div>
        ) : claimsCount === 0 ? (
          <div className="welcome-banner">
            <div className="welcome-banner-icon">✨</div>
            <div style={{ flex: 1 }}>
              <div className="welcome-banner-title">You&apos;re all set up!</div>
              <div className="welcome-banner-desc">
                Run your first plan recommendation from{' '}
                <Link href="/find-plans" style={{ color: '#1e3a5f', fontWeight: 600 }}>Find Plans</Link>
                {' '}or upload your claims below to get started.
              </div>
            </div>
          </div>
        ) : (
          <div className="welcome-banner" style={{ background: '#ebf3ea', borderColor: '#7a9b76' }}>
            <div className="welcome-banner-icon">📊</div>
            <div style={{ flex: 1 }}>
              <div className="welcome-banner-title">{claimsCount} claim{claimsCount !== 1 ? 's' : ''} uploaded</div>
              <div className="welcome-banner-desc">
                Your data is securely stored.{' '}
                <Link href="/find-plans" style={{ color: '#5a7857', fontWeight: 600 }}>Get your plan recommendations →</Link>
              </div>
            </div>
          </div>
        )}

        <div className="dash-stat-row">
          <div className="dash-stat">
            <div className="dash-stat-label">Top Match Score</div>
            <div className={`dash-stat-val ${topMatchScore == null ? 'muted-val' : ''}`}>
              {topMatchScore != null ? `${topMatchScore}` : '—'}
            </div>
            <div className="dash-stat-change">
              {topMatchScore != null ? `${topPlan?.name}` : 'Run Find Plans to see'}
            </div>
          </div>
          <div className="dash-stat">
            <div className="dash-stat-label">Est. Monthly Savings</div>
            <div className={`dash-stat-val ${monthlySavings == null ? 'muted-val' : ''}`}>
              {monthlySavings != null ? `$${monthlySavings.toLocaleString()}` : '—'}
            </div>
            <div className="dash-stat-change">
              {monthlySavings != null ? 'vs. unsubsidized premium' : 'Pending analysis'}
            </div>
          </div>
          <div className="dash-stat">
            <div className="dash-stat-label">Claims Uploaded</div>
            <div className="dash-stat-val">{claimsCount}</div>
            <div className="dash-stat-change">{claimsCount === 0 ? 'Get started below' : 'Securely stored'}</div>
          </div>
        </div>

        <div className="dash-two-col">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="dash-card" id="upload-section">
              <div className="dash-card-header">
                <div className="dash-card-title">Upload Claims</div>
                <div className="dash-card-action">Drag &amp; drop or click</div>
              </div>
              <ClaimsUpload userId={user.id} onUploadComplete={fetchClaims} />
            </div>

            <div className="dash-card">
              <div className="dash-card-header">
                <div className="dash-card-title">Your Uploaded Files</div>
                <div className="dash-card-action">{claimsCount} file{claimsCount !== 1 ? 's' : ''}</div>
              </div>
              {claimsLoading ? (
                <div className="empty-state">
                  <div className="empty-state-desc">Loading your files...</div>
                </div>
              ) : claims.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📋</div>
                  <div className="empty-state-title">No files uploaded yet</div>
                  <div className="empty-state-desc">Upload your first claim above to get started.</div>
                </div>
              ) : (
                <div className="files-list">
                  {claims.map((claim) => (
                    <div key={claim.id} className="file-row">
                      <div className="file-icon">{getFileIcon(claim.file_type)}</div>
                      <div className="file-info">
                        <div className="file-name">{claim.file_name}</div>
                        <div className="file-meta">
                          {formatFileSize(claim.file_size)} · Uploaded {formatDate(claim.uploaded_at)}
                        </div>
                      </div>
                      <button
                        className="file-delete-btn"
                        onClick={() => handleDeleteClaim(claim)}
                        aria-label={`Delete ${claim.file_name}`}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="dash-card">
              <div className="dash-card-header">
                <div className="dash-card-title">Account</div>
              </div>
              <div className="account-list">
                <div className="account-row">
                  <div className="account-label">Name</div>
                  <div className="account-value">{firstName} {lastName}</div>
                </div>
                <div className="account-row">
                  <div className="account-label">Email</div>
                  <div className="account-value">{user.email}</div>
                </div>
                <div className="account-row">
                  <div className="account-label">Account Type</div>
                  <div className="account-value">{role}</div>
                </div>
                <div className="account-row">
                  <div className="account-label">Member Since</div>
                  <div className="account-value">{new Date(user.created_at).toLocaleDateString()}</div>
                </div>
              </div>
            </div>

            <div className="dash-card">
              <div className="dash-card-header">
                <div className="dash-card-title">Getting Started</div>
              </div>
              <div className="checklist">
                <div className="checklist-item done">
                  <div className="checklist-check">✓</div>
                  <div>
                    <div className="checklist-title">Create your account</div>
                    <div className="checklist-desc">Done — welcome to Clarity Health</div>
                  </div>
                </div>
                <div className={`checklist-item ${claimsCount > 0 ? 'done' : ''}`}>
                  <div className={`checklist-check ${claimsCount > 0 ? '' : 'empty'}`}>{claimsCount > 0 ? '✓' : '2'}</div>
                  <div>
                    <div className="checklist-title">Upload your claims</div>
                    <div className="checklist-desc">{claimsCount > 0 ? `${claimsCount} file${claimsCount !== 1 ? 's' : ''} uploaded` : 'Drag & drop above to get started'}</div>
                  </div>
                </div>
                <div className="checklist-item">
                  <div className="checklist-check empty">3</div>
                  <div>
                    <div className="checklist-title">Set your preferences</div>
                    <div className="checklist-desc">Conditions, family size, budget</div>
                  </div>
                </div>
                <div className={`checklist-item ${hasRecommendation ? 'done' : ''}`}>
                  <div className={`checklist-check ${hasRecommendation ? '' : 'empty'}`}>{hasRecommendation ? '✓' : '4'}</div>
                  <div>
                    <div className="checklist-title">Get your recommendations</div>
                    <div className="checklist-desc">
                      {hasRecommendation
                        ? `${recommendation?.plans?.length ?? 0} plans ranked for your household`
                        : 'AI-ranked plans tailored to you'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}