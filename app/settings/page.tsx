'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../supabase';
import Sidebar from '../components/Sidebar';

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  // Profile section
  const [displayName, setDisplayName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');

  // Password section
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');

  // Delete section
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);
      const meta = user.user_metadata || {};
      const fullName = [meta.first_name, meta.last_name].filter(Boolean).join(' ');
      setDisplayName(meta.display_name || fullName || '');
      setLoading(false);
    }
    loadUser();
  }, [router]);

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg('');
    setProfileErr('');

    const { error } = await supabase.auth.updateUser({
      data: { display_name: displayName.trim() }
    });

    setProfileSaving(false);

    if (error) {
      setProfileErr(error.message);
      return;
    }
    setProfileMsg('Profile updated successfully.');
    setTimeout(() => setProfileMsg(''), 4000);
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwSaving(true);
    setPwMsg('');
    setPwErr('');

    if (newPassword.length < 6) {
      setPwErr('Password must be at least 6 characters.');
      setPwSaving(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwErr('Passwords do not match.');
      setPwSaving(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    setPwSaving(false);

    if (error) {
      setPwErr(error.message);
      return;
    }
    setPwMsg('Password updated successfully.');
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => setPwMsg(''), 4000);
  }

  async function handleDeleteAccount() {
    if (deleteText !== 'DELETE') {
      setDeleteErr('Please type DELETE to confirm.');
      return;
    }
    setDeleting(true);
    setDeleteErr('');
    setDeleteErr('Account deletion requires support assistance. Please email support@clarityhealth.com to delete your account.');
    setDeleting(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loading) {
    return (
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh'}}>
        <p>Loading settings...</p>
      </div>
    );
  }

  const firstName = user?.user_metadata?.first_name || '';
  const lastName = user?.user_metadata?.last_name || '';
  const role = user?.user_metadata?.role || 'Individual';

  return (
    <div className="dash-layout">
      <Sidebar
        active="settings"
        firstName={firstName}
        lastName={lastName}
        role={role}
        onLogout={handleLogout}
      />

      <main className="dash-main">
        <div className="dash-header">
          <div>
            <div className="dash-greeting">Settings</div>
            <div className="dash-date">Manage your account and preferences</div>
          </div>
        </div>

        {/* Profile section */}
        <div className="dash-card" style={{marginBottom: '1.5rem'}}>
          <div className="dash-card-header">
            <div className="dash-card-title">Profile</div>
          </div>
          <p style={{color: '#6b7785', fontSize: '0.9rem', margin: '0 0 1.25rem 0'}}>Update your display name and personal information.</p>

          <form onSubmit={handleProfileSave} style={{maxWidth: '480px'}}>
            <div className="form-field">
              <label className="form-label">Display name</label>
              <input
                className="form-input"
                type="text"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={profileSaving}
              />
            </div>

            {profileErr && <div style={{color: '#d95858', fontSize: '0.85rem', marginTop: '0.75rem'}}>{profileErr}</div>}
            {profileMsg && <div style={{color: '#7a9b76', fontSize: '0.85rem', marginTop: '0.75rem'}}>{profileMsg}</div>}

            <button type="submit" className="btn-sm btn-accent" style={{marginTop: '1rem'}} disabled={profileSaving}>
              {profileSaving ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        </div>

        {/* Account info section */}
        <div className="dash-card" style={{marginBottom: '1.5rem'}}>
          <div className="dash-card-header">
            <div className="dash-card-title">Account information</div>
          </div>
          <p style={{color: '#6b7785', fontSize: '0.9rem', margin: '0 0 1.25rem 0'}}>Read-only details about your account.</p>

          <div className="account-list">
            <div className="account-row">
              <div className="account-label">Email</div>
              <div className="account-value">{user?.email}</div>
            </div>
            <div className="account-row">
              <div className="account-label">Account Type</div>
              <div className="account-value">{role}</div>
            </div>
            <div className="account-row">
              <div className="account-label">Member Since</div>
              <div className="account-value">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</div>
            </div>
          </div>
        </div>

        {/* Security section */}
        <div className="dash-card" style={{marginBottom: '1.5rem'}}>
          <div className="dash-card-header">
            <div className="dash-card-title">Security</div>
          </div>
          <p style={{color: '#6b7785', fontSize: '0.9rem', margin: '0 0 1.25rem 0'}}>Update your password to keep your account secure.</p>

          <form onSubmit={handlePasswordChange} style={{maxWidth: '480px'}}>
            <div className="form-field">
              <label className="form-label">New password</label>
              <input
                className="form-input"
                type="password"
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={pwSaving}
              />
            </div>
            <div className="form-field">
              <label className="form-label">Confirm new password</label>
              <input
                className="form-input"
                type="password"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={pwSaving}
              />
            </div>

            {pwErr && <div style={{color: '#d95858', fontSize: '0.85rem', marginTop: '0.75rem'}}>{pwErr}</div>}
            {pwMsg && <div style={{color: '#7a9b76', fontSize: '0.85rem', marginTop: '0.75rem'}}>{pwMsg}</div>}

            <button type="submit" className="btn-sm btn-accent" style={{marginTop: '1rem'}} disabled={pwSaving}>
              {pwSaving ? 'Updating...' : 'Update password'}
            </button>
          </form>
        </div>

        {/* Danger zone */}
        <div className="dash-card" style={{marginBottom: '1.5rem', borderColor: '#f3d4d4', backgroundColor: '#fdf6f6'}}>
          <div className="dash-card-header">
            <div className="dash-card-title" style={{color: '#a33b3b'}}>Danger zone</div>
          </div>
          <p style={{color: '#6b7785', fontSize: '0.9rem', margin: '0 0 1.25rem 0'}}>Permanently delete your account and all associated data.</p>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{backgroundColor: '#fff', color: '#a33b3b', border: '1px solid #d95858', padding: '0.6rem 1.25rem', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem'}}
            >
              Delete my account
            </button>
          ) : (
            <div style={{maxWidth: '480px'}}>
              <p style={{fontSize: '0.9rem', color: '#3a4d68', marginBottom: '1rem'}}>
                This action cannot be undone. To confirm, type <strong>DELETE</strong> below.
              </p>
              <input
                className="form-input"
                type="text"
                placeholder="Type DELETE to confirm"
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                disabled={deleting}
                style={{maxWidth: '320px'}}
              />
              {deleteErr && <div style={{color: '#d95858', fontSize: '0.85rem', marginTop: '0.75rem'}}>{deleteErr}</div>}
              <div style={{marginTop: '1rem', display: 'flex', gap: '0.75rem'}}>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting || deleteText !== 'DELETE'}
                  style={{backgroundColor: '#d95858', color: '#fff', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '6px', fontWeight: 600, cursor: deleteText === 'DELETE' ? 'pointer' : 'not-allowed', fontSize: '0.9rem', opacity: deleteText === 'DELETE' ? 1 : 0.5}}
                >
                  {deleting ? 'Deleting...' : 'Permanently delete account'}
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteText(''); setDeleteErr(''); }}
                  style={{backgroundColor: '#fff', color: '#1e3a5f', border: '1px solid #c4cdd5', padding: '0.6rem 1.25rem', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem'}}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}