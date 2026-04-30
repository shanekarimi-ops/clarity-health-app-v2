'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '../supabase';
import ClaimsUpload from '../components/ClaimsUpload';

type Claim = {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  uploaded_at: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);

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

  useEffect(() => {
    if (user) {
      fetchClaims();
    }
  }, [user, fetchClaims]);

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
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh'}}>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  const firstName = user?.user_metadata?.first_name || 'there';
  const lastName = user?.user_metadata?.last_name || '';
  const role = user?.user_metadata?.role || 'Individual';
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

  const claimsCount = claims.length;

  return (
    <div className="dash-layout">
      <aside className="dash-sidebar">
        <a href="/" className="logo-mark">
          <Image src="/logo.png" alt="Clarity Health logo" width={32} height={32} style={{filter: 'brightness(1.4)'}} />
          <span className="logo-text">Clarity <em>Health</em></span>
        </a>

        <div className="dash-section-label">Main</div>
        <div className="dash-nav-item active"><div className="dash-nav-icon">🏠</div> Dashboard</div>
        <div className="dash-nav-item"><div className="dash-nav-icon">📋</div> My Plans <span className="soon-tag">soon</span></div>
        <div className="dash-nav-item"><div className="dash-nav-icon">⚖️</div> Compare Plans <span className="soon-tag">soon</span></div>

        <div className="dash-section-label">My Data</div>
        <div className="dash-nav-item"><div className="dash-nav-icon">📄</div> Claims & Profile <span className="soon-tag">soon</span></div>
        <div className="dash-nav-item"><div className="dash-nav-icon">📎</div> Uploaded Files <span className="soon-tag">soon</span></div>

        <div className="dash-section-label">Account</div>
        <a href="/settings" style={{textDecoration: 'none', color: 'inherit'}}>
          <div className="dash-nav-item"><div className="dash-nav-icon">⚙️</div> Settings</div>
        </a>
        <div className="dash-nav-item"><div className="dash-nav-icon">💳</div> Billing <span className="soon-tag">soon</span></div>
        <div className="dash-nav-item"><div className="dash-nav-icon">❓</div> Help</div>

        <div className="dash-sidebar-footer">
          <div className="dash-user">
            <div className="dash-avatar">{initials}</div>
            <div style={{flex: 1, minWidth: 0}}>
              <div className="dash-user-name">{firstName} {lastName}</div>
              <div className="dash-user-role">{role}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="dash-logout-btn">Log Out</button>
        </div>
      </aside>

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

        {claimsCount === 0 ? (
          <div className="welcome-banner">
            <div className="welcome-banner-icon">✨</div>
            <div style={{flex: 1}}>
              <div className="welcome-banner-title">You&apos;re all set up!</div>
              <div className="welcome-banner-desc">
                Upload your claims below to start getting personalized plan recommendations based on your real health data.
              </div>
            </div>
          </div>
        ) : (
          <div className="welcome-banner" style={{background: '#ebf3ea', borderColor: '#7a9b76'}}>
            <div className="welcome-banner-icon">📊</div>
            <div style={{flex: 1}}>
              <div className="welcome-banner-title">{claimsCount} claim{claimsCount !== 1 ? 's' : ''} uploaded</div>
              <div className="welcome-banner-desc">
                Your data is securely stored. AI plan recommendations will appear here in the next phase of the build.
              </div>
            </div>
          </div>
        )}

        <div className="dash-stat-row">
          <div className="dash-stat">
            <div className="dash-stat-label">Top Match Score</div>
            <div className="dash-stat-val muted-val">—</div>
            <div className="dash-stat-change">Coming with AI engine</div>
          </div>
          <div className="dash-stat">
            <div className="dash-stat-label">Est. Monthly Savings</div>
            <div className="dash-stat-val muted-val">—</div>
            <div className="dash-stat-change">Pending analysis</div>
          </div>
          <div className="dash-stat">
            <div className="dash-stat-label">Claims Uploaded</div>
            <div className="dash-stat-val">{claimsCount}</div>
            <div className="dash-stat-change">{claimsCount === 0 ? 'Get started below' : 'Securely stored'}</div>
          </div>
        </div>

        <div className="dash-two-col">
          <div style={{display: 'flex', flexDirection: 'column', gap: '1.25rem'}}>
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

          <div style={{display: 'flex', flexDirection: 'column', gap: '1.25rem'}}>
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
                <div className="checklist-item">
                  <div className="checklist-check empty">4</div>
                  <div>
                    <div className="checklist-title">Get your recommendations</div>
                    <div className="checklist-desc">AI-ranked plans tailored to you</div>
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