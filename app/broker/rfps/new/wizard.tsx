'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../supabase';

type StartMode = 'from-spd' | 'from-scratch';

type Client = {
  id: string;
  first_name: string;
  last_name: string;
  employer_name: string | null;
  member_count: number | null;
};

export type WizardData = {
  clientId: string | null;
  rfpName: string;
  planYear: number;
  effectiveDate: string;
  censusSize: number | null;
  spdFilename: string | null;
  spdFile: File | null;
  spdStoragePath: string | null;
  extractedData: any | null;
  planOptions: any[];
  rx: any;
  dental: any;
  vision: any;
  life: any;
};

const TOTAL_STEPS = 5;
const STEP_LABELS = ['Basics', 'Upload SPD', 'Plan design', 'Ancillary', 'Review'];

export default function RFPWizard({
  startMode,
  user,
  agencyId,
  brokerId,
  editingRfpId,
  onCancel,
  onExit,
}: {
  startMode: StartMode;
  user: any;
  agencyId: string | null;
  brokerId: string | null;
  editingRfpId?: string | null;
  onCancel: () => void;
  onExit: () => void;
}) {
  const router = useRouter();
  const isEditMode = !!editingRfpId;
  const currentYear = new Date().getFullYear();
  const defaultPlanYear = currentYear + 1;

  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>({
    clientId: null,
    rfpName: '',
    planYear: defaultPlanYear,
    effectiveDate: `${defaultPlanYear}-01-01`,
    censusSize: null,
    spdFilename: null,
    spdFile: null,
    spdStoragePath: null,
    extractedData: null,
    planOptions: [],
    rx: null,
    dental: null,
    vision: null,
    life: null,
  });

  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);

  const [loadingExisting, setLoadingExisting] = useState(isEditMode);
  const [loadError, setLoadError] = useState<string | null>(null);

  // In edit mode, track whether the broker wants to replace the existing SPD
  const [replaceSpd, setReplaceSpd] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!agencyId) return;
    loadClients();
  }, [agencyId]);

  useEffect(() => {
    if (!editingRfpId) return;
    loadExistingRfp(editingRfpId);
  }, [editingRfpId]);

  async function loadClients() {
    setClientsLoading(true);
    const { data: rows } = await supabase
      .from('clients')
      .select('id, first_name, last_name, employer_name, member_count')
      .eq('agency_id', agencyId)
      .order('employer_name', { ascending: true, nullsFirst: false });
    setClients(rows || []);
    setClientsLoading(false);
  }

  async function loadExistingRfp(rfpId: string) {
    setLoadingExisting(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/rfps/${rfpId}`);
      const result = await res.json();
      if (!res.ok || !result.success) {
        setLoadError(result.message || result.error || 'Failed to load RFP.');
        setLoadingExisting(false);
        return;
      }

      const r = result.rfp;
      const planDesign = r.current_plan_design || {};
      const filename = r.current_plan_doc_url
        ? r.current_plan_doc_url.split('/').pop() || null
        : null;

      const effective = r.effective_date || `${defaultPlanYear}-01-01`;
      const yearFromDesign = planDesign.planYear
        ? Number(planDesign.planYear)
        : effective
        ? new Date(effective).getFullYear()
        : defaultPlanYear;

      setData({
        clientId: r.client_id,
        rfpName: r.name || '',
        planYear: yearFromDesign,
        effectiveDate: effective,
        censusSize: r.employee_lives ?? null,
        spdFilename: filename,
        spdFile: null,
        spdStoragePath: r.current_plan_doc_url || null,
        extractedData: planDesign.extractedData || null,
        planOptions: planDesign.planOptions || [],
        rx: planDesign.rx || null,
        dental: planDesign.dental || null,
        vision: planDesign.vision || null,
        life: planDesign.life || null,
      });

      setLoadingExisting(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load RFP.';
      setLoadError(msg);
      setLoadingExisting(false);
    }
  }

  function updateField<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function handleClientChange(clientId: string) {
    const client = clients.find((c) => c.id === clientId);
    setData((prev) => ({
      ...prev,
      clientId,
      rfpName:
        prev.rfpName === '' && client
          ? `${client.employer_name || `${client.first_name} ${client.last_name}`} ${prev.planYear} Renewal`
          : prev.rfpName,
      censusSize:
        prev.censusSize === null && client?.member_count
          ? client.member_count
          : prev.censusSize,
    }));
  }

  function handlePlanYearChange(year: number) {
    setData((prev) => ({
      ...prev,
      planYear: year,
      effectiveDate:
        prev.effectiveDate === `${prev.planYear}-01-01`
          ? `${year}-01-01`
          : prev.effectiveDate,
    }));
  }

  function isStepValid(s: number): boolean {
    if (s === 1) {
      return !!data.clientId && data.rfpName.trim().length > 0;
    }
    return true;
  }

  function goNext() {
    if (step < TOTAL_STEPS && isStepValid(step)) {
      setStep(step + 1);
    }
  }

  function goBack() {
    if (step === 1) {
      onCancel();
      return;
    }
    setStep(step - 1);
  }

  async function fileToBase64(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(
        null,
        Array.from(bytes.subarray(i, i + chunkSize))
      );
    }
    return btoa(binary);
  }

  async function handleSave() {
    if (saving) return;
    if (!agencyId || !user?.id) {
      setSaveError('Missing agency or user context. Please refresh and try again.');
      return;
    }
    if (!data.clientId || !data.rfpName.trim()) {
      setSaveError('Client and RFP name are required.');
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      let spdBase64: string | null = null;
      if (data.spdFile) {
        spdBase64 = await fileToBase64(data.spdFile);
      }

      const userName =
        user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        user?.email ||
        null;

      const url = isEditMode ? `/api/rfps/${editingRfpId}` : '/api/rfps';
      const method = isEditMode ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agencyId,
          userId: user.id,
          userName,
          clientId: data.clientId,
          rfpName: data.rfpName,
          effectiveDate: data.effectiveDate || null,
          censusSize: data.censusSize,
          spdFilename: data.spdFilename,
          spdBase64,
          planYear: data.planYear,
          extractedData: data.extractedData,
          planOptions: data.planOptions,
          rx: data.rx,
          dental: data.dental,
          vision: data.vision,
          life: data.life,
        }),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        const msg = result.message || result.error || 'Save failed.';
        setSaveError(msg);
        setSaving(false);
        return;
      }

      const targetId = isEditMode ? editingRfpId : result.rfp_id;
      router.push(`/broker/rfps/${targetId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed.';
      setSaveError(msg);
      setSaving(false);
    }
  }

  const canSave =
    !!data.clientId &&
    data.rfpName.trim().length > 0 &&
    !!agencyId &&
    !!user?.id &&
    !saving;

  if (loadingExisting) {
    return (
      <div style={{ maxWidth: 900 }}>
        <div style={{ color: '#3a4d68', fontSize: 14 }}>Loading RFP...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ maxWidth: 900 }}>
        <div
          style={{
            padding: 14,
            background: '#fde8e8',
            border: '1px solid #f5b7b7',
            borderRadius: 8,
            color: '#9b2c2c',
            fontSize: 14,
          }}
        >
          <strong>Couldn't load this RFP:</strong> {loadError}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={onCancel}
          disabled={saving}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#3a4d68',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: 14,
            padding: 0,
            marginBottom: 12,
            fontFamily: 'Figtree, sans-serif',
            opacity: saving ? 0.5 : 1,
          }}
        >
          {isEditMode ? '← Cancel edit' : '← Change start option'}
        </button>
        <h1
          style={{
            fontFamily: 'Playfair Display, serif',
            fontSize: 32,
            color: '#1e3a5f',
            margin: 0,
          }}
        >
          {isEditMode ? 'Edit RFP' : 'New RFP'}
        </h1>
      </div>

      <Stepper currentStep={step} />

      <div
        style={{
          background: 'white',
          border: '1px solid #eef1f4',
          borderRadius: 12,
          padding: 32,
          marginTop: 24,
        }}
      >
        {step === 1 && (
          <Step1Basics
            data={data}
            clients={clients}
            clientsLoading={clientsLoading}
            updateField={updateField}
            onClientChange={handleClientChange}
            onPlanYearChange={handlePlanYearChange}
          />
        )}
        {step === 2 && (
          <Step2UploadSPD
            startMode={startMode}
            isEditMode={isEditMode}
            replaceSpd={replaceSpd}
            onReplaceClick={() => setReplaceSpd(true)}
            onCancelReplace={() => setReplaceSpd(false)}
            data={data}
            updateField={updateField}
            onAutoAdvance={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <Step3PlanDesign data={data} updateField={updateField} />
        )}
        {step === 4 && (
          <Step4Ancillary data={data} updateField={updateField} />
        )}
        {step === 5 && (
          <Step5Review data={data} saveError={saveError} isEditMode={isEditMode} />
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 24,
        }}
      >
        <button
          onClick={goBack}
          disabled={saving}
          style={{
            background: 'white',
            color: '#3a4d68',
            border: '1px solid #d4d4d4',
            padding: '10px 22px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            fontFamily: 'Figtree, sans-serif',
            opacity: saving ? 0.5 : 1,
          }}
        >
          ← Back
        </button>

        {step < TOTAL_STEPS ? (
          <button
            onClick={goNext}
            disabled={!isStepValid(step)}
            style={{
              background: isStepValid(step) ? '#7a9b76' : '#c5d1c2',
              color: 'white',
              border: 'none',
              padding: '10px 28px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: isStepValid(step) ? 'pointer' : 'not-allowed',
              fontFamily: 'Figtree, sans-serif',
            }}
          >
            Next →
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              background: canSave ? '#7a9b76' : '#c5d1c2',
              color: 'white',
              border: 'none',
              padding: '10px 28px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: canSave ? 'pointer' : 'not-allowed',
              fontFamily: 'Figtree, sans-serif',
            }}
          >
            {saving
              ? isEditMode
                ? 'Updating...'
                : 'Saving...'
              : isEditMode
              ? 'Update RFP'
              : 'Save RFP'}
          </button>
        )}
      </div>
    </div>
  );
}

