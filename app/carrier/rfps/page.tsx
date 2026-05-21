'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/supabase';
import CarrierShell from '@/app/components/CarrierShell';
import { BENEFIT_LINE_LABELS, BenefitLineValue } from '@/app/lib/benefit-lines';

type CarrierRfpRow = {
  rfp_carrier_id: string;
  rc_status: string;
  requested_benefits: string[];
  sent_at: string | null;
  rfp_id: string;
  rfp_name: string;
  rfp_type: string | null;
  effective_date: string | null;
  proposal_due_date: string | null;
  employee_lives: number | null;
  est_premium_volume: number | null;
  client_name: string | null;
  agency_name: string;
};

export default function CarrierRfpsPage() {
  return (
    <CarrierShell active="rfps">
      {(info) => <CarrierRfpInbox carrierUserId={info.carrier_user_id} carrierName={info.carrier_name} />}
    </CarrierShell>
  );
}

function CarrierRfpInbox({ carrierUserId, carrierName }: { carrierUserId: string; carrierName: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CarrierRfpRow[]>([]);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const loadRfps = async () => {
      setLoading(true);

      // CHANGED S42: rfps.client_id → rfps.group_id, clients(employer_name) → groups(name)
      const { data, error: queryError } = await supabase
        .from('rfp_carriers')
        .select(`
          id,
          status,
          requested_benefits,
          sent_at,
          rfps:rfp_id (
            id,
            name,
            rfp_type,
            effective_date,
            proposal_due_date,
            employee_lives,
            est_premium_volume,
            agency_id,
            group_id,
            agencies:agency_id ( name ),
            groups:group_id ( name )
          )
        `)
        .eq('assigned_carrier_user_id', carrierUserId);

      if (queryError) {
        console.error('[CarrierRfpInbox] query error:', queryError);
        setError('Could not load your RFPs. Please refresh the page.');
        setLoading(false);
        return;
      }

      const flattened: CarrierRfpRow[] = (data ?? [])
        .map((row: any) => {
          const rfp = row.rfps;
          if (!rfp) return null;
          return {
            rfp_carrier_id: row.id,
            rc_status: row.status,
            requested_benefits: row.requested_benefits ?? [],
            sent_at: row.sent_at,
            rfp_id: rfp.id,
            rfp_name: rfp.name,
            rfp_type: rfp.rfp_type,
            effective_date: rfp.effective_date,
            proposal_due_date: rfp.proposal_due_date,
            employee_lives: rfp.employee_lives,
            est_premium_volume: rfp.est_premium_volume,
            // CHANGED S42: rfp.clients?.employer_name → rfp.groups?.name
            client_name: rfp.groups?.name ?? null,
            agency_name: rfp.agencies?.name ?? 'Unknown agency',
          };
        })
        .filter((r): r is CarrierRfpRow => r !== null)
        .sort((a, b) => {
          if (a.proposal_due_date && !b.proposal_due_date) return -1;
          if (!a.proposal_due_date && b.proposal_due_date) return 1;
          if (!a.proposal_due_date && !b.proposal_due_date) return 0;
          return new Date(a.proposal_due_date!).getTime() - new Date(b.proposal_due_date!).getTime();
        });

      setRows(flattened);
      setLoading(false);
    };

    loadRfps();
  }, [carrierUserId]);

  return (
    <div style={pageContainerStyle}>
      <div style={headerRowStyle}>
        <div>
          <h1 style={pageTitleStyle}>RFPs</h1>
          <p style={pageSubtitleStyle}>
            Quote requests sent to {carrierName}
          </p>
        </div>
      </div>

      {loading && (
        <div style={loadingStyle}>Loading your RFPs…</div>
      )}

      {!loading && error && (
        <div style={errorBannerStyle}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div style={emptyStateCardStyle}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📥</div>
          <h2 style={emptyHeadingStyle}>No RFPs yet</h2>
          <p style={emptyBodyStyle}>
            When a broker sends a quote request to {carrierName}, it&apos;ll show up here.
          </p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div style={cardsContainerStyle}>
          {rows.map((row) => (
            <RfpCard key={row.rfp_carrier_id} row={row} onClick={() => router.push(`/carrier/rfps/${row.rfp_id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function RfpCard({ row, onClick }: { row: CarrierRfpRow; onClick: () => void }) {
  const dueDateLabel = formatDueDate(row.proposal_due_date);
  const effectiveLabel = row.effective_date ? formatDate(row.effective_date) : '—';
  const livesLabel = row.employee_lives ? `${row.employee_lives.toLocaleString()} lives` : '—';
  const sentLabel = row.sent_at ? formatRelative(row.sent_at) : '—';
  const rfpTypeLabel = row.rfp_type === 'renewal' ? 'Renewal' : row.rfp_type === 'new_business' ? 'New Business' : (row.rfp_type ?? '—');

  return (
    <div
      style={cardStyle}
      onClick={onClick}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 24px rgba(30, 58, 95, 0.12)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(30, 58, 95, 0.06)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
    >
      <div style={cardTopRowStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={clientNameStyle}>{row.client_name || 'Unnamed client'}</div>
          <div style={rfpNameStyle}>{row.rfp_name}</div>
        </div>
        <CarrierStatusPill status={row.rc_status} />
      </div>

      <div style={detailsGridStyle}>
        <DetailItem label="From" value={row.agency_name} />
        <DetailItem label="Type" value={rfpTypeLabel} />
        <DetailItem label="Effective" value={effectiveLabel} />
        <DetailItem label="Lives" value={livesLabel} />
        <DetailItem label="Due" value={dueDateLabel.text} highlight={dueDateLabel.urgent} />
        <DetailItem label="Sent" value={sentLabel} />
      </div>

      {row.requested_benefits.length > 0 && (
        <div style={benefitPillsStyle}>
          {row.requested_benefits.map((b) => (
            <span key={b} style={benefitPillStyle}>
              {BENEFIT_LINE_LABELS[b as BenefitLineValue] ?? b}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div style={detailLabelStyle}>{label}</div>
      <div style={{ ...detailValueStyle, color: highlight ? '#c2410c' : '#1e3a5f', fontWeight: highlight ? 600 : 500 }}>
        {value}
      </div>
    </div>
  );
}

function CarrierStatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    pending: { bg: '#f3f4f6', fg: '#6b7280', label: 'Pending' },
    sent: { bg: '#dbeafe', fg: '#1e3a5f', label: 'New' },
    opened: { bg: '#fef3c7', fg: '#92400e', label: 'Viewed' },
    downloaded: { bg: '#fed7aa', fg: '#9a3412', label: 'Downloaded' },
    in_progress: { bg: '#e0e7ff', fg: '#3730a3', label: 'In Progress' },
    submitted: { bg: '#d1fae5', fg: '#065f46', label: 'Quoted' },
    declined: { bg: '#fee2e2', fg: '#991b1b', label: 'Declined' },
    won: { bg: '#dcfce7', fg: '#166534', label: 'Won' },
    lost: { bg: '#f3f4f6', fg: '#6b7280', label: 'Lost' },
  };
  const config = map[status] ?? { bg: '#f3f4f6', fg: '#6b7280', label: status };
  return (
    <span style={{
      backgroundColor: config.bg,
      color: config.fg,
      padding: '4px 10px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 600,
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }}>
      {config.label}
    </span>
  );
}

function formatDueDate(dateStr: string | null): { text: string; urgent: boolean } {
  if (!dateStr) return { text: '—', urgent: false };
  const due = new Date(dateStr);
  const now = new Date();
  const days = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, urgent: true };
  if (days === 0) return { text: 'Today', urgent: true };
  if (days === 1) return { text: 'Tomorrow', urgent: true };
  if (days <= 7) return { text: `${days} days`, urgent: true };
  return { text: formatDate(dateStr), urgent: false };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelative(dateStr: string): string {
  const then = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

const pageContainerStyle: React.CSSProperties = {
  padding: '32px 40px',
  maxWidth: '1200px',
  margin: '0 auto',
  fontFamily: '"Figtree", -apple-system, BlinkMacSystemFont, sans-serif',
};

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  marginBottom: '24px',
};

const pageTitleStyle: React.CSSProperties = {
  fontFamily: '"Playfair Display", Georgia, serif',
  fontSize: '28px',
  fontWeight: 600,
  color: '#1e3a5f',
  margin: '0 0 4px 0',
};

const pageSubtitleStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#5a6c7d',
  margin: 0,
};

const loadingStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '48px',
  color: '#5a6c7d',
  fontSize: '15px',
};

const errorBannerStyle: React.CSSProperties = {
  backgroundColor: '#fee2e2',
  color: '#991b1b',
  padding: '14px 18px',
  borderRadius: '8px',
  fontSize: '14px',
  marginBottom: '16px',
};

const emptyStateCardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  padding: '48px 32px',
  textAlign: 'center',
  border: '1px dashed #e8e2d4',
};

const emptyHeadingStyle: React.CSSProperties = {
  fontFamily: '"Playfair Display", Georgia, serif',
  fontSize: '20px',
  fontWeight: 600,
  color: '#1e3a5f',
  margin: '0 0 8px 0',
};

const emptyBodyStyle: React.CSSProperties = {
  fontSize: '15px',
  color: '#5a6c7d',
  lineHeight: 1.6,
  margin: 0,
};

const cardsContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  padding: '20px 24px',
  cursor: 'pointer',
  boxShadow: '0 2px 8px rgba(30, 58, 95, 0.06)',
  transition: 'box-shadow 0.15s ease, transform 0.15s ease',
  border: '1px solid #f0ebe0',
};

const cardTopRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '16px',
  marginBottom: '16px',
};

const clientNameStyle: React.CSSProperties = {
  fontFamily: '"Playfair Display", Georgia, serif',
  fontSize: '20px',
  fontWeight: 600,
  color: '#1e3a5f',
  marginBottom: '2px',
  lineHeight: 1.3,
};

const rfpNameStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#5a6c7d',
};

const detailsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: '16px 24px',
  marginBottom: '12px',
};

const detailLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#8a98a8',
  marginBottom: '4px',
};

const detailValueStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 500,
};

const benefitPillsStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
  paddingTop: '12px',
  borderTop: '1px solid #f0ebe0',
};

const benefitPillStyle: React.CSSProperties = {
  backgroundColor: '#f5f1e8',
  color: '#5a6c7d',
  padding: '4px 10px',
  borderRadius: '12px',
  fontSize: '12px',
  fontWeight: 500,
};