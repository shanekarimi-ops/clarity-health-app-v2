'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../supabase';
import Sidebar from '../../components/Sidebar';

type EmployerPlan = {
  id: string;
  packet_id: string;
  plan_name: string;
  plan_type: string | null;
  monthly_premium_employee: number | null;
  monthly_premium_employee_plus_family: number | null;
  deductible_individual: number | null;
  deductible_family: number | null;
  out_of_pocket_max_individual: number | null;
  out_of_pocket_max_family: number | null;
  hsa_eligible: boolean;
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
  is_spouse_packet: boolean;
};

type SpouseEmployment = {
  id?: string;
  spouse_employer_name: string;
  spouse_annual_income: string;
  spousal_surcharge_applies: boolean;
  spousal_surcharge_amount: string;
  notes: string;
};

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const MAX_SIZE_MB = 25;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export default function CoordinatePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selfPacket, setSelfPacket] = useState<Packet | null>(null);
  const [selfPlans, setSelfPlans] = useState<EmployerPlan[]>([]);
  const [spousePacket, setSpousePacket] = useState<Packet | null>(null);
  const [spousePlans, setSpousePlans] = useState<EmployerPlan[]>([]);

  const [spouseEmployment, setSpouseEmployment] = useState<SpouseEmployment>({
    spouse_employer_name: '',
    spouse_annual_income: '',
    spousal_surcharge_applies: false,
    spousal_surcharge_amount: '',
    notes: '',
  });
  const [savingEmployment, setSavingEmployment] = useState(false);
  const [employmentSavedAt, setEmploymentSavedAt] = useState<number | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async (userId: string) => {
    // Self packet (latest non-spouse, success)
    const { data: selfRows } = await supabase
      .from('employer_benefits_packets')
      .select('*')
      .eq('user_id', userId)
      .eq('is_spouse_packet', false)
      .order('uploaded_at', { ascending: false })
      .limit(1);

    const sp = (selfRows || [])[0] as Packet | undefined;
    setSelfPacket(sp || null);

    if (sp) {
      const { data: planData } = await supabase
        .from('employer_plans')
        .select('*')
        .eq('packet_id', sp.id);
      setSelfPlans((planData as EmployerPlan[]) || []);
    } else {
      setSelfPlans([]);
    }

    // Spouse packet (latest spouse=true)
    const { data: spouseRows } = await supabase
      .from('employer_benefits_packets')
      .select('*')
      .eq('user_id', userId)
      .eq('is_spouse_packet', true)
      .order('uploaded_at', { ascending: false })
      .limit(1);

    const spp = (spouseRows || [])[0] as Packet | undefined;
    setSpousePacket(spp || null);

    if (spp) {
      const { data: planData } = await supabase
        .from('employer_plans')
        .select('*')
        .eq('packet_id', spp.id);
      setSpousePlans((planData as EmployerPlan[]) || []);
    } else {
      setSpousePlans([]);
    }

    // Spouse employment info
    const { data: emp } = await supabase
      .from('spouse_employment_info')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (emp) {
      setSpouseEmployment({
        id: emp.id,
        spouse_employer_name: emp.spouse_employer_name || '',
        spouse_annual_income: emp.spouse_annual_income?.toString() || '',
        spousal_surcharge_applies: !!emp.spousal_surcharge_applies,
        spousal_surcharge_amount: emp.spousal_surcharge_amount?.toString() || '',
        notes: emp.notes || '',
      });
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

  // Auto-refresh while spouse packet is parsing
  useEffect(() => {
    if (!user) return;
    if (spousePacket?.parse_status === 'pending') {
      const interval = setInterval(() => loadData(user.id), 3000);
      return () => clearInterval(interval);
    }
  }, [spousePacket, user, loadData]);

  async function handleSpouseFiles(files: FileList | File[]) {
    setErrorMsg('');
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    const file = fileArray[0];

    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrorMsg(`"${file.name}" is not a supported file type. PDF, JPG, or PNG only.`);
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setErrorMsg(`"${file.name}" is too large. Max ${MAX_SIZE_MB}MB.`);
      return;
    }

    setUploading(true);
    setUploadStatus('Uploading spouse packet...');

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${user.id}/spouse_${timestamp}_${safeName}`;

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
        is_spouse_packet: true,
      })
      .select()
      .single();

    if (insertErr || !insertedPacket) {
      setErrorMsg(`File uploaded, but record save failed: ${insertErr?.message}`);
      setUploading(false);
      setUploadStatus('');
      return;
    }

    setUploadStatus('Analyzing spouse packet...');

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
      handleSpouseFiles(e.dataTransfer.files);
    }
  }
  function handleClick() {
    fileInputRef.current?.click();
  }
  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      handleSpouseFiles(e.target.files);
      e.target.value = '';
    }
  }

  async function handleDeleteSpousePacket() {
    if (!spousePacket) return;
    if (!confirm(`Delete spouse packet "${spousePacket.file_name}"? All extracted plans will also be removed.`)) return;
    await supabase.storage.from('employer-benefits').remove([spousePacket.file_path]);
    const { error } = await supabase.from('employer_benefits_packets').delete().eq('id', spousePacket.id);
    if (error) {
      setErrorMsg(`Delete failed: ${error.message}`);
      return;
    }
    if (user) await loadData(user.id);
  }

  async function handleSaveEmployment(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingEmployment(true);
    setErrorMsg('');

    const payload: any = {
      user_id: user.id,
      spouse_employer_name: spouseEmployment.spouse_employer_name.trim() || null,
      spouse_annual_income: spouseEmployment.spouse_annual_income ? parseFloat(spouseEmployment.spouse_annual_income) : null,
      spousal_surcharge_applies: spouseEmployment.spousal_surcharge_applies,
      spousal_surcharge_amount: spouseEmployment.spousal_surcharge_amount ? parseFloat(spouseEmployment.spousal_surcharge_amount) : 0,
      notes: spouseEmployment.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('spouse_employment_info')
      .upsert(payload, { onConflict: 'user_id' });

    setSavingEmployment(false);

    if (error) {
      setErrorMsg(`Failed to save spouse info: ${error.message}`);
      return;
    }

    setEmploymentSavedAt(Date.now());
    setTimeout(() => setEmploymentSavedAt(null), 3000);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  function handleRunCoordination() {
    // Placeholder for P8.2/P8.3 — engine + UI
    alert('Coordination engine coming in the next push. For now, the data has been captured.');
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

  // Readiness checklist
  const selfReady = !!selfPacket && selfPacket.parse_status === 'success' && selfPlans.length > 0;
  const spouseReady = !!spousePacket && spousePacket.parse_status === 'success' && spousePlans.length > 0;
  const employmentSaved = !!spouseEmployment.id;
  const allReady = selfReady && spouseReady;

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
            <div style={{ fontSize: '0.75rem', color: '#7a9b76', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>
              💑 Coordination of Benefits
            </div>
            <div className="dash-greeting">Coordinate plans with your spouse</div>
            <div className="dash-date">
              <Link href="/employer-benefits" style={{ color: '#5b7a99', textDecoration: 'none' }}>
                ← Back to Employer Benefits
              </Link>
            </div>
          </div>
        </div>

        {/* Intro callout */}
        <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.95rem', color: '#3a4d68', lineHeight: 1.6, margin: 0 }}>
            When both spouses have access to employer coverage, the optimal choice isn&apos;t always obvious. We&apos;ll model
            the major coverage scenarios — both on your plan, both on theirs, split coverage — and recommend the
            combination that minimizes your total family cost while flagging gotchas like HSA conflicts and
            spousal surcharges.
          </p>
        </div>

        {/* Readiness checklist */}
        <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
          <div className="dash-card-header">
            <div className="dash-card-title">Readiness</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.5rem' }}>
            <ChecklistRow
              done={selfReady}
              title="Your employer packet"
              detail={
                selfReady
                  ? `${selfPacket?.employer_name || selfPacket?.file_name} · ${selfPlans.length} plans extracted`
                  : 'Upload on Employer Benefits page first'
              }
              cta={!selfReady ? { label: 'Go to Employer Benefits →', href: '/employer-benefits' } : undefined}
            />
            <ChecklistRow
              done={spouseReady}
              title="Spouse&apos;s employer packet"
              detail={
                spouseReady
                  ? `${spousePacket?.employer_name || spousePacket?.file_name} · ${spousePlans.length} plans extracted`
                  : spousePacket?.parse_status === 'pending'
                    ? 'Analyzing... (30-60 seconds)'
                    : spousePacket?.parse_status && spousePacket.parse_status !== 'success'
                      ? `Parse error: ${spousePacket.parse_error || 'unknown'}`
                      : 'Upload below'
              }
            />
            <ChecklistRow
              done={employmentSaved}
              title="Spouse employment info"
              detail={
                employmentSaved
                  ? `${spouseEmployment.spouse_employer_name || 'saved'}${spouseEmployment.spouse_annual_income ? ' · $' + parseFloat(spouseEmployment.spouse_annual_income).toLocaleString() : ''}`
                  : 'Fill in below (optional but improves accuracy)'
              }
            />
          </div>
        </div>

        {/* Spouse packet upload */}
        <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
          <div className="dash-card-header">
            <div className="dash-card-title">Spouse&apos;s benefits packet</div>
            {spousePacket && (
              <button onClick={handleDeleteSpousePacket} className="btn-sm btn-ghost-sm">
                Replace
              </button>
            )}
          </div>

          {spousePacket && spousePacket.parse_status === 'success' ? (
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{
                padding: '1rem 1.25rem',
                background: '#f5f8f4',
                border: '1px solid #c7d9c5',
                borderRadius: '8px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ fontSize: '0.7rem', color: '#5a7857', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.3rem' }}>
                      Loaded
                    </div>
                    <div style={{ fontFamily: 'Playfair Display, serif', color: '#1e3a5f', fontSize: '1.15rem', fontWeight: 700 }}>
                      {spousePacket.employer_name || spousePacket.file_name}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7785', marginTop: '0.25rem' }}>
                      {spousePacket.plan_year && <span>Plan year {spousePacket.plan_year} · </span>}
                      Uploaded {new Date(spousePacket.uploaded_at).toLocaleDateString()} · {spousePlans.length} plans
                    </div>
                    {spousePacket.summary_text && (
                      <p style={{ fontSize: '0.85rem', color: '#3a4d68', margin: '0.5rem 0 0 0', lineHeight: 1.5 }}>
                        {spousePacket.summary_text}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : spousePacket && spousePacket.parse_status === 'pending' ? (
            <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', background: '#fef9e8', border: '1px solid #f0e6b8', borderRadius: '6px', fontSize: '0.85rem', color: '#806c1e' }}>
              ⏳ Analyzing spouse packet... this can take 30-60 seconds for larger documents.
            </div>
          ) : (
            <>
              <p style={{ color: '#6b7785', fontSize: '0.9rem', margin: '0 0 1rem 0' }}>
                Upload the benefits packet from your spouse&apos;s employer (PDF preferred). We&apos;ll extract their medical
                plan options the same way we extracted yours.
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
                <div className="dropzone-icon">💑</div>
                {uploading ? (
                  <>
                    <div className="dropzone-title">Working...</div>
                    <div className="dropzone-subtitle">{uploadStatus}</div>
                  </>
                ) : (
                  <>
                    <div className="dropzone-title">
                      {isDragging ? 'Drop the spouse packet here' : 'Upload spouse&apos;s benefits packet'}
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
              {spousePacket && spousePacket.parse_status !== 'success' && spousePacket.parse_status !== 'pending' && spousePacket.parse_error && (
                <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', background: '#fde8e8', border: '1px solid #f5b8b8', borderRadius: '6px', fontSize: '0.85rem', color: '#8a3030' }}>
                  ⚠ Parse failed: {spousePacket.parse_error}
                </div>
              )}
            </>
          )}

          {errorMsg && <div className="upload-error" style={{ marginTop: '1rem' }}>{errorMsg}</div>}
        </div>

        {/* Spouse employment form */}
        <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
          <div className="dash-card-header">
            <div className="dash-card-title">Spouse employment info</div>
          </div>
          <p style={{ color: '#6b7785', fontSize: '0.9rem', margin: '0 0 1.25rem 0' }}>
            Optional but recommended. Helps us model after-tax costs and surface spousal-surcharge gotchas.
          </p>

          <form onSubmit={handleSaveEmployment}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div className="form-field">
                <label className="form-label">Spouse&apos;s employer name</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="e.g. Google"
                  value={spouseEmployment.spouse_employer_name}
                  onChange={(e) => setSpouseEmployment({ ...spouseEmployment, spouse_employer_name: e.target.value })}
                  disabled={savingEmployment}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Spouse&apos;s annual income (USD)</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  placeholder="e.g. 110000"
                  value={spouseEmployment.spouse_annual_income}
                  onChange={(e) => setSpouseEmployment({ ...spouseEmployment, spouse_annual_income: e.target.value })}
                  disabled={savingEmployment}
                />
              </div>
            </div>

            <div className="form-field" style={{ marginTop: '1.25rem' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.6rem',
                  padding: '0.75rem 1rem',
                  border: `1px solid ${spouseEmployment.spousal_surcharge_applies ? '#7a9b76' : '#e1e6eb'}`,
                  borderRadius: '6px',
                  backgroundColor: spouseEmployment.spousal_surcharge_applies ? '#ebf3ea' : '#fff',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  color: '#1e3a5f',
                }}
              >
                <input
                  type="checkbox"
                  checked={spouseEmployment.spousal_surcharge_applies}
                  onChange={(e) => setSpouseEmployment({ ...spouseEmployment, spousal_surcharge_applies: e.target.checked })}
                  disabled={savingEmployment}
                  style={{ marginTop: '2px' }}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>My employer charges a spousal surcharge</div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7785', marginTop: '0.2rem' }}>
                    Some employers charge an extra monthly fee if your spouse has their own employer coverage but enrolls in yours instead.
                  </div>
                </div>
              </label>
            </div>

            {spouseEmployment.spousal_surcharge_applies && (
              <div className="form-field" style={{ marginTop: '1.25rem', maxWidth: '300px' }}>
                <label className="form-label">Surcharge amount per month (USD)</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  placeholder="e.g. 100"
                  value={spouseEmployment.spousal_surcharge_amount}
                  onChange={(e) => setSpouseEmployment({ ...spouseEmployment, spousal_surcharge_amount: e.target.value })}
                  disabled={savingEmployment}
                />
              </div>
            )}

            <div className="form-field" style={{ marginTop: '1.25rem' }}>
              <label className="form-label">Notes (optional)</label>
              <textarea
                className="form-input"
                placeholder="e.g. spouse's plan year is calendar, mine is fiscal"
                value={spouseEmployment.notes}
                onChange={(e) => setSpouseEmployment({ ...spouseEmployment, notes: e.target.value })}
                disabled={savingEmployment}
                rows={2}
                style={{ resize: 'vertical', minHeight: '60px' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.25rem' }}>
              <button type="submit" className="btn-sm btn-accent" disabled={savingEmployment}>
                {savingEmployment ? 'Saving...' : employmentSaved ? 'Update spouse info' : 'Save spouse info'}
              </button>
              {employmentSavedAt && (
                <span style={{ color: '#7a9b76', fontSize: '0.85rem' }}>Saved.</span>
              )}
            </div>
          </form>
        </div>

        {/* Run coordination CTA */}
        <div
          className="dash-card"
          style={{
            marginBottom: '1.5rem',
            backgroundColor: allReady ? '#f5f8f4' : '#faf7f2',
            border: `2px solid ${allReady ? '#c7d9c5' : '#eef1f4'}`,
          }}
        >
          <div style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '2.25rem', marginBottom: '0.5rem' }}>{allReady ? '🎯' : '⏳'}</div>
            <h3 style={{ fontFamily: 'Playfair Display, serif', color: '#1e3a5f', margin: '0 0 0.5rem 0', fontSize: '1.3rem' }}>
              {allReady ? 'Ready to coordinate' : 'Almost there'}
            </h3>
            <p style={{ fontSize: '0.9rem', color: '#3a4d68', maxWidth: '460px', margin: '0 auto 1.25rem auto', lineHeight: 1.5 }}>
              {allReady
                ? `We have ${selfPlans.length} of your plans and ${spousePlans.length} of your spouse's plans. Click below to run the coordination analysis.`
                : 'Upload both packets to unlock the coordination analysis. Spouse employment info is optional but improves the recommendation.'}
            </p>
            <button
              className="btn-sm btn-accent"
              onClick={handleRunCoordination}
              disabled={!allReady}
              style={{ opacity: allReady ? 1 : 0.5, cursor: allReady ? 'pointer' : 'not-allowed' }}
            >
              Run coordination analysis →
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function ChecklistRow({ done, title, detail, cta }: { done: boolean; title: string; detail: string; cta?: { label: string; href: string } }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.75rem',
      padding: '0.75rem 1rem',
      background: done ? '#f5f8f4' : '#fafbfc',
      border: `1px solid ${done ? '#c7d9c5' : '#eef1f4'}`,
      borderRadius: '6px',
    }}>
      <div style={{
        flexShrink: 0,
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        backgroundColor: done ? '#7a9b76' : '#fff',
        border: done ? 'none' : '2px solid #d4dbe2',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.8rem',
        fontWeight: 700,
      }}>
        {done ? '✓' : ''}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e3a5f' }}>{title}</div>
        <div style={{ fontSize: '0.8rem', color: '#6b7785', marginTop: '0.15rem' }}>{detail}</div>
      </div>
      {cta && (
        <Link href={cta.href} style={{ fontSize: '0.8rem', color: '#7a9b76', textDecoration: 'underline', whiteSpace: 'nowrap' }}>
          {cta.label}
        </Link>
      )}
    </div>
  );
}