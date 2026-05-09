'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '../../../supabase';
import BrokerSidebar from '../../../components/BrokerSidebar';

type Carrier = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_color: string | null;
  website: string | null;
  is_global: boolean;
  added_by_agency_id: string | null;
};

type AgencyCarrier = {
  id: string;
  agency_id: string;
  carrier_id: string;
  default_carrier_user_id: string | null;
  notes: string | null;
  is_favorite: boolean;
};

type CarrierUser = {
  id: string;
  user_id: string | null;
  carrier_id: string;
  email: string;
  full_name: string | null;
  title: string | null;
  phone: string | null;
  region: string | null;
  status: string;
  created_at: string;
};

type TabKey = 'reps' | 'engagement' | 'history' | 'notes';

export default function CarrierDetailPage() {
  const router = useRouter();
  const params = useParams();
  const carrierId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [agencyId, setAgencyId] = useState<string>('');

  const [carrier, setCarrier] = useState<Carrier | null>(null);
  const [agencyCarrier, setAgencyCarrier] = useState<AgencyCarrier | null>(null);
  const [reps, setReps] = useState<CarrierUser[]>([]);
  const [adding, setAdding] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [tab, setTab] = useState<TabKey>('reps');

  useEffect(() => {
    async function load() {
      if (!carrierId) return;

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

      if (!brokerRow?.agency_id) {
        setLoading(false);
        return;
      }

      setAgencyId(brokerRow.agency_id);
      if (brokerRow.agencies) {
        setAgencyName((brokerRow.agencies as any).name || '');
      }

      // Load carrier + agency_carriers row + reps in parallel
      const [carrierRes, agencyCarrierRes, repsRes] = await Promise.all([
        supabase
          .from('carriers')
          .select('id, name, slug, logo_url, brand_color, website, is_global, added_by_agency_id')
          .eq('id', carrierId)
          .maybeSingle(),
        supabase
          .from('agency_carriers')
          .select('id, agency_id, carrier_id, default_carrier_user_id, notes, is_favorite')
          .eq('agency_id', brokerRow.agency_id)
          .eq('carrier_id', carrierId)
          .maybeSingle(),
        supabase
          .from('carrier_users')
          .select('id, user_id, carrier_id, email, full_name, title, phone, region, status, created_at')
          .eq('carrier_id', carrierId)
          .order('created_at', { ascending: true }),
      ]);

      if (!carrierRes.data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setCarrier(carrierRes.data as Carrier);
      if (agencyCarrierRes.data) setAgencyCarrier(agencyCarrierRes.data as AgencyCarrier);
      if (repsRes.data) setReps(repsRes.data as CarrierUser[]);

      setLoading(false);
    }
    load();
  }, [carrierId, router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function handleAddToAgency() {
    if (!agencyId || !carrierId) return;
    setAdding(true);
    try {
      const { data, error } = await supabase
        .from('agency_carriers')
        .insert({ agency_id: agencyId, carrier_id: carrierId })
        .select('id, agency_id, carrier_id, default_carrier_user_id, notes, is_favorite')
        .single();

      if (error) {
        alert('Failed to add carrier: ' + error.message);
        return;
      }
      if (data) setAgencyCarrier(data as AgencyCarrier);
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return (
      <div className="dash-layout">
        <main className="dash-main" style={{ padding: 40, color: '#1e3a5f' }}>Loading...</main>
      </div>
    );
  }

  if (notFound || !carrier) {
    return (
      <div className="dash-layout">
        <BrokerSidebar
          active="carriers"
          firstName={firstName}
          lastName={lastName}
          agencyName={agencyName}
          onLogout={handleLogout}
        />
        <main className="dash-main">
          <div style={{ padding: '2rem 2.5rem', maxWidth: 1400, margin: '0 auto' }}>
            <button
              onClick={() => router.push('/broker/carriers')}
              style={backLinkStyle}
            >
              ← Back to Carriers
            </button>
            <div style={{ marginTop: '2rem', padding: '3rem', textAlign: 'center', background: '#faf7f2', borderRadius: 12, border: '1px solid #e8e0d0' }}>
              <h2 style={{ color: '#1e3a5f', fontFamily: 'Playfair Display, serif', margin: 0, marginBottom: '0.5rem' }}>Carrier not found</h2>
              <p style={{ color: '#3a4d68' }}>This carrier doesn't exist or you don't have access to it.</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const initials = carrier.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const brandColor = carrier.brand_color || '#1e3a5f';
  const isInAgency = !!agencyCarrier;

  return (
    <div className="dash-layout">
      <BrokerSidebar
        active="carriers"
        firstName={firstName}
        lastName={lastName}
        agencyName={agencyName}
        onLogout={handleLogout}
      />
      <main className="dash-main">
        <div style={{ padding: '2rem 2.5rem', maxWidth: 1400, margin: '0 auto' }}>
          <button onClick={() => router.push('/broker/carriers')} style={backLinkStyle}>
            ← Back to Carriers
          </button>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginTop: '1rem', marginBottom: '1.5rem' }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: 10,
              background: brandColor,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem',
              fontWeight: 700,
              flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '2rem', color: '#1e3a5f', margin: 0, marginBottom: '0.25rem' }}>
                {carrier.name}
                {agencyCarrier?.is_favorite && (
                  <span style={{ marginLeft: '0.6rem', color: '#d4a017', fontSize: '1.4rem' }}>★</span>
                )}
              </h1>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', fontSize: '0.88rem', color: '#7a8a9b' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '0.2rem 0.5rem',
                  background: carrier.is_global ? '#eef2f7' : '#f4f1ea',
                  color: carrier.is_global ? '#1e3a5f' : '#7a9b76',
                  fontSize: '0.72rem',
                  borderRadius: 4,
                  fontWeight: 500,
                }}>
                  {carrier.is_global ? 'Global' : 'Custom'}
                </span>
                {carrier.website && (
                  <a href={carrier.website} target="_blank" rel="noopener noreferrer" style={{ color: '#7a9b76', textDecoration: 'none' }}>
                    {carrier.website.replace(/^https?:\/\//, '')} ↗
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Add-to-agency banner */}
          {!isInAgency && (
            <div style={{
              background: '#fef9ec',
              border: '1px solid #f0d68a',
              borderRadius: 8,
              padding: '1rem 1.25rem',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
            }}>
              <div style={{ color: '#7a5e1a', fontSize: '0.92rem' }}>
                This carrier isn't in your agency's roster yet. Add it to start managing reps and tracking RFP activity.
              </div>
              <button
                onClick={handleAddToAgency}
                disabled={adding}
                style={{
                  background: '#7a9b76',
                  color: '#fff',
                  border: 'none',
                  padding: '0.55rem 1rem',
                  borderRadius: 6,
                  fontSize: '0.88rem',
                  fontWeight: 500,
                  cursor: adding ? 'wait' : 'pointer',
                  opacity: adding ? 0.6 : 1,
                  flexShrink: 0,
                  fontFamily: 'inherit',
                }}
              >
                {adding ? 'Adding...' : '+ Add to my agency'}
              </button>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e8e0d0', marginBottom: '1.5rem' }}>
            <DetailTab active={tab === 'reps'} onClick={() => setTab('reps')} label="Reps" count={reps.length} />
            <DetailTab active={tab === 'engagement'} onClick={() => setTab('engagement')} label="Engagement" />
            <DetailTab active={tab === 'history'} onClick={() => setTab('history')} label="History" />
            <DetailTab active={tab === 'notes'} onClick={() => setTab('notes')} label="Notes" />
          </div>

          {/* Tab content */}
          {tab === 'reps' && <RepsTab reps={reps} disabled={!isInAgency} />}
          {tab === 'engagement' && <EngagementTab />}
          {tab === 'history' && <HistoryTab />}
          {tab === 'notes' && <NotesTab notes={agencyCarrier?.notes || ''} />}
        </div>
      </main>
    </div>
  );
}

function DetailTab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        padding: '0.85rem 1.5rem',
        fontSize: '0.95rem',
        fontWeight: active ? 600 : 500,
        color: active ? '#1e3a5f' : '#7a8a9b',
        borderBottom: active ? '2px solid #7a9b76' : '2px solid transparent',
        cursor: 'pointer',
        marginBottom: '-1px',
        fontFamily: 'inherit',
      }}
    >
      {label}
      {count !== undefined && (
        <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: active ? '#7a9b76' : '#a0aec0', fontWeight: 500 }}>
          {count}
        </span>
      )}
    </button>
  );
}

