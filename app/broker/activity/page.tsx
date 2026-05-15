'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';
import BrokerSidebar from '../../components/BrokerSidebar';

type ActivityEvent = {
  id: string;
  event_type: string;
  event_summary: string;
  actor_name: string | null;
  actor_user_id: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
};

type FilterCategory = 'all' | 'rfp' | 'quote' | 'presentation' | 'client' | 'census' | 'report' | 'other';

// Map event_type prefixes to categories for filtering
const EVENT_CATEGORY_MAP: Record<string, FilterCategory> = {
  rfp: 'rfp',
  quote: 'quote',
  presentation: 'presentation',
  client: 'client',
  group: 'client',
  member: 'client',
  census: 'census',
  report: 'report',
};

function categorizeEvent(eventType: string): FilterCategory {
  for (const [prefix, cat] of Object.entries(EVENT_CATEGORY_MAP)) {
    if (eventType.startsWith(prefix)) return cat;
  }
  return 'other';
}

// Map event_type to an icon + accent color
const EVENT_STYLES: Record<FilterCategory, { icon: string; bg: string; fg: string; label: string }> = {
  rfp:          { icon: '📄', bg: '#e6f0fb', fg: '#1e3a5f', label: 'RFP' },
  quote:        { icon: '💬', bg: '#e6f4ea', fg: '#1e5631', label: 'Quote' },
  presentation: { icon: '📑', bg: '#eee6f5', fg: '#3a2a6a', label: 'Presentation' },
  client:       { icon: '👥', bg: '#fff4e0', fg: '#8a5a00', label: 'Client' },
  census:       { icon: '📋', bg: '#f5efe0', fg: '#665028', label: 'Census' },
  report:       { icon: '📈', bg: '#e8e0f5', fg: '#4b3a7a', label: 'Report' },
  other:        { icon: '•',  bg: '#e2e3e5', fg: '#383d41', label: 'Other' },
  all:          { icon: '',   bg: '',        fg: '',        label: 'All' },
};

// Routes for clickable events
function getRouteForEvent(event: ActivityEvent): string | null {
  const md = event.metadata || {};
  const cat = categorizeEvent(event.event_type);
  if (cat === 'rfp' && md.rfp_id) return `/broker/rfps/${md.rfp_id}`;
  if (cat === 'quote' && md.rfp_id) return `/broker/rfps/${md.rfp_id}/quotes`;
  if (cat === 'presentation' && md.presentation_id) return `/broker/presentations/${md.presentation_id}`;
  if (cat === 'client' && md.client_id) return `/broker/clients/${md.client_id}`;
  return null;
}

