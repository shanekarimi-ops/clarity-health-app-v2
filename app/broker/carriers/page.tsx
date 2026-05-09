'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';
import BrokerSidebar from '../../components/BrokerSidebar';

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
  created_at: string;
  carriers: Carrier;
};

export default function CarriersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [agencyId, setAgencyId] = useState<string>('');

  const [tab, setTab] = useState<'mine' | 'all'>('mine');
  const [myCarriers, setMyCarriers] = useState<AgencyCarrier[]>([]);
  const [allCarriers, setAllCarriers] = useState<Carrier[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);

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

      if (!brokerRow?.agency_id) {
        setLoading(false);
        return;
      }

      setAgencyId(brokerRow.agency_id);
      if (brokerRow.agencies) {
        setAgencyName((brokerRow.agencies as any).name || '');
      }

      // Load both lists in parallel
      const [myRes, allRes] = await Promise.all([
        supabase
          .from('agency_carriers')
          .select('id, agency_id, carrier_id, default_carrier_user_id, notes, is_favorite, created_at, carriers(id, name, slug, logo_url, brand_color, website, is_global, added_by_agency_id)')
          .eq('agency_id', brokerRow.agency_id)
          .order('created_at', { ascending: true }),
        supabase
          .from('carriers')
          .select('id, name, slug, logo_url, brand_color, website, is_global, added_by_agency_id')
          .eq('is_global', true)
          .order('name', { ascending: true }),
      ]);

      if (myRes.data) setMyCarriers(myRes.data as any);
      if (allRes.data) setAllCarriers(allRes.data as any);

      setLoading(false);
    }
    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function handleAddCarrier(carrierId: string) {
    if (!agencyId) return;
    setAddingId(carrierId);
    try {
      const { data, error } = await supabase
        .from('agency_carriers')
        .insert({ agency_id: agencyId, carrier_id: carrierId })
        .select('id, agency_id, carrier_id, default_carrier_user_id, notes, is_favorite, created_at, carriers(id, name, slug, logo_url, brand_color, website, is_global, added_by_agency_id)')
        .single();

      if (error) {
        alert('Failed to add carrier: ' + error.message);
        return;
      }

      if (data) {
        setMyCarriers(prev => [...prev, data as any]);
      }
    } finally {
      setAddingId(null);
    }
  }

  const myCarrierIds = new Set(myCarriers.map(mc => mc.carrier_id));

  if (loading) {
    return (
      <div className="dash-layout">
        <main className="dash-main" style={{ padding: 40, color: '#1e3a5f' }}>Loading...</main>
      </div>
    );
  }

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
          {/* Header */}
          <div style={{ fontSize: '0.8rem', color: '#7a8a9b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            Broker · Directory
          </div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '2.25rem', color: '#1e3a5f', margin: 0, marginBottom: '0.5rem' }}>
            Carriers
          </h1>
          <p style={{ color: '#3a4d68', fontSize: '1.05rem', marginBottom: '2rem' }}>
            Manage your agency's carrier roster and rep contacts.
          </p>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #e8e0d0', marginBottom: '1.5rem' }}>
            <TabButton
              active={tab === 'mine'}
              onClick={() => setTab('mine')}
              label="My Carriers"
              count={myCarriers.length}
            />
            <TabButton
              active={tab === 'all'}
              onClick={() => setTab('all')}
              label="All Carriers"
              count={allCarriers.length}
            />
          </div>

          {/* Tab content */}
          {tab === 'mine' ? (
            myCarriers.length === 0 ? (
              <EmptyState onBrowse={() => setTab('all')} />
            ) : (
              <CarrierTable
                rows={myCarriers.map(mc => ({
                  carrier: mc.carriers,
                  isFavorite: mc.is_favorite,
                  isAdded: true,
                  notes: mc.notes,
                }))}
                addingId={null}
                onAdd={() => {}}
                onRowClick={(carrierId) => router.push(`/broker/carriers/${carrierId}`)}
                showAddColumn={false}
              />
            )
          ) : (
            <CarrierTable
              rows={allCarriers.map(c => ({
                carrier: c,
                isFavorite: false,
                isAdded: myCarrierIds.has(c.id),
                notes: null,
              }))}
              addingId={addingId}
              onAdd={handleAddCarrier}
              onRowClick={(carrierId) => {
                if (myCarrierIds.has(carrierId)) {
                  router.push(`/broker/carriers/${carrierId}`);
                }
              }}
              showAddColumn={true}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
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
      <span style={{
        marginLeft: '0.5rem',
        fontSize: '0.8rem',
        color: active ? '#7a9b76' : '#a0aec0',
        fontWeight: 500,
      }}>
        {count}
      </span>
    </button>
  );
}

