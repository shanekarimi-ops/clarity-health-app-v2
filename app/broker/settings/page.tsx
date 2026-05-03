'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';
import BrokerSidebar from '../../components/BrokerSidebar';

export default function BrokerSettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // user
  const [userId, setUserId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');

  // broker / agency
  const [role, setRole] = useState('');
  const [agencyId, setAgencyId] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [agencyCreatedAt, setAgencyCreatedAt] = useState('');

  // edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');

  // toast
  const [toast, setToast] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    const meta = user.user_metadata || {};
    setUserId(user.id);
    setFirstName(meta.first_name || '');
    setLastName(meta.last_name || '');
    setEmail(user.email || '');

    const { data: brokerRow } = await supabase
      .from('brokers')
      .select('agency_id, role, agencies(id, name, created_at)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (brokerRow) {
      setRole(brokerRow.role || 'broker');
      setAgencyId(brokerRow.agency_id || '');

      if (brokerRow.agencies) {
        const agency: any = Array.isArray(brokerRow.agencies)
          ? brokerRow.agencies[0]
          : brokerRow.agencies;
        setAgencyName(agency?.name || '');
        setAgencyCreatedAt(agency?.created_at || '');
      }
    }

    setLoading(false);
  }

  function openEditModal() {
    setEditName(agencyName);
    setEditError('');
    setShowEditModal(true);
  }

  function closeEditModal() {
    setShowEditModal(false);
    setEditError('');
  }

  async function saveAgencyName() {
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditError('Agency name cannot be empty.');
      return;
    }
    if (trimmed === agencyName) {
      closeEditModal();
      return;
    }

    setSaving(true);
    setEditError('');

    const oldName = agencyName;

    const { error } = await supabase
      .from('agencies')
      .update({ name: trimmed })
      .eq('id', agencyId);

    if (error) {
      setEditError('Could not save: ' + error.message);
      setSaving(false);
      return;
    }

    setAgencyName(trimmed);

    // log activity (fire and forget — agency-level event, no client_id)
    try {
      await supabase.from('activity_log').insert({
        agency_id: agencyId,
        client_id: null,
        actor_user_id: userId,
        actor_name: `${firstName} ${lastName}`.trim(),
        event_type: 'agency_edited',
        event_summary: `Renamed agency from "${oldName}" to "${trimmed}"`,
        metadata: { old_name: oldName, new_name: trimmed },
      });
    } catch (logErr) {
      console.warn('Activity log insert failed', logErr);
    }

    setSaving(false);
    closeEditModal();
    showToast('Agency name saved');
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (loading) {
    return (
      <div style={{ padding: 40, color: '#1e3a5f', fontFamily: 'Figtree, sans-serif' }}>
        Loading...
      </div>
    );
  }

  const isOwner = role === 'owner';
  const createdDate = agencyCreatedAt
    ? new Date(agencyCreatedAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : '—';

  return (
    <div className="dash-shell">
      <BrokerSidebar
        active="settings"
        firstName={firstName}
        lastName={lastName}
        agencyName={agencyName}
        onLogout={handleLogout}
      />

      <main className="dash-main">
        <div style={headerRow}>
          <div>
            <h1 style={pageTitle}>Settings</h1>
            <p style={pageSubtitle}>
              Manage your agency profile, branding, and account preferences
            </p>
          </div>
        </div>

        {/* AGENCY INFO */}
        <div style={card}>
          <div style={cardHeader}>
            <div>
              <div style={cardLabel}>Agency</div>
              <h2 style={cardTitle}>{agencyName || 'Untitled Agency'}</h2>
            </div>
            {isOwner && (
              <button style={editBtn} onClick={openEditModal}>
                ✏️ Edit
              </button>
            )}
          </div>

          <div style={metaGrid}>
            <div>
              <div style={metaLabel}>Your Role</div>
              <div style={metaValue}>
                <span style={isOwner ? roleBadgeOwner : roleBadge}>{role || '—'}</span>
              </div>
            </div>
            <div>
              <div style={metaLabel}>Agency Created</div>
              <div style={metaValue}>{createdDate}</div>
            </div>
            <div>
              <div style={metaLabel}>Agency ID</div>
              <div style={{ ...metaValue, fontFamily: 'monospace', fontSize: 12 }}>
                {agencyId.substring(0, 13)}…
              </div>
            </div>
          </div>

          {!isOwner && (
            <div style={infoBanner}>
              Only the agency owner can edit agency settings.
            </div>
          )}
        </div>

        {/* BRANDING */}
        <div style={card}>
          <div style={cardHeader}>
            <div>
              <div style={cardLabel}>Branding</div>
              <h2 style={cardTitle}>Logo & Colors</h2>
            </div>
            <div style={comingSoonPill}>Coming in Session 19</div>
          </div>

          <div style={brandingGrid}>
            <div>
              <div style={metaLabel}>Agency Logo</div>
              <div style={logoDropzone}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>🖼️</div>
                <div style={{ fontWeight: 600, color: '#1e3a5f', marginBottom: 4 }}>
                  No logo uploaded
                </div>
                <div style={{ fontSize: 12, color: '#7a8a9b' }}>
                  PNG or SVG, max 2MB
                </div>
              </div>
              <button style={secondaryBtnDisabled} disabled>
                + Upload Logo
              </button>
            </div>

            <div>
              <div style={metaLabel}>Primary Color</div>
              <div style={colorRow}>
                <div style={{ ...colorSwatch, background: '#1e3a5f' }} />
                <div style={colorInputWrap}>
                  <input
                    type="text"
                    value="#1e3a5f"
                    disabled
                    style={colorInputDisabled}
                  />
                </div>
              </div>

              <div style={{ ...metaLabel, marginTop: 16 }}>Accent Color</div>
              <div style={colorRow}>
                <div style={{ ...colorSwatch, background: '#7a9b76' }} />
                <div style={colorInputWrap}>
                  <input
                    type="text"
                    value="#7a9b76"
                    disabled
                    style={colorInputDisabled}
                  />
                </div>
              </div>

              <button style={{ ...secondaryBtnDisabled, marginTop: 16 }} disabled>
                Save Branding
              </button>
            </div>
          </div>
        </div>

        {/* ACCOUNT */}
        <div style={card}>
          <div style={cardHeader}>
            <div>
              <div style={cardLabel}>Account</div>
              <h2 style={cardTitle}>Your Profile</h2>
            </div>
          </div>

          <div style={metaGrid}>
            <div>
              <div style={metaLabel}>Name</div>
              <div style={metaValue}>{firstName} {lastName}</div>
            </div>
            <div>
              <div style={metaLabel}>Email</div>
              <div style={metaValue}>{email}</div>
            </div>
            <div>
              <div style={metaLabel}>User ID</div>
              <div style={{ ...metaValue, fontFamily: 'monospace', fontSize: 12 }}>
                {userId.substring(0, 13)}…
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <button style={secondaryBtnDisabled} disabled title="Coming in Session 19">
              Change Password
            </button>
            <button style={secondaryBtnDisabled} disabled title="Coming in Session 19">
              Update Profile
            </button>
            <button style={signOutBtn} onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        </div>

        {/* DANGER ZONE — owner only */}
        {isOwner && (
          <div style={dangerCard}>
            <div style={cardHeader}>
              <div>
                <div style={dangerLabel}>Danger Zone</div>
                <h2 style={cardTitle}>Delete Agency</h2>
              </div>
            </div>

            <p style={{
              color: '#3a4d68',
              fontSize: 14,
              lineHeight: 1.6,
              fontFamily: 'Figtree, sans-serif',
              marginTop: 4,
              marginBottom: 14,
            }}>
              Permanently delete <strong>{agencyName}</strong> and all associated clients,
              claims, recommendations, and notes. This cannot be undone.
            </p>

            <button style={dangerBtnDisabled} disabled title="Coming in Session 19">
              🗑 Delete Agency
            </button>
          </div>
        )}
      </main>

      {/* EDIT MODAL */}
      {showEditModal && (
        <div style={modalOverlay} onClick={closeEditModal}>
          <div style={modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalTitle}>Edit Agency Name</h2>

            <div style={{ marginTop: 18 }}>
              <label style={modalLabel}>Agency Name *</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={modalInput}
                autoFocus
              />
            </div>

            {editError && (
              <div style={modalError}>{editError}</div>
            )}

            <div style={modalActions}>
              <button
                style={modalCancelBtn}
                onClick={closeEditModal}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                style={modalSaveBtn}
                onClick={saveAgencyName}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div style={toastStyle}>
          ✓ {toast}
        </div>
      )}
    </div>
  );
}

const headerRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  marginBottom: 24,
  flexWrap: 'wrap',
  gap: 16,
};

const pageTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 36,
  color: '#1e3a5f',
  margin: 0,
  marginBottom: 4,
};

const pageSubtitle: React.CSSProperties = {
  fontFamily: 'Figtree, sans-serif',
  color: '#3a4d68',
  margin: 0,
  fontSize: 15,
};

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 24,
  marginBottom: 20,
  fontFamily: 'Figtree, sans-serif',
};

const cardHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: 16,
  flexWrap: 'wrap',
  gap: 10,
};

const cardLabel: React.CSSProperties = {
  fontSize: 11,
  color: '#7a8a9b',
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  fontWeight: 600,
  marginBottom: 4,
};

const cardTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  color: '#1e3a5f',
  fontSize: 24,
  margin: 0,
};

const editBtn: React.CSSProperties = {
  background: '#1e3a5f',
  color: '#fff',
  border: 'none',
  padding: '8px 16px',
  borderRadius: 6,
  fontFamily: 'Figtree, sans-serif',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
};

const comingSoonPill: React.CSSProperties = {
  background: '#eef1f4',
  color: '#3a4d68',
  padding: '4px 10px',
  borderRadius: 12,
  fontSize: 11,
  fontWeight: 600,
};

const metaGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 16,
};

const metaLabel: React.CSSProperties = {
  fontSize: 11,
  color: '#7a8a9b',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  fontWeight: 600,
  marginBottom: 6,
};

const metaValue: React.CSSProperties = {
  fontSize: 15,
  color: '#1e3a5f',
  fontWeight: 500,
};

const roleBadge: React.CSSProperties = {
  background: '#eef1f4',
  color: '#3a4d68',
  padding: '4px 10px',
  borderRadius: 12,
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'capitalize',
};

const roleBadgeOwner: React.CSSProperties = {
  background: '#e6f0e6',
  color: '#5a7a56',
  padding: '4px 10px',
  borderRadius: 12,
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'capitalize',
};

const infoBanner: React.CSSProperties = {
  background: '#eef1f4',
  color: '#3a4d68',
  padding: '10px 14px',
  borderRadius: 6,
  fontSize: 13,
  marginTop: 16,
};

const brandingGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 24,
  opacity: 0.85,
};

const logoDropzone: React.CSSProperties = {
  background: '#faf7f2',
  border: '2px dashed #cbd5e0',
  borderRadius: 8,
  padding: '28px 20px',
  textAlign: 'center',
  marginBottom: 12,
};

const colorRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const colorSwatch: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 6,
  border: '1px solid #cbd5e0',
  flexShrink: 0,
};

const colorInputWrap: React.CSSProperties = {
  flex: 1,
};

const colorInputDisabled: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  fontFamily: 'monospace',
  fontSize: 13,
  background: '#f7f9fb',
  color: '#7a8a9b',
  cursor: 'not-allowed',
};

const secondaryBtnDisabled: React.CSSProperties = {
  background: '#fff',
  color: '#7a8a9b',
  border: '1px solid #e2e8f0',
  padding: '8px 14px',
  borderRadius: 6,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  cursor: 'not-allowed',
};

const signOutBtn: React.CSSProperties = {
  background: '#fff',
  color: '#1e3a5f',
  border: '1px solid #1e3a5f',
  padding: '8px 14px',
  borderRadius: 6,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const dangerCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #f4c5c5',
  borderRadius: 10,
  padding: 24,
  marginBottom: 20,
  fontFamily: 'Figtree, sans-serif',
};

const dangerLabel: React.CSSProperties = {
  fontSize: 11,
  color: '#a83838',
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  fontWeight: 700,
  marginBottom: 4,
};

const dangerBtnDisabled: React.CSSProperties = {
  background: '#fff',
  color: '#a83838',
  border: '1px solid #f4c5c5',
  padding: '10px 18px',
  borderRadius: 6,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'not-allowed',
  opacity: 0.6,
};

const modalOverlay: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(30, 58, 95, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 20,
};

const modalContent: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 28,
  maxWidth: 480,
  width: '100%',
  fontFamily: 'Figtree, sans-serif',
  boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
};

const modalTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  color: '#1e3a5f',
  fontSize: 24,
  margin: 0,
};

const modalLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#3a4d68',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 6,
};

const modalInput: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #cbd5e0',
  borderRadius: 6,
  fontSize: 14,
  fontFamily: 'Figtree, sans-serif',
};

const modalError: React.CSSProperties = {
  background: '#fde8e8',
  color: '#a83838',
  padding: '10px 14px',
  borderRadius: 6,
  fontSize: 13,
  marginTop: 14,
};

const modalActions: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  marginTop: 22,
};

const modalCancelBtn: React.CSSProperties = {
  background: '#fff',
  color: '#3a4d68',
  border: '1px solid #cbd5e0',
  padding: '9px 18px',
  borderRadius: 6,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const modalSaveBtn: React.CSSProperties = {
  background: '#1e3a5f',
  color: '#fff',
  border: 'none',
  padding: '9px 22px',
  borderRadius: 6,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const toastStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 30,
  right: 30,
  background: '#7a9b76',
  color: '#fff',
  padding: '12px 20px',
  borderRadius: 8,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 14,
  fontWeight: 600,
  boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
  zIndex: 1001,
};