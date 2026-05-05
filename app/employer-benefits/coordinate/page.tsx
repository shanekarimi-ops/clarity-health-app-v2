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

type Gotcha = {
  severity: 'warn' | 'info' | 'positive';
  tag: string;
  message: string;
};

type Scenario = {
  id: string;
  rank: 1 | 2 | 3;
  scenario_type: 'self_family' | 'spouse_family' | 'both_single' | 'self_ee_kids' | 'spouse_ee_kids';
  scenario_label: string;
  selfPlan: { id: string; name: string; tier: string } | null;
  spousePlan: { id: string; name: string; tier: string } | null;
  monthlyPremium: number;
  annualPremium: number;
  expectedAnnualOOP: number;
  expectedAnnualCost: number;
  worstCaseAnnualCost: number;
  hsaEligible: boolean;
  gotchas: Gotcha[];
  whoIsOn: { self: string; spouse: string; children: string };
  ai_insight: string | null;
};

type CoordinationResult = {
  success: boolean;
  household_size: number;
  coverage_scope: string;
  utilization_level: 'low' | 'moderate' | 'high';
  expected_annual_medical_spend: number;
  claims_used: number;
  self_employer_name: string;
  spouse_employer_name: string;
  self_plan_count: number;
  spouse_plan_count: number;
  total_scenarios_evaluated: number;
  top_scenarios: Scenario[];
  household_income: number;
  spouse_income: number;
  combined_income: number;
  marginal_tax_rate: number;
  spousal_surcharge_applies: boolean;
  spousal_surcharge_amount: number | null;
  ai_overall_recommendation: string | null;
  ai_key_tradeoffs: string[];
  ai_used: boolean;
  cached_at?: number;
};

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const MAX_SIZE_MB = 25;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

const CACHE_VERSION = 'v1';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const cacheKey = (userId: string) => `clarity-coordinate-${userId}-${CACHE_VERSION}`;

const utilizationLabelMap: Record<string, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
};