export default function ActivityPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [filter, setFilter] = useState<FilterCategory>('all');

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push('/login');
        return;
      }
      const meta = sessionData.session.user.user_metadata || {};
      setFirstName(meta.first_name || '');
      setLastName(meta.last_name || '');

      const { data: brokerRow } = await supabase
        .from('brokers')
        .select('agency_id, agencies(name)')
        .eq('user_id', sessionData.session.user.id)
        .maybeSingle();
      if (brokerRow?.agencies) {
        setAgencyName((brokerRow.agencies as any).name || '');
      }

      // Fetch activity_log — RLS handles agency scoping
      const { data: rows, error: rowsErr } = await supabase
        .from('activity_log')
        .select('id, event_type, event_summary, actor_name, actor_user_id, metadata, created_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (rowsErr) {
        setErrorMsg('Error loading activity: ' + rowsErr.message);
        setLoading(false);
        return;
      }

      setEvents((rows || []) as ActivityEvent[]);
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  // Filtered events
  const visibleEvents = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((e) => categorizeEvent(e.event_type) === filter);
  }, [events, filter]);

  // Group events by day bucket
  const groupedEvents = useMemo(() => {
    const buckets: { label: string; events: ActivityEvent[] }[] = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const sevenDaysAgo = today - 7 * 86400000;
    const thirtyDaysAgo = today - 30 * 86400000;

    const todayBucket: ActivityEvent[] = [];
    const yesterdayBucket: ActivityEvent[] = [];
    const thisWeekBucket: ActivityEvent[] = [];
    const thisMonthBucket: ActivityEvent[] = [];
    const earlierBucket: ActivityEvent[] = [];

    visibleEvents.forEach((e) => {
      const ts = new Date(e.created_at).getTime();
      if (ts >= today) todayBucket.push(e);
      else if (ts >= yesterday) yesterdayBucket.push(e);
      else if (ts >= sevenDaysAgo) thisWeekBucket.push(e);
      else if (ts >= thirtyDaysAgo) thisMonthBucket.push(e);
      else earlierBucket.push(e);
    });

    if (todayBucket.length) buckets.push({ label: 'Today', events: todayBucket });
    if (yesterdayBucket.length) buckets.push({ label: 'Yesterday', events: yesterdayBucket });
    if (thisWeekBucket.length) buckets.push({ label: 'This week', events: thisWeekBucket });
    if (thisMonthBucket.length) buckets.push({ label: 'This month', events: thisMonthBucket });
    if (earlierBucket.length) buckets.push({ label: 'Earlier', events: earlierBucket });

    return buckets;
  }, [visibleEvents]);

  // Counts per filter category
  const counts = useMemo(() => {
    const c: Record<FilterCategory, number> = { all: events.length, rfp: 0, quote: 0, presentation: 0, client: 0, census: 0, report: 0, other: 0 };
    events.forEach((e) => {
      const cat = categorizeEvent(e.event_type);
      c[cat]++;
    });
    return c;
  }, [events]);

  if (loading) return <div style={{ padding: 40, color: '#1e3a5f' }}>Loading...</div>;

  return (
    <div className="dash-layout">
      <BrokerSidebar
        active="activity"
        firstName={firstName}
        lastName={lastName}
        agencyName={agencyName}
        onLogout={handleLogout}
      />
      <main className="dash-main">
        <div style={{ padding: '2rem 2.5rem', maxWidth: '1100px' }}>
          {/* Header */}
          <div style={{ fontSize: '0.8rem', color: '#7a8a9b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            Broker · Insights
          </div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '2.25rem', color: '#1e3a5f', margin: 0, marginBottom: '0.5rem' }}>
            Activity
          </h1>
          <p style={{ color: '#3a4d68', fontSize: '1.05rem', marginBottom: '2rem' }}>
            Everything that's happened across your agency.
          </p>

          {errorMsg && (
            <div style={{
              background: '#fdecec',
              border: '1px solid #f5c6cb',
              color: '#9b2c2c',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              fontSize: '0.9rem',
            }}>
              {errorMsg}
            </div>
          )}

          {/* Filter pills */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
          }}>
            <FilterPill label="All" count={counts.all} active={filter === 'all'} onClick={() => setFilter('all')} />
            <FilterPill label="RFPs" count={counts.rfp} active={filter === 'rfp'} icon="📄" onClick={() => setFilter('rfp')} />
            <FilterPill label="Quotes" count={counts.quote} active={filter === 'quote'} icon="💬" onClick={() => setFilter('quote')} />
            <FilterPill label="Presentations" count={counts.presentation} active={filter === 'presentation'} icon="📑" onClick={() => setFilter('presentation')} />
            <FilterPill label="Clients" count={counts.client} active={filter === 'client'} icon="👥" onClick={() => setFilter('client')} />
            <FilterPill label="Census" count={counts.census} active={filter === 'census'} icon="📋" onClick={() => setFilter('census')} />
            <FilterPill label="Reports" count={counts.report} active={filter === 'report'} icon="📈" onClick={() => setFilter('report')} />
            {counts.other > 0 && (
              <FilterPill label="Other" count={counts.other} active={filter === 'other'} onClick={() => setFilter('other')} />
            )}
          </div>

          {/* Timeline */}
          {events.length === 0 ? (
            <EmptyState />
          ) : visibleEvents.length === 0 ? (
            <NoMatchState onClear={() => setFilter('all')} />
          ) : (
            <div>
              {groupedEvents.map((bucket) => (
                <div key={bucket.label} style={{ marginBottom: '2rem' }}>
                  <div style={{
                    fontSize: '0.75rem',
                    color: '#7a8a9b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontWeight: 600,
                    marginBottom: '0.75rem',
                    paddingBottom: '0.5rem',
                    borderBottom: '1px solid #e8e0d0',
                  }}>
                    {bucket.label} · {bucket.events.length}
                  </div>
                  <div>
                    {bucket.events.map((event) => (
                      <EventRow key={event.id} event={event} onNavigate={(url) => router.push(url)} />
                    ))}
                  </div>
                </div>
              ))}
              {events.length >= 200 && (
                <div style={{ textAlign: 'center', color: '#7a8a9b', fontSize: '0.85rem', marginTop: '1rem' }}>
                  Showing the 200 most recent events.
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ----- Small components -----

function FilterPill({
  label,
  count,
  active,
  icon,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  icon?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#1e3a5f' : '#faf7f2',
        color: active ? '#fff' : '#3a4d68',
        border: active ? '1px solid #1e3a5f' : '1px solid #d4cab8',
        padding: '0.4rem 0.85rem',
        borderRadius: '20px',
        fontSize: '0.85rem',
        fontWeight: 500,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.3rem',
        transition: 'all 0.1s',
      }}
    >
      {icon && <span>{icon}</span>}
      <span>{label}</span>
      <span style={{
        background: active ? 'rgba(255,255,255,0.2)' : '#e8e0d0',
        color: active ? '#fff' : '#7a8a9b',
        fontSize: '0.7rem',
        fontWeight: 600,
        padding: '0.1rem 0.4rem',
        borderRadius: '10px',
        marginLeft: '0.1rem',
      }}>
        {count}
      </span>
    </button>
  );
}

function EventRow({
  event,
  onNavigate,
}: {
  event: ActivityEvent;
  onNavigate: (url: string) => void;
}) {
  const cat = categorizeEvent(event.event_type);
  const style = EVENT_STYLES[cat];
  const route = getRouteForEvent(event);
  const clickable = !!route;

  const actorName = event.actor_name || 'System';
  const actorInitials = actorName
    .split(/\s+/)
    .map((n) => n.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('') || '?';

  return (
    <div
      onClick={clickable ? () => onNavigate(route!) : undefined}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.85rem',
        padding: '0.85rem 1rem',
        marginBottom: '0.3rem',
        background: '#faf7f2',
        border: '1px solid #e8e0d0',
        borderRadius: '8px',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'background 0.1s, border-color 0.1s',
      }}
      onMouseEnter={(e) => {
        if (clickable) {
          e.currentTarget.style.background = '#f5efe0';
          e.currentTarget.style.borderColor = '#d4cab8';
        }
      }}
      onMouseLeave={(e) => {
        if (clickable) {
          e.currentTarget.style.background = '#faf7f2';
          e.currentTarget.style.borderColor = '#e8e0d0';
        }
      }}
    >
      {/* Actor avatar */}
      <div style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: event.actor_name ? '#1e3a5f' : '#a8b0bc',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.8rem',
        fontWeight: 600,
        flexShrink: 0,
      }}>
        {actorInitials}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '0.2rem',
        }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            background: style.bg,
            color: style.fg,
            fontSize: '0.7rem',
            fontWeight: 600,
            padding: '0.15rem 0.5rem',
            borderRadius: '10px',
            letterSpacing: '0.02em',
          }}>
            <span>{style.icon}</span>
            <span>{style.label}</span>
          </span>
          <span style={{ fontSize: '0.75rem', color: '#7a8a9b' }}>
            {formatRelativeTime(event.created_at)}
          </span>
        </div>
        <div style={{
          fontSize: '0.95rem',
          color: '#1e3a5f',
          lineHeight: 1.4,
        }}>
          {event.event_summary}
        </div>
        {event.actor_name && (
          <div style={{ fontSize: '0.75rem', color: '#7a8a9b', marginTop: '0.2rem' }}>
            by {event.actor_name}
          </div>
        )}
      </div>

      {/* Arrow if clickable */}
      {clickable && (
        <div style={{
          color: '#7a8a9b',
          fontSize: '1rem',
          flexShrink: 0,
          alignSelf: 'center',
        }}>
          →
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      background: '#faf7f2',
      border: '1px dashed #d4cab8',
      borderRadius: '12px',
      padding: '3rem 2rem',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🕓</div>
      <div style={{ fontSize: '1.1rem', color: '#1e3a5f', fontWeight: 500, marginBottom: '0.4rem' }}>
        No activity yet
      </div>
      <div style={{ color: '#7a8a9b', fontSize: '0.9rem' }}>
        Events from across your agency will appear here as they happen.
      </div>
    </div>
  );
}

function NoMatchState({ onClear }: { onClear: () => void }) {
  return (
    <div style={{
      background: '#faf7f2',
      border: '1px dashed #d4cab8',
      borderRadius: '12px',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <div style={{ color: '#3a4d68', fontSize: '0.95rem', marginBottom: '0.75rem' }}>
        No events match this filter.
      </div>
      <button
        onClick={onClear}
        style={{
          background: '#7a9b76',
          color: '#faf7f2',
          border: 'none',
          padding: '0.5rem 1rem',
          borderRadius: '6px',
          fontSize: '0.85rem',
          cursor: 'pointer',
          fontWeight: 500,
        }}
      >
        Show all events
      </button>
    </div>
  );
}

// ----- Formatting helpers -----

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}