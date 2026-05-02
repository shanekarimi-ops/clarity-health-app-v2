'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../supabase';
import Sidebar from '../components/Sidebar';

type EmployerPlan = {
  id: string;
  packet_id: string;
  plan_name: string;
  plan_type: string | null;
  metal_level: string | null;
  network_description: string | null;
  monthly_premium_employee: number | null;
  monthly_premium_employee_plus_family: number | null;
  deductible_individual: number | null;
  deductible_family: number | null;
  out_of_pocket_max_individual: number | null;
  out_of_pocket_max_family: number | null;
  primary_care_copay: string | null;
  specialist_copay: string | null;
  er_copay: string | null;
  generic_rx_copay: string | null;
  brand_rx_copay: string | null;
  hsa_eligible: boolean;
  fsa_offered: boolean;
  highlights: string | null;
};

type Packet = {
  id: string;
  user_id: string;
  uploaded_at: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  employer_name: string | null;
  plan_year: number | null;
  parse_status: string;
  parse_error: string | null;
  parsed_at: string | null;
  summary_text: string | null;
};

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const MAX_SIZE_MB = 25;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export default function EmployerBenefitsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [plansByPacket, setPlansByPacket] = useState<Record<string, EmployerPlan[]>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async (userId: string) => {
    const { data: packetData, error: packetErr } = await supabase
      .from('employer_benefits_packets')
      .select('*')
      .eq('user_id', userId)
      .order('uploaded_at', { ascending: false });

    if (packetErr) {
      console.error('Failed to load packets:', packetErr);
      return;
    }

    const packetList = (packetData || []) as Packet[];
    setPackets(packetList);

    if (packetList.length > 0) {
      const ids = packetList.map((p) => p.id);
      const { data: planData } = await supabase
        .from('employer_plans')
        .select('*')
        .in('packet_id', ids);

      const grouped: Record<string, EmployerPlan[]> = {};
      (planData || []).forEach((p: any) => {
        if (!grouped[p.packet_id]) grouped[p.packet_id] = [];
        grouped[p.packet_id].push(p);
      });
      setPlansByPacket(grouped);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);
      await loadData(user.id);
      setLoading(false);
    }
    init();
  }, [router, loadData]);

  // Auto-refresh while a parse is pending (server is processing in background)
  useEffect(() => {
    if (!user) return;
    const anyPending = packets.some((p) => p.parse_status === 'pending');
    if (!anyPending) return;
    const interval = setInterval(() => loadData(user.id), 3000);
    return () => clearInterval(interval);
  }, [packets, user, loadData]);

  async function handleFiles(files: FileList | File[]) {
    setErrorMsg('');
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    const file = fileArray[0]; // Only handle first file — one packet per upload

    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrorMsg(`"${file.name}" is not a supported file type. PDF, JPG, or PNG only.`);
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setErrorMsg(`"${file.name}" is too large. Max ${MAX_SIZE_MB}MB.`);
      return;
    }

    setUploading(true);
    setUploadStatus('Uploading file...');

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${user.id}/${timestamp}_${safeName}`;

    const { error: uploadErr } = await supabase.storage
      .from('employer-benefits')
      .upload(filePath, file, { cacheControl: '3600', upsert: false });

    if (uploadErr) {
      setErrorMsg(`Upload failed: ${uploadErr.message}`);
      setUploading(false);
      setUploadStatus('');
      return;
    }

    setUploadStatus('Saving record...');

    const { data: insertedPacket, error: insertErr } = await supabase
      .from('employer_benefits_packets')
      .insert({
        user_id: user.id,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        file_type: file.type,
        parse_status: 'pending',
      })
      .select()
      .single();

    if (insertErr || !insertedPacket) {
      setErrorMsg(`File uploaded, but record save failed: ${insertErr?.message}`);
      setUploading(false);
      setUploadStatus('');
      return;
    }

    setUploadStatus('Analyzing your benefits packet...');

    // Trigger parse — this one we DO await so we can show success or error inline
    try {
      const res = await fetch('/api/parse-employer-benefits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packet_id: insertedPacket.id, user_id: user.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorMsg(`Parse failed: ${err.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      setErrorMsg(`Network error during parse: ${e.message}`);
    }

    await loadData(user.id);
    setUploading(false);
    setUploadStatus('');
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }
  function handleClick() {
    fileInputRef.current?.click();
  }
  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  }

  async function handleDeletePacket(packet: Packet) {
    if (!confirm(`Delete "${packet.file_name}"? All extracted plans from this packet will also be removed.`)) return;
    // Storage delete
    await supabase.storage.from('employer-benefits').remove([packet.file_path]);
    // DB cascade handles plans
    const { error } = await supabase.from('employer_benefits_packets').delete().eq('id', packet.id);
    if (error) {
      setErrorMsg(`Delete failed: ${error.message}`);
      return;
    }
    if (user) await loadData(user.id);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p>Loading...</p>
      </div>
    );
  }

  const firstName = user?.user_metadata?.first_name || 'there';
  const lastName = user?.user_metadata?.last_name || '';
  const role = user?.user_metadata?.role || 'Individual';

  const currentPacket = packets[0] || null; // Most recent
  const historicalPackets = packets.slice(1);
  const currentPlans = currentPacket ? plansByPacket[currentPacket.id] || [] : [];
  const canCompareEmployerOnly = currentPlans.length >= 2;
  const canCompareVsMarketplace = currentPlans.length >= 1;

  return (
    <div className="dash-layout">
      <Sidebar
        active="employer-benefits"
        firstName={firstName}
        lastName={lastName}
        role={role}
        onLogout={handleLogout}
      />
      <main className="dash-main">
        <div className="dash-header">
          <div>
            <div className="dash-greeting">Employer Benefits</div>
            <div className="dash-date">Upload your employer's benefits packet to compare your options.</div>
          </div>
        </div>

        {/* ===== UPLOAD ZONE ===== */}
        <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
          <div className="dash-card-header">
            <div className="dash-card-title">
              {currentPacket ? 'Upload a new packet' : 'Get started'}
            </div>
          </div>
          <p style={{ color: '#6b7785', fontSize: '0.9rem', margin: '0 0 1rem 0' }}>
            Upload your full benefits packet (medical, dental, vision, 401k — whatever you have). We'll extract just the medical plans for now. Most recent upload is treated as your current packet.
          </p>

          <div
            className={`claims-dropzone ${isDragging ? 'dragging' : ''} ${uploading ? 'uploading' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
            style={{ cursor: uploading ? 'wait' : 'pointer' }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileInputChange}
              style={{ display: 'none' }}
            />
            <div className="dropzone-icon">🏢</div>
            {uploading ? (
              <>
                <div className="dropzone-title">Working...</div>
                <div className="dropzone-subtitle">{uploadStatus}</div>
                <div className="dropzone-hint" style={{ marginTop: '0.5rem' }}>
                  Parsing can take 30-60 seconds for large packets.
                </div>
              </>
            ) : (
              <>
                <div className="dropzone-title">
                  {isDragging ? 'Drop your packet here' : 'Upload your benefits packet'}
                </div>
                <div className="dropzone-subtitle">
                  Drag and drop, or <span className="dropzone-link">click to browse</span>
                </div>
                <div className="dropzone-hint">
                  PDF, JPG, or PNG · Max {MAX_SIZE_MB}MB · One packet at a time
                </div>
              </>
            )}
          </div>

          {errorMsg && <div className="upload-error" style={{ marginTop: '1rem' }}>{errorMsg}</div>}
        </div>

        {/* ===== EMPTY STATE ===== */}
        {!currentPacket && !uploading && (
          <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ padding: '40px 24px', textAlign: 'center', color: '#3a4d68' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
              <h3 style={{ fontFamily: 'Playfair Display, serif', color: '#1e3a5f', margin: '0 0 8px 0' }}>
                No packet uploaded yet
              </h3>
              <p style={{ fontSize: '14px', color: '#6b7785', maxWidth: '440px', margin: '0 auto' }}>
                Once you upload your benefits packet, we'll extract the medical plans your employer offers and let you compare them — against each other or against the federal Marketplace.
              </p>
            </div>
          </div>
        )}

        {/* ===== CURRENT PACKET + EXTRACTED PLANS ===== */}
        {currentPacket && (
          <>
            <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ flex: 1, minWidth: '260px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#7a9b76', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.4rem' }}>
                    Current packet
                  </div>
                  <h2 style={{ fontFamily: 'Playfair Display, serif', color: '#1e3a5f', margin: '0 0 0.4rem 0', fontSize: '1.4rem' }}>
                    {currentPacket.employer_name || currentPacket.file_name}
                  </h2>
                  <div style={{ fontSize: '0.85rem', color: '#6b7785' }}>
                    {currentPacket.plan_year && <span>Plan year {currentPacket.plan_year} · </span>}
                    Uploaded {new Date(currentPacket.uploaded_at).toLocaleDateString()}
                  </div>
                  {currentPacket.summary_text && (
                    <p style={{ fontSize: '0.9rem', color: '#3a4d68', margin: '0.75rem 0 0 0', lineHeight: 1.5 }}>
                      {currentPacket.summary_text}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <ParseStatusBadge status={currentPacket.parse_status} />
                  <button onClick={() => handleDeletePacket(currentPacket)} className="btn-sm btn-ghost-sm">
                    Delete
                  </button>
                </div>
              </div>

              {currentPacket.parse_status === 'pending' && (
                <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#fef9e8', border: '1px solid #f0e6b8', borderRadius: '6px', fontSize: '0.85rem', color: '#806c1e' }}>
                  ⏳ Analyzing your packet... this can take 30-60 seconds for larger documents. Plans will appear below when ready.
                </div>
              )}
              {currentPacket.parse_status !== 'success' && currentPacket.parse_status !== 'pending' && currentPacket.parse_error && (
                <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#fde8e8', border: '1px solid #f5b8b8', borderRadius: '6px', fontSize: '0.85rem', color: '#8a3030' }}>
                  ⚠ Parse failed: {currentPacket.parse_error}
                </div>
              )}
            </div>

            {/* ===== EXTRACTED PLANS ===== */}
            {currentPlans.length > 0 && (
              <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
                <div className="dash-card-header">
                  <div className="dash-card-title">Plans we found ({currentPlans.length})</div>
                </div>
                <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
                  {currentPlans.map((plan) => <PlanCard key={plan.id} plan={plan} />)}
                </div>
              </div>
            )}

            {/* ===== COMPARISON CHOICE ===== */}
            {currentPlans.length > 0 && (
              <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
                <div className="dash-card-header">
                  <div className="dash-card-title">What do you want to compare?</div>
                </div>
                <p style={{ color: '#6b7785', fontSize: '0.9rem', margin: '0 0 1rem 0' }}>
                  Pick how you want to use this data. Your choice changes which plans are being compared.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                  <ComparisonChoiceCard
                    icon="🏢"
                    title="Compare my employer's plans"
                    scope={`Ranks the ${currentPlans.length} plans from ${currentPacket.employer_name || 'your employer'} against each other, weighted by your claims.`}
                    cta="Compare employer plans →"
                    href="/employer-benefits/compare?mode=employer-only"
                    enabled={canCompareEmployerOnly}
                    disabledReason={!canCompareEmployerOnly ? 'Need at least 2 employer plans to compare.' : ''}
                  />
                  <ComparisonChoiceCard
                    icon="🌐"
                    title="Employer vs. Marketplace"
                    scope={`Head-to-head: your best employer plan vs. your top federal Marketplace match.`}
                    cta="Compare against Marketplace →"
                    href="/employer-benefits/compare?mode=employer-vs-marketplace"
                    enabled={canCompareVsMarketplace}
                    disabledReason={!canCompareVsMarketplace ? 'Need at least 1 employer plan.' : ''}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== HISTORY ===== */}
        {historicalPackets.length > 0 && (
          <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
            <div className="dash-card-header">
              <div className="dash-card-title">Past packets ({historicalPackets.length})</div>
            </div>
            <p style={{ color: '#6b7785', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
              Earlier uploads. The most recent packet (above) is what's used in comparisons.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {historicalPackets.map((p) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#faf7f2', border: '1px solid #eef1f4', borderRadius: '6px', fontSize: '0.875rem' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: '#1e3a5f', fontWeight: 600 }}>
                      {p.employer_name || p.file_name}
                    </div>
                    <div style={{ color: '#6b7785', fontSize: '0.8rem' }}>
                      {p.plan_year && <span>Plan year {p.plan_year} · </span>}
                      Uploaded {new Date(p.uploaded_at).toLocaleDateString()} · {(plansByPacket[p.id] || []).length} plans
                    </div>
                  </div>
                  <button onClick={() => handleDeletePacket(p)} className="btn-sm btn-ghost-sm">Delete</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function ParseStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    success: { label: 'Ready', bg: '#ebf3ea', fg: '#5a7857' },
    pending: { label: 'Analyzing...', bg: '#fef9e8', fg: '#806c1e' },
    json_parse_failed: { label: 'Parse error', bg: '#fde8e8', fg: '#8a3030' },
    download_failed: { label: 'Download error', bg: '#fde8e8', fg: '#8a3030' },
    unsupported_format: { label: 'Unsupported', bg: '#fde8e8', fg: '#8a3030' },
  };
  const style = map[status] || { label: status, bg: '#eef1f4', fg: '#5b6c7d' };
  return (
    <span style={{
      fontSize: '0.7rem',
      padding: '0.25rem 0.6rem',
      borderRadius: '4px',
      backgroundColor: style.bg,
      color: style.fg,
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {style.label}
    </span>
  );
}

function PlanCard({ plan }: { plan: EmployerPlan }) {
  return (
    <div style={{
      border: '1px solid #eef1f4',
      borderRadius: '8px',
      padding: '1rem 1.25rem',
      background: '#fff',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, color: '#1e3a5f', fontSize: '1.05rem', fontWeight: 700 }}>
              {plan.plan_name}
            </h3>
            {plan.plan_type && (
              <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: '#eef1f4', color: '#5b6c7d', fontWeight: 600 }}>
                {plan.plan_type}
              </span>
            )}
            {plan.hsa_eligible && (
              <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: '#ebf3ea', color: '#5a7857', fontWeight: 600 }}>
                HSA
              </span>
            )}
          </div>
          {plan.network_description && (
            <div style={{ fontSize: '0.8rem', color: '#6b7785', marginTop: '0.2rem' }}>
              {plan.network_description}
            </div>
          )}
        </div>
        {plan.monthly_premium_employee != null && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.7rem', color: '#6b7785', textTransform: 'uppercase', letterSpacing: '0.5px' }}>You pay</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e3a5f' }}>
              ${Math.round(plan.monthly_premium_employee).toLocaleString()}
              <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#6b7785' }}> /mo</span>
            </div>
          </div>
        )}
      </div>

      {plan.highlights && (
        <p style={{ fontSize: '0.85rem', color: '#3a4d68', margin: '0 0 0.75rem 0', lineHeight: 1.5 }}>
          {plan.highlights}
        </p>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: '0.5rem',
        paddingTop: '0.75rem',
        borderTop: '1px solid #eef1f4',
      }}>
        <Stat label="Deductible" value={plan.deductible_individual != null ? `$${plan.deductible_individual.toLocaleString()}` : '—'} />
        <Stat label="Out-of-pocket max" value={plan.out_of_pocket_max_individual != null ? `$${plan.out_of_pocket_max_individual.toLocaleString()}` : '—'} />
        <Stat label="Primary care" value={plan.primary_care_copay || '—'} />
        <Stat label="Specialist" value={plan.specialist_copay || '—'} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '0.65rem', color: '#6b7785', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.15rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e3a5f' }}>
        {value}
      </div>
    </div>
  );
}

function ComparisonChoiceCard({
  icon, title, scope, cta, href, enabled, disabledReason,
}: {
  icon: string; title: string; scope: string; cta: string; href: string; enabled: boolean; disabledReason: string;
}) {
  const inner = (
    <div style={{
      border: enabled ? '2px solid #d4e2d2' : '2px dashed #e1e6eb',
      borderRadius: '10px',
      padding: '1.25rem',
      background: enabled ? '#f5f8f4' : '#faf7f2',
      opacity: enabled ? 1 : 0.6,
      cursor: enabled ? 'pointer' : 'not-allowed',
      transition: 'all 0.2s',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      height: '100%',
    }}>
      <div style={{ fontSize: '1.75rem' }}>{icon}</div>
      <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.1rem', fontWeight: 700, color: '#1e3a5f' }}>
        {title}
      </div>
      <p style={{ fontSize: '0.85rem', color: '#3a4d68', margin: 0, lineHeight: 1.5, flex: 1 }}>
        {scope}
      </p>
      {enabled ? (
        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#5a7857', marginTop: '0.5rem' }}>
          {cta}
        </div>
      ) : (
        <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic', marginTop: '0.5rem' }}>
          {disabledReason}
        </div>
      )}
    </div>
  );
  if (!enabled) return inner;
  return <Link href={href} style={{ textDecoration: 'none' }}>{inner}</Link>;
}