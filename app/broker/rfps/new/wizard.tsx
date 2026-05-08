'use client';

import { useEffect, useState } from 'react';
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
  // Step 1
  clientId: string | null;
  rfpName: string;
  planYear: number;
  effectiveDate: string;
  censusSize: number | null;
  // Step 2
  spdFilename: string | null;
  spdStoragePath: string | null;
  extractedData: any | null;
  // Step 3-4
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
  onCancel,
  onExit,
}: {
  startMode: StartMode;
  user: any;
  agencyId: string | null;
  brokerId: string | null;
  onCancel: () => void;
  onExit: () => void;
}) {
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

  useEffect(() => {
    if (!agencyId) return;
    loadClients();
  }, [agencyId]);

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

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#3a4d68',
            cursor: 'pointer',
            fontSize: 14,
            padding: 0,
            marginBottom: 12,
            fontFamily: 'Figtree, sans-serif',
          }}
        >
          ← Change start option
        </button>
        <h1
          style={{
            fontFamily: 'Playfair Display, serif',
            fontSize: 32,
            color: '#1e3a5f',
            margin: 0,
          }}
        >
          New RFP
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
            data={data}
            updateField={updateField}
            onAutoAdvance={() => setStep(3)}
          />
        )}
        {step === 3 && <Step3PlanDesign />}
        {step === 4 && <Step4Ancillary />}
        {step === 5 && <Step5Review data={data} />}
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
          style={{
            background: 'white',
            color: '#3a4d68',
            border: '1px solid #d4d4d4',
            padding: '10px 22px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'Figtree, sans-serif',
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
            disabled
            title="Save coming in next push"
            style={{
              background: '#c5d1c2',
              color: 'white',
              border: 'none',
              padding: '10px 28px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'not-allowed',
              fontFamily: 'Figtree, sans-serif',
            }}
          >
            Save RFP (coming next)
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
  data,
  updateField,
  onAutoAdvance,
}: {
  startMode: StartMode;
  data: WizardData;
  updateField: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  onAutoAdvance: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const hasExtracted = !!data.extractedData;

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
    updateField('spdFilename', null);
    updateField('extractedData', null);
    updateField('planOptions', []);
    updateField('rx', null);
    updateField('dental', null);
    updateField('vision', null);
    updateField('life', null);
    setError(null);
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
        {startMode === 'from-spd'
          ? "Upload the client's Summary Plan Description. We'll extract the plan design with AI."
          : 'Optional: drop in an SPD if you have one. Otherwise click Next to enter the plan design manually.'}
      </p>

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
            Upload a different SPD
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

      {!hasExtracted && !uploading && (
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

function Step3PlanDesign() {
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
      <SkeletonNote text="Plan-design editor lands in the next push, prefilled from the SPD extraction." />
    </div>
  );
}

function Step4Ancillary() {
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
        Configure Rx, dental, vision, and life coverage for this RFP.
      </p>
      <SkeletonNote text="Ancillary editor lands in the next push." />
    </div>
  );
}

function Step5Review({ data }: { data: WizardData }) {
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
        Review everything before saving the RFP as a draft.
      </p>

      <ReviewRow label="RFP name" value={data.rfpName || '—'} />
      <ReviewRow label="Plan year" value={String(data.planYear)} />
      <ReviewRow label="Effective date" value={data.effectiveDate} />
      <ReviewRow label="Census size" value={data.censusSize ? `${data.censusSize} members` : '—'} />
      <ReviewRow label="SPD" value={data.spdFilename || '— (none uploaded)'} />

      <div
        style={{
          marginTop: 24,
          padding: 14,
          background: '#fff8e6',
          border: '1px solid #f5e0a3',
          borderRadius: 8,
          fontSize: 13,
          color: '#665028',
        }}
      >
        Step 5 will show the full RFP summary once Steps 3–4 are wired up.
      </div>
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

function SkeletonNote({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: 24,
        background: '#faf7f2',
        border: '1px dashed #d4d4d4',
        borderRadius: 8,
        fontSize: 14,
        color: '#3a4d68',
        textAlign: 'center',
      }}
    >
      {text}
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