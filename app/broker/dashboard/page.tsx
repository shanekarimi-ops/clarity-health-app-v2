'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../supabase';
import BrokerSidebar from '../../components/BrokerSidebar';
import { getAccountType } from '../../lib/account';

type Agency = {
  id: string;
  name: string;
  primary_color: string | null;
  accent_color: string | null;
};

type ActivityEvent = {
  id: string;
  client_id: string | null;
  actor_name: string;
  event_type: string;
  event_summary: string;
  created_at: string;
};

export default function BrokerDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientCount, setClientCount] = useState(0);
  const [recentRecCount, setRecentRecCount] = useState(0);
  const [pendingLinks, setPendingLinks] = useState(0);
  const [recentActivity, setRecentActivity] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // Gate: only brokers can be here
      const accountType = getAccountType(user);
      if (accountType !== 'broker') {
        router.push('/profile');
        return;
      }

      setUser(user);

      // Load the user's agency
      const { data: brokerRow } = await supabase
        .from('brokers')
        .select('agency_id, agencies(*)')
        .eq('user_id', user.id)
        .single();

      if (brokerRow?.agencies) {
        setAgency(brokerRow.agencies as unknown as Agency);
      }

      setLoading(false);
    }
    init();
  }, [router]);

  const fetchStats = useCallback(async () => {
    if (!user || !agency) return;

    // Active clients in this agency
    const { count: activeClients } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('agency_id', agency.id)
      .eq('status', 'active');

    setClientCount(activeClients || 0);

    // Recommendations created in last 30 days for clients in this agency
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { count: recs } = await supabase
      .from('recommendations')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo.toISOString())
      .not('client_id', 'is', null);

    setRecentRecCount(recs || 0);

    // Pending link requests for this agency's clients
    const { count: links } = await supabase
      .from('client_links')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    setPendingLinks(links || 0);

    // Recent activity (last 10 events) for this agency
    const { data: activityRows } = await supabase
      .from('activity_log')
      .select('id, client_id, actor_name, event_type, event_summary, created_at')
      .eq('agency_id', agency.id)
      .order('created_at', { ascending: false })
      .limit(10);

    setRecentActivity(activityRows || []);
  }, [user, agency]);

  useEffect(() => {
    if (user && agency) fetchStats();
  }, [user, agency, fetchStats]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  function formatRelativeTime(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function iconForEvent(eventType: string) {
    const icons: Record<string, string> = {
      client_added: '➕',
      client_edited: '✏️',
      client_deleted: '🗑',
      claim_uploaded: '📎',
      claim_deleted: '🗑',
      recommendation_run: '⭐',
      note_added: '📝',
      note_deleted: '🗑',
      agency_edited: '🏢',
      link_request_sent: '🔗',
      link_accepted: '✅',
      link_revoked: '🚫',
    };
    return icons[eventType] || '•';
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p>Loading your broker workspace...</p>
      </div>
    );
  }

  const firstName = user?.user_metadata?.first_name || 'there';
  const lastName = user?.user_metadata?.last_name || '';
  const agencyName = agency?.name || 'Your Agency';

  return (
    <div className="dash-layout">
      <BrokerSidebar
        active="dashboard"
        firstName={firstName}
        lastName={lastName}
        agencyName={agencyName}
        onLogout={handleLogout}
      />

      <main className="dash-main">
        <div className="dash-header">
          <div>
            <div className="dash-greeting">Welcome back, {firstName} 👋</div>
            <div className="dash-date">{agencyName} · {clientCount} active client{clientCount !== 1 ? 's' : ''}</div>
          </div>
          <div className="dash-header-actions">
            <button
              className="btn-sm btn-ghost-sm"
              onClick={() => router.push('/broker/groups')}
            >
              + New Group
            </button>
            <button
              className="btn-sm btn-accent"
              onClick={() => router.push('/broker/clients')}
            >
              + Add Client
            </button>
          </div>
        </div>

        {clientCount === 0 && (
          <div className="welcome-banner">
            <div className="welcome-banner-icon">✨</div>
            <div style={{ flex: 1 }}>
              <div className="welcome-banner-title">Welcome to {agencyName}!</div>
              <div className="welcome-banner-desc">
                Get started by adding your first client. You can invite existing Clarity Health users
                or create a new client profile from scratch.
              </div>
            </div>
          </div>
        )}

        <div className="dash-stat-row">
          <div className="dash-stat">
            <div className="dash-stat-label">Active Clients</div>
            <div className={`dash-stat-val ${clientCount === 0 ? 'muted-val' : ''}`}>
              {clientCount}
            </div>
            <div className="dash-stat-change">
              {clientCount === 0 ? 'Add your first client' : 'Across your agency'}
            </div>
          </div>

          <div className="dash-stat">
            <div className="dash-stat-label">Recs This Month</div>
            <div className={`dash-stat-val ${recentRecCount === 0 ? 'muted-val' : ''}`}>
              {recentRecCount}
            </div>
            <div className="dash-stat-change">
              {recentRecCount === 0 ? 'Last 30 days' : 'Generated for clients'}
            </div>
          </div>

          <div className="dash-stat">
            <div className="dash-stat-label">Open Groups</div>
            <div className="dash-stat-val muted-val">0</div>
            <div className="dash-stat-change">Coming soon</div>
          </div>
        </div>

        <div className="dash-two-col">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="dash-card">
            <div className="dash-card-header">
                <div className="dash-card-title">Recent Activity</div>
              </div>
              {recentActivity.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📋</div>
                  <div className="empty-state-title">No activity yet</div>
                  <div className="empty-state-desc">
                    Activity will appear here as you add clients, run recommendations,
                    and upload documents.
                  </div>
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: '320px',
                  overflowY: 'auto',
                  paddingRight: '4px',
                }}>
                  {recentActivity.map((event) => {
                    const inner = (
                      <>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: event.client_id ? '#1e3a5f' : '#7a9b76',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '16px',
                          flexShrink: 0,
                        }}>
                          {iconForEvent(event.event_type)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#1e3a5f',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {event.event_summary}
                          </div>
                          <div style={{
                            fontSize: '12px',
                            color: '#3a4d68',
                            marginTop: '2px',
                          }}>
                            {event.actor_name}
                          </div>
                        </div>
                        <div style={{
                          fontSize: '12px',
                          color: '#888',
                          flexShrink: 0,
                        }}>
                          {formatRelativeTime(event.created_at)}
                        </div>
                      </>
                    );

                    const rowStyle: React.CSSProperties = {
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 4px',
                      borderBottom: '1px solid #eef1f4',
                      textDecoration: 'none',
                      color: 'inherit',
                      transition: 'background 0.15s',
                    };

                    return event.client_id ? (
                      <Link
                        key={event.id}
                        href={`/broker/clients/${event.client_id}`}
                        style={rowStyle}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#faf7f2')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div
                        key={event.id}
                        style={rowStyle}
                      >
                        {inner}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="dash-card">
              <div className="dash-card-header">
                <div className="dash-card-title">Quick Actions</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem 0' }}>
                <button
                  className="btn-sm btn-accent"
                  onClick={() => router.push('/broker/clients')}
                  style={{ justifyContent: 'flex-start' }}
                >
                  👥 Add a new client
                </button>
                <button
                  className="btn-sm btn-ghost-sm"
                  onClick={() => router.push('/broker/groups')}
                  style={{ justifyContent: 'flex-start' }}
                >
                  🏢 Start a group analysis
                </button>
                <button
                  className="btn-sm btn-ghost-sm"
                  onClick={() => router.push('/broker/plan-design')}
                  style={{ justifyContent: 'flex-start' }}
                >
                  📐 Design a self-funded plan
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="dash-card">
              <div className="dash-card-header">
                <div className="dash-card-title">Needs Attention</div>
              </div>
              {pendingLinks === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-desc" style={{ fontSize: '0.85rem' }}>
                    Nothing needs your attention right now. 🎉
                  </div>
                </div>
              ) : (
                <div className="account-list">
                  <div className="account-row">
                    <div className="account-label">🔔 Link requests</div>
                    <div className="account-value">
                      {pendingLinks} pending
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="dash-card">
              <div className="dash-card-header">
                <div className="dash-card-title">Upcoming Renewals</div>
              </div>
              <div className="empty-state">
                <div className="empty-state-desc" style={{ fontSize: '0.85rem' }}>
                  No renewals scheduled. Add clients with their plan year to see them here.
                </div>
              </div>
            </div>

            <div className="dash-card">
              <div className="dash-card-header">
                <div className="dash-card-title">Agency</div>
              </div>
              <div className="account-list">
                <div className="account-row">
                  <div className="account-label">Name</div>
                  <div className="account-value">{agencyName}</div>
                </div>
                <div className="account-row">
                  <div className="account-label">You</div>
                  <div className="account-value">{firstName} {lastName}</div>
                </div>
                <div className="account-row">
                  <div className="account-label">Role</div>
                  <div className="account-value">Owner</div>
                </div>
                <div className="account-row">
                  <div className="account-label">Email</div>
                  <div className="account-value">{user.email}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}