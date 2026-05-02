'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../supabase';
import BrokerSidebar from '../../../components/BrokerSidebar';
import { getAccountType } from '../../../lib/account';

type Client = {
  id: string;
  agency_id: string;
  assigned_broker_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  employer_name: string | null;
  member_count: number | null;
  state: string | null;
  status: string;
  created_at: string;
};

export default function ClientProfilePage() {
  const router = useRouter();
  const params = useParams();
  const clientId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<Client | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'documents' | 'recommendations' | 'notes' | 'activity'>('overview');
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    loadClient();
  }, [clientId]);

  async function loadClient() {
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

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (error || !data) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setClient(data as Client);
    setLoading(false);
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#faf7f2' }}>
        <BrokerSidebar />
        <div style={{ flex: 1, padding: '40px', fontFamily: 'Figtree, sans-serif' }}>
          Loading client...
        </div>
      </div>
    );
  }

  if (notFound || !client) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#faf7f2' }}>
        <BrokerSidebar />
        <div style={{ flex: 1, padding: '40px', fontFamily: 'Figtree, sans-serif' }}>
          <h1 style={{ fontFamily: 'Playfair Display, serif', color: '#1e3a5f' }}>
            Client not found
          </h1>
          <p style={{ color: '#3a4d68' }}>
            This client doesn't exist or you don't have access.
          </p>
          <Link href="/broker/clients" style={{ color: '#7a9b76', fontWeight: 600 }}>
            ← Back to clients
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#faf7f2' }}>
      <BrokerSidebar />

      <div style={{ flex: 1, padding: '40px', fontFamily: 'Figtree, sans-serif' }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: '20px' }}>
          <Link
            href="/broker/clients"
            style={{ color: '#5b7a99', fontSize: '14px', textDecoration: 'none' }}
          >
            ← Back to clients
          </Link>
        </div>

        {/* Header card */}
        <div style={{
          background: 'white',
          border: '1px solid #eef1f4',
          borderRadius: '12px',
          padding: '28px',
          marginBottom: '24px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              {/* Avatar circle */}
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#1e3a5f',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 600,
                fontFamily: 'Playfair Display, serif',
              }}>
                {client.first_name[0]}{client.last_name[0]}
              </div>

              <div>
                <h1 style={{
                  fontFamily: 'Playfair Display, serif',
                  fontSize: '32px',
                  color: '#1e3a5f',
                  margin: 0,
                }}>
                  {client.first_name} {client.last_name}
                </h1>
                <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap' }}>
                  {client.employer_name && (
                    <span style={{ color: '#3a4d68', fontSize: '14px' }}>
                      🏢 {client.employer_name}
                    </span>
                  )}
                  <span style={{ color: '#3a4d68', fontSize: '14px' }}>
                    👥 {client.member_count || 1} {(client.member_count || 1) === 1 ? 'member' : 'members'}
                  </span>
                  {client.state && (
                    <span style={{ color: '#3a4d68', fontSize: '14px' }}>
                      📍 {client.state}
                    </span>
                  )}
                </div>
                {client.email && (
                  <div style={{ color: '#3a4d68', fontSize: '14px', marginTop: '6px' }}>
                    {client.email}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 600,
                background: client.status === 'active' ? '#e8f0e6' : '#f5f5f5',
                color: client.status === 'active' ? '#5a7857' : '#666',
                textTransform: 'capitalize',
              }}>
                {client.status}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '24px', flexWrap: 'wrap' }}>
            <button style={primaryButton} disabled>
              Run Recommendation
            </button>
            <button style={secondaryButton} disabled>
              Upload Document
            </button>
            <button style={secondaryButton} disabled>
              Send Link Request
            </button>
          </div>
          <div style={{ color: '#999', fontSize: '12px', marginTop: '10px' }}>
            (Action buttons coming in Session 15)
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '4px',
          borderBottom: '2px solid #eef1f4',
          marginBottom: '24px',
        }}>
          {(['overview', 'documents', 'recommendations', 'notes', 'activity'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '12px 20px',
                fontSize: '14px',
                fontWeight: 600,
                color: activeTab === tab ? '#1e3a5f' : '#5b7a99',
                cursor: 'pointer',
                fontFamily: 'Figtree, sans-serif',
                borderBottom: activeTab === tab ? '2px solid #7a9b76' : '2px solid transparent',
                marginBottom: '-2px',
                textTransform: 'capitalize',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Latest Recommendation */}
            <div style={cardStyle}>
              <h3 style={cardTitle}>Latest Recommendation</h3>
              <div style={emptyText}>
                No recommendations yet. Run one once you've uploaded their claims and benefits.
              </div>
            </div>

            {/* Recent Documents */}
            <div style={cardStyle}>
              <h3 style={cardTitle}>Recent Documents</h3>
              <div style={emptyText}>
                No documents uploaded yet.
              </div>
            </div>

            {/* Client Info */}
            <div style={cardStyle}>
              <h3 style={cardTitle}>Client Info</h3>
              <div style={{ fontSize: '14px', color: '#3a4d68', lineHeight: '1.8' }}>
                <div><strong style={{ color: '#1e3a5f' }}>Name:</strong> {client.first_name} {client.last_name}</div>
                <div><strong style={{ color: '#1e3a5f' }}>Email:</strong> {client.email || '—'}</div>
                <div><strong style={{ color: '#1e3a5f' }}>Phone:</strong> {client.phone || '—'}</div>
                <div><strong style={{ color: '#1e3a5f' }}>Employer:</strong> {client.employer_name || '—'}</div>
                <div><strong style={{ color: '#1e3a5f' }}>Members:</strong> {client.member_count || 1}</div>
                <div><strong style={{ color: '#1e3a5f' }}>State:</strong> {client.state || '—'}</div>
                <div><strong style={{ color: '#1e3a5f' }}>Added:</strong> {new Date(client.created_at).toLocaleDateString()}</div>
              </div>
            </div>

            {/* Link Status */}
            <div style={cardStyle}>
              <h3 style={cardTitle}>Account Link</h3>
              <div style={emptyText}>
                Not linked to an Individual account yet. Send a link request to connect their data.
              </div>
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div style={cardStyle}>
            <div style={emptyText}>
              Documents tab coming in Session 15. Will let you upload claims and employer benefits on behalf of the client.
            </div>
          </div>
        )}

        {activeTab === 'recommendations' && (
          <div style={cardStyle}>
            <div style={emptyText}>
              Recommendations tab coming in Session 15. Will show all plan recommendations run for this client.
            </div>
          </div>
        )}

        {activeTab === 'notes' && (
          <div style={cardStyle}>
            <div style={emptyText}>
              Notes tab coming in Session 15. Internal notes only — never shown to the client.
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div style={cardStyle}>
            <div style={emptyText}>
              Activity log coming in Session 15.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid #eef1f4',
  borderRadius: '12px',
  padding: '24px',
};

const cardTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: '18px',
  color: '#1e3a5f',
  marginTop: 0,
  marginBottom: '14px',
};

const emptyText: React.CSSProperties = {
  color: '#888',
  fontSize: '14px',
  fontStyle: 'italic',
};

const primaryButton: React.CSSProperties = {
  background: '#7a9b76',
  color: 'white',
  border: 'none',
  padding: '10px 20px',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'not-allowed',
  fontFamily: 'Figtree, sans-serif',
  opacity: 0.6,
};

const secondaryButton: React.CSSProperties = {
  background: 'white',
  color: '#3a4d68',
  border: '1px solid #d4d4d4',
  padding: '10px 20px',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'not-allowed',
  fontFamily: 'Figtree, sans-serif',
  opacity: 0.6,
};