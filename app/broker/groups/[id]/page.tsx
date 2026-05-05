'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '../../../supabase';
import BrokerSidebar from '../../../components/BrokerSidebar';

type Group = {
  id: string;
  agency_id: string;
  client_id: string | null;
  name: string;
  industry: string | null;
  location: string | null;
  member_count: number | null;
  status: 'Active' | 'Renewal' | 'Prospect' | 'Lost';
  renewal_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ClientLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type ActivityEvent = {
  id: string;
  event_type: string;
  event_summary: string;
  created_at: string;
  metadata: any;
};

export default function GroupDetailPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [agencyId, setAgencyId] = useState('');
  const [group, setGroup] = useState<Group | null>(null);
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [notFound, setNotFound] = useState(false);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editIndustry, setEditIndustry] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editMemberCount, setEditMemberCount] = useState('');
  const [editStatus, setEditStatus] = useState<'Active' | 'Renewal' | 'Prospect' | 'Lost'>('Active');
  const [editRenewalDate, setEditRenewalDate] = useState('');
  const [editClientId, setEditClientId] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState('');

  // Delete confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  async function loadAll() {
    if (!groupId) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    const meta = user.user_metadata || {};
    setFirstName(meta.first_name || '');
    setLastName(meta.last_name || '');

    const { data: brokerRow } = await supabase
      .from('brokers')
      .select('agency_id, agencies(name)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!brokerRow) {
      setLoading(false);
      return;
    }

    const agency: any = Array.isArray(brokerRow.agencies)
      ? brokerRow.agencies[0]
      : brokerRow.agencies;
    setAgencyName(agency?.name || '');
    setAgencyId(brokerRow.agency_id);

    // Load this group
    const { data: groupData, error: groupError } = await supabase
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .eq('agency_id', brokerRow.agency_id)
      .maybeSingle();

    if (groupError || !groupData) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setGroup(groupData as Group);

    // Load clients for the optional link dropdown
    const { data: clientsData } = await supabase
      .from('clients')
      .select('id, first_name, last_name')
      .eq('agency_id', brokerRow.agency_id)
      .order('first_name', { ascending: true });
    setClients((clientsData as ClientLite[]) || []);

    // Load activity log entries for this group
    const { data: activityData } = await supabase
      .from('activity_log')
      .select('id, event_type, event_summary, created_at, metadata')
      .eq('agency_id', brokerRow.agency_id)
      .order('created_at', { ascending: false })
      .limit(100);

    const filtered = ((activityData as ActivityEvent[]) || []).filter(
      (e) => e.metadata && e.metadata.group_id === groupId,
    );
    setActivity(filtered);

    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  function openEditModal() {
    if (!group) return;
    setEditName(group.name);
    setEditIndustry(group.industry || '');
    setEditLocation(group.location || '');
    setEditMemberCount(String(group.member_count || 0));
    setEditStatus(group.status);
    setEditRenewalDate(group.renewal_date || '');
    setEditClientId(group.client_id || '');
    setEditNotes(group.notes || '');
    setEditError('');
    setShowEditModal(true);
  }

  async function handleSaveEdit() {
    if (!group) return;
    setEditError('');
    if (!editName.trim()) {
      setEditError('Group name is required.');
      return;
    }
    setSaving(true);

    const memberCountNum = editMemberCount.trim()
      ? parseInt(editMemberCount, 10)
      : 0;

    const oldRenewal = group.renewal_date;
    const newRenewal = editRenewalDate || null;

    const payload: any = {
      name: editName.trim(),
      industry: editIndustry.trim() || null,
      location: editLocation.trim() || null,
      member_count: isNaN(memberCountNum) ? 0 : memberCountNum,
      status: editStatus,
      renewal_date: newRenewal,
      client_id: editClientId || null,
      notes: editNotes.trim() || null,
    };

    const { error } = await supabase
      .from('groups')
      .update(payload)
      .eq('id', group.id);

    if (error) {
      setEditError(error.message || 'Could not save group.');
      setSaving(false);
      return;
    }

    // Smart activity logging
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      let summary = `Edited group: ${editName.trim()}`;
      let eventType = 'group_edited';

      if (oldRenewal !== newRenewal) {
        if (newRenewal && !oldRenewal) {
          summary = `Set renewal date for ${editName.trim()}`;
          eventType = 'renewal_date_set';
        } else if (!newRenewal && oldRenewal) {
          summary = `Cleared renewal date for ${editName.trim()}`;
          eventType = 'renewal_date_cleared';
        } else {
          summary = `Updated renewal date for ${editName.trim()}`;
          eventType = 'renewal_date_set';
        }
      }

      await supabase.from('activity_log').insert({
        agency_id: agencyId,
        broker_user_id: user.id,
        event_type: eventType,
        event_summary: summary,
        metadata: { group_id: group.id, group_name: editName.trim() },
      });
    }

    setShowEditModal(false);
    setSaving(false);
    await loadAll();
  }

  async function handleDelete() {
    if (!group) return;
    setDeleting(true);

    const groupName = group.name;
    const { error } = await supabase.from('groups').delete().eq('id', group.id);

    if (error) {
      alert(error.message || 'Could not delete group.');
      setDeleting(false);
      return;
    }

    // Activity log
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('activity_log').insert({
        agency_id: agencyId,
        broker_user_id: user.id,
        event_type: 'group_deleted',
        event_summary: `Deleted group: ${groupName}`,
        metadata: { group_name: groupName },
      });
    }

    router.push('/broker/groups');
  }

  function getClientName(clientId: string | null): string | null {
    if (!clientId) return null;
    const c = clients.find((cl) => cl.id === clientId);
    if (!c) return null;
    return `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Linked client';
  }

  function formatDate(d: string | null, includeTime = false): string {
    if (!d) return '—';
    const date = new Date(d);
    if (includeTime) {
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    }
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function formatRenewalDate(d: string | null): string | null {
    if (!d) return null;
    const parts = d.split('-');
    if (parts.length !== 3) return d;
    const date = new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10),
    );
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function daysUntilRenewal(d: string | null): number | null {
    if (!d) return null;
    const parts = d.split('-');
    if (parts.length !== 3) return null;
    const renewal = new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10),
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((renewal.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  function renewalBadgeStyle(days: number | null): React.CSSProperties {
    if (days === null) return { display: 'none' };
    let bg = '#e6f0e6', fg = '#5a7a56';
    if (days < 0) { bg = '#eef1f4'; fg = '#7a8a9b'; }
    else if (days <= 30) { bg = '#f1e6e6'; fg = '#8a3a3a'; }
    else if (days <= 60) { bg = '#fef3e6'; fg = '#a06d2a'; }
    else if (days <= 90) { bg = '#e6eef5'; fg = '#1e3a5f'; }
    return {
      background: bg,
      color: fg,
      padding: '6px 12px',
      borderRadius: 14,
      fontSize: 13,
      fontWeight: 600,
      display: 'inline-block',
    };
  }

  function eventIcon(type: string): string {
    const map: Record<string, string> = {
      group_added: '🏢',
      group_edited: '✏️',
      group_deleted: '🗑️',
      renewal_date_set: '📅',
      renewal_date_cleared: '📅',
    };
    return map[type] || '•';
  }

  if (loading) {
    return (
      <div style={{ padding: 40, color: '#1e3a5f', fontFamily: 'Figtree, sans-serif' }}>
        Loading...
      </div>
    );
  }

  if (notFound || !group) {
    return (
      <div className="dash-layout">
        <BrokerSidebar
          active="groups"
          firstName={firstName}
          lastName={lastName}
          agencyName={agencyName}
          onLogout={handleLogout}
        />
        <main className="dash-main">
          <div style={{ padding: 40, fontFamily: 'Figtree, sans-serif' }}>
            <h1 style={{ fontFamily: 'Playfair Display, serif', color: '#1e3a5f' }}>
              Group not found
            </h1>
            <p style={{ color: '#3a4d68' }}>
              This group doesn't exist or you don't have access to it.
            </p>
            <button
              style={primaryBtn}
              onClick={() => router.push('/broker/groups')}
            >
              ← Back to Groups
            </button>
          </div>
        </main>
      </div>
    );
  }

  const linkedClient = getClientName(group.client_id);
  const renewalDays = daysUntilRenewal(group.renewal_date);
  const renewalLabel =
    renewalDays === null
      ? null
      : renewalDays < 0
      ? `Past · ${formatRenewalDate(group.renewal_date)}`
      : `Renews ${formatRenewalDate(group.renewal_date)} · in ${renewalDays}d`;

  return (
    <div className="dash-layout">
      <BrokerSidebar
        active="groups"
        firstName={firstName}
        lastName={lastName}
        agencyName={agencyName}
        onLogout={handleLogout}
      />

      <main className="dash-main">
        <button style={backLink} onClick={() => router.push('/broker/groups')}>
          ← Back to Groups
        </button>

        {/* Header */}
        <div style={headerCard}>
          <div style={headerTop}>
            <div style={industryBadge}>{group.industry || 'No industry'}</div>
            <div style={statusPill(group.status)}>{group.status}</div>
          </div>
          <h1 style={pageTitle}>{group.name}</h1>
          <div style={headerMeta}>
            {group.location && <span>📍 {group.location}</span>}
            <span>👥 {group.member_count || 0} members</span>
            {linkedClient && <span style={{ color: '#7a9b76' }}>🔗 {linkedClient}</span>}
          </div>
          {renewalLabel && (
            <div style={{ marginTop: 12 }}>
              <span style={renewalBadgeStyle(renewalDays)}>📅 {renewalLabel}</span>
            </div>
          )}
          <div style={headerActions}>
            <button style={primaryBtn} onClick={openEditModal}>
              Edit Group
            </button>
            <button style={dangerBtn} onClick={() => setShowDeleteConfirm(true)}>
              Delete
            </button>
          </div>
        </div>

        {/* 2-column layout: info + activity */}
        <div style={twoColGrid}>
          {/* Left column: info */}
          <div>
            <div style={infoCard}>
              <h2 style={cardTitle}>Group Info</h2>
              <div style={infoRow}>
                <span style={infoLabel}>Industry</span>
                <span style={infoValue}>{group.industry || '—'}</span>
              </div>
              <div style={infoRow}>
                <span style={infoLabel}>Location</span>
                <span style={infoValue}>{group.location || '—'}</span>
              </div>
              <div style={infoRow}>
                <span style={infoLabel}>Members</span>
                <span style={infoValue}>{group.member_count || 0}</span>
              </div>
              <div style={infoRow}>
                <span style={infoLabel}>Status</span>
                <span style={infoValue}>{group.status}</span>
              </div>
              <div style={infoRow}>
                <span style={infoLabel}>Renewal Date</span>
                <span style={infoValue}>
                  {formatRenewalDate(group.renewal_date) || '—'}
                </span>
              </div>
              <div style={infoRow}>
                <span style={infoLabel}>Linked Client</span>
                <span style={infoValue}>
                  {linkedClient ? (
                    <span
                      style={{ color: '#7a9b76', cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => router.push(`/broker/clients/${group.client_id}`)}
                    >
                      {linkedClient}
                    </span>
                  ) : (
                    '—'
                  )}
                </span>
              </div>
              <div style={infoRow}>
                <span style={infoLabel}>Created</span>
                <span style={infoValue}>{formatDate(group.created_at)}</span>
              </div>
            </div>

            {group.notes && (
              <div style={{ ...infoCard, marginTop: 16 }}>
                <h2 style={cardTitle}>Notes</h2>
                <p style={notesText}>{group.notes}</p>
              </div>
            )}

            {/* Census placeholder */}
            <div style={{ ...infoCard, marginTop: 16 }}>
              <h2 style={cardTitle}>Census</h2>
              <div style={placeholderBox}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                <strong style={{ color: '#1e3a5f' }}>Census upload coming in Push 3</strong>
                <p style={{ color: '#3a4d68', fontSize: 13, margin: '8px 0 0' }}>
                  Upload CSV or Excel files to parse member data, track ages, and generate carrier recommendations.
                </p>
              </div>
            </div>
          </div>

          {/* Right column: activity */}
          <div style={infoCard}>
            <h2 style={cardTitle}>Activity</h2>
            {activity.length === 0 ? (
              <p style={{ color: '#7a8a9b', fontSize: 14, fontStyle: 'italic' }}>
                No activity yet for this group.
              </p>
            ) : (
              <div style={activityList}>
                {activity.map((e) => (
                  <div key={e.id} style={activityItem}>
                    <span style={activityIcon}>{eventIcon(e.event_type)}</span>
                    <div style={{ flex: 1 }}>
                      <div style={activityText}>{e.event_summary}</div>
                      <div style={activityTime}>{formatDate(e.created_at, true)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Edit Group Modal */}
      {showEditModal && (
        <div style={modalOverlay} onClick={() => !saving && setShowEditModal(false)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalTitle}>Edit Group</h2>

            <div style={formRow}>
              <label style={formLabel}>Group Name *</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={formInput}
              />
            </div>

            <div style={formRowDouble}>
              <div style={{ flex: 1 }}>
                <label style={formLabel}>Industry</label>
                <input
                  type="text"
                  value={editIndustry}
                  onChange={(e) => setEditIndustry(e.target.value)}
                  style={formInput}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={formLabel}>Location</label>
                <input
                  type="text"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  style={formInput}
                />
              </div>
            </div>

            <div style={formRowDouble}>
              <div style={{ flex: 1 }}>
                <label style={formLabel}>Member Count</label>
                <input
                  type="number"
                  value={editMemberCount}
                  onChange={(e) => setEditMemberCount(e.target.value)}
                  style={formInput}
                  min="0"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={formLabel}>Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  style={formInput}
                >
                  <option value="Prospect">Prospect</option>
                  <option value="Active">Active</option>
                  <option value="Renewal">Renewal</option>
                  <option value="Lost">Lost</option>
                </select>
              </div>
            </div>

            <div style={formRowDouble}>
              <div style={{ flex: 1 }}>
                <label style={formLabel}>Renewal Date</label>
                <input
                  type="date"
                  value={editRenewalDate}
                  onChange={(e) => setEditRenewalDate(e.target.value)}
                  style={formInput}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={formLabel}>Link to Client</label>
                <select
                  value={editClientId}
                  onChange={(e) => setEditClientId(e.target.value)}
                  style={formInput}
                >
                  <option value="">— None —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {(c.first_name || '') + ' ' + (c.last_name || '')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={formRow}>
              <label style={formLabel}>Notes</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                style={{ ...formInput, minHeight: 80, resize: 'vertical' as const }}
              />
            </div>

            {editError && <div style={errorBox}>{editError}</div>}

            <div style={modalFooter}>
              <button style={secondaryBtn} onClick={() => setShowEditModal(false)} disabled={saving}>
                Cancel
              </button>
              <button style={primaryBtn} onClick={handleSaveEdit} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {showDeleteConfirm && (
        <div style={modalOverlay} onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div style={{ ...modalCard, maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalTitle}>Delete this group?</h2>
            <p style={{ color: '#3a4d68', fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
              You are about to permanently delete <strong>{group.name}</strong>. This cannot be undone.
            </p>
            <div style={modalFooter}>
              <button style={secondaryBtn} onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>
                Cancel
              </button>
              <button style={dangerBtn} onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============= STYLES =============

const backLink: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#7a9b76',
  fontSize: 14,
  fontWeight: 600,
  fontFamily: 'Figtree, sans-serif',
  cursor: 'pointer',
  padding: 0,
  marginBottom: 16,
};

const headerCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: 24,
  marginBottom: 20,
  fontFamily: 'Figtree, sans-serif',
};

const headerTop: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  marginBottom: 12,
  flexWrap: 'wrap',
};

const pageTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 36,
  color: '#1e3a5f',
  margin: '0 0 8px',
};

const headerMeta: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  fontSize: 14,
  color: '#3a4d68',
  flexWrap: 'wrap',
};

const headerActions: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  marginTop: 18,
  flexWrap: 'wrap',
};

const primaryBtn: React.CSSProperties = {
  background: '#7a9b76',
  color: '#fff',
  border: 'none',
  padding: '12px 22px',
  borderRadius: 8,
  fontFamily: 'Figtree, sans-serif',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  background: '#fff',
  color: '#3a4d68',
  border: '1px solid #cbd5e0',
  padding: '12px 22px',
  borderRadius: 8,
  fontFamily: 'Figtree, sans-serif',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
};

const dangerBtn: React.CSSProperties = {
  background: '#fff',
  color: '#8a3a3a',
  border: '1px solid #d4a5a5',
  padding: '12px 22px',
  borderRadius: 8,
  fontFamily: 'Figtree, sans-serif',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
};

const twoColGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
  gap: 16,
};

const infoCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 20,
  fontFamily: 'Figtree, sans-serif',
};

const cardTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  color: '#1e3a5f',
  fontSize: 20,
  margin: '0 0 14px',
};

const infoRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '10px 0',
  borderBottom: '1px solid #eef1f4',
  fontSize: 14,
};

const infoLabel: React.CSSProperties = {
  color: '#7a8a9b',
  fontWeight: 600,
};

const infoValue: React.CSSProperties = {
  color: '#1e3a5f',
  textAlign: 'right',
};

const notesText: React.CSSProperties = {
  color: '#3a4d68',
  fontSize: 14,
  lineHeight: 1.6,
  margin: 0,
  whiteSpace: 'pre-wrap',
};

const placeholderBox: React.CSSProperties = {
  background: 'linear-gradient(135deg, #faf7f2 0%, #eef1f4 100%)',
  border: '1px dashed #cbd5e0',
  borderRadius: 8,
  padding: 24,
  textAlign: 'center',
};

const activityList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const activityItem: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  padding: '8px 0',
  borderBottom: '1px solid #eef1f4',
  alignItems: 'flex-start',
};

const activityIcon: React.CSSProperties = {
  fontSize: 16,
  marginTop: 1,
};

const activityText: React.CSSProperties = {
  fontSize: 13,
  color: '#1e3a5f',
  fontWeight: 500,
};

const activityTime: React.CSSProperties = {
  fontSize: 11,
  color: '#7a8a9b',
  marginTop: 2,
};

const industryBadge: React.CSSProperties = {
  background: '#eef1f4',
  color: '#3a4d68',
  padding: '6px 12px',
  borderRadius: 14,
  fontSize: 12,
  fontWeight: 600,
};

function statusPill(status: string): React.CSSProperties {
  const colors: Record<string, { bg: string; fg: string }> = {
    Active: { bg: '#e6f0e6', fg: '#5a7a56' },
    Renewal: { bg: '#fef3e6', fg: '#a06d2a' },
    Prospect: { bg: '#e6eef5', fg: '#1e3a5f' },
    Lost: { bg: '#f1e6e6', fg: '#8a3a3a' },
  };
  const c = colors[status] || { bg: '#eef1f4', fg: '#3a4d68' };
  return {
    background: c.bg,
    color: c.fg,
    padding: '6px 12px',
    borderRadius: 14,
    fontSize: 12,
    fontWeight: 600,
  };
}

const modalOverlay: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(30, 58, 95, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
  padding: 20,
};

const modalCard: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 28,
  maxWidth: 600,
  width: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
  fontFamily: 'Figtree, sans-serif',
};

const modalTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  color: '#1e3a5f',
  fontSize: 24,
  margin: '0 0 20px',
};

const formRow: React.CSSProperties = {
  marginBottom: 16,
};

const formRowDouble: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  marginBottom: 16,
  flexWrap: 'wrap',
};

const formLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  color: '#3a4d68',
  fontWeight: 600,
  marginBottom: 6,
};

const formInput: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #cbd5e0',
  borderRadius: 6,
  fontSize: 14,
  fontFamily: 'Figtree, sans-serif',
  color: '#1e3a5f',
  boxSizing: 'border-box',
};

const errorBox: React.CSSProperties = {
  background: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#991b1b',
  padding: '10px 12px',
  borderRadius: 6,
  fontSize: 13,
  marginBottom: 16,
};

const modalFooter: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  marginTop: 8,
};