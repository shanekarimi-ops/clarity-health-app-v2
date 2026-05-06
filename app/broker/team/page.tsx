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
  const [myRole, setMyRole] = useState<'owner' | 'admin' | 'broker'>('broker');
  const [agencyName, setAgencyName] = useState('');
  const [agencyId, setAgencyId] = useState('');
  const [brokers, setBrokers] = useState<BrokerRow[]>([]);

  useEffect(() => {
    loadEverything();
  }, []);

  async function loadEverything() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    const meta = user.user_metadata || {};
    setFirstName(meta.first_name || '');
    setLastName(meta.last_name || '');

    // Get my broker row + agency
    const { data: myBroker } = await supabase
      .from('brokers')
      .select('id, agency_id, role, agencies(name)')
      .eq('user_id', user.id)
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

    // Get all brokers in the agency
    const { data: allBrokers } = await supabase
      .from('brokers')
      .select('id, user_id, role')
      .eq('agency_id', myBroker.agency_id);

    if (!allBrokers || allBrokers.length === 0) {
      setLoading(false);
      return;
    }

    // Fetch metrics + emails via API route (needs service role for auth.users)
    const res = await fetch('/api/team/roster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agency_id: myBroker.agency_id,
        user_id: user.id,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setBrokers(data.brokers || []);
    }

    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
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
            <div style={{ ...tableCol, flex: 1 }}>Actions</div>
          </div>

          {brokers.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#7a8a9b', fontSize: 14 }}>
              No brokers in your agency yet.
            </div>
          )}

          {brokers.map((b) => {
            const initials = `${(b.first_name || '?').charAt(0)}${(b.last_name || '').charAt(0)}`.toUpperCase();
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
                <div style={{ ...tableCol, flex: 1 }}>
                  <button style={secondaryBtnDisabled} disabled title="Coming in P12.2">Edit</button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
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

const primaryBtnDisabled: React.CSSProperties = {
  background: '#cbd5e0',
  color: '#fff',
  border: 'none',
  padding: '12px 22px',
  borderRadius: 8,
  fontFamily: 'Figtree, sans-serif',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'not-allowed',
  opacity: 0.7,
};

const secondaryBtnDisabled: React.CSSProperties = {
  background: '#fff',
  color: '#7a8a9b',
  border: '1px solid #e2e8f0',
  padding: '6px 12px',
  borderRadius: 6,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 12,
  cursor: 'not-allowed',
};

const statsRow: React.CSSProperties = {
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
  marginBottom: 6,
};

const statValue: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  color: '#1e3a5f',
  fontFamily: 'Playfair Display, serif',
};

const sectionTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 22,
  color: '#1e3a5f',
  marginBottom: 14,
};

const tableCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  marginBottom: 28,
  overflow: 'hidden',
  fontFamily: 'Figtree, sans-serif',
};

const tableHeader: React.CSSProperties = {
  display: 'flex',
  background: '#eef1f4',
  padding: '12px 18px',
  fontSize: 12,
  fontWeight: 700,
  color: '#3a4d68',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  borderBottom: '1px solid #e2e8f0',
};

const tableRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '14px 18px',
  borderBottom: '1px solid #eef1f4',
  fontSize: 14,
};

const tableCol: React.CSSProperties = {
  padding: '0 6px',
};

const avatarReal: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  background: '#7a9b76',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 600,
  fontSize: 13,
};