function Stepper({ currentStep }: { currentStep: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {STEP_LABELS.map((label, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === currentStep;
        const isComplete = stepNum < currentStep;
        return (
          <div
            key={label}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <div
              style={{
                width: '100%',
                height: 4,
                borderRadius: 2,
                background: isActive || isComplete ? '#7a9b76' : '#e6e6e6',
              }}
            />
            <div
              style={{
                fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? '#1e3a5f' : '#3a4d68',
                fontFamily: 'Figtree, sans-serif',
              }}
            >
              {stepNum}. {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Step1Basics({
  data,
  clients,
  clientsLoading,
  updateField,
  onClientChange,
  onPlanYearChange,
}: {
  data: WizardData;
  clients: Client[];
  clientsLoading: boolean;
  updateField: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  onClientChange: (clientId: string) => void;
  onPlanYearChange: (year: number) => void;
}) {
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear, currentYear + 1, currentYear + 2];

  return (
    <div>
      <h2
        style={{
          fontFamily: 'Playfair Display, serif',
          fontSize: 22,
          color: '#1e3a5f',
          margin: '0 0 4px 0',
        }}
      >
        Basics
      </h2>
      <p style={{ color: '#3a4d68', fontSize: 14, marginTop: 0, marginBottom: 24 }}>
        Tell us which client this RFP is for and when it's effective.
      </p>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Client *</label>
        {clientsLoading ? (
          <div style={{ color: '#3a4d68', fontSize: 14 }}>Loading clients...</div>
        ) : clients.length === 0 ? (
          <div
            style={{
              padding: 14,
              background: '#faf7f2',
              border: '1px solid #eef1f4',
              borderRadius: 8,
              fontSize: 14,
              color: '#3a4d68',
            }}
          >
            No clients in your agency yet.{' '}
            <a
              href="/broker/clients"
              style={{ color: '#1e3a5f', fontWeight: 600 }}
            >
              Add a client first.
            </a>
          </div>
        ) : (
          <select
            value={data.clientId || ''}
            onChange={(e) => onClientChange(e.target.value)}
            style={inputStyle}
          >
            <option value="">— Select a client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.employer_name || `${c.first_name} ${c.last_name}`}
                {c.member_count ? ` (${c.member_count} members)` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>RFP name *</label>
        <input
          type="text"
          value={data.rfpName}
          onChange={(e) => updateField('rfpName', e.target.value)}
          placeholder="e.g. Acme Corp 2026 Renewal"
          style={inputStyle}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div>
          <label style={labelStyle}>Plan year</label>
          <select
            value={data.planYear}
            onChange={(e) => onPlanYearChange(parseInt(e.target.value, 10))}
            style={inputStyle}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Effective date</label>
          <input
            type="date"
            value={data.effectiveDate}
            onChange={(e) => updateField('effectiveDate', e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Census size (members)</label>
        <input
          type="number"
          min="1"
          value={data.censusSize ?? ''}
          onChange={(e) =>
            updateField('censusSize', e.target.value ? parseInt(e.target.value, 10) : null)
          }
          placeholder="e.g. 150"
          style={inputStyle}
        />
        <div style={{ fontSize: 12, color: '#3a4d68', marginTop: 4 }}>
          Auto-fills from the client's member count. Adjust if needed.
        </div>
      </div>
    </div>
  );
}

function Step2UploadSPD({
  startMode,
  isEditMode,
  replaceSpd,
  onReplaceClick,
  onCancelReplace,
  data,
  updateField,
  onAutoAdvance,
}: {
  startMode: StartMode;
  isEditMode: boolean;
  replaceSpd: boolean;
  onReplaceClick: () => void;
  onCancelReplace: () => void;
  data: WizardData;
  updateField: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  onAutoAdvance: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // In edit mode, "hasExisting" means the RFP already has a SPD on file (filename) and the user hasn't asked to replace it
  const hasExisting = isEditMode && !!data.spdFilename && !data.spdFile && !replaceSpd;

  // "hasExtracted" means an extraction just ran in this session
  const hasExtracted = !!data.extractedData && !!data.spdFile;

  async function handleFile(file: File) {
    setError(null);

    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('PDF must be under 20 MB.');
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/rfps/extract-spd', {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();

      if (!res.ok) {
        const msg = result.message || result.error || 'Extraction failed.';
        setError(msg);
        setUploading(false);
        return;
      }

      updateField('spdFilename', file.name);
      updateField('spdFile', file);
      updateField('extractedData', result.extracted);
      updateField('planOptions', result.extracted?.plan_options || []);
      updateField('rx', result.extracted?.rx || null);
      updateField('dental', result.extracted?.dental || null);
      updateField('vision', result.extracted?.vision || null);
      updateField('life', result.extracted?.life || null);

      setUploading(false);
      setTimeout(() => onAutoAdvance(), 800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setError(msg);
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(true);
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
  }

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function clearAndRetry() {
    updateField('spdFilename', isEditMode ? data.spdFilename : null);
    updateField('spdFile', null);
    updateField('extractedData', null);
    updateField('planOptions', []);
    updateField('rx', null);
    updateField('dental', null);
    updateField('vision', null);
    updateField('life', null);
    setError(null);
    if (isEditMode) {
      onCancelReplace();
    }
  }

  return (
    <div>
      <h2
        style={{
          fontFamily: 'Playfair Display, serif',
          fontSize: 22,
          color: '#1e3a5f',
          margin: '0 0 4px 0',
        }}
      >
        Upload SPD
      </h2>
      <p style={{ color: '#3a4d68', fontSize: 14, marginTop: 0, marginBottom: 24 }}>
        {isEditMode
          ? "The current SPD is shown below. Replace it if you've received an updated version."
          : startMode === 'from-spd'
          ? "Upload the client's Summary Plan Description. We'll extract the plan design with AI."
          : 'Optional: drop in an SPD if you have one. Otherwise click Next to enter the plan design manually.'}
      </p>

      {hasExisting && (
        <div
          style={{
            background: '#f0f7ee',
            border: '1px solid #c9dec4',
            borderRadius: 12,
            padding: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: '#7a9b76',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              ✓
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#1e3a5f', fontSize: 15 }}>
                Currently uploaded: {data.spdFilename}
              </div>
              <div style={{ color: '#3a4d68', fontSize: 13 }}>
                Plan design loaded from this file. Click Next to review or edit.
              </div>
            </div>
          </div>

          <button
            onClick={onReplaceClick}
            style={{
              marginTop: 4,
              background: 'transparent',
              border: '1px solid #c9dec4',
              color: '#3a4d68',
              padding: '8px 16px',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'Figtree, sans-serif',
            }}
          >
            Replace with a new SPD
          </button>
        </div>
      )}

      {hasExtracted && !uploading && (
        <div
          style={{
            background: '#f0f7ee',
            border: '1px solid #c9dec4',
            borderRadius: 12,
            padding: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: '#7a9b76',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              ✓
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#1e3a5f', fontSize: 15 }}>
                Extracted from {data.spdFilename}
              </div>
              <div style={{ color: '#3a4d68', fontSize: 13 }}>
                Plan design ready to review on the next step.
              </div>
            </div>
          </div>

          <ExtractionSummary extracted={data.extractedData} />

          <button
            onClick={clearAndRetry}
            style={{
              marginTop: 16,
              background: 'transparent',
              border: '1px solid #c9dec4',
              color: '#3a4d68',
              padding: '8px 16px',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'Figtree, sans-serif',
            }}
          >
            {isEditMode ? 'Keep existing SPD' : 'Upload a different SPD'}
          </button>
        </div>
      )}

      {uploading && (
        <div
          style={{
            border: '2px dashed #7a9b76',
            borderRadius: 12,
            padding: '60px 24px',
            textAlign: 'center',
            background: '#faf7f2',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              border: '3px solid #e6e6e6',
              borderTopColor: '#7a9b76',
              borderRadius: '50%',
              margin: '0 auto 16px',
              animation: 'spin 1s linear infinite',
            }}
          />
          <div
            style={{
              color: '#1e3a5f',
              fontSize: 15,
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Extracting plan design with AI...
          </div>
          <div style={{ color: '#3a4d68', fontSize: 13 }}>
            This usually takes 20–40 seconds for a large SPD.
          </div>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {!hasExisting && !hasExtracted && !uploading && (
        <>
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            style={{
              border: `2px dashed ${dragActive ? '#7a9b76' : '#d4d4d4'}`,
              background: dragActive ? '#f0f7ee' : '#faf7f2',
              borderRadius: 12,
              padding: '48px 24px',
              textAlign: 'center',
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                background: '#e8f0e6',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <svg
                width={24}
                height={24}
                viewBox="0 0 24 24"
                fill="none"
                stroke="#5a7857"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1={12} y1={3} x2={12} y2={15} />
              </svg>
            </div>
            <div
              style={{
                color: '#1e3a5f',
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Drop your SPD here
            </div>
            <div style={{ color: '#3a4d68', fontSize: 13, marginBottom: 16 }}>or</div>
            <label
              style={{
                display: 'inline-block',
                background: '#7a9b76',
                color: 'white',
                padding: '10px 22px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'Figtree, sans-serif',
              }}
            >
              Browse files
              <input
                type="file"
                accept="application/pdf"
                onChange={onFilePick}
                style={{ display: 'none' }}
              />
            </label>
            <div style={{ color: '#3a4d68', fontSize: 12, marginTop: 16 }}>
              PDF only · Max 20 MB
            </div>
          </div>

          {isEditMode && replaceSpd && (
            <button
              onClick={onCancelReplace}
              style={{
                marginTop: 12,
                background: 'transparent',
                border: 'none',
                color: '#3a4d68',
                padding: '4px 0',
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'Figtree, sans-serif',
              }}
            >
              Keep current SPD instead
            </button>
          )}

          {error && (
            <div
              style={{
                marginTop: 16,
                padding: 14,
                background: '#fde8e8',
                border: '1px solid #f5b7b7',
                borderRadius: 8,
                color: '#9b2c2c',
                fontSize: 14,
              }}
            >
              <strong>Couldn't extract this PDF:</strong> {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ExtractionSummary({ extracted }: { extracted: any }) {
  if (!extracted) return null;

  const planCount = extracted.plan_options?.length || 0;
  const tierCount = (extracted.plan_options || []).reduce(
    (sum: number, p: any) => sum + (p.tiers?.length || 0),
    0
  );
  const hasRx = !!extracted.rx?.carrier;
  const hasDental = !!extracted.dental?.carrier;
  const hasVision = !!extracted.vision?.carrier;
  const hasLife = extracted.life?.amount != null;
  const warnings = extracted.warnings?.length || 0;

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #eef1f4',
        borderRadius: 8,
        padding: 14,
        fontSize: 13,
        color: '#1e3a5f',
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <strong>Found:</strong> {planCount} medical {planCount === 1 ? 'plan' : 'plans'} (
        {tierCount} {tierCount === 1 ? 'tier' : 'tiers'})
        {hasRx ? ', Rx' : ''}
        {hasDental ? ', dental' : ''}
        {hasVision ? ', vision' : ''}
        {hasLife ? ', life' : ''}
      </div>
      {extracted.employer_name && (
        <div style={{ color: '#3a4d68' }}>
          Employer: <strong style={{ color: '#1e3a5f' }}>{extracted.employer_name}</strong>
        </div>
      )}
      {extracted.plan_year && (
        <div style={{ color: '#3a4d68' }}>
          Plan year: <strong style={{ color: '#1e3a5f' }}>{extracted.plan_year}</strong>
        </div>
      )}
      {warnings > 0 && (
        <div style={{ color: '#665028', marginTop: 8, fontSize: 12 }}>
          {warnings} {warnings === 1 ? 'item' : 'items'} flagged for review on the next step.
        </div>
      )}
    </div>
  );
}

function Step3PlanDesign({
  data,
  updateField,
}: {
  data: WizardData;
  updateField: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
}) {
  const planOptions = data.planOptions || [];
  const warnings: string[] = data.extractedData?.warnings || [];
  const confidence = data.extractedData?.extraction_confidence || {};

  function updatePlan(planIndex: number, updates: any) {
    const next = [...planOptions];
    next[planIndex] = { ...next[planIndex], ...updates };
    updateField('planOptions', next);
  }

  function deletePlan(planIndex: number) {
    if (!confirm(`Remove "${planOptions[planIndex]?.name || 'this plan'}"? This can't be undone.`)) {
      return;
    }
    const next = planOptions.filter((_, i) => i !== planIndex);
    updateField('planOptions', next);
  }

  function addPlan() {
    const next = [
      ...planOptions,
      {
        name: `Plan ${planOptions.length + 1}`,
        type: 'PPO',
        hsa_eligible: false,
        tiers: [emptyTier('In-Network')],
      },
    ];
    updateField('planOptions', next);
  }

  function updateTier(planIndex: number, tierIndex: number, updates: any) {
    const next = [...planOptions];
    const tiers = [...(next[planIndex].tiers || [])];
    tiers[tierIndex] = { ...tiers[tierIndex], ...updates };
    next[planIndex] = { ...next[planIndex], tiers };
    updateField('planOptions', next);
  }

  function deleteTier(planIndex: number, tierIndex: number) {
    const tierName = planOptions[planIndex]?.tiers?.[tierIndex]?.tier_name || 'this tier';
    if (!confirm(`Remove ${tierName}?`)) return;
    const next = [...planOptions];
    next[planIndex] = {
      ...next[planIndex],
      tiers: next[planIndex].tiers.filter((_: any, i: number) => i !== tierIndex),
    };
    updateField('planOptions', next);
  }

  function addTier(planIndex: number) {
    const next = [...planOptions];
    const existingTiers = next[planIndex].tiers || [];
    next[planIndex] = {
      ...next[planIndex],
      tiers: [...existingTiers, emptyTier('New Tier')],
    };
    updateField('planOptions', next);
  }

  return (
    <div>
      <h2
        style={{
          fontFamily: 'Playfair Display, serif',
          fontSize: 22,
          color: '#1e3a5f',
          margin: '0 0 4px 0',
        }}
      >
        Plan design
      </h2>
      <p style={{ color: '#3a4d68', fontSize: 14, marginTop: 0, marginBottom: 24 }}>
        Review and edit the medical plan design that carriers will quote against.
      </p>

      {warnings.length > 0 && <WarningsPanel warnings={warnings} />}

      {planOptions.length === 0 ? (
        <div
          style={{
            padding: 32,
            background: '#faf7f2',
            border: '1px dashed #d4d4d4',
            borderRadius: 8,
            fontSize: 14,
            color: '#3a4d68',
            textAlign: 'center',
          }}
        >
          No plans yet. Click "Add a plan" below to start, or upload an SPD on Step 2.
        </div>
      ) : (
        planOptions.map((plan: any, pi: number) => (
          <PlanCard
            key={pi}
            plan={plan}
            planIndex={pi}
            confidence={confidence.plan_options}
            onUpdatePlan={(updates) => updatePlan(pi, updates)}
            onDeletePlan={() => deletePlan(pi)}
            onUpdateTier={(ti, updates) => updateTier(pi, ti, updates)}
            onDeleteTier={(ti) => deleteTier(pi, ti)}
            onAddTier={() => addTier(pi)}
          />
        ))
      )}

      <button
        onClick={addPlan}
        style={{
          marginTop: 16,
          background: 'white',
          color: '#1e3a5f',
          border: '1px dashed #7a9b76',
          padding: '12px 20px',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'Figtree, sans-serif',
          width: '100%',
        }}
      >
        + Add another plan
      </button>
    </div>
  );
}

function WarningsPanel({ warnings }: { warnings: string[] }) {
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  function dismiss(i: number) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(i);
      return next;
    });
  }

  const visibleCount = warnings.length - dismissed.size;
  if (visibleCount === 0) return null;

  return (
    <div
      style={{
        background: '#fff8e6',
        border: '1px solid #f5e0a3',
        borderRadius: 8,
        marginBottom: 24,
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          fontFamily: 'Figtree, sans-serif',
          fontSize: 14,
          fontWeight: 600,
          color: '#665028',
        }}
      >
        <span>
          ⚠ {visibleCount} {visibleCount === 1 ? 'item' : 'items'} flagged for review
        </span>
        <span style={{ fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div style={{ padding: '0 16px 16px 16px' }}>
          {warnings.map((w, i) =>
            dismissed.has(i) ? null : (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '8px 0',
                  borderTop: i > 0 ? '1px solid #f5e0a3' : 'none',
                  fontSize: 13,
                  color: '#665028',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ flex: 1 }}>{w}</div>
                <button
                  onClick={() => dismiss(i)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#665028',
                    cursor: 'pointer',
                    fontSize: 12,
                    padding: '2px 6px',
                    fontFamily: 'Figtree, sans-serif',
                  }}
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  planIndex,
  confidence,
  onUpdatePlan,
  onDeletePlan,
  onUpdateTier,
  onDeleteTier,
  onAddTier,
}: {
  plan: any;
  planIndex: number;
  confidence?: string;
  onUpdatePlan: (updates: any) => void;
  onDeletePlan: () => void;
  onUpdateTier: (tierIndex: number, updates: any) => void;
  onDeleteTier: (tierIndex: number) => void;
  onAddTier: () => void;
}) {
  const tiers = plan.tiers || [];

  return (
    <div
      style={{
        border: '1px solid #eef1f4',
        borderRadius: 12,
        marginBottom: 16,
        background: '#fdfcf9',
      }}
    >
      <div
        style={{
          padding: '20px 20px 12px 20px',
          borderBottom: '1px solid #eef1f4',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#3a4d68',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Plan {planIndex + 1}
            </span>
            {confidence && <ConfidenceBadge level={confidence} />}
          </div>
          <button
            onClick={onDeletePlan}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9b2c2c',
              cursor: 'pointer',
              fontSize: 12,
              padding: '4px 8px',
              fontFamily: 'Figtree, sans-serif',
            }}
          >
            Remove plan
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr',
            gap: 12,
          }}
        >
          <div>
            <label style={miniLabel}>Plan name</label>
            <input
              type="text"
              value={plan.name || ''}
              onChange={(e) => onUpdatePlan({ name: e.target.value })}
              style={miniInput}
            />
          </div>
          <div>
            <label style={miniLabel}>Type</label>
            <select
              value={plan.type || 'PPO'}
              onChange={(e) => onUpdatePlan({ type: e.target.value })}
              style={miniInput}
            >
              <option>PPO</option>
              <option>HMO</option>
              <option>EPO</option>
              <option>POS</option>
              <option>HDHP</option>
              <option>Indemnity</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label style={miniLabel}>HSA-eligible</label>
            <select
              value={plan.hsa_eligible === true ? 'yes' : plan.hsa_eligible === false ? 'no' : ''}
              onChange={(e) =>
                onUpdatePlan({
                  hsa_eligible:
                    e.target.value === 'yes'
                      ? true
                      : e.target.value === 'no'
                      ? false
                      : null,
                })
              }
              style={miniInput}
            >
              <option value="">—</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 20px 20px 20px' }}>
        {tiers.length === 0 ? (
          <div
            style={{
              padding: 16,
              fontSize: 13,
              color: '#3a4d68',
              textAlign: 'center',
              fontStyle: 'italic',
            }}
          >
            No network tiers yet.
          </div>
        ) : (
          tiers.map((tier: any, ti: number) => (
            <TierEditor
              key={ti}
              tier={tier}
              tierIndex={ti}
              onUpdate={(updates) => onUpdateTier(ti, updates)}
              onDelete={() => onDeleteTier(ti)}
            />
          ))
        )}

        <button
          onClick={onAddTier}
          style={{
            marginTop: 8,
            background: 'transparent',
            color: '#5a7857',
            border: '1px dashed #c9dec4',
            padding: '8px 14px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'Figtree, sans-serif',
          }}
        >
          + Add a network tier
        </button>
      </div>
    </div>
  );
}

function TierEditor({
  tier,
  tierIndex,
  onUpdate,
  onDelete,
}: {
  tier: any;
  tierIndex: number;
  onUpdate: (updates: any) => void;
  onDelete: () => void;
}) {
  function num(field: string, label: string, prefix = '$') {
    const value = tier[field];
    return (
      <div>
        <label style={miniLabel}>{label}</label>
        <div style={{ position: 'relative' }}>
          {prefix && (
            <span
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#3a4d68',
                fontSize: 13,
                pointerEvents: 'none',
              }}
            >
              {prefix}
            </span>
          )}
          <input
            type="number"
            value={value === null || value === undefined ? '' : value}
            onChange={(e) =>
              onUpdate({
                [field]: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            style={{
              ...miniInput,
              paddingLeft: prefix ? 22 : 10,
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #eef1f4',
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <input
          type="text"
          value={tier.tier_name || ''}
          onChange={(e) => onUpdate({ tier_name: e.target.value })}
          placeholder="Tier name (e.g. In-Network)"
          style={{
            ...miniInput,
            flex: 1,
            fontWeight: 600,
            color: '#1e3a5f',
            border: '1px solid transparent',
            background: 'transparent',
            padding: '6px 8px',
          }}
        />
        <button
          onClick={onDelete}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9b2c2c',
            cursor: 'pointer',
            fontSize: 12,
            padding: '4px 8px',
            fontFamily: 'Figtree, sans-serif',
          }}
        >
          Remove tier
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
        }}
      >
        {num('deductible_individual', 'Deductible (individual)')}
        {num('deductible_family', 'Deductible (family)')}
        {num('coinsurance_oop_individual', 'Coinsurance OOP (individual)')}
        {num('coinsurance_oop_family', 'Coinsurance OOP (family)')}
        {num('aca_oop_individual', 'ACA OOP (individual)')}
        {num('aca_oop_family', 'ACA OOP (family)')}
        {num('office_visit_pcp_copay', 'PCP copay')}
        {num('office_visit_specialist_copay', 'Specialist copay')}
        {num('telehealth_copay', 'Telehealth copay')}
        {num('er_copay', 'ER copay')}
        {num('urgent_care_copay', 'Urgent care copay')}
        {num('inpatient_hospital_coinsurance_pct', 'Inpatient coinsurance (%)', '')}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          marginTop: 10,
        }}
      >
        <div>
          <label style={miniLabel}>Lifetime max</label>
          <input
            type="text"
            value={tier.lifetime_max ?? ''}
            onChange={(e) =>
              onUpdate({
                lifetime_max: e.target.value === '' ? null : e.target.value,
              })
            }
            placeholder="Unlimited or amount"
            style={miniInput}
          />
        </div>
        <div>
          <label style={miniLabel}>Preventive 100%</label>
          <select
            value={
              tier.preventive_covered_100pct === true
                ? 'yes'
                : tier.preventive_covered_100pct === false
                ? 'no'
                : ''
            }
            onChange={(e) =>
              onUpdate({
                preventive_covered_100pct:
                  e.target.value === 'yes'
                    ? true
                    : e.target.value === 'no'
                    ? false
                    : null,
              })
            }
            style={miniInput}
          >
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function ConfidenceBadge({ level }: { level: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    high: { bg: '#e8f0e6', fg: '#5a7857', label: 'High confidence' },
    medium: { bg: '#fff8e6', fg: '#665028', label: 'Verify' },
    low: { bg: '#fde8e8', fg: '#9b2c2c', label: 'Review carefully' },
  };
  const c = map[level] || map.medium;
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        fontSize: 11,
        fontWeight: 600,
        padding: '3px 8px',
        borderRadius: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {c.label}
    </span>
  );
}

function emptyTier(name: string) {
  return {
    tier_name: name,
    deductible_individual: null,
    deductible_family: null,
    coinsurance_oop_individual: null,
    coinsurance_oop_family: null,
    aca_oop_individual: null,
    aca_oop_family: null,
    lifetime_max: null,
    office_visit_pcp_copay: null,
    office_visit_specialist_copay: null,
    telehealth_copay: null,
    er_copay: null,
    urgent_care_copay: null,
    inpatient_hospital_coinsurance_pct: null,
    preventive_covered_100pct: null,
  };
}

function emptyRx() {
  return {
    carrier: null,
    retail_30day: { generic: null, preferred_brand: null, non_preferred_brand: null, specialty: null },
    mail_90day: { generic: null, preferred_brand: null, non_preferred_brand: null, specialty: null },
  };
}

function emptyDental() {
  return {
    carrier: null,
    deductible_individual: null,
    annual_max: null,
    preventive_coverage_pct: null,
    basic_coverage_pct: null,
    major_coverage_pct: null,
    ortho_lifetime_max: null,
  };
}

function emptyVision() {
  return {
    carrier: null,
    exam_copay: null,
    frames_allowance: null,
    contacts_allowance: null,
    exam_frequency_months: null,
  };
}

function emptyLife() {
  return {
    carrier: null,
    amount: null,
    ad_d_amount: null,
  };
}

function Step4Ancillary({
  data,
  updateField,
}: {
  data: WizardData;
  updateField: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
}) {
  const confidence = data.extractedData?.extraction_confidence || {};
  const rx = data.rx || emptyRx();
  const dental = data.dental || emptyDental();
  const vision = data.vision || emptyVision();
  const life = data.life || emptyLife();

  return (
    <div>
      <h2
        style={{
          fontFamily: 'Playfair Display, serif',
          fontSize: 22,
          color: '#1e3a5f',
          margin: '0 0 4px 0',
        }}
      >
        Ancillary lines
      </h2>
      <p style={{ color: '#3a4d68', fontSize: 14, marginTop: 0, marginBottom: 24 }}>
        Configure Rx, dental, vision, and life coverage. Leave any line blank if it isn't part of this RFP.
      </p>

      <RxSection
        rx={rx}
        confidence={confidence.rx}
        onUpdate={(updates) => updateField('rx', { ...rx, ...updates })}
        onUpdateRetail={(updates) =>
          updateField('rx', { ...rx, retail_30day: { ...rx.retail_30day, ...updates } })
        }
        onUpdateMail={(updates) =>
          updateField('rx', { ...rx, mail_90day: { ...rx.mail_90day, ...updates } })
        }
      />

      <DentalSection
        dental={dental}
        confidence={confidence.dental}
        onUpdate={(updates) => updateField('dental', { ...dental, ...updates })}
      />

      <VisionSection
        vision={vision}
        confidence={confidence.vision}
        onUpdate={(updates) => updateField('vision', { ...vision, ...updates })}
      />

      <LifeSection
        life={life}
        confidence={confidence.life}
        onUpdate={(updates) => updateField('life', { ...life, ...updates })}
      />
    </div>
  );
}

function AncillaryCard({
  title,
  confidence,
  children,
}: {
  title: string;
  confidence?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: '1px solid #eef1f4',
        borderRadius: 12,
        marginBottom: 16,
        background: '#fdfcf9',
      }}
    >
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #eef1f4',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h3
          style={{
            fontFamily: 'Playfair Display, serif',
            fontSize: 17,
            color: '#1e3a5f',
            margin: 0,
            fontWeight: 600,
          }}
        >
          {title}
        </h3>
        {confidence && <ConfidenceBadge level={confidence} />}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  prefix = '$',
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  prefix?: string;
}) {
  return (
    <div>
      <label style={miniLabel}>{label}</label>
      <div style={{ position: 'relative' }}>
        {prefix && (
          <span
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#3a4d68',
              fontSize: 13,
              pointerEvents: 'none',
            }}
          >
            {prefix}
          </span>
        )}
        <input
          type="number"
          value={value === null || value === undefined ? '' : value}
          onChange={(e) =>
            onChange(e.target.value === '' ? null : Number(e.target.value))
          }
          style={{
            ...miniInput,
            paddingLeft: prefix ? 22 : 10,
          }}
        />
      </div>
    </div>
  );
}

function CarrierField({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={miniLabel}>Carrier</label>
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        placeholder="e.g. Express Scripts, MetLife, VSP"
        style={miniInput}
      />
    </div>
  );
}

function RxSection({
  rx,
  confidence,
  onUpdate,
  onUpdateRetail,
  onUpdateMail,
}: {
  rx: any;
  confidence?: string;
  onUpdate: (updates: any) => void;
  onUpdateRetail: (updates: any) => void;
  onUpdateMail: (updates: any) => void;
}) {
  const retail = rx.retail_30day || {};
  const mail = rx.mail_90day || {};

  return (
    <AncillaryCard title="Pharmacy (Rx)" confidence={confidence}>
      <CarrierField value={rx.carrier} onChange={(v) => onUpdate({ carrier: v })} />

      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#3a4d68',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 10,
          marginTop: 4,
        }}
      >
        Retail (30-day supply)
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          marginBottom: 18,
        }}
      >
        <NumberField
          label="Generic"
          value={retail.generic}
          onChange={(v) => onUpdateRetail({ generic: v })}
        />
        <NumberField
          label="Preferred brand"
          value={retail.preferred_brand}
          onChange={(v) => onUpdateRetail({ preferred_brand: v })}
        />
        <NumberField
          label="Non-preferred brand"
          value={retail.non_preferred_brand}
          onChange={(v) => onUpdateRetail({ non_preferred_brand: v })}
        />
        <NumberField
          label="Specialty"
          value={retail.specialty}
          onChange={(v) => onUpdateRetail({ specialty: v })}
        />
      </div>

      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#3a4d68',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 10,
        }}
      >
        Mail order (90-day supply)
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
        }}
      >
        <NumberField
          label="Generic"
          value={mail.generic}
          onChange={(v) => onUpdateMail({ generic: v })}
        />
        <NumberField
          label="Preferred brand"
          value={mail.preferred_brand}
          onChange={(v) => onUpdateMail({ preferred_brand: v })}
        />
        <NumberField
          label="Non-preferred brand"
          value={mail.non_preferred_brand}
          onChange={(v) => onUpdateMail({ non_preferred_brand: v })}
        />
        <NumberField
          label="Specialty"
          value={mail.specialty}
          onChange={(v) => onUpdateMail({ specialty: v })}
        />
      </div>
    </AncillaryCard>
  );
}

function DentalSection({
  dental,
  confidence,
  onUpdate,
}: {
  dental: any;
  confidence?: string;
  onUpdate: (updates: any) => void;
}) {
  return (
    <AncillaryCard title="Dental" confidence={confidence}>
      <CarrierField value={dental.carrier} onChange={(v) => onUpdate({ carrier: v })} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          marginBottom: 10,
        }}
      >
        <NumberField
          label="Deductible (individual)"
          value={dental.deductible_individual}
          onChange={(v) => onUpdate({ deductible_individual: v })}
        />
        <NumberField
          label="Annual max"
          value={dental.annual_max}
          onChange={(v) => onUpdate({ annual_max: v })}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 10,
          marginBottom: 10,
        }}
      >
        <NumberField
          label="Preventive (%)"
          value={dental.preventive_coverage_pct}
          onChange={(v) => onUpdate({ preventive_coverage_pct: v })}
          prefix=""
        />
        <NumberField
          label="Basic (%)"
          value={dental.basic_coverage_pct}
          onChange={(v) => onUpdate({ basic_coverage_pct: v })}
          prefix=""
        />
        <NumberField
          label="Major (%)"
          value={dental.major_coverage_pct}
          onChange={(v) => onUpdate({ major_coverage_pct: v })}
          prefix=""
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <NumberField
          label="Ortho lifetime max"
          value={dental.ortho_lifetime_max}
          onChange={(v) => onUpdate({ ortho_lifetime_max: v })}
        />
        <div />
      </div>
    </AncillaryCard>
  );
}

function VisionSection({
  vision,
  confidence,
  onUpdate,
}: {
  vision: any;
  confidence?: string;
  onUpdate: (updates: any) => void;
}) {
  return (
    <AncillaryCard title="Vision" confidence={confidence}>
      <CarrierField value={vision.carrier} onChange={(v) => onUpdate({ carrier: v })} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          marginBottom: 10,
        }}
      >
        <NumberField
          label="Exam copay"
          value={vision.exam_copay}
          onChange={(v) => onUpdate({ exam_copay: v })}
        />
        <NumberField
          label="Exam frequency (months)"
          value={vision.exam_frequency_months}
          onChange={(v) => onUpdate({ exam_frequency_months: v })}
          prefix=""
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <NumberField
          label="Frames allowance"
          value={vision.frames_allowance}
          onChange={(v) => onUpdate({ frames_allowance: v })}
        />
        <NumberField
          label="Contacts allowance"
          value={vision.contacts_allowance}
          onChange={(v) => onUpdate({ contacts_allowance: v })}
        />
      </div>
    </AncillaryCard>
  );
}

function LifeSection({
  life,
  confidence,
  onUpdate,
}: {
  life: any;
  confidence?: string;
  onUpdate: (updates: any) => void;
}) {
  return (
    <AncillaryCard title="Life & AD&D" confidence={confidence}>
      <CarrierField value={life.carrier} onChange={(v) => onUpdate({ carrier: v })} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <NumberField
          label="Life amount"
          value={life.amount}
          onChange={(v) => onUpdate({ amount: v })}
        />
        <NumberField
          label="AD&D amount"
          value={life.ad_d_amount}
          onChange={(v) => onUpdate({ ad_d_amount: v })}
        />
      </div>
    </AncillaryCard>
  );
}

function Step5Review({
  data,
  saveError,
  isEditMode,
}: {
  data: WizardData;
  saveError: string | null;
  isEditMode: boolean;
}) {
  const planCount = (data.planOptions || []).length;
  const tierCount = (data.planOptions || []).reduce(
    (sum: number, p: any) => sum + (p.tiers?.length || 0),
    0
  );

  const ancillaryLines: string[] = [];
  if (data.rx?.carrier) ancillaryLines.push(`Rx (${data.rx.carrier})`);
  if (data.dental?.carrier) ancillaryLines.push(`Dental (${data.dental.carrier})`);
  if (data.vision?.carrier) ancillaryLines.push(`Vision (${data.vision.carrier})`);
  if (data.life?.carrier || data.life?.amount) {
    ancillaryLines.push(
      `Life${data.life?.carrier ? ` (${data.life.carrier})` : ''}`
    );
  }

  return (
    <div>
      <h2
        style={{
          fontFamily: 'Playfair Display, serif',
          fontSize: 22,
          color: '#1e3a5f',
          margin: '0 0 4px 0',
        }}
      >
        Review
      </h2>
      <p style={{ color: '#3a4d68', fontSize: 14, marginTop: 0, marginBottom: 24 }}>
        {isEditMode
          ? 'Review your changes before updating.'
          : 'Review everything before saving the RFP as a draft.'}
      </p>

      <ReviewRow label="RFP name" value={data.rfpName || '—'} />
      <ReviewRow label="Plan year" value={String(data.planYear)} />
      <ReviewRow label="Effective date" value={data.effectiveDate} />
      <ReviewRow label="Census size" value={data.censusSize ? `${data.censusSize} members` : '—'} />
      <ReviewRow label="SPD" value={data.spdFilename || '— (none uploaded)'} />
      <ReviewRow
        label="Plan design"
        value={
          planCount === 0
            ? '— (none configured)'
            : `${planCount} ${planCount === 1 ? 'plan' : 'plans'}, ${tierCount} ${tierCount === 1 ? 'tier' : 'tiers'}`
        }
      />
      <ReviewRow
        label="Ancillary lines"
        value={ancillaryLines.length === 0 ? '— (none configured)' : ancillaryLines.join(', ')}
      />

      {saveError && (
        <div
          style={{
            marginTop: 24,
            padding: 14,
            background: '#fde8e8',
            border: '1px solid #f5b7b7',
            borderRadius: 8,
            fontSize: 13,
            color: '#9b2c2c',
          }}
        >
          <strong>Couldn't save:</strong> {saveError}
        </div>
      )}

      {!saveError && (
        <div
          style={{
            marginTop: 24,
            padding: 14,
            background: '#f0f7ee',
            border: '1px solid #c9dec4',
            borderRadius: 8,
            fontSize: 13,
            color: '#3a4d68',
          }}
        >
          {isEditMode
            ? <>Click <strong style={{ color: '#1e3a5f' }}>Update RFP</strong> to save your changes.</>
            : <>Click <strong style={{ color: '#1e3a5f' }}>Save RFP</strong> to create a draft. You can edit it any time.</>
          }
        </div>
      )}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '180px 1fr',
        padding: '10px 0',
        borderBottom: '1px solid #eef1f4',
        fontSize: 14,
      }}
    >
      <div style={{ color: '#3a4d68', fontWeight: 600 }}>{label}</div>
      <div style={{ color: '#1e3a5f' }}>{value}</div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#1e3a5f',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 6,
  border: '1px solid #d4d4d4',
  fontSize: 14,
  fontFamily: 'Figtree, sans-serif',
  boxSizing: 'border-box',
  background: 'white',
};

const miniLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: '#3a4d68',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: 0.3,
};

const miniInput: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #d4d4d4',
  fontSize: 13,
  fontFamily: 'Figtree, sans-serif',
  boxSizing: 'border-box',
  background: 'white',
};