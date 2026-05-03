'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';
import BrokerSidebar from '../../components/BrokerSidebar';

export default function BrokerTeamPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [agencyName, setAgencyName] = useState('');

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    const meta = user.user_metadata || {};
    setFirstName(meta.first_name || '');
    setLastName(meta.last_name || '');
    setEmail(user.email || '');

    const { data: brokerRow } = await supabase
      .from('brokers')
      .select('agency_id, role, agencies(name)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (brokerRow) {
      setRole(brokerRow.role || 'broker');
      if (brokerRow.agencies) {
        const agency: any = Array.isArray(brokerRow.agencies)
          ? brokerRow.agencies[0]
          : brokerRow.agencies;
        setAgencyName(agency?.name || '');
      }
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
        Loading...
      </div>
    );
  }

  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  const isOwner = role === 'owner';

  return (
    <div className="dash-shell">
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
          <button style={primaryBtnDisabled} disabled title="Coming in Session 19">
            + Invite Broker
          </button>
        </div>

        <div style={comingSoonBanner}>
          <span style={{ fontSize: 20, marginRight: 10 }}>🚧</span>
          <strong>Coming in Session 19</strong>
          <span style={{ marginLeft: 10, color: '#3a4d68' }}>
            — Email-based broker invitations, role management, client assignment, and team activity feeds
          </span>
        </div>

        <div style={statsRow}>
          <div style={statTile}>
            <div style={statLabel}>Active Brokers</div>
            <div style={statValue}>1</div>
          </div>
          <div style={statTile}>
            <div style={statLabel}>Pending Invites</div>
            <div style={statValue}>—</div>
          </div>
          <div style={statTile}>
            <div style={statLabel}>Total Clients</div>
            <div style={statValue}>5</div>
          </div>
          <div style={statTile}>
            <div style={statLabel}>Avg per Broker</div>
            <div style={statValue}>5</div>
          </div>
        </div>

        <div style={sectionTitle}>Broker Roster</div>

        <div style={tableCard}>
          <div style={tableHeader}>
            <div style={{ ...tableCol, flex: 2 }}>Broker</div>
            <div style={{ ...tableCol, flex: 2 }}>Email</div>
            <div style={{ ...tableCol, flex: 1 }}>Role</div>
            <div style={{ ...tableCol, flex: 1 }}>Clients</div>
            <div style={{ ...tableCol, flex: 1 }}>Status</div>
            <div style={{ ...tableCol, flex: 1 }}>Actions</div>
          </div>

          <div style={{ ...tableRow, background: '#faf7f2' }}>
            <div style={{ ...tableCol, flex: 2, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={avatarReal}>{initials}</div>
              <div>
                <div style={{ fontWeight: 600, color: '#1e3a5f' }}>{firstName} {lastName}</div>
                <div style={{ fontSize: 12, color: '#7a8a9b' }}>You</div>
              </div>
            </div>
            <div style={{ ...tableCol, flex: 2, color: '#3a4d68' }}>{email}</div>
            <div style={{ ...tableCol, flex: 1 }}>
              <span style={isOwner ? roleBadgeOwner : roleBadge}>{role}</span>
            </div>
            <div style={{ ...tableCol, flex: 1, color: '#3a4d68' }}>5</div>
            <div style={{ ...tableCol, flex: 1 }}>
              <span style={statusActive}>Active</span>
            </div>
            <div style={{ ...tableCol, flex: 1 }}>
              <button style={secondaryBtnDisabled} disabled>Edit</button>
            </div>
          </div>

          {mockBrokers.map((b, i) => (
            <div key={i} style={{ ...tableRow, opacity: 0.55 }}>
              <div style={{ ...tableCol, flex: 2, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={avatarMock}>{b.initials}</div>
                <div>
                  <div style={{ fontWeight: 600, color: '#1e3a5f' }}>{b.name}</div>
                  <div style={{ fontSize: 12, color: '#7a8a9b' }}>Mock data</div>
                </div>
              </div>
              <div style={{ ...tableCol, flex: 2, color: '#3a4d68' }}>{b.email}</div>
              <div style={{ ...tableCol, flex: 1 }}>
                <span style={roleBadge}>{b.role}</span>
              </div>
              <div style={{ ...tableCol, flex: 1, color: '#3a4d68' }}>{b.clients}</div>
              <div style={{ ...tableCol, flex: 1 }}>
                <span style={b.status === 'Active' ? statusActive : statusPending}>{b.status}</span>
              </div>
              <div style={{ ...tableCol, flex: 1 }}>
                <button style={secondaryBtnDisabled} disabled>Edit</button>
              </div>
            </div>
          ))}
        </div>

        <div style={featureListCard}>
          <h3 style={featureListTitle}>What you'll be able to do:</h3>
          <ul style={featureList}>
            <li>Invite brokers by email with a single click</li>
            <li>Assign roles: Owner, Broker, or Admin</li>
            <li>Reassign clients between brokers in the agency</li>
            <li>See per-broker performance: clients added, recommendations run, plans sold</li>
            <li>Remove brokers from the agency (Owner-only)</li>
            <li>Audit log of every action taken in the agency</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

const mockBrokers = [
  { initials: 'JS', name: 'Jane Smith', email: 'jane@example.com', role: 'broker', clients: 8, status: 'Active' },
  { initials: 'MR', name: 'Mike Rodriguez', email: 'mike@example.com', role: 'broker', clients: 12, status: 'Active' },
  { initials: 'TT', name: 'Taylor Tran', email: 'taylor@example.com', role: 'admin', clients: 0, status: 'Pending' },
];

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

const comingSoonBanner: React.CSSProperties = {
  background: 'linear-gradient(135deg, #faf7f2 0%, #eef1f4 100%)',
  border: '1px solid #d4dae2',
  borderRadius: 10,
  padding: '14px 18px',
  marginBottom: 28,
  fontFamily: 'Figtree, sans-serif',
  color: '#1e3a5f',
  fontSize: 14,
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
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

const avatarMock: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  background: '#cbd5e0',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 600,
  fontSize: 13,
};

const roleBadge: React.CSSProperties = {
  background: '#eef1f4',
  color: '#3a4d68',
  padding: '4px 10px',
  borderRadius: 12,
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'capitalize',
};

const roleBadgeOwner: React.CSSProperties = {
  background: '#e6f0e6',
  color: '#5a7a56',
  padding: '4px 10px',
  borderRadius: 12,
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'capitalize',
};

const statusActive: React.CSSProperties = {
  background: '#e6f0e6',
  color: '#5a7a56',
  padding: '4px 10px',
  borderRadius: 12,
  fontSize: 11,
  fontWeight: 600,
};

const statusPending: React.CSSProperties = {
  background: '#fef3e6',
  color: '#a06d2a',
  padding: '4px 10px',
  borderRadius: 12,
  fontSize: 11,
  fontWeight: 600,
};

const featureListCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 24,
  fontFamily: 'Figtree, sans-serif',
};

const featureListTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  color: '#1e3a5f',
  fontSize: 20,
  margin: '0 0 14px',
};

const featureList: React.CSSProperties = {
  margin: 0,
  paddingLeft: 22,
  color: '#3a4d68',
  fontSize: 14,
  lineHeight: 1.9,
};