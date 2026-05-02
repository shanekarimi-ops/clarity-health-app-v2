'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../supabase';
import BrokerSidebar from '../../components/BrokerSidebar';
import { getAccountType } from '../../lib/account';

type Client = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  employer_name: string | null;
  member_count: number | null;
  state: string | null;
  status: string;
  created_at: string;
};

export default function BrokerClientsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [brokerId, setBrokerId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [agencyName, setAgencyName] = useState('Your Agency');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  // Add Client form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [employerName, setEmployerName] = useState('');
  const [memberCount, setMemberCount] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.push('/login');
      return;
    }

    if (getAccountType(user) !== 'broker') {
      router.push('/profile');
      return;
    }

    setUser(user);

    // Get broker record + agency
    const { data: brokerData } = await supabase
      .from('brokers')
      .select('id, agency_id, agencies(name)')
      .eq('user_id', user.id)
      .single();

    if (!brokerData) {
      setLoading(false);
      return;
    }

    setBrokerId(brokerData.id);
    setAgencyId(brokerData.agency_id);

    if (brokerData.agencies) {
      setAgencyName((brokerData.agencies as any).name || 'Your Agency');
    }

    // Load clients for this agency
    const { data: clientsData } = await supabase
      .from('clients')
      .select('*')
      .eq('agency_id', brokerData.agency_id)
      .order('created_at', { ascending: false });

    setClients(clientsData || []);
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setFormError('First and last name are required.');
      return;
    }

    if (!agencyId || !brokerId) {
      setFormError('Could not find your agency. Please refresh.');
      return;
    }

    setSubmitting(true);

    const { error } = await supabase.from('clients').insert({
      agency_id: agencyId,
      assigned_broker_id: brokerId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim() || null,
      employer_name: employerName.trim() || null,
      member_count: parseInt(memberCount) || 1,
      status: 'active',
    });

    setSubmitting(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    // Reset form & close modal
    setFirstName('');
    setLastName('');
    setEmail('');
    setEmployerName('');
    setMemberCount('1');
    setShowModal(false);

    // Reload list
    loadData();
  }

  const filteredClients = clients.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      (c.employer_name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#faf7f2' }}>
        <BrokerSidebar
          active="clients"
          firstName={user?.user_metadata?.first_name || ''}
          lastName={user?.user_metadata?.last_name || ''}
          agencyName={agencyName}
          onLogout={handleLogout}
        />
        <div style={{ flex: 1, padding: '40px', fontFamily: 'Figtree, sans-serif' }}>
          Loading clients...
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#faf7f2' }}>
      <BrokerSidebar
        active="clients"
        firstName={user?.user_metadata?.first_name || ''}
        lastName={user?.user_metadata?.last_name || ''}
        agencyName={agencyName}
        onLogout={handleLogout}
      />

      <div style={{ flex: 1, padding: '40px', fontFamily: 'Figtree, sans-serif' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '36px', color: '#1e3a5f', margin: 0 }}>
              Clients
            </h1>
            <p style={{ color: '#3a4d68', marginTop: '4px' }}>
              {clients.length} {clients.length === 1 ? 'client' : 'clients'} in your agency
            </p>
          </div>

          <button
            onClick={() => setShowModal(true)}
            style={{
              background: '#7a9b76',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'Figtree, sans-serif',
            }}
          >
            + Add Client
          </button>
        </div>

        {/* Search */}
        {clients.length > 0 && (
          <input
            type="text"
            placeholder="Search by name, employer, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              maxWidth: '400px',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid #d4d4d4',
              fontSize: '14px',
              fontFamily: 'Figtree, sans-serif',
              marginBottom: '24px',
              background: 'white',
            }}
          />
        )}

        {/* Empty state */}
        {clients.length === 0 ? (
          <div style={{
            background: 'white',
            border: '1px solid #eef1f4',
            borderRadius: '12px',
            padding: '60px 40px',
            textAlign: 'center',
          }}>
            <h2 style={{ fontFamily: 'Playfair Display, serif', color: '#1e3a5f', fontSize: '24px', marginBottom: '12px' }}>
              No clients yet
            </h2>
            <p style={{ color: '#3a4d68', marginBottom: '24px' }}>
              Add your first client to start managing their benefits.
            </p>
            <button
              onClick={() => setShowModal(true)}
              style={{
                background: '#7a9b76',
                color: 'white',
                border: 'none',
                padding: '14px 28px',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'Figtree, sans-serif',
              }}
            >
              + Add your first client
            </button>
          </div>
        ) : filteredClients.length === 0 ? (
          <div style={{ color: '#3a4d68', padding: '20px' }}>
            No clients match "{search}".
          </div>
        ) : (
          /* Client list */
          <div style={{
            background: 'white',
            border: '1px solid #eef1f4',
            borderRadius: '12px',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr',
              padding: '14px 20px',
              background: '#faf7f2',
              borderBottom: '1px solid #eef1f4',
              fontSize: '13px',
              fontWeight: 600,
              color: '#3a4d68',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              <div>Name</div>
              <div>Employer</div>
              <div>Members</div>
              <div>Status</div>
              <div>Added</div>
            </div>

            {filteredClients.map((client) => (
              <Link
                key={client.id}
                href={`/broker/clients/${client.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr',
                  padding: '16px 20px',
                  borderBottom: '1px solid #eef1f4',
                  fontSize: '14px',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#faf7f2')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                >
                  <div style={{ color: '#1e3a5f', fontWeight: 600 }}>
                    {client.first_name} {client.last_name}
                    {client.email && (
                      <div style={{ color: '#3a4d68', fontSize: '12px', fontWeight: 400, marginTop: '2px' }}>
                        {client.email}
                      </div>
                    )}
                  </div>
                  <div style={{ color: '#3a4d68' }}>{client.employer_name || '—'}</div>
                  <div style={{ color: '#3a4d68' }}>{client.member_count || 1}</div>
                  <div>
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 10px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      background: client.status === 'active' ? '#e8f0e6' : '#f5f5f5',
                      color: client.status === 'active' ? '#5a7857' : '#666',
                    }}>
                      {client.status}
                    </span>
                  </div>
                  <div style={{ color: '#3a4d68', fontSize: '13px' }}>
                    {new Date(client.created_at).toLocaleDateString()}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Add Client Modal */}
        {showModal && (
          <div
            onClick={() => setShowModal(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(30, 58, 95, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'white',
                borderRadius: '12px',
                padding: '32px',
                width: '90%',
                maxWidth: '480px',
                maxHeight: '90vh',
                overflowY: 'auto',
              }}
            >
              <h2 style={{
                fontFamily: 'Playfair Display, serif',
                fontSize: '24px',
                color: '#1e3a5f',
                marginTop: 0,
                marginBottom: '20px',
              }}>
                Add New Client
              </h2>

              <form onSubmit={handleAddClient}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={labelStyle}>First Name *</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      style={inputStyle}
                      required
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Last Name *</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      style={inputStyle}
                      required
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={labelStyle}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={labelStyle}>Employer Name</label>
                  <input
                    type="text"
                    value={employerName}
                    onChange={(e) => setEmployerName(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={labelStyle}>Member Count</label>
                  <input
                    type="number"
                    min="1"
                    value={memberCount}
                    onChange={(e) => setMemberCount(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                {formError && (
                  <div style={{
                    background: '#fde8e8',
                    color: '#9b2c2c',
                    padding: '10px 14px',
                    borderRadius: '6px',
                    fontSize: '14px',
                    marginBottom: '16px',
                  }}>
                    {formError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    style={{
                      background: 'white',
                      color: '#3a4d68',
                      border: '1px solid #d4d4d4',
                      padding: '10px 20px',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'Figtree, sans-serif',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      background: submitting ? '#a8b8a4' : '#7a9b76',
                      color: 'white',
                      border: 'none',
                      padding: '10px 24px',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      fontFamily: 'Figtree, sans-serif',
                    }}
                  >
                    {submitting ? 'Adding...' : 'Add Client'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: '#1e3a5f',
  marginBottom: '6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '6px',
  border: '1px solid #d4d4d4',
  fontSize: '14px',
  fontFamily: 'Figtree, sans-serif',
  boxSizing: 'border-box',
};