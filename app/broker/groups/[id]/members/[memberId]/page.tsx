'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '../../../../../supabase';
import BrokerSidebar from '../../../../../components/BrokerSidebar';

type Member = {
  id: string;
  group_id: string;
  agency_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  date_of_birth: string | null;
  age: number | null;
  gender: string | null;
  relationship: string | null;
  salary_amount: number | null;
  tier: string | null;
  zip_code: string | null;
  state: string | null;
  coverage_type: string | null;
  current_plan: string | null;
  created_at: string;
  updated_at: string;
};

type GroupLite = {
  id: string;
  name: string;
};

export default function MemberDetailPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params?.id as string;
  const memberId = params?.memberId as string;

  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [member, setMember] = useState<Member | null>(null);
  const [group, setGroup] = useState<GroupLite | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [agencyId, setAgencyId] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editGender, setEditGender] = useState('');
  const [editRelationship, setEditRelationship] = useState('');
  const [editSalary, setEditSalary] = useState('');
  const [editTier, setEditTier] = useState('');
  const [editZip, setEditZip] = useState('');
  const [editState, setEditState] = useState('');
  const [editCoverageType, setEditCoverageType] = useState('');
  const [editCurrentPlan, setEditCurrentPlan] = useState('');

  // Delete confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadMember();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, groupId]);

  async function loadMember() {
    if (!memberId || !groupId) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    setCurrentUserId(user.id);

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

    // Load member (RLS handles access control)
    const { data: memberData, error: memberError } = await supabase
      .from('group_members')
      .select('*')
      .eq('id', memberId)
      .eq('group_id', groupId)
      .maybeSingle();

    if (memberError || !memberData) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setMember(memberData as Member);

    // Load group name for breadcrumb context
    const { data: groupData } = await supabase
      .from('groups')
      .select('id, name')
      .eq('id', groupId)
      .maybeSingle();

    if (groupData) setGroup(groupData as GroupLite);

    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  function formatDate(d: string | null): string {
    if (!d) return '—';
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function formatSalary(amt: number | null): string {
    if (amt === null || amt === undefined) return '—';
    return `$${amt.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }

  // ============= EDIT HANDLERS =============

  function startEdit() {
    if (!member) return;
    setEditFirstName(member.first_name || '');
    setEditLastName(member.last_name || '');
    setEditEmail(member.email || '');
    setEditDob(member.date_of_birth || '');
    setEditAge(member.age !== null ? String(member.age) : '');
    setEditGender(member.gender || '');
    setEditRelationship(member.relationship || '');
    setEditSalary(member.salary_amount !== null ? String(member.salary_amount) : '');
    setEditTier(member.tier || '');
    setEditZip(member.zip_code || '');
    setEditState(member.state || '');
    setEditCoverageType(member.coverage_type || '');
    setEditCurrentPlan(member.current_plan || '');
    setEditError('');
    setEditMode(true);
  }

  function cancelEdit() {
    setEditMode(false);
    setEditError('');
  }

  async function handleSave() {
    if (!member) return;
    setEditError('');
    setSaving(true);

    // Coerce values
    const ageNum = editAge.trim() ? parseInt(editAge.trim(), 10) : null;
    const salaryNum = editSalary.trim()
      ? parseFloat(editSalary.replace(/[\$,\s]/g, ''))
      : null;

    const payload = {
      first_name: editFirstName.trim() || null,
      last_name: editLastName.trim() || null,
      email: editEmail.trim() || null,
      date_of_birth: editDob.trim() || null,
      age: ageNum !== null && !isNaN(ageNum) ? ageNum : null,
      gender: editGender.trim() || null,
      relationship: editRelationship.trim() || null,
      salary_amount: salaryNum !== null && !isNaN(salaryNum) ? salaryNum : null,
      tier: editTier.trim() || null,
      zip_code: editZip.trim() || null,
      state: editState.trim() || null,
      coverage_type: editCoverageType.trim() || null,
      current_plan: editCurrentPlan.trim() || null,
    };

    // Detect changed fields for activity log summary
    const fieldLabels: Record<string, string> = {
      first_name: 'first name',
      last_name: 'last name',
      email: 'email',
      date_of_birth: 'date of birth',
      age: 'age',
      gender: 'gender',
      relationship: 'relationship',
      salary_amount: 'salary',
      tier: 'tier',
      zip_code: 'zip code',
      state: 'state',
      coverage_type: 'coverage type',
      current_plan: 'current plan',
    };

    const changed: string[] = [];
    for (const key of Object.keys(payload) as (keyof typeof payload)[]) {
      const before = (member as any)[key];
      const after = (payload as any)[key];
      // Treat null/empty as equivalent
      const a = before === null || before === undefined || before === '' ? null : before;
      const b = after === null || after === undefined || after === '' ? null : after;
      if (a !== b) changed.push(fieldLabels[key as string] || key);
    }

    const { error } = await supabase
      .from('group_members')
      .update(payload)
      .eq('id', member.id);

    if (error) {
      setEditError(error.message || 'Could not save changes.');
      setSaving(false);
      return;
    }

    // Activity log entry — only if something actually changed
    if (changed.length > 0) {
      const memberName = `${editFirstName.trim()} ${editLastName.trim()}`.trim() || 'a member';
      const fieldsList = changed.length <= 3
        ? changed.join(', ')
        : `${changed.slice(0, 2).join(', ')} and ${changed.length - 2} more`;

      await supabase.from('activity_log').insert({
        agency_id: agencyId,
        actor_user_id: currentUserId,
        event_type: 'member_edited',
        event_summary: `Updated ${memberName}: ${fieldsList}`,
        metadata: {
          group_id: groupId,
          member_id: member.id,
          changed_fields: changed,
        },
      });
    }

    setEditMode(false);
    setSaving(false);
    await loadMember();
  }

  async function handleDelete() {
    if (!member) return;
    setDeleting(true);

    const memberName = `${member.first_name || ''} ${member.last_name || ''}`.trim() || 'a member';

    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('id', member.id);

    if (error) {
      alert(error.message || 'Could not delete member.');
      setDeleting(false);
      return;
    }

    // Decrement group's member_count
    if (group) {
      const { data: countData } = await supabase
        .from('group_members')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', groupId);
      const newCount = (countData as any)?.length ?? null;
      // Fallback: just count remaining members directly
      const { count } = await supabase
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId);
      await supabase
        .from('groups')
        .update({ member_count: count ?? 0 })
        .eq('id', groupId);
    }

    // Activity log
    await supabase.from('activity_log').insert({
      agency_id: agencyId,
      actor_user_id: currentUserId,
      event_type: 'member_deleted',
      event_summary: `Deleted ${memberName} from census`,
      metadata: {
        group_id: groupId,
        member_id: member.id,
        member_name: memberName,
      },
    });

    router.push(`/broker/groups/${groupId}`);
  }

  function relationshipBadgeStyle(rel: string | null): React.CSSProperties {
    const r = (rel || '').toLowerCase();
    let bg = '#eef1f4', fg = '#3a4d68';
    if (r.includes('employee') || r === 'ee') { bg = '#e6eef5'; fg = '#1e3a5f'; }
    else if (r.includes('spouse') || r.includes('partner')) { bg = '#f1ece6'; fg = '#7a5a3a'; }
    else if (r.includes('child')) { bg = '#e6f0e6'; fg = '#5a7a56'; }
    return {
      background: bg,
      color: fg,
      padding: '6px 12px',
      borderRadius: 14,
      fontSize: 12,
      fontWeight: 600,
      display: 'inline-block',
    };
  }

  if (loading) {
    return (
      <div style={{ padding: 40, color: '#1e3a5f', fontFamily: 'Figtree, sans-serif' }}>
        Loading...
      </div>
    );
  }

  if (notFound || !member) {
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
              Member not found
            </h1>
            <p style={{ color: '#3a4d68' }}>
              This member doesn't exist, was removed, or you don't have access.
            </p>
            <button
              style={primaryBtn}
              onClick={() => router.push(`/broker/groups/${groupId}`)}
            >
              ← Back to Group
            </button>
          </div>
        </main>
      </div>
    );
  }

  const fullName = `${member.first_name || ''} ${member.last_name || ''}`.trim() || 'Unnamed Member';
  const groupName = group?.name || 'Group';

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
        <button style={backLink} onClick={() => router.push(`/broker/groups/${groupId}`)}>
          ← Back to {groupName}
        </button>

        {/* Header */}
        <div style={headerCard}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {member.relationship && (
              <span style={relationshipBadgeStyle(member.relationship)}>
                {member.relationship}
              </span>
            )}
            {member.age !== null && (
              <span style={ageBadge}>{member.age} years old</span>
            )}
          </div>
          <h1 style={pageTitle}>{fullName}</h1>
          {member.email && (
            <div style={{ fontSize: 14, color: '#7a8a9b', marginTop: 4 }}>
              ✉️ {member.email}
            </div>
          )}
          <div style={headerActions}>
            {!editMode ? (
              <>
                <button style={primaryBtnEnabled} onClick={startEdit}>
                  Edit Member
                </button>
                <button style={dangerBtnEnabled} onClick={() => setShowDeleteConfirm(true)}>
                  Delete
                </button>
              </>
            ) : null}
          </div>
        </div>

        {/* Info card */}
        <div style={infoCard}>
          <h2 style={cardTitle}>Member Details</h2>

          {editError && <div style={errorBox}>{editError}</div>}

          {!editMode ? (
            <div style={infoGrid}>
              <div style={infoBlock}>
                <h3 style={infoBlockTitle}>Personal</h3>
                <div style={infoRow}>
                  <span style={infoLabel}>First Name</span>
                  <span style={infoValue}>{member.first_name || '—'}</span>
                </div>
                <div style={infoRow}>
                  <span style={infoLabel}>Last Name</span>
                  <span style={infoValue}>{member.last_name || '—'}</span>
                </div>
                <div style={infoRow}>
                  <span style={infoLabel}>Email</span>
                  <span style={infoValue}>{member.email || '—'}</span>
                </div>
                <div style={infoRow}>
                  <span style={infoLabel}>Date of Birth</span>
                  <span style={infoValue}>{formatDate(member.date_of_birth)}</span>
                </div>
                <div style={infoRow}>
                  <span style={infoLabel}>Age</span>
                  <span style={infoValue}>{member.age ?? '—'}</span>
                </div>
                <div style={infoRow}>
                  <span style={infoLabel}>Gender</span>
                  <span style={infoValue}>{member.gender || '—'}</span>
                </div>
                <div style={infoRow}>
                  <span style={infoLabel}>Relationship</span>
                  <span style={infoValue}>{member.relationship || '—'}</span>
                </div>
              </div>

              <div style={infoBlock}>
                <h3 style={infoBlockTitle}>Coverage & Location</h3>
                <div style={infoRow}>
                  <span style={infoLabel}>Salary</span>
                  <span style={infoValue}>{formatSalary(member.salary_amount)}</span>
                </div>
                <div style={infoRow}>
                  <span style={infoLabel}>Coverage Tier</span>
                  <span style={infoValue}>{member.tier || '—'}</span>
                </div>
                <div style={infoRow}>
                  <span style={infoLabel}>Coverage Type</span>
                  <span style={infoValue}>{member.coverage_type || '—'}</span>
                </div>
                <div style={infoRow}>
                  <span style={infoLabel}>Current Plan</span>
                  <span style={infoValue}>{member.current_plan || '—'}</span>
                </div>
                <div style={infoRow}>
                  <span style={infoLabel}>Zip Code</span>
                  <span style={infoValue}>{member.zip_code || '—'}</span>
                </div>
                <div style={infoRow}>
                  <span style={infoLabel}>State</span>
                  <span style={infoValue}>{member.state || '—'}</span>
                </div>
                <div style={infoRow}>
                  <span style={infoLabel}>Added</span>
                  <span style={infoValue}>{formatDate(member.created_at)}</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={infoGrid}>
                <div style={infoBlock}>
                  <h3 style={infoBlockTitle}>Personal</h3>
                  <div style={editRow}>
                    <label style={editLabel}>First Name</label>
                    <input type="text" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} style={editInput} />
                  </div>
                  <div style={editRow}>
                    <label style={editLabel}>Last Name</label>
                    <input type="text" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} style={editInput} />
                  </div>
                  <div style={editRow}>
                    <label style={editLabel}>Email</label>
                    <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} style={editInput} />
                  </div>
                  <div style={editRow}>
                    <label style={editLabel}>Date of Birth</label>
                    <input type="date" value={editDob} onChange={(e) => setEditDob(e.target.value)} style={editInput} />
                  </div>
                  <div style={editRow}>
                    <label style={editLabel}>Age</label>
                    <input type="number" value={editAge} onChange={(e) => setEditAge(e.target.value)} style={editInput} min="0" max="130" />
                  </div>
                  <div style={editRow}>
                    <label style={editLabel}>Gender</label>
                    <input type="text" value={editGender} onChange={(e) => setEditGender(e.target.value)} style={editInput} placeholder="M / F / Other" />
                  </div>
                  <div style={editRow}>
                    <label style={editLabel}>Relationship</label>
                    <select value={editRelationship} onChange={(e) => setEditRelationship(e.target.value)} style={editInput}>
                      <option value="">— Select —</option>
                      <option value="Employee">Employee</option>
                      <option value="Spouse">Spouse</option>
                      <option value="Domestic Partner">Domestic Partner</option>
                      <option value="Child">Child</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div style={infoBlock}>
                  <h3 style={infoBlockTitle}>Coverage & Location</h3>
                  <div style={editRow}>
                    <label style={editLabel}>Salary</label>
                    <input type="text" value={editSalary} onChange={(e) => setEditSalary(e.target.value)} style={editInput} placeholder="75000" />
                  </div>
                  <div style={editRow}>
                    <label style={editLabel}>Coverage Tier</label>
                    <input type="text" value={editTier} onChange={(e) => setEditTier(e.target.value)} style={editInput} placeholder="EE Only / EE+Spouse / Family" />
                  </div>
                  <div style={editRow}>
                    <label style={editLabel}>Coverage Type</label>
                    <input type="text" value={editCoverageType} onChange={(e) => setEditCoverageType(e.target.value)} style={editInput} placeholder="Medical / Dental / Vision" />
                  </div>
                  <div style={editRow}>
                    <label style={editLabel}>Current Plan</label>
                    <input type="text" value={editCurrentPlan} onChange={(e) => setEditCurrentPlan(e.target.value)} style={editInput} />
                  </div>
                  <div style={editRow}>
                    <label style={editLabel}>Zip Code</label>
                    <input type="text" value={editZip} onChange={(e) => setEditZip(e.target.value)} style={editInput} />
                  </div>
                  <div style={editRow}>
                    <label style={editLabel}>State</label>
                    <input type="text" value={editState} onChange={(e) => setEditState(e.target.value)} style={editInput} placeholder="AZ" maxLength={2} />
                  </div>
                </div>
              </div>

              <div style={editFooter}>
                <button style={secondaryBtn} onClick={cancelEdit} disabled={saving}>
                  Cancel
                </button>
                <button style={primaryBtnEnabled} onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </>
          )}
        </div>
        </main>

{/* Delete Confirm Modal */}
{showDeleteConfirm && (
  <div style={modalOverlay} onClick={() => !deleting && setShowDeleteConfirm(false)}>
    <div style={modalCard} onClick={(e) => e.stopPropagation()}>
      <h2 style={modalTitle}>Delete this member?</h2>
      <p style={{ color: '#3a4d68', fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
        You are about to permanently remove <strong>{`${member.first_name || ''} ${member.last_name || ''}`.trim() || 'this member'}</strong> from the census. This cannot be undone — the member can be restored by re-uploading the census.
      </p>
      <div style={modalFooter}>
        <button style={secondaryBtn} onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>
          Cancel
        </button>
        <button style={dangerBtnEnabled} onClick={handleDelete} disabled={deleting}>
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

const pageTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 36,
  color: '#1e3a5f',
  margin: '0 0 4px',
};

const ageBadge: React.CSSProperties = {
  background: '#eef1f4',
  color: '#3a4d68',
  padding: '6px 12px',
  borderRadius: 14,
  fontSize: 12,
  fontWeight: 600,
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
  opacity: 0.6,
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
  opacity: 0.6,
};

const infoCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 24,
  fontFamily: 'Figtree, sans-serif',
};

const cardTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  color: '#1e3a5f',
  fontSize: 22,
  margin: '0 0 18px',
};

const infoGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 24,
};

const infoBlock: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
};

const infoBlockTitle: React.CSSProperties = {
  fontFamily: 'Figtree, sans-serif',
  color: '#7a8a9b',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  margin: '0 0 8px',
  paddingBottom: 6,
  borderBottom: '1px solid #eef1f4',
};

const infoRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '10px 0',
  borderBottom: '1px solid #eef1f4',
  fontSize: 14,
  gap: 12,
};

const infoLabel: React.CSSProperties = {
  color: '#7a8a9b',
  fontWeight: 600,
  flexShrink: 0,
};

const infoValue: React.CSSProperties = {
    color: '#1e3a5f',
    textAlign: 'right',
    wordBreak: 'break-word',
  };
  
  const primaryBtnEnabled: React.CSSProperties = {
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
  
  const editRow: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '8px 0',
    borderBottom: '1px solid #eef1f4',
  };
  
  const editLabel: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: '#7a8a9b',
  };
  
  const editInput: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #cbd5e0',
    borderRadius: 6,
    fontSize: 14,
    fontFamily: 'Figtree, sans-serif',
    color: '#1e3a5f',
    boxSizing: 'border-box',
  };
  
  const editFooter: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
    paddingTop: 16,
    borderTop: '1px solid #e2e8f0',
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

  const dangerBtnEnabled: React.CSSProperties = {
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
  
  const modalOverlay: React.CSSProperties = {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
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
    maxWidth: 460,
    width: '100%',
    fontFamily: 'Figtree, sans-serif',
  };
  
  const modalTitle: React.CSSProperties = {
    fontFamily: 'Playfair Display, serif',
    color: '#1e3a5f',
    fontSize: 24,
    margin: '0 0 16px',
  };
  
  const modalFooter: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  };