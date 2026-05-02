'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../supabase';
import BrokerSidebar from '../../../components/BrokerSidebar';
import ClaimsUpload from '../../../components/ClaimsUpload';
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

type ClaimRow = {
  id: string;
  file_name: string;
  file_size: number | null;
  file_type: string | null;
  uploaded_at: string;
  parsed?: {
    parse_status: string | null;
    summary_text: string | null;
  } | null;
};

export default function ClientProfilePage() {
  const router = useRouter();
  const params = useParams();
  const clientId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<Client | null>(null);
  const [user, setUser] = useState<any>(null);
  const [agencyName, setAgencyName] = useState('Your Agency');
  const [activeTab, setActiveTab] = useState<'overview' | 'documents' | 'recommendations' | 'notes' | 'activity'>('overview');
  const [notFound, setNotFound] = useState(false);

  // Documents state
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const pollTimerRef = useRef<any>(null);

  useEffect(() => {
    loadClient();
  }, [clientId]);

  // Load claims when client is loaded, then again whenever activeTab changes to docs/overview
  useEffect(() => {
    if (client) {
      loadClaims();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id]);

  // Auto-refresh polling: every 5s while any claim is still parsing
  useEffect(() => {
    const anyPending = claims.some(
      (c) => !c.parsed || c.parsed.parse_status === null || c.parsed.parse_status === 'pending'
    );

    if (anyPending && client) {
      pollTimerRef.current = setTimeout(() => {
        loadClaims();
      }, 5000);
    }

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claims, client?.id]);

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

    setUser(user);

    // Get broker's agency name for sidebar
    const { data: brokerData } = await supabase
      .from('brokers')
      .select('agencies(name)')
      .eq('user_id', user.id)
      .single();

    if (brokerData?.agencies) {
      setAgencyName((brokerData.agencies as any).name || 'Your Agency');
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

  const loadClaims = useCallback(async () => {
    if (!clientId) return;
    setClaimsLoading(true);

    // Pull claims for this client, plus any parsed row attached to each claim
    const { data: claimRows, error: claimErr } = await supabase
      .from('claims')
      .select('id, file_name, file_size, file_type, uploaded_at')
      .eq('client_id', clientId)
      .order('uploaded_at', { ascending: false });

    if (claimErr || !claimRows) {
      console.error('Error loading claims:', claimErr);
      setClaims([]);
      setClaimsLoading(false);
      return;
    }

    if (claimRows.length === 0) {
      setClaims([]);
      setClaimsLoading(false);
      return;
    }

    // Fetch parsed rows for these claim ids
    const claimIds = claimRows.map((c) => c.id);
    const { data: parsedRows } = await supabase
      .from('claims_parsed')
      .select('claim_id, parse_status, summary_text')
      .in('claim_id', claimIds);

    const parsedMap = new Map<string, { parse_status: string | null; summary_text: string | null }>();
    (parsedRows || []).forEach((p: any) => {
      parsedMap.set(p.claim_id, {
        parse_status: p.parse_status,
        summary_text: p.summary_text,
      });
    });

    const merged: ClaimRow[] = claimRows.map((c) => ({
      ...c,
      parsed: parsedMap.get(c.id) || null,
    }));

    setClaims(merged);
    setClaimsLoading(false);
  }, [clientId]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  function handleUploadDocClick() {
    setActiveTab('documents');
    // Scroll to top of tab area
    setTimeout(() => {
      window.scrollTo({ top: 200, behavior: 'smooth' });
    }, 50);
  }

  function formatFileSize(bytes: number | null): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function StatusBadge({ status }: { status: string | null | undefined }) {
    if (!status || status === 'pending') {
      return (
        <span style={{ ...statusBadge, background: '#fff4e0', color: '#a96a1c' }}>
          ⏳ Parsing…
        </span>
      );
    }
    if (status === 'success') {
      return (
        <span style={{ ...statusBadge, background: '#e8f0e6', color: '#5a7857' }}>
          ✓ Parsed
        </span>
      );
    }
    // Any error status
    return (
      <span style={{ ...statusBadge, background: '#fde7e7', color: '#a44' }}>
        ✗ Failed
      </span>
    );
  }

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
          Loading client...
        </div>
      </div>
    );
  }

  if (notFound || !client) {
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

  const recentClaims = claims.slice(0, 3);

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
            <button style={primaryButtonDisabled} disabled>
              Run Recommendation
            </button>
            <button style={secondaryButtonActive} onClick={handleUploadDocClick}>
              Upload Document
            </button>
            <button style={secondaryButtonDisabled} disabled>
              Send Link Request
            </button>
          </div>
          <div style={{ color: '#999', fontSize: '12px', marginTop: '10px' }}>
            (Run Recommendation + Send Link Request coming in Session 16)
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
              {tab === 'documents' && claims.length > 0 && (
                <span style={{
                  marginLeft: '6px',
                  background: '#eef1f4',
                  color: '#5b7a99',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: 700,
                }}>
                  {claims.length}
                </span>
              )}
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

            {/* Recent Documents — now real */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ ...cardTitle, marginBottom: 0 }}>Recent Documents</h3>
                {claims.length > 0 && (
                  <button
                    onClick={() => setActiveTab('documents')}
                    style={linkButton}
                  >
                    View all →
                  </button>
                )}
              </div>
              {recentClaims.length === 0 ? (
                <div style={emptyText}>
                  No documents uploaded yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {recentClaims.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px',
                        background: '#faf7f2',
                        borderRadius: '6px',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '13px',
                          color: '#1e3a5f',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          📄 {c.file_name}
                        </div>
                        <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                          {formatDate(c.uploaded_at)}
                        </div>
                      </div>
                      <StatusBadge status={c.parsed?.parse_status} />
                    </div>
                  ))}
                </div>
              )}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Upload widget */}
            <div style={cardStyle}>
              <h3 style={{ ...cardTitle, marginBottom: '6px' }}>
                Upload claims for {client.first_name}
              </h3>
              <div style={{ color: '#5b7a99', fontSize: '13px', marginBottom: '18px' }}>
                Drop in EOBs, claims, or medical statements. We'll auto-parse them with AI.
              </div>
              {user && (
                <ClaimsUpload
                  userId={user.id}
                  clientId={client.id}
                  onUploadComplete={loadClaims}
                />
              )}
            </div>

            {/* Uploaded list */}
            <div style={cardStyle}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}>
                <h3 style={{ ...cardTitle, marginBottom: 0 }}>
                  Uploaded Documents ({claims.length})
                </h3>
                <button onClick={loadClaims} style={linkButton} disabled={claimsLoading}>
                  {claimsLoading ? 'Refreshing...' : '↻ Refresh'}
                </button>
              </div>

              {claims.length === 0 ? (
                <div style={emptyText}>
                  No documents uploaded yet. Use the upload area above to get started.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {claims.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '14px 16px',
                        background: '#faf7f2',
                        border: '1px solid #eef1f4',
                        borderRadius: '8px',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '14px',
                          color: '#1e3a5f',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          📄 {c.file_name}
                        </div>
                        <div style={{ fontSize: '12px', color: '#5b7a99', marginTop: '4px' }}>
                          {formatDate(c.uploaded_at)} · {formatFileSize(c.file_size)}
                        </div>
                        {c.parsed?.summary_text && (
                          <div style={{ fontSize: '12px', color: '#888', marginTop: '6px', fontStyle: 'italic' }}>
                            {c.parsed.summary_text}
                          </div>
                        )}
                      </div>
                      <div style={{ marginLeft: '16px', flexShrink: 0 }}>
                        <StatusBadge status={c.parsed?.parse_status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'recommendations' && (
          <div style={cardStyle}>
            <div style={emptyText}>
              Recommendations tab coming in Session 16. Will show all plan recommendations run for this client.
            </div>
          </div>
        )}

        {activeTab === 'notes' && (
          <div style={cardStyle}>
            <div style={emptyText}>
              Notes tab coming in Session 16. Internal notes only — never shown to the client.
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div style={cardStyle}>
            <div style={emptyText}>
              Activity log coming in Session 17.
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

const primaryButtonDisabled: React.CSSProperties = {
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

const secondaryButtonActive: React.CSSProperties = {
  background: 'white',
  color: '#1e3a5f',
  border: '1px solid #1e3a5f',
  padding: '10px 20px',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'Figtree, sans-serif',
};

const secondaryButtonDisabled: React.CSSProperties = {
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

const linkButton: React.CSSProperties = {
  background: 'transparent',
  color: '#7a9b76',
  border: 'none',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'Figtree, sans-serif',
  padding: 0,
};

const statusBadge: React.CSSProperties = {
  display: 'inline-block',
  padding: '4px 10px',
  borderRadius: '12px',
  fontSize: '11px',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};