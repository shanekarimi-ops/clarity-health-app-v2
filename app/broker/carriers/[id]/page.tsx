'use client';

import { useEffect, useState, useRef } from 'react';
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
  const [showRepModal, setShowRepModal] = useState(false);
  const [editingRep, setEditingRep] = useState<CarrierUser | null>(null);
  const [deletingRep, setDeletingRep] = useState<CarrierUser | null>(null);

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
  async function handleToggleFavorite() {
    if (!agencyCarrier) return;
    const newValue = !agencyCarrier.is_favorite;

    // Optimistic
    setAgencyCarrier(prev => prev ? { ...prev, is_favorite: newValue } : prev);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      alert('Session expired. Please log in again.');
      return;
    }

    try {
      const res = await fetch(`/api/agency-carriers/${carrierId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_favorite: newValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Roll back
        setAgencyCarrier(prev => prev ? { ...prev, is_favorite: !newValue } : prev);
        alert(data.error || 'Failed to update favorite');
        return;
      }
      if (data.agencyCarrier) {
        setAgencyCarrier(data.agencyCarrier);
      }
    } catch (e: any) {
      setAgencyCarrier(prev => prev ? { ...prev, is_favorite: !newValue } : prev);
      alert(e.message || 'Network error');
    }
  }

  async function handleSaveNotes(notes: string) {
    if (!agencyCarrier) return { ok: false, error: 'Not in agency' };

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      return { ok: false, error: 'Session expired. Please log in again.' };
    }

    try {
      const res = await fetch(`/api/agency-carriers/${carrierId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || 'Failed to save notes' };
      }
      if (data.agencyCarrier) {
        setAgencyCarrier(data.agencyCarrier);
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message || 'Network error' };
    }
  }
  function handleRepSaved(savedRep: CarrierUser, mode: 'create' | 'edit') {
    if (mode === 'create') {
      setReps(prev => [...prev, savedRep]);
    } else {
      setReps(prev => prev.map(r => r.id === savedRep.id ? savedRep : r));
    }
    setShowRepModal(false);
    setEditingRep(null);
  }

  function handleAddRepClick() {
    setEditingRep(null);
    setShowRepModal(true);
  }

  function handleEditRepClick(rep: CarrierUser) {
    setEditingRep(rep);
    setShowRepModal(true);
  }

  async function handleConfirmDelete() {
    if (!deletingRep) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      alert('Session expired. Please log in again.');
      return;
    }

    try {
      const res = await fetch(`/api/carriers/${carrierId}/reps/${deletingRep.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to remove rep');
        return;
      }

      setReps(prev => prev.filter(r => r.id !== deletingRep.id));
      setDeletingRep(null);
    } catch (e: any) {
      alert(e.message || 'Network error');
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
            <button onClick={() => router.push('/broker/carriers')} style={backLinkStyle}>
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
            <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '2rem', color: '#1e3a5f', margin: 0, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                {carrier.name}
                {isInAgency && (
                  <button
                    onClick={handleToggleFavorite}
                    title={agencyCarrier?.is_favorite ? 'Remove from favorites' : 'Mark as favorite'}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      fontSize: '1.4rem',
                      lineHeight: 1,
                      color: agencyCarrier?.is_favorite ? '#d4a017' : '#cbd5db',
                    }}
                  >
                    {agencyCarrier?.is_favorite ? '★' : '☆'}
                  </button>
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

          <div style={{ display: 'flex', borderBottom: '1px solid #e8e0d0', marginBottom: '1.5rem' }}>
            <DetailTab active={tab === 'reps'} onClick={() => setTab('reps')} label="Reps" count={reps.length} />
            <DetailTab active={tab === 'engagement'} onClick={() => setTab('engagement')} label="Engagement" />
            <DetailTab active={tab === 'history'} onClick={() => setTab('history')} label="History" />
            <DetailTab active={tab === 'notes'} onClick={() => setTab('notes')} label="Notes" />
          </div>

          {tab === 'reps' && (
            <RepsTab
              reps={reps}
              isInAgency={isInAgency}
              onAddRepClick={handleAddRepClick}
              onEditRep={handleEditRepClick}
              onDeleteRep={(rep) => setDeletingRep(rep)}
            />
          )}
          {tab === 'engagement' && <EngagementTab />}
          {tab === 'history' && <HistoryTab />}
          {tab === 'notes' && (
            <NotesTab
              initialNotes={agencyCarrier?.notes || ''}
              isInAgency={isInAgency}
              onSave={handleSaveNotes}
            />
          )}
        </div>
      </main>

      {showRepModal && (
        <RepFormModal
          carrierId={carrierId}
          carrierName={carrier.name}
          editingRep={editingRep}
          onClose={() => { setShowRepModal(false); setEditingRep(null); }}
          onSaved={handleRepSaved}
        />
      )}

      {deletingRep && (
        <DeleteRepConfirm
          rep={deletingRep}
          carrierName={carrier.name}
          onCancel={() => setDeletingRep(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
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

function RepsTab({
  reps,
  isInAgency,
  onAddRepClick,
  onEditRep,
  onDeleteRep,
}: {
  reps: CarrierUser[];
  isInAgency: boolean;
  onAddRepClick: () => void;
  onEditRep: (rep: CarrierUser) => void;
  onDeleteRep: (rep: CarrierUser) => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ color: '#3a4d68', fontSize: '0.92rem' }}>
          Carrier reps your agency works with at this carrier.
        </div>
        <button
          onClick={onAddRepClick}
          disabled={!isInAgency}
          title={!isInAgency ? 'Add this carrier to your agency first' : 'Add a new rep'}
          style={{
            background: isInAgency ? '#7a9b76' : '#cbd5db',
            color: '#fff',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: 6,
            fontSize: '0.88rem',
            fontWeight: 500,
            cursor: isInAgency ? 'pointer' : 'not-allowed',
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
                <th style={{ ...detailThStyle, width: 140, textAlign: 'right' }}>Actions</th>
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
                  <td style={{ ...detailTdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => onEditRep(rep)} style={rowActionLinkStyle}>Edit</button>
                    <span style={{ color: '#cbd5db', margin: '0 0.4rem' }}>·</span>
                    <button
                      onClick={() => onDeleteRep(rep)}
                      style={{ ...rowActionLinkStyle, color: '#9a3a3a' }}
                    >
                      Remove
                    </button>
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

function RowActionMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#7a8a9b',
          fontSize: '1.2rem',
          fontWeight: 700,
          cursor: 'pointer',
          padding: '0.25rem 0.5rem',
          borderRadius: 4,
          lineHeight: 1,
        }}
        aria-label="Row actions"
      >
        ⋯
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: '100%',
          marginTop: 4,
          background: '#fff',
          border: '1px solid #e8e0d0',
          borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          minWidth: 140,
          zIndex: 10,
          overflow: 'hidden',
        }}>
          <button
            onClick={() => { setOpen(false); onEdit(); }}
            style={menuItemStyle}
          >
            Edit
          </button>
          <button
            onClick={() => { setOpen(false); onDelete(); }}
            style={{ ...menuItemStyle, color: '#9a3a3a', borderTop: '1px solid #f0e8d8' }}
          >
            Remove
          </button>
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

function NotesTab({
  initialNotes,
  isInAgency,
  onSave,
}: {
  initialNotes: string;
  isInAgency: boolean;
  onSave: (notes: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Reset local state when initialNotes changes (e.g., after server roundtrip)
  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  const dirty = notes !== initialNotes;

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    const result = await onSave(notes);
    setSaving(false);
    if (result.ok) {
      setFeedback({ type: 'ok', msg: 'Notes saved' });
      setTimeout(() => setFeedback(null), 2000);
    } else {
      setFeedback({ type: 'err', msg: result.error || 'Failed to save' });
    }
  }

  return (
    <div>
      <div style={{ color: '#3a4d68', fontSize: '0.92rem', marginBottom: '1rem' }}>
        Internal notes about this carrier (visible to your agency only).
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={!isInAgency || saving}
        placeholder={isInAgency ? 'Add notes about this carrier...' : 'Add this carrier to your agency to enable notes.'}
        style={{
          width: '100%',
          minHeight: 200,
          padding: '0.85rem 1rem',
          fontSize: '0.92rem',
          color: '#1e3a5f',
          background: isInAgency ? '#fff' : '#faf7f2',
          border: '1px solid #cbd5db',
          borderRadius: 8,
          fontFamily: 'inherit',
          resize: 'vertical',
        }}
      />
      {isInAgency && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', marginTop: '0.75rem' }}>
          {feedback && (
            <span style={{
              fontSize: '0.85rem',
              color: feedback.type === 'ok' ? '#5a7a56' : '#9a3a3a',
            }}>
              {feedback.msg}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            style={{
              background: dirty ? '#7a9b76' : '#cbd5db',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1.1rem',
              borderRadius: 6,
              fontSize: '0.88rem',
              fontWeight: 500,
              cursor: dirty && !saving ? 'pointer' : 'not-allowed',
              opacity: saving ? 0.6 : 1,
              fontFamily: 'inherit',
            }}
          >
            {saving ? 'Saving...' : 'Save notes'}
          </button>
        </div>
      )}
    </div>
  );
}

function RepFormModal({
  carrierId,
  carrierName,
  editingRep,
  onClose,
  onSaved,
}: {
  carrierId: string;
  carrierName: string;
  editingRep: CarrierUser | null;
  onClose: () => void;
  onSaved: (rep: CarrierUser, mode: 'create' | 'edit') => void;
}) {
  const isEdit = !!editingRep;
  const [email, setEmail] = useState(editingRep?.email || '');
  const [fullName, setFullName] = useState(editingRep?.full_name || '');
  const [title, setTitle] = useState(editingRep?.title || '');
  const [phone, setPhone] = useState(editingRep?.phone || '');
  const [region, setRegion] = useState(editingRep?.region || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setError('Session expired. Please log in again.');
        return;
      }

      const url = isEdit
        ? `/api/carriers/${carrierId}/reps/${editingRep!.id}`
        : `/api/carriers/${carrierId}/reps`;
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          full_name: fullName.trim(),
          title: title.trim(),
          phone: phone.trim(),
          region: region.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save rep');
        return;
      }

      onSaved(data.rep, isEdit ? 'edit' : 'create');
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={modalOverlayStyle}>
      <div style={modalCardStyle}>
        <div style={{ padding: '1.5rem 1.75rem 1rem', borderBottom: '1px solid #e8e0d0' }}>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.4rem', color: '#1e3a5f', margin: 0 }}>
            {isEdit ? 'Edit Carrier Rep' : 'Add Carrier Rep'}
          </h2>
          <div style={{ fontSize: '0.85rem', color: '#7a8a9b', marginTop: '0.25rem' }}>
            {isEdit ? 'Updating' : 'New rep at'} <strong style={{ color: '#3a4d68' }}>{carrierName}</strong>
          </div>
        </div>

        <div style={{ padding: '1.25rem 1.75rem' }}>
          <FormField label="Email" required>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rep@carrier.com" style={inputStyle} />
          </FormField>
          <FormField label="Full name">
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Smith" style={inputStyle} />
          </FormField>
          <FormField label="Title">
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Senior Account Executive" style={inputStyle} />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <FormField label="Phone">
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
            </FormField>
            <FormField label="Region">
              <input type="text" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="West, AZ/NV/UT" style={inputStyle} />
            </FormField>
          </div>

          {error && (
            <div style={{
              background: '#fdecec',
              border: '1px solid #f0baba',
              color: '#9a3a3a',
              padding: '0.65rem 0.85rem',
              borderRadius: 6,
              fontSize: '0.88rem',
              marginTop: '0.5rem',
            }}>
              {error}
            </div>
          )}
        </div>

        <div style={{
          padding: '1rem 1.75rem 1.25rem',
          borderTop: '1px solid #e8e0d0',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.75rem',
        }}>
          <button onClick={onClose} disabled={submitting} style={btnSecondaryStyle}>Cancel</button>
          <button onClick={handleSubmit} disabled={submitting} style={{
            ...btnPrimaryStyle,
            cursor: submitting ? 'wait' : 'pointer',
            opacity: submitting ? 0.6 : 1,
          }}>
            {submitting ? 'Saving...' : (isEdit ? 'Save changes' : 'Add Rep')}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteRepConfirm({
  rep,
  carrierName,
  onCancel,
  onConfirm,
}: {
  rep: CarrierUser;
  carrierName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const repLabel = rep.full_name || rep.email;

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={modalOverlayStyle}>
      <div style={{ ...modalCardStyle, maxWidth: 440 }}>
        <div style={{ padding: '1.5rem 1.75rem 1rem' }}>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.3rem', color: '#1e3a5f', margin: 0, marginBottom: '0.5rem' }}>
            Remove Rep
          </h2>
          <p style={{ color: '#3a4d68', fontSize: '0.92rem', margin: 0 }}>
            Remove <strong>{repLabel}</strong> from <strong>{carrierName}</strong>? This cannot be undone.
          </p>
        </div>
        <div style={{
          padding: '1rem 1.75rem 1.25rem',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.75rem',
        }}>
          <button onClick={onCancel} disabled={submitting} style={btnSecondaryStyle}>Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            style={{
              ...btnPrimaryStyle,
              background: '#9a3a3a',
              cursor: submitting ? 'wait' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Removing...' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{
        display: 'block',
        fontSize: '0.82rem',
        fontWeight: 500,
        color: '#3a4d68',
        marginBottom: '0.35rem',
      }}>
        {label}{required && <span style={{ color: '#9a3a3a', marginLeft: '0.2rem' }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.55rem 0.75rem',
  fontSize: '0.92rem',
  color: '#1e3a5f',
  background: '#fff',
  border: '1px solid #cbd5db',
  borderRadius: 6,
  fontFamily: 'inherit',
};

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

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(30, 58, 95, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '1rem',
};

const modalCardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  maxWidth: 540,
  width: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
};

const btnPrimaryStyle: React.CSSProperties = {
  background: '#7a9b76',
  color: '#fff',
  border: 'none',
  padding: '0.55rem 1.25rem',
  borderRadius: 6,
  fontSize: '0.88rem',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const btnSecondaryStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #cbd5db',
  color: '#3a4d68',
  padding: '0.55rem 1.1rem',
  borderRadius: 6,
  fontSize: '0.88rem',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const menuItemStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    padding: '0.6rem 0.9rem',
    fontSize: '0.88rem',
    color: '#3a4d68',
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
  
  const rowActionLinkStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: '#7a9b76',
    fontSize: '0.85rem',
    fontWeight: 500,
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit',
  };