function RepsTab({ reps, disabled }: { reps: CarrierUser[]; disabled: boolean }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ color: '#3a4d68', fontSize: '0.92rem' }}>
          Carrier reps your agency works with at this carrier.
        </div>
        <button
          disabled
          title={disabled ? 'Add this carrier to your agency first' : 'Coming in Push 3'}
          style={{
            background: '#cbd5db',
            color: '#fff',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: 6,
            fontSize: '0.88rem',
            fontWeight: 500,
            cursor: 'not-allowed',
            fontFamily: 'inherit',
          }}
        >
          + Add Rep
        </button>
      </div>

      {reps.length === 0 ? (
        <div style={{
          background: '#faf7f2',
          border: '1px dashed #d4c8b0',
          borderRadius: 8,
          padding: '2.5rem 2rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>👤</div>
          <h3 style={{ color: '#1e3a5f', fontFamily: 'Playfair Display, serif', margin: 0, marginBottom: '0.5rem' }}>
            No reps yet
          </h3>
          <p style={{ color: '#3a4d68', fontSize: '0.9rem', margin: 0 }}>
            Add your first carrier rep to start sending RFPs and tracking responses.
          </p>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e8e0d0', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#faf7f2', borderBottom: '1px solid #e8e0d0' }}>
                <th style={detailThStyle}>Name</th>
                <th style={detailThStyle}>Email</th>
                <th style={detailThStyle}>Title</th>
                <th style={detailThStyle}>Phone</th>
                <th style={detailThStyle}>Region</th>
                <th style={detailThStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {reps.map(rep => (
                <tr key={rep.id} style={{ borderBottom: '1px solid #f0e8d8' }}>
                  <td style={detailTdStyle}>
                    <div style={{ fontWeight: 600, color: '#1e3a5f' }}>
                      {rep.full_name || <span style={{ color: '#a0aec0' }}>—</span>}
                    </div>
                  </td>
                  <td style={detailTdStyle}>{rep.email}</td>
                  <td style={{ ...detailTdStyle, color: '#3a4d68' }}>{rep.title || <span style={{ color: '#a0aec0' }}>—</span>}</td>
                  <td style={{ ...detailTdStyle, color: '#3a4d68' }}>{rep.phone || <span style={{ color: '#a0aec0' }}>—</span>}</td>
                  <td style={{ ...detailTdStyle, color: '#3a4d68' }}>{rep.region || <span style={{ color: '#a0aec0' }}>—</span>}</td>
                  <td style={detailTdStyle}>
                    <StatusPill status={rep.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    invited: { bg: '#fef9ec', fg: '#7a5e1a' },
    active: { bg: '#e8f0e6', fg: '#5a7a56' },
    inactive: { bg: '#eef2f7', fg: '#7a8a9b' },
  };
  const c = colors[status] || colors.inactive;
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.2rem 0.55rem',
      background: c.bg,
      color: c.fg,
      fontSize: '0.75rem',
      borderRadius: 4,
      fontWeight: 500,
      textTransform: 'capitalize',
    }}>
      {status}
    </span>
  );
}

function EngagementTab() {
  return (
    <div>
      <div style={{ color: '#3a4d68', fontSize: '0.92rem', marginBottom: '1rem' }}>
        Engagement metrics across all RFPs sent to this carrier.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatBox label="Avg Open Time" value="—" />
        <StatBox label="Open Rate" value="—" />
        <StatBox label="Response Rate" value="—" />
        <StatBox label="Avg Response Time" value="—" />
      </div>
      <div style={{
        background: '#faf7f2',
        border: '1px dashed #d4c8b0',
        borderRadius: 8,
        padding: '2rem',
        textAlign: 'center',
        color: '#3a4d68',
        fontSize: '0.92rem',
      }}>
        Engagement tracking will populate once you start sending RFPs to this carrier.
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e8e0d0', borderRadius: 8, padding: '1rem 1.25rem' }}>
      <div style={{ fontSize: '0.75rem', color: '#7a8a9b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1e3a5f' }}>{value}</div>
    </div>
  );
}

function HistoryTab() {
  return (
    <div>
      <div style={{ color: '#3a4d68', fontSize: '0.92rem', marginBottom: '1rem' }}>
        Every RFP your agency has sent to this carrier.
      </div>
      <div style={{ background: '#fff', border: '1px solid #e8e0d0', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#faf7f2', borderBottom: '1px solid #e8e0d0' }}>
              <th style={detailThStyle}>RFP</th>
              <th style={detailThStyle}>Sent</th>
              <th style={detailThStyle}>Opened</th>
              <th style={detailThStyle}>Quoted</th>
              <th style={detailThStyle}>Status</th>
              <th style={detailThStyle}>Outcome</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: '#7a8a9b', fontSize: '0.92rem' }}>
                No RFPs sent to this carrier yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NotesTab({ notes }: { notes: string }) {
  return (
    <div>
      <div style={{ color: '#3a4d68', fontSize: '0.92rem', marginBottom: '1rem' }}>
        Internal notes about this carrier (visible to your agency only).
      </div>
      <textarea
        value={notes}
        disabled
        placeholder="No notes yet. Editing coming soon."
        style={{
          width: '100%',
          minHeight: 180,
          padding: '0.85rem 1rem',
          fontSize: '0.92rem',
          color: '#3a4d68',
          background: '#faf7f2',
          border: '1px solid #e8e0d0',
          borderRadius: 8,
          fontFamily: 'inherit',
          resize: 'vertical',
        }}
      />
    </div>
  );
}

const backLinkStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#7a9b76',
  fontSize: '0.9rem',
  cursor: 'pointer',
  padding: 0,
  fontFamily: 'inherit',
};

const detailThStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.85rem 1rem',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#7a8a9b',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const detailTdStyle: React.CSSProperties = {
  padding: '0.85rem 1rem',
  color: '#1e3a5f',
  verticalAlign: 'middle',
};