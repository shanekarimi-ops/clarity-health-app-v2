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
            <button style={primaryBtn} disabled title="Coming in next push">
              Edit Member
            </button>
            <button style={dangerBtn} disabled title="Coming in next push">
              Delete
            </button>
          </div>
          <p style={{ fontSize: 11, color: '#7a8a9b', fontStyle: 'italic', margin: '12px 0 0' }}>
            💡 Edit and delete are read-only in this view — coming in the next push.
          </p>
        </div>

        {/* Info card */}
        <div style={infoCard}>
          <h2 style={cardTitle}>Member Details</h2>

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
        </div>
      </main>
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