const scopeLabelMap: Record<string, string> = {
  individual: 'Just you (employee-only)',
  employee_plus_spouse: 'You + spouse',
  employee_plus_children: 'You + child(ren)',
  family: 'Whole family',
};

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return '$' + Math.round(n).toLocaleString();
}

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

  // Coordination result state
  const [running, setRunning] = useState(false);
  const [coordError, setCoordError] = useState('');
  const [result, setResult] = useState<CoordinationResult | null>(null);

  // PDF download state
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState('');

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

  // Read cached result on mount
  const readCache = useCallback((userId: string): CoordinationResult | null => {
    try {
      const raw = sessionStorage.getItem(cacheKey(userId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CoordinationResult;
      if (!parsed.cached_at || Date.now() - parsed.cached_at > CACHE_TTL_MS) {
        sessionStorage.removeItem(cacheKey(userId));
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }, []);

  const writeCache = useCallback((userId: string, data: CoordinationResult) => {
    try {
      const toStore = { ...data, cached_at: Date.now() };
      sessionStorage.setItem(cacheKey(userId), JSON.stringify(toStore));
    } catch {
      // ignore
    }
  }, []);

  const clearCache = useCallback((userId: string) => {
    try {
      sessionStorage.removeItem(cacheKey(userId));
    } catch {
      // ignore
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
      const cached = readCache(user.id);
      if (cached) setResult(cached);
      setLoading(false);
    }
    init();
  }, [router, loadData, readCache]);

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
    // New packet means stale results; clear cache + result
    if (user) clearCache(user.id);
    setResult(null);
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
    if (user) {
      clearCache(user.id);
      setResult(null);
      await loadData(user.id);
    }
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
    // Inputs changed; invalidate cache
    clearCache(user.id);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  async function handleRunCoordination() {
    if (!user) return;
    setCoordError('');
    setRunning(true);
    try {
      const res = await fetch('/api/coordinate-spouse-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setCoordError(`Coordination failed: ${err.error || res.statusText || 'Unknown error'}`);
        setRunning(false);
        return;
      }

      const data = (await res.json()) as CoordinationResult;
      if (!data.success) {
        setCoordError('Coordination engine returned an unsuccessful response.');
        setRunning(false);
        return;
      }

      setResult(data);
      writeCache(user.id, data);

      // Scroll results into view after they render
      setTimeout(() => {
        const el = document.getElementById('coordination-results');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (e: any) {
      setCoordError(`Network error: ${e.message}`);
    } finally {
      setRunning(false);
    }
  }

  function handleRerun() {
    if (!user) return;
    clearCache(user.id);
    setResult(null);
    handleRunCoordination();
  }

  async function handleDownloadPdf() {
    if (!result) return;
    setPdfError('');
    setDownloadingPdf(true);
    try {
      const res = await fetch('/api/generate-coordination-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result }),
      });

      if (!res.ok) {
        let msg = 'PDF generation failed';
        try {
          const err = await res.json();
          if (err?.error) msg = err.error;
        } catch {
          // body wasn't JSON
        }
        setPdfError(msg);
        setDownloadingPdf(false);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      a.download = `clarity-coordination-${yyyy}-${mm}-${dd}.pdf`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Free the blob URL after a moment
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setPdfError(`Network error: ${e.message}`);
    } finally {
      setDownloadingPdf(false);
    }
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
              title="Spouse's employer packet"
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
                      {isDragging ? 'Drop the spouse packet here' : "Upload spouse's benefits packet"}
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
            <div style={{ fontSize: '2.25rem', marginBottom: '0.5rem' }}>
              {running ? '⏱️' : allReady ? '🎯' : '⏳'}
            </div>
            <h3 style={{ fontFamily: 'Playfair Display, serif', color: '#1e3a5f', margin: '0 0 0.5rem 0', fontSize: '1.3rem' }}>
              {running ? 'Crunching the numbers...' : allReady ? 'Ready to coordinate' : 'Almost there'}
            </h3>
            <p style={{ fontSize: '0.9rem', color: '#3a4d68', maxWidth: '460px', margin: '0 auto 1.25rem auto', lineHeight: 1.5 }}>
              {running
                ? 'Modeling every plan combination across your household. This usually takes 15-30 seconds.'
                : allReady
                  ? `We have ${selfPlans.length} of your plans and ${spousePlans.length} of your spouse's plans. Click below to run the coordination analysis.`
                  : 'Upload both packets to unlock the coordination analysis. Spouse employment info is optional but improves the recommendation.'}
            </p>
            <button
              className="btn-sm btn-accent"
              onClick={handleRunCoordination}
              disabled={!allReady || running}
              style={{ opacity: allReady && !running ? 1 : 0.5, cursor: allReady && !running ? 'pointer' : 'not-allowed' }}
            >
              {running ? 'Running...' : 'Run coordination analysis →'}
            </button>
            {coordError && (
              <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#fde8e8', border: '1px solid #f5b8b8', borderRadius: '6px', fontSize: '0.85rem', color: '#8a3030' }}>
                ⚠ {coordError}
              </div>
            )}
          </div>
        </div>

        {/* Coordination results */}
        {result && (
          <div id="coordination-results">
            <ResultsSection
              result={result}
              onRerun={handleRerun}
              running={running}
              onDownloadPdf={handleDownloadPdf}
              downloadingPdf={downloadingPdf}
              pdfError={pdfError}
            />
          </div>
        )}
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

function ResultsSection({
  result,
  onRerun,
  running,
  onDownloadPdf,
  downloadingPdf,
  pdfError,
}: {
  result: CoordinationResult;
  onRerun: () => void;
  running: boolean;
  onDownloadPdf: () => void;
  downloadingPdf: boolean;
  pdfError: string;
}) {
  const recommended = result.top_scenarios.find(s => s.rank === 1);
  const cachedAgo = result.cached_at ? Math.round((Date.now() - result.cached_at) / 60000) : 0;

  return (
    <>
      {/* Header strip */}
      <div
        className="dash-card"
        style={{
          marginBottom: '1.5rem',
          backgroundColor: '#ebf3ea',
          borderLeft: '3px solid #7a9b76',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <div style={{ fontSize: '0.7rem', color: '#5a7857', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>
              Coordination analysis
            </div>
            <div style={{ fontSize: '0.95rem', color: '#1e3a5f' }}>
              <strong>{result.top_scenarios.length}</strong> top scenarios from <strong>{result.total_scenarios_evaluated}</strong> evaluated combinations
              {' · '}
              {scopeLabelMap[result.coverage_scope] || result.coverage_scope}
              {' · '}
              {utilizationLabelMap[result.utilization_level] || result.utilization_level} expected use
              {' · '}
              {fmtMoney(result.expected_annual_medical_spend)} expected medical spend
            </div>
            {cachedAgo > 0 && (
              <div style={{ fontSize: '0.75rem', color: '#6b7785', marginTop: '0.3rem' }}>
                Results from {cachedAgo} min ago
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              className="btn-sm btn-accent"
              onClick={onDownloadPdf}
              disabled={downloadingPdf || running}
              style={{ whiteSpace: 'nowrap' }}
            >
              {downloadingPdf ? 'Generating...' : '⬇ Download PDF'}
            </button>
            <button
              className="btn-sm btn-ghost-sm"
              onClick={onRerun}
              disabled={running || downloadingPdf}
              style={{ whiteSpace: 'nowrap' }}
            >
              {running ? 'Running...' : '↻ Re-run'}
            </button>
          </div>
        </div>
        {pdfError && (
          <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.85rem', background: '#fde8e8', border: '1px solid #f5b8b8', borderRadius: '6px', fontSize: '0.8rem', color: '#8a3030' }}>
            ⚠ {pdfError}
          </div>
        )}
      </div>

      {/* AI overall recommendation */}
      {result.ai_overall_recommendation && (
        <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
          <div className="dash-card-header">
            <div className="dash-card-title">Our recommendation</div>
          </div>
          <p style={{ fontSize: '0.95rem', color: '#3a4d68', lineHeight: 1.6, margin: '0.5rem 0 0 0' }}>
            {result.ai_overall_recommendation}
          </p>
          {recommended && (
            <div style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              background: '#f5f8f4',
              border: '1px solid #c7d9c5',
              borderRadius: '6px',
              fontSize: '0.85rem',
              color: '#1e3a5f',
            }}>
              <strong>Recommended scenario:</strong> {recommended.scenario_label}
              {' · '}
              <strong>{fmtMoney(recommended.expectedAnnualCost)}/yr</strong> expected total
            </div>
          )}
        </div>
      )}

      {/* Top scenarios */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontFamily: 'Playfair Display, serif', color: '#1e3a5f', fontSize: '1.4rem', margin: '0 0 1rem 0' }}>
          Top {result.top_scenarios.length} scenarios
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {result.top_scenarios.map((scenario) => (
            <ScenarioCard key={scenario.id} scenario={scenario} />
          ))}
        </div>
      </div>

      {/* Key trade-offs */}
      {result.ai_key_tradeoffs && result.ai_key_tradeoffs.length > 0 && (
        <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
          <div className="dash-card-header">
            <div className="dash-card-title">Key trade-offs to think about</div>
          </div>
          <ul style={{ paddingLeft: '1.25rem', margin: '0.5rem 0 0 0', color: '#3a4d68', fontSize: '0.9rem', lineHeight: 1.7 }}>
            {result.ai_key_tradeoffs.map((t, i) => (
              <li key={i} style={{ marginBottom: '0.4rem' }}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Footnote */}
      <div style={{ fontSize: '0.75rem', color: '#6b7785', marginBottom: '1rem', lineHeight: 1.5 }}>
        Estimates are based on the plan documents you uploaded, your household profile, and recent claims (if any).
        Actual costs depend on real utilization, network usage, and any mid-year life changes. Always confirm specifics
        with your benefits administrator before enrolling.
      </div>
    </>
  );
}

function ScenarioCard({ scenario }: { scenario: Scenario }) {
  const isTop = scenario.rank === 1;

  return (
    <div
      className="dash-card"
      style={{
        border: isTop ? '2px solid #7a9b76' : '1px solid #eef1f4',
        backgroundColor: isTop ? '#f9fcf9' : '#fff',
        position: 'relative',
      }}
    >
      {isTop && (
        <div style={{
          position: 'absolute',
          top: '-10px',
          left: '1rem',
          background: '#7a9b76',
          color: '#fff',
          fontSize: '0.7rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          padding: '0.2rem 0.6rem',
          borderRadius: '4px',
        }}>
          Recommended
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
            <div style={{
              fontSize: '0.7rem',
              color: '#fff',
              backgroundColor: isTop ? '#7a9b76' : '#5b7a99',
              fontWeight: 700,
              padding: '0.15rem 0.5rem',
              borderRadius: '4px',
            }}>
              #{scenario.rank}
            </div>
            <div style={{ fontFamily: 'Playfair Display, serif', color: '#1e3a5f', fontSize: '1.15rem', fontWeight: 700 }}>
              {scenario.scenario_label}
            </div>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#6b7785', marginTop: '0.3rem' }}>
            <span><strong>You:</strong> {scenario.whoIsOn.self}</span>
            {' · '}
            <span><strong>Spouse:</strong> {scenario.whoIsOn.spouse}</span>
            {scenario.whoIsOn.children && scenario.whoIsOn.children !== 'none' && (
              <>
                {' · '}
                <span><strong>Kids:</strong> {scenario.whoIsOn.children}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Cost breakdown */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '0.6rem',
        marginBottom: '0.75rem',
      }}>
        <CostBox label="Annual premium" value={fmtMoney(scenario.annualPremium)} />
        <CostBox label="Expected OOP" value={fmtMoney(scenario.expectedAnnualOOP)} />
        <CostBox label="Expected total" value={fmtMoney(scenario.expectedAnnualCost)} highlight />
        <CostBox label="Worst-case total" value={fmtMoney(scenario.worstCaseAnnualCost)} subtle />
      </div>

      {/* Plan details */}
      <div style={{ fontSize: '0.8rem', color: '#3a4d68', marginBottom: '0.75rem', lineHeight: 1.5 }}>
        {scenario.selfPlan && (
          <div><strong>Your plan:</strong> {scenario.selfPlan.name} <span style={{ color: '#6b7785' }}>({scenario.selfPlan.tier})</span></div>
        )}
        {scenario.spousePlan && (
          <div><strong>Spouse&apos;s plan:</strong> {scenario.spousePlan.name} <span style={{ color: '#6b7785' }}>({scenario.spousePlan.tier})</span></div>
        )}
        {scenario.hsaEligible && (
          <div style={{ color: '#5a7857', marginTop: '0.25rem' }}>✓ HSA eligible</div>
        )}
      </div>

      {/* AI insight */}
      {scenario.ai_insight && (
        <div style={{
          padding: '0.6rem 0.85rem',
          background: '#fafbfc',
          borderLeft: '3px solid #5b7a99',
          borderRadius: '4px',
          fontSize: '0.85rem',
          color: '#3a4d68',
          lineHeight: 1.5,
          marginBottom: scenario.gotchas?.length ? '0.75rem' : 0,
        }}>
          {scenario.ai_insight}
        </div>
      )}

      {/* Gotchas */}
      {scenario.gotchas && scenario.gotchas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {scenario.gotchas.map((g, i) => (
            <GotchaRow key={i} gotcha={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function CostBox({ label, value, highlight, subtle }: { label: string; value: string; highlight?: boolean; subtle?: boolean }) {
  const bg = highlight ? '#ebf3ea' : subtle ? '#fafbfc' : '#fff';
  const border = highlight ? '#c7d9c5' : '#eef1f4';
  const valueColor = highlight ? '#1e3a5f' : subtle ? '#6b7785' : '#1e3a5f';
  return (
    <div style={{
      padding: '0.6rem 0.75rem',
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: '6px',
    }}>
      <div style={{ fontSize: '0.7rem', color: '#6b7785', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.2rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.05rem', color: valueColor, fontWeight: 700, fontFamily: 'Playfair Display, serif' }}>
        {value}
      </div>
    </div>
  );
}

function GotchaRow({ gotcha }: { gotcha: Gotcha }) {
  const palette = {
    warn: { bg: '#fef9e8', border: '#f0e6b8', color: '#806c1e', icon: '⚠' },
    info: { bg: '#eaf1f7', border: '#c5d6e8', color: '#2c4a6b', icon: 'ℹ' },
    positive: { bg: '#f5f8f4', border: '#c7d9c5', color: '#5a7857', icon: '✓' },
  }[gotcha.severity] || { bg: '#fafbfc', border: '#eef1f4', color: '#3a4d68', icon: '·' };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.5rem',
      padding: '0.5rem 0.75rem',
      background: palette.bg,
      border: `1px solid ${palette.border}`,
      borderRadius: '4px',
      fontSize: '0.85rem',
      color: palette.color,
      lineHeight: 1.4,
    }}>
      <div style={{ flexShrink: 0, fontWeight: 700 }}>{palette.icon}</div>
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 600 }}>{gotcha.tag}:</span> {gotcha.message}
      </div>
    </div>
  );
}