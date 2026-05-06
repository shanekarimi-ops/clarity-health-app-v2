'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';
import BrokerSidebar from '../../components/BrokerSidebar';

type BrokerRow = {
  id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'broker';
  email: string;
  first_name: string;
  last_name: string;
  client_count: number;
  recommendations_count: number;
  finalized_designs_count: number;
  is_you: boolean;
};

export default function BrokerTeamPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [myUserId, setMyUserId] = useState('');
  const [myRole, setMyRole] = useState<'owner' | 'admin' | 'broker'>('broker');
  const [agencyName, setAgencyName] = useState('');
  const [agencyId, setAgencyId] = useState('');
  const [brokers, setBrokers] = useState<BrokerRow[]>([]);

  // Modal state
  const [editTarget, setEditTarget] = useState<BrokerRow | null>(null);
  const [transferTarget, setTransferTarget] = useState<BrokerRow | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<BrokerRow | null>(null);
  const [pendingRole, setPendingRole] = useState<'admin' | 'broker'>('broker');
  const [transferConfirmText, setTransferConfirmText] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    loadEverything();
  }, []);

  async function loadEverything() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    setMyUserId(user.id);
    const meta = user.user_metadata || {};
    setFirstName(meta.first_name || '');
    setLastName(meta.last_name || '');

    const { data: myBroker } = await supabase
      .from('brokers')
      .select('id, agency_id, role, agencies(name)')
      .eq('user_id', user.id)
      .is('removed_at', null)
      .maybeSingle();

    if (!myBroker) {
      setLoading(false);
      return;
    }

    setMyRole((myBroker.role || 'broker') as any);
    setAgencyId(myBroker.agency_id);

    if (myBroker.agencies) {
      const agency: any = Array.isArray(myBroker.agencies)
        ? myBroker.agencies[0]
        : myBroker.agencies;
      setAgencyName(agency?.name || '');
    }

    await refreshRoster(myBroker.agency_id, user.id);
    setLoading(false);
  }

  async function refreshRoster(agId: string, uId: string) {
    const res = await fetch('/api/team/roster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agency_id: agId, user_id: uId }),
    });
    if (res.ok) {
      const data = await res.json();
      setBrokers(data.brokers || []);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  function openEdit(b: BrokerRow) {
    setEditTarget(b);
    setPendingRole(b.role === 'owner' ? 'admin' : (b.role as 'admin' | 'broker'));
    setActionError('');
  }

  function closeAllModals() {
    setEditTarget(null);
    setTransferTarget(null);
    setConfirmRemove(null);
    setTransferConfirmText('');
    setActionError('');
    setActionLoading(false);
  }

  async function handleSaveRole() {
    if (!editTarget) return;
    setActionLoading(true);
    setActionError('');

    const res = await fetch('/api/team/update-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caller_user_id: myUserId,
        target_broker_id: editTarget.id,
        new_role: pendingRole,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      setActionError(err.error || 'Failed to update role');
      setActionLoading(false);
      return;
    }

    await refreshRoster(agencyId, myUserId);
    closeAllModals();
  }

  async function handleRemoveBroker() {
    if (!confirmRemove) return;
    setActionLoading(true);
    setActionError('');

    const res = await fetch('/api/team/remove-broker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caller_user_id: myUserId,
        target_broker_id: confirmRemove.id,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      setActionError(err.error || 'Failed to remove broker');
      setActionLoading(false);
      return;
    }

    await refreshRoster(agencyId, myUserId);
    closeAllModals();
  }

  async function handleTransferOwnership() {
    if (!transferTarget) return;
    if (transferConfirmText !== 'TRANSFER') {
      setActionError('Type TRANSFER to confirm');
      return;
    }
    setActionLoading(true);
    setActionError('');

    const res = await fetch('/api/team/transfer-ownership', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caller_user_id: myUserId,
        target_broker_id: transferTarget.id,
        confirmation: 'TRANSFER',
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      setActionError(err.error || 'Failed to transfer ownership');
      setActionLoading(false);
      return;
    }

    // Re-load full state — your role changed
    await loadEverything();
    closeAllModals();
  }

  if (loading) {
    return (
      <div style={{ padding: 40, color: '#1e3a5f', fontFamily: 'Figtree, sans-serif' }}>
        Loading team...
      </div>
    );
  }

  const activeBrokers = brokers.length;
  const totalClients = brokers.reduce((sum, b) => sum + b.client_count, 0);
  const avgPerBroker = activeBrokers > 0 ? Math.round(totalClients / activeBrokers) : 0;

  const canInvite = myRole === 'owner' || myRole === 'admin';
  const canEdit = myRole === 'owner' || myRole === 'admin';

  return (
    <div className="dash-layout">
      <BrokerSidebar
        active="team"
        firstName={firstName}
        lastName={lastName}
        agencyName={agencyName}
        onLogout={handleLogout}
      />

      <main className="dash-main">
        <div style={headerRow}>
          <div>
            <h1 style={pageTitle}>Team</h1>
            <p style={pageSubtitle}>
              Manage brokers in {agencyName || 'your agency'} — invite teammates, set roles, and assign clients
            </p>
          </div>
          <button
            style={canInvite ? primaryBtn : primaryBtnDisabled}
            disabled={!canInvite}
            title={canInvite ? 'Invite a new broker' : 'Only Owners and Admins can invite'}
          >
            + Invite Broker
          </button>
        </div>

        <div style={statsRow}>
          <div style={statTile}>
            <div style={statLabel}>Active Brokers</div>
            <div style={statValue}>{activeBrokers}</div>
          </div>
          <div style={statTile}>
            <div style={statLabel}>Pending Invites</div>
            <div style={statValue}>—</div>
          </div>
          <div style={statTile}>
            <div style={statLabel}>Total Clients</div>
            <div style={statValue}>{totalClients}</div>
          </div>
          <div style={statTile}>
            <div style={statLabel}>Avg per Broker</div>
            <div style={statValue}>{avgPerBroker}</div>
          </div>
        </div>

        <div style={sectionTitle}>Broker Roster</div>

        <div style={tableCard}>
          <div style={tableHeader}>
            <div style={{ ...tableCol, flex: 2 }}>Broker</div>
            <div style={{ ...tableCol, flex: 2 }}>Email</div>
            <div style={{ ...tableCol, flex: 1 }}>Role</div>
            <div style={{ ...tableCol, flex: 1, textAlign: 'right' }}>Clients</div>
            <div style={{ ...tableCol, flex: 1, textAlign: 'right' }}>Recs</div>
            <div style={{ ...tableCol, flex: 1, textAlign: 'right' }}>Designs</div>
            <div style={{ ...tableCol, flex: 1, textAlign: 'right', paddingRight: 12 }}>Actions</div>
          </div>

          {brokers.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#7a8a9b', fontSize: 14 }}>
              No brokers in your agency yet.
            </div>
          )}

          {brokers.map((b) => {
            const initials = `${(b.first_name || '?').charAt(0)}${(b.last_name || '').charAt(0)}`.toUpperCase();
            const showEdit = canEdit && !b.is_you && !(myRole === 'admin' && b.role === 'owner');
            return (
              <div key={b.id} style={{ ...tableRow, background: b.is_you ? '#faf7f2' : '#fff' }}>
                <div style={{ ...tableCol, flex: 2, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={avatarReal}>{initials || '—'}</div>
                  <div>
                    <div style={{ fontWeight: 600, color: '#1e3a5f' }}>
                      {b.first_name || '(no name)'} {b.last_name || ''}
                    </div>
                    {b.is_you && <div style={{ fontSize: 12, color: '#7a8a9b' }}>You</div>}
                  </div>
                </div>
                <div style={{ ...tableCol, flex: 2, color: '#3a4d68', fontSize: 13 }}>{b.email || '—'}</div>
                <div style={{ ...tableCol, flex: 1 }}>
                  <span style={roleBadgeStyle(b.role)}>{b.role}</span>
                </div>
                <div style={{ ...tableCol, flex: 1, color: '#3a4d68', textAlign: 'right' }}>{b.client_count}</div>
                <div style={{ ...tableCol, flex: 1, color: '#3a4d68', textAlign: 'right' }}>{b.recommendations_count}</div>
                <div style={{ ...tableCol, flex: 1, color: '#3a4d68', textAlign: 'right' }}>{b.finalized_designs_count}</div>
                <div style={{ ...tableCol, flex: 1, textAlign: 'right', paddingRight: 12 }}>
                  {showEdit ? (
                    <button style={secondaryBtn} onClick={() => openEdit(b)}>Edit</button>
                  ) : (
                    <button style={secondaryBtnDisabled} disabled title={b.is_you ? 'You cannot edit yourself' : 'Insufficient permissions'}>Edit</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Owner-only: transfer ownership of self */}
        {myRole === 'owner' && brokers.length > 1 && (
          <div style={{ marginBottom: 24, color: '#7a8a9b', fontSize: 13, fontFamily: 'Figtree, sans-serif' }}>
            Need to step down as Owner?{' '}
            <button
              style={linkBtn}
              onClick={() => {
                const candidates = brokers.filter(b => !b.is_you);
                if (candidates.length > 0) {
                  setTransferTarget(candidates[0]);
                  setActionError('');
                }
              }}
            >
              Transfer ownership →
            </button>
          </div>
        )}
      </main>

      {/* Edit Modal */}
      {editTarget && (
        <div style={modalOverlay} onClick={closeAllModals}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <h2 style={modalTitle}>Edit broker</h2>
              <button style={modalClose} onClick={closeAllModals}>×</button>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 600, color: '#1e3a5f', fontSize: 16 }}>
                {editTarget.first_name} {editTarget.last_name}
              </div>
              <div style={{ color: '#7a8a9b', fontSize: 13 }}>{editTarget.email}</div>
              <div style={{ marginTop: 8 }}>
                <span style={roleBadgeStyle(editTarget.role)}>{editTarget.role}</span>
              </div>
            </div>

            {editTarget.role === 'owner' ? (
              <div style={callout}>
                This broker is the Owner. To change their role, use the "Transfer ownership" flow.
              </div>
            ) : (
              <>
                <div style={fieldLabel}>Role</div>
                <select
                  value={pendingRole}
                  onChange={(e) => setPendingRole(e.target.value as 'admin' | 'broker')}
                  style={selectStyle}
                  disabled={myRole === 'admin'}
                >
                  <option value="broker">Broker</option>
                  <option value="admin">Admin</option>
                </select>
                {myRole === 'admin' && (
                  <div style={{ fontSize: 12, color: '#7a8a9b', marginTop: 6 }}>
                    Only Owners can change roles to/from Admin.
                  </div>
                )}
              </>
            )}

            {myRole === 'owner' && editTarget.role !== 'owner' && (
              <div style={{ marginTop: 16 }}>
                <button
                  style={linkBtn}
                  onClick={() => {
                    setTransferTarget(editTarget);
                    setEditTarget(null);
                    setActionError('');
                  }}
                >
                  Transfer ownership to {editTarget.first_name} →
                </button>
              </div>
            )}

            {actionError && <div style={errorBox}>{actionError}</div>}

            <div style={modalActions}>
              <button
                style={dangerBtn}
                onClick={() => {
                  setConfirmRemove(editTarget);
                  setEditTarget(null);
                  setActionError('');
                }}
                disabled={actionLoading || editTarget.role === 'owner' || (myRole === 'admin' && editTarget.role !== 'broker')}
              >
                Remove broker
              </button>
              <div style={{ flex: 1 }} />
              <button style={secondaryBtn} onClick={closeAllModals} disabled={actionLoading}>
                Cancel
              </button>
              <button
                style={editTarget.role === 'owner' ? primaryBtnDisabled : primaryBtn}
                onClick={handleSaveRole}
                disabled={actionLoading || editTarget.role === 'owner' || pendingRole === editTarget.role}
              >
                {actionLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Remove Modal */}
      {confirmRemove && (
        <div style={modalOverlay} onClick={closeAllModals}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <h2 style={modalTitle}>Remove broker</h2>
              <button style={modalClose} onClick={closeAllModals}>×</button>
            </div>

            <div style={{ marginBottom: 18, color: '#3a4d68', fontSize: 14, lineHeight: 1.6 }}>
              You're about to remove <strong>{confirmRemove.first_name} {confirmRemove.last_name}</strong> from {agencyName}.
            </div>

            <div style={callout}>
              <strong>What happens:</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 13 }}>
                <li>Their {confirmRemove.client_count} client{confirmRemove.client_count === 1 ? '' : 's'} will be reassigned to you (Owner)</li>
                <li>They'll lose access to the agency immediately</li>
                <li>Their broker record is preserved for audit purposes</li>
              </ul>
            </div>

            {actionError && <div style={errorBox}>{actionError}</div>}

            <div style={modalActions}>
              <div style={{ flex: 1 }} />
              <button style={secondaryBtn} onClick={closeAllModals} disabled={actionLoading}>
                Cancel
              </button>
              <button style={dangerBtnFilled} onClick={handleRemoveBroker} disabled={actionLoading}>
                {actionLoading ? 'Removing...' : 'Remove broker'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Ownership Modal */}
      {transferTarget && (
        <div style={modalOverlay} onClick={closeAllModals}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <h2 style={modalTitle}>Transfer ownership</h2>
              <button style={modalClose} onClick={closeAllModals}>×</button>
            </div>

            <div style={{ marginBottom: 14, color: '#3a4d68', fontSize: 14, lineHeight: 1.6 }}>
              You're transferring ownership of <strong>{agencyName}</strong> to:
            </div>

            <div style={{ background: '#faf7f2', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontWeight: 600, color: '#1e3a5f' }}>
                {transferTarget.first_name} {transferTarget.last_name}
              </div>
              <div style={{ color: '#7a8a9b', fontSize: 13 }}>{transferTarget.email}</div>
            </div>

            <div style={dangerCallout}>
              <strong>This is permanent and irreversible from this UI.</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 13 }}>
                <li>{transferTarget.first_name} becomes the new Owner with full agency access</li>
                <li>You will be demoted to Admin</li>
                <li>Only the new Owner can transfer ownership back</li>
              </ul>
            </div>

            <div style={fieldLabel}>Type <strong>TRANSFER</strong> to confirm:</div>
            <input
              type="text"
              value={transferConfirmText}
              onChange={(e) => setTransferConfirmText(e.target.value)}
              placeholder="TRANSFER"
              style={inputStyle}
              autoFocus
            />

            {actionError && <div style={errorBox}>{actionError}</div>}

            <div style={modalActions}>
              <div style={{ flex: 1 }} />
              <button style={secondaryBtn} onClick={closeAllModals} disabled={actionLoading}>
                Cancel
              </button>
              <button
                style={transferConfirmText === 'TRANSFER' ? dangerBtnFilled : primaryBtnDisabled}
                onClick={handleTransferOwnership}
                disabled={actionLoading || transferConfirmText !== 'TRANSFER'}
              >
                {actionLoading ? 'Transferring...' : 'Transfer ownership'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function roleBadgeStyle(role: string): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '4px 10px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'capitalize',
    display: 'inline-block',
  };
  if (role === 'owner') return { ...base, background: '#e6f0e6', color: '#5a7a56' };
  if (role === 'admin') return { ...base, background: '#e8eef5', color: '#1e3a5f' };
  return { ...base, background: '#eef1f4', color: '#3a4d68' };
}

const headerRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
  marginBottom: 24, flexWrap: 'wrap', gap: 16,
};
const pageTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif', fontSize: 36, color: '#1e3a5f', margin: 0, marginBottom: 4,
};
const pageSubtitle: React.CSSProperties = {
  fontFamily: 'Figtree, sans-serif', color: '#3a4d68', margin: 0, fontSize: 15,
};
const primaryBtn: React.CSSProperties = {
  background: '#7a9b76', color: '#fff', border: 'none', padding: '12px 22px',
  borderRadius: 8, fontFamily: 'Figtree, sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer',
};
const primaryBtnDisabled: React.CSSProperties = {
  background: '#cbd5e0', color: '#fff', border: 'none', padding: '12px 22px',
  borderRadius: 8, fontFamily: 'Figtree, sans-serif', fontWeight: 600, fontSize: 14,
  cursor: 'not-allowed', opacity: 0.7,
};
const secondaryBtn: React.CSSProperties = {
  background: '#fff', color: '#1e3a5f', border: '1px solid #cbd5e0',
  padding: '8px 14px', borderRadius: 6, fontFamily: 'Figtree, sans-serif',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const secondaryBtnDisabled: React.CSSProperties = {
  background: '#fff', color: '#7a8a9b', border: '1px solid #e2e8f0',
  padding: '6px 12px', borderRadius: 6, fontFamily: 'Figtree, sans-serif',
  fontSize: 12, cursor: 'not-allowed',
};
const dangerBtn: React.CSSProperties = {
  background: '#fff', color: '#a04444', border: '1px solid #e8c8c8',
  padding: '8px 14px', borderRadius: 6, fontFamily: 'Figtree, sans-serif',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const dangerBtnFilled: React.CSSProperties = {
  background: '#a04444', color: '#fff', border: 'none',
  padding: '12px 22px', borderRadius: 8, fontFamily: 'Figtree, sans-serif',
  fontWeight: 600, fontSize: 14, cursor: 'pointer',
};
const linkBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#7a9b76',
  padding: 0, fontFamily: 'Figtree, sans-serif', fontSize: 13,
  fontWeight: 600, cursor: 'pointer', textDecoration: 'underline',
};
const statsRow: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 14, marginBottom: 28,
};
const statTile: React.CSSProperties = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 18,
  fontFamily: 'Figtree, sans-serif',
};
const statLabel: React.CSSProperties = {
  fontSize: 12, color: '#7a8a9b', textTransform: 'uppercase',
  letterSpacing: 0.5, marginBottom: 6,
};
const statValue: React.CSSProperties = {
  fontSize: 28, fontWeight: 700, color: '#1e3a5f', fontFamily: 'Playfair Display, serif',
};
const sectionTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif', fontSize: 22, color: '#1e3a5f', marginBottom: 14,
};
const tableCard: React.CSSProperties = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
  marginBottom: 28, overflow: 'hidden', fontFamily: 'Figtree, sans-serif',
};
const tableHeader: React.CSSProperties = {
  display: 'flex', background: '#eef1f4', padding: '12px 18px', fontSize: 12,
  fontWeight: 700, color: '#3a4d68', textTransform: 'uppercase',
  letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0',
};
const tableRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', padding: '14px 18px',
  borderBottom: '1px solid #eef1f4', fontSize: 14,
};
const tableCol: React.CSSProperties = { padding: '0 6px' };
const avatarReal: React.CSSProperties = {
  width: 36, height: 36, borderRadius: '50%', background: '#7a9b76', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontWeight: 600, fontSize: 13,
};

const modalOverlay: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(30, 58, 95, 0.5)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modalCard: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: 28, width: '100%',
  maxWidth: 480, fontFamily: 'Figtree, sans-serif', maxHeight: '90vh', overflowY: 'auto',
};
const modalHeader: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18,
};
const modalTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif', fontSize: 24, color: '#1e3a5f', margin: 0,
};
const modalClose: React.CSSProperties = {
  background: 'transparent', border: 'none', fontSize: 28, color: '#7a8a9b',
  cursor: 'pointer', padding: 0, lineHeight: 1,
};
const modalActions: React.CSSProperties = {
  display: 'flex', gap: 10, marginTop: 22, alignItems: 'center',
};
const fieldLabel: React.CSSProperties = {
  fontSize: 13, color: '#3a4d68', fontWeight: 600, marginBottom: 6, marginTop: 12,
};
const selectStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 6,
  border: '1px solid #cbd5e0', fontFamily: 'Figtree, sans-serif',
  fontSize: 14, color: '#1e3a5f', background: '#fff',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 6,
  border: '1px solid #cbd5e0', fontFamily: 'Figtree, sans-serif',
  fontSize: 14, color: '#1e3a5f', boxSizing: 'border-box',
};
const callout: React.CSSProperties = {
  background: '#faf7f2', border: '1px solid #e8e0d0', borderRadius: 8,
  padding: 14, fontSize: 13, color: '#3a4d68', marginTop: 12, lineHeight: 1.5,
};
const dangerCallout: React.CSSProperties = {
  background: '#fef0f0', border: '1px solid #f0c8c8', borderRadius: 8,
  padding: 14, fontSize: 13, color: '#7a3a3a', marginBottom: 16, lineHeight: 1.5,
};
const errorBox: React.CSSProperties = {
  background: '#fef0f0', border: '1px solid #f0c8c8', borderRadius: 6,
  padding: '10px 12px', fontSize: 13, color: '#a04444', marginTop: 14,
};