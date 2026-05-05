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

type HouseholdSummary = {
  id: string;
  zip_code: string | null;
  household_size: number | null;
  annual_income: number | null;
  coverage_scope: string | null;
  conditions: string[] | null;
  isComplete: boolean;
  memberCount: number;
  membersWithAge: number;
};

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [household, setHousehold] = useState<HouseholdSummary | null>(null);

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

  const fetchHousehold = useCallback(async () => {
    if (!user) return;
    const { data: hh } = await supabase
      .from('households')
      .select('id, zip_code, household_size, annual_income, coverage_scope, conditions')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!hh) {
      setHousehold(null);
      return;
    }

    const { data: memberRows } = await supabase
      .from('household_members')
      .select('age')
      .eq('household_id', hh.id);

    const memberCount = memberRows?.length ?? 0;
    const membersWithAge = (memberRows || []).filter((m: any) => m.age != null).length;
    const expectedSize = hh.household_size ?? 1;

    const isComplete =
      !!hh.zip_code &&
      !!hh.annual_income &&
      !!hh.household_size &&
      memberCount >= expectedSize &&
      membersWithAge >= expectedSize;

    setHousehold({
      ...hh,
      isComplete,
      memberCount,
      membersWithAge,
    });
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchClaims();
      fetchRecommendation();
      fetchHousehold();
    }
  }, [user, fetchClaims, fetchRecommendation, fetchHousehold]);

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
  const householdComplete = household?.isComplete ?? false;

  // Coverage scope pretty-print
  const coverageScopeLabel: Record<string, string> = {
    individual: 'Just you',
    employee_plus_spouse: 'You + spouse',
    employee_plus_children: 'You + child(ren)',
    family: 'Whole family',
  };

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

        {/* Welcome banner — priority order: rec > complete household > claims > new user */}
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
        ) : householdComplete ? (
          <div className="welcome-banner" style={{ background: '#ebf3ea', borderColor: '#7a9b76' }}>
            <div className="welcome-banner-icon">✨</div>
            <div style={{ flex: 1 }}>
              <div className="welcome-banner-title">Household is ready</div>
              <div className="welcome-banner-desc">
                You&apos;re set up to find Marketplace plans.{' '}
                <Link href="/find-plans" style={{ color: '#5a7857', fontWeight: 600 }}>
                  Get my recommendations →
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
                Start by setting up your{' '}
                <Link href="/household" style={{ color: '#1e3a5f', fontWeight: 600 }}>Household</Link>
                {' '}or upload your claims below.
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
                <Link href="/household" style={{ color: '#5a7857', fontWeight: 600 }}>Set up your Household to get recommendations →</Link>
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
            {/* Household Status card — new in P7 */}
            <div className="dash-card">
              <div className="dash-card-header">
                <div className="dash-card-title">Household</div>
                <Link href="/household" style={{ fontSize: '0.8rem', color: '#7a9b76', textDecoration: 'none', fontWeight: 600 }}>
                  {householdComplete ? 'Edit →' : 'Set up →'}
                </Link>
              </div>
              {!household ? (
                <div className="empty-state" style={{ padding: '1.25rem 0' }}>
                  <div className="empty-state-icon">👨‍👩‍👧</div>
                  <div className="empty-state-title">No household set up yet</div>
                  <div className="empty-state-desc" style={{ marginBottom: '1rem' }}>
                    Tell us who you&apos;re covering — we use this for every recommendation.
                  </div>
                  <Link href="/household" style={{ textDecoration: 'none' }}>
                    <button className="btn-sm btn-accent">Set up Household →</button>
                  </Link>
                </div>
              ) : householdComplete ? (
                <div className="account-list">
                  <div className="account-row">
                    <div className="account-label">Coverage</div>
                    <div className="account-value">
                      {coverageScopeLabel[household.coverage_scope || 'individual'] || household.coverage_scope}
                    </div>
                  </div>
                  <div className="account-row">
                    <div className="account-label">ZIP Code</div>
                    <div className="account-value">{household.zip_code}</div>
                  </div>
                  <div className="account-row">
                    <div className="account-label">Members</div>
                    <div className="account-value">{household.household_size}</div>
                  </div>
                  <div className="account-row">
                    <div className="account-label">Income</div>
                    <div className="account-value">${(household.annual_income ?? 0).toLocaleString()}</div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '1rem 0' }}>
                  <div style={{
                    backgroundColor: '#fff8e6',
                    borderLeft: '3px solid #d4a83c',
                    borderRadius: '6px',
                    padding: '0.75rem 1rem',
                    fontSize: '0.875rem',
                    color: '#3a4d68',
                    marginBottom: '1rem',
                  }}>
                    <strong style={{ color: '#1e3a5f' }}>Almost there!</strong>{' '}
                    Your household is missing some details. Finish it to unlock Marketplace recommendations.
                  </div>
                  <Link href="/household" style={{ textDecoration: 'none' }}>
                    <button className="btn-sm btn-accent">Complete Household →</button>
                  </Link>
                </div>
              )}
            </div>

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
                <div className={`checklist-item ${householdComplete ? 'done' : ''}`}>
                  <div className={`checklist-check ${householdComplete ? '' : 'empty'}`}>{householdComplete ? '✓' : '2'}</div>
                  <div>
                    <div className="checklist-title">Set up your Household</div>
                    <div className="checklist-desc">
                      {householdComplete
                        ? `${coverageScopeLabel[household?.coverage_scope || 'individual'] || 'Set'} · ${household?.household_size} member${household?.household_size === 1 ? '' : 's'}`
                        : household
                          ? 'Almost done — finish a few more fields'
                          : 'ZIP, household size, members, conditions'}
                    </div>
                  </div>
                </div>
                <div className={`checklist-item ${claimsCount > 0 ? 'done' : ''}`}>
                  <div className={`checklist-check ${claimsCount > 0 ? '' : 'empty'}`}>{claimsCount > 0 ? '✓' : '3'}</div>
                  <div>
                    <div className="checklist-title">Upload your claims</div>
                    <div className="checklist-desc">{claimsCount > 0 ? `${claimsCount} file${claimsCount !== 1 ? 's' : ''} uploaded` : 'Drag & drop above to get started'}</div>
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