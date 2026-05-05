'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';
import BrokerSidebar from '../../components/BrokerSidebar';

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
};

type ClientLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

export default function BrokerGroupsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [agencyId, setAgencyId] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [clients, setClients] = useState<ClientLite[]>([]);

  // Add Group modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addName, setAddName] = useState('');
  const [addIndustry, setAddIndustry] = useState('');
  const [addLocation, setAddLocation] = useState('');
  const [addMemberCount, setAddMemberCount] = useState('');
  const [addStatus, setAddStatus] = useState<'Active' | 'Renewal' | 'Prospect' | 'Lost'>('Prospect');
  const [addRenewalDate, setAddRenewalDate] = useState('');
  const [addClientId, setAddClientId] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [addError, setAddError] = useState('');

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

    // Load groups
    const { data: groupsData } = await supabase
      .from('groups')
      .select('*')
      .eq('agency_id', brokerRow.agency_id)
      .order('created_at', { ascending: false });
    setGroups((groupsData as Group[]) || []);

    // Load clients (for the optional link dropdown)
    const { data: clientsData } = await supabase
      .from('clients')
      .select('id, first_name, last_name')
      .eq('agency_id', brokerRow.agency_id)
      .order('first_name', { ascending: true });
    setClients((clientsData as ClientLite[]) || []);

    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  function openAddModal() {
    setAddName('');
    setAddIndustry('');
    setAddLocation('');
    setAddMemberCount('');
    setAddStatus('Prospect');
    setAddRenewalDate('');
    setAddClientId('');
    setAddNotes('');
    setAddError('');
    setShowAddModal(true);
  }

  async function handleSaveGroup() {
    setAddError('');
    if (!addName.trim()) {
      setAddError('Group name is required.');
      return;
    }
    setSaving(true);

    const memberCountNum = addMemberCount.trim()
      ? parseInt(addMemberCount, 10)
      : 0;

    const payload: any = {
      agency_id: agencyId,
      name: addName.trim(),
      industry: addIndustry.trim() || null,
      location: addLocation.trim() || null,
      member_count: isNaN(memberCountNum) ? 0 : memberCountNum,
      status: addStatus,
      renewal_date: addRenewalDate || null,
      client_id: addClientId || null,
      notes: addNotes.trim() || null,
    };

    const { data: inserted, error } = await supabase
      .from('groups')
      .insert(payload)
      .select()
      .single();

      if (error) {
        setAddError(error.message || 'Could not save group.');
        setSaving(false);
        return;
      }
  
      // Activity log entry
      const { data: { user } } = await supabase.auth.getUser();
      if (user && inserted) {
        await supabase.from('activity_log').insert({
          agency_id: agencyId,
          actor_user_id: user.id,
          event_type: 'group_added',
          event_summary: `Added group: ${inserted.name}`,
          metadata: { group_id: inserted.id, group_name: inserted.name },
        });
      }

    setShowAddModal(false);
    setSaving(false);
    await loadAll();
  }

  function getClientName(clientId: string | null): string | null {
    if (!clientId) return null;
    const c = clients.find((cl) => cl.id === clientId);
    if (!c) return null;
    return `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Linked client';
  }

  function formatRenewalDate(d: string | null): string | null {
    if (!d) return null;
    // Parse YYYY-MM-DD without timezone slippage
    const parts = d.split('-');
    if (parts.length !== 3) return d;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  // Stats
  const totalGroups = groups.length;
  const totalMembers = groups.reduce((sum, g) => sum + (g.member_count || 0), 0);
  const activeCount = groups.filter((g) => g.status === 'Active').length;
  const upcomingRenewals = groups.filter((g) => {
    if (!g.renewal_date) return false;
    const parts = g.renewal_date.split('-');
    if (parts.length !== 3) return false;
    const renewal = new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10),
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor(
      (renewal.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    return diffDays >= 0 && diffDays <= 90;
  }).length;

  if (loading) {
    return (
      <div style={{ padding: 40, color: '#1e3a5f', fontFamily: 'Figtree, sans-serif' }}>
        Loading...
      </div>
    );
  }

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
        <div style={headerRow}>
          <div>
            <h1 style={pageTitle}>Groups</h1>
            <p style={pageSubtitle}>
              Manage employer groups and run census-based recommendations
            </p>
          </div>
          <button style={primaryBtn} onClick={openAddModal}>
            + Add Group
          </button>
        </div>

        {/* Stat tiles */}
        <div style={statsGrid}>
          <div style={statTile}>
            <div style={statLabel}>Total Groups</div>
            <div style={statValue}>{totalGroups}</div>
          </div>
          <div style={statTile}>
            <div style={statLabel}>Total Members</div>
            <div style={statValue}>{totalMembers}</div>
          </div>
          <div style={statTile}>
            <div style={statLabel}>Active</div>
            <div style={statValue}>{activeCount}</div>
          </div>
          <div style={statTile}>
            <div style={statLabel}>Renewals next 90d</div>
            <div style={statValue}>{upcomingRenewals}</div>
          </div>
        </div>

        {/* Empty state or grid */}
        {groups.length === 0 ? (
          <div style={emptyStateCard}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏢</div>
            <h3 style={emptyTitle}>No groups yet</h3>
            <p style={emptySubtitle}>
              Add your first employer group to start tracking members, renewals, and plan recommendations.
            </p>
            <button style={primaryBtn} onClick={openAddModal}>
              + Add Your First Group
            </button>
          </div>
        ) : (
          <div style={cardGrid}>
            {groups.map((g) => {
              const linkedClient = getClientName(g.client_id);
              return (
                <div
                  key={g.id}
                  style={groupCard}
                  onClick={() => router.push(`/broker/groups/${g.id}`)}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(30,58,95,0.08)';
                    (e.currentTarget as HTMLDivElement).style.borderColor = '#cbd5e0';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                    (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0';
                  }}
                >
                  <div style={cardHeader}>
                    <div style={industryBadge}>
                      {g.industry || 'No industry'}
                    </div>
                    <div style={statusPill(g.status)}>{g.status}</div>
                  </div>
                  <h3 style={groupCardTitle}>{g.name}</h3>
                  <div style={cardMeta}>
                    <span>👥 {g.member_count || 0} members</span>
                    {g.location && <span>📍 {g.location}</span>}
                    {g.renewal_date && (
                      <span>📅 Renews {formatRenewalDate(g.renewal_date)}</span>
                    )}
                    {linkedClient && (
                      <span style={{ color: '#7a9b76' }}>🔗 {linkedClient}</span>
                    )}
                  </div>
                  <div style={cardFooter}>
                    <span style={detailLink}>View details →</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Add Group Modal */}
      {showAddModal && (
        <div style={modalOverlay} onClick={() => !saving && setShowAddModal(false)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalTitle}>Add New Group</h2>

            <div style={formRow}>
              <label style={formLabel}>Group Name *</label>
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                style={formInput}
                placeholder="Acme Manufacturing"
              />
            </div>

            <div style={formRowDouble}>
              <div style={{ flex: 1 }}>
                <label style={formLabel}>Industry</label>
                <input
                  type="text"
                  value={addIndustry}
                  onChange={(e) => setAddIndustry(e.target.value)}
                  style={formInput}
                  placeholder="Manufacturing"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={formLabel}>Location</label>
                <input
                  type="text"
                  value={addLocation}
                  onChange={(e) => setAddLocation(e.target.value)}
                  style={formInput}
                  placeholder="Phoenix, AZ"
                />
              </div>
            </div>

            <div style={formRowDouble}>
              <div style={{ flex: 1 }}>
                <label style={formLabel}>Member Count</label>
                <input
                  type="number"
                  value={addMemberCount}
                  onChange={(e) => setAddMemberCount(e.target.value)}
                  style={formInput}
                  placeholder="0"
                  min="0"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={formLabel}>Status</label>
                <select
                  value={addStatus}
                  onChange={(e) => setAddStatus(e.target.value as any)}
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
                  value={addRenewalDate}
                  onChange={(e) => setAddRenewalDate(e.target.value)}
                  style={formInput}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={formLabel}>Link to Client (optional)</label>
                <select
                  value={addClientId}
                  onChange={(e) => setAddClientId(e.target.value)}
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
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                style={{ ...formInput, minHeight: 80, resize: 'vertical' as const }}
                placeholder="Optional notes about this group..."
              />
            </div>

            {addError && <div style={errorBox}>{addError}</div>}

            <div style={modalFooter}>
              <button
                style={secondaryBtn}
                onClick={() => setShowAddModal(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                style={primaryBtn}
                onClick={handleSaveGroup}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============= STYLES =============

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

const statsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 14,
  marginBottom: 28,
};

const statTile: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 18,
  fontFamily: 'Figtree, sans-serif',
};

const statLabel: React.CSSProperties = {
  fontSize: 12,
  color: '#7a8a9b',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  fontWeight: 600,
  marginBottom: 6,
};

const statValue: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 32,
  color: '#1e3a5f',
  fontWeight: 600,
};

const cardGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: 16,
};

const groupCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 18,
  fontFamily: 'Figtree, sans-serif',
  cursor: 'pointer',
  transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
};

const cardHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: 10,
  gap: 8,
};

const industryBadge: React.CSSProperties = {
  background: '#eef1f4',
  color: '#3a4d68',
  padding: '4px 10px',
  borderRadius: 12,
  fontSize: 11,
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
    padding: '4px 10px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
  };
}

const groupCardTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  color: '#1e3a5f',
  fontSize: 20,
  margin: '0 0 10px',
};

const cardMeta: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 13,
  color: '#3a4d68',
  marginBottom: 14,
};

const cardFooter: React.CSSProperties = {
  borderTop: '1px solid #eef1f4',
  paddingTop: 10,
};

const detailLink: React.CSSProperties = {
  color: '#7a9b76',
  fontSize: 13,
  fontWeight: 600,
};

const emptyStateCard: React.CSSProperties = {
  background: '#fff',
  border: '1px dashed #cbd5e0',
  borderRadius: 12,
  padding: 60,
  textAlign: 'center',
  fontFamily: 'Figtree, sans-serif',
};

const emptyTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  color: '#1e3a5f',
  fontSize: 24,
  margin: '0 0 8px',
};

const emptySubtitle: React.CSSProperties = {
  color: '#3a4d68',
  fontSize: 15,
  margin: '0 0 20px',
  maxWidth: 400,
  marginLeft: 'auto',
  marginRight: 'auto',
};

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