function EmptyState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div style={{
      background: '#faf7f2',
      border: '1px dashed #d4c8b0',
      borderRadius: '12px',
      padding: '3rem 2rem',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🏢</div>
      <h3 style={{ color: '#1e3a5f', fontSize: '1.25rem', margin: 0, marginBottom: '0.5rem', fontFamily: 'Playfair Display, serif' }}>
        No carriers added yet
      </h3>
      <p style={{ color: '#3a4d68', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
        Browse the global carrier list to add the carriers you work with.
      </p>
      <button
        onClick={onBrowse}
        style={{
          background: '#1e3a5f',
          color: '#faf7f2',
          border: 'none',
          padding: '0.75rem 1.5rem',
          borderRadius: '6px',
          fontSize: '0.95rem',
          fontWeight: 500,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Browse All Carriers
      </button>
    </div>
  );
}

type CarrierRow = {
  carrier: Carrier;
  isFavorite: boolean;
  isAdded: boolean;
  notes: string | null;
};

function CarrierTable({
  rows,
  addingId,
  onAdd,
  onRowClick,
  showAddColumn,
}: {
  rows: CarrierRow[];
  addingId: string | null;
  onAdd: (carrierId: string) => void;
  onRowClick: (carrierId: string) => void;
  showAddColumn: boolean;
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e8e0d0', borderRadius: '8px', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.92rem' }}>
        <thead>
          <tr style={{ background: '#faf7f2', borderBottom: '1px solid #e8e0d0' }}>
            <th style={thStyle}>Carrier</th>
            <th style={thStyle}>Type</th>
            <th style={thStyle}>Reps</th>
            <th style={thStyle}>Active RFPs</th>
            <th style={thStyle}>Notes</th>
            {showAddColumn && <th style={{ ...thStyle, textAlign: 'right' }}>Action</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const initials = row.carrier.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
            const brandColor = row.carrier.brand_color || '#1e3a5f';
            const clickable = !showAddColumn || row.isAdded;
            return (
              <tr
                key={row.carrier.id}
                onClick={() => clickable && onRowClick(row.carrier.id)}
                style={{
                  borderBottom: '1px solid #f0e8d8',
                  cursor: clickable ? 'pointer' : 'default',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { if (clickable) e.currentTarget.style.background = '#faf7f2'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <td style={tdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: 6,
                      background: brandColor,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}>
                      {initials}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: '#1e3a5f' }}>
                        {row.carrier.name}
                        {row.isFavorite && (
                          <span style={{ marginLeft: '0.5rem', color: '#d4a017', fontSize: '0.85rem' }}>★</span>
                        )}
                      </div>
                      {row.carrier.website && (
                        <div style={{ fontSize: '0.78rem', color: '#7a8a9b' }}>
                          {row.carrier.website.replace(/^https?:\/\//, '')}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={tdStyle}>
                  <span style={{
                    display: 'inline-block',
                    padding: '0.2rem 0.5rem',
                    background: row.carrier.is_global ? '#eef2f7' : '#f4f1ea',
                    color: row.carrier.is_global ? '#1e3a5f' : '#7a9b76',
                    fontSize: '0.75rem',
                    borderRadius: 4,
                    fontWeight: 500,
                  }}>
                    {row.carrier.is_global ? 'Global' : 'Custom'}
                  </span>
                </td>
                <td style={{ ...tdStyle, color: '#7a8a9b' }}>—</td>
                <td style={{ ...tdStyle, color: '#7a8a9b' }}>—</td>
                <td style={{ ...tdStyle, color: '#3a4d68', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.notes || <span style={{ color: '#a0aec0' }}>—</span>}
                </td>
                {showAddColumn && (
                  <td style={{ ...tdStyle, textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                    {row.isAdded ? (
                      <span style={{
                        display: 'inline-block',
                        padding: '0.35rem 0.7rem',
                        background: '#e8f0e6',
                        color: '#5a7a56',
                        fontSize: '0.8rem',
                        borderRadius: 4,
                        fontWeight: 500,
                      }}>
                        ✓ Added
                      </span>
                    ) : (
                      <button
                        onClick={() => onAdd(row.carrier.id)}
                        disabled={addingId === row.carrier.id}
                        style={{
                          background: '#7a9b76',
                          color: '#fff',
                          border: 'none',
                          padding: '0.4rem 0.85rem',
                          borderRadius: 4,
                          fontSize: '0.82rem',
                          fontWeight: 500,
                          cursor: addingId === row.carrier.id ? 'wait' : 'pointer',
                          opacity: addingId === row.carrier.id ? 0.6 : 1,
                          fontFamily: 'inherit',
                        }}
                      >
                        {addingId === row.carrier.id ? 'Adding...' : '+ Add'}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.85rem 1rem',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#7a8a9b',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const tdStyle: React.CSSProperties = {
  padding: '0.85rem 1rem',
  color: '#1e3a5f',
  verticalAlign: 'middle',
};