'use client';

import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { supabase } from '../supabase';

// ============= TYPES =============

type FieldKey =
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'date_of_birth'
  | 'age'
  | 'gender'
  | 'relationship'
  | 'salary_amount'
  | 'tier'
  | 'zip_code'
  | 'state'
  | 'coverage_type'
  | 'current_plan'
  | 'ignore';

type FieldDef = {
  key: FieldKey;
  label: string;
  aliases: string[]; // case-insensitive substrings used for auto-detect
};

type ParsedRow = Record<string, string>;

type CensusUploadProps = {
  groupId: string;
  agencyId: string;
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
};

// ============= FIELD DEFINITIONS =============

const FIELD_DEFS: FieldDef[] = [
  { key: 'first_name', label: 'First Name', aliases: ['first name', 'firstname', 'first_name', 'fname', 'given name', 'givenname'] },
  { key: 'last_name', label: 'Last Name', aliases: ['last name', 'lastname', 'last_name', 'lname', 'surname', 'family name'] },
  { key: 'email', label: 'Email', aliases: ['email', 'e-mail', 'email address', 'mail'] },
  { key: 'date_of_birth', label: 'Date of Birth', aliases: ['date of birth', 'dob', 'birthdate', 'birth date', 'birthday', 'date_of_birth'] },
  { key: 'age', label: 'Age', aliases: ['age', 'years old'] },
  { key: 'gender', label: 'Gender', aliases: ['gender', 'sex', 'm/f'] },
  { key: 'relationship', label: 'Relationship', aliases: ['relationship', 'relation', 'role', 'type', 'member type'] },
  { key: 'salary_amount', label: 'Salary', aliases: ['salary', 'annual salary', 'compensation', 'pay', 'wage', 'income', 'earnings'] },
  { key: 'tier', label: 'Coverage Tier', aliases: ['tier', 'coverage tier', 'enrollment tier', 'tier level'] },
  { key: 'zip_code', label: 'Zip Code', aliases: ['zip', 'zip code', 'zipcode', 'postal code', 'postal'] },
  { key: 'state', label: 'State', aliases: ['state', 'st', 'state code', 'province'] },
  { key: 'coverage_type', label: 'Coverage Type', aliases: ['coverage type', 'plan type', 'coverage', 'medical type'] },
  { key: 'current_plan', label: 'Current Plan', aliases: ['current plan', 'plan', 'plan name', 'current coverage'] },
];

const FIELD_LABEL_MAP: Record<FieldKey, string> = FIELD_DEFS.reduce(
  (acc, f) => ({ ...acc, [f.key]: f.label }),
  { ignore: 'Ignore this column' } as Record<FieldKey, string>,
);

// ============= AUTO-DETECT =============

function autoDetectField(header: string): FieldKey {
    const normalized = header.toLowerCase().trim().replace(/[_\-\.]/g, ' ');
  
    // Pass 1: exact-match aliases (highest priority)
    for (const def of FIELD_DEFS) {
      for (const alias of def.aliases) {
        if (normalized === alias) return def.key;
      }
    }
  
    // Pass 2: word-boundary substring match (avoids "age" matching inside "coverage type")
    for (const def of FIELD_DEFS) {
      for (const alias of def.aliases) {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wordBoundaryRe = new RegExp(`\\b${escaped}\\b`);
        if (wordBoundaryRe.test(normalized)) return def.key;
      }
    }
  
    return 'ignore';
  }

// ============= COMPONENT =============

export default function CensusUpload({ groupId, agencyId, userId, onClose, onSuccess }: CensusUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'select' | 'review' | 'uploading'>('select');
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, FieldKey>>({});
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  function handleFileSelected(f: File) {
    setError('');
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a CSV file. Excel support is coming in a future push.');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('File is too large. Please keep census files under 10MB.');
      return;
    }
    setFile(f);

    Papa.parse<ParsedRow>(f, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false, // keep everything as strings; we coerce ourselves
      complete: (results) => {
        if (results.errors && results.errors.length > 0 && results.errors[0].type === 'Delimiter') {
          setError('Could not parse this CSV. Check that it uses commas as delimiters.');
          return;
        }
        const fields = results.meta.fields || [];
        if (fields.length === 0) {
          setError('Could not find any columns in this file. Make sure the first row is column headers.');
          return;
        }
        if (results.data.length === 0) {
          setError('This file has headers but no data rows.');
          return;
        }
        setHeaders(fields);
        setRows(results.data);
        // Auto-detect mappings
        const detected: Record<string, FieldKey> = {};
        const used = new Set<FieldKey>();
        for (const h of fields) {
          const candidate = autoDetectField(h);
          // Don't auto-assign the same field twice
          if (candidate !== 'ignore' && !used.has(candidate)) {
            detected[h] = candidate;
            used.add(candidate);
          } else {
            detected[h] = 'ignore';
          }
        }
        setMapping(detected);
        setStep('review');
      },
      error: (err) => {
        setError(`Parse error: ${err.message}`);
      },
    });
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFileSelected(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelected(f);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function setMappingFor(header: string, field: FieldKey) {
    setMapping((m) => ({ ...m, [header]: field }));
  }

  // ============= COERCION HELPERS =============

  function coerceDate(s: string): string | null {
    if (!s) return null;
    const trimmed = s.trim();
    if (!trimmed) return null;
    // Try Date parsing
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return null;
    // Return YYYY-MM-DD
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${dy}`;
  }

  function coerceAge(s: string, dob: string | null): number | null {
    if (s) {
      const n = parseInt(s.trim(), 10);
      if (!isNaN(n) && n > 0 && n < 130) return n;
    }
    // Calculate from DOB if available
    if (dob) {
      const d = new Date(dob);
      if (!isNaN(d.getTime())) {
        const today = new Date();
        let age = today.getFullYear() - d.getFullYear();
        const m = today.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
        return age;
      }
    }
    return null;
  }

  function coerceSalary(s: string): number | null {
    if (!s) return null;
    // Strip $ , spaces
    const clean = s.replace(/[\$,\s]/g, '');
    const n = parseFloat(clean);
    return isNaN(n) ? null : n;
  }

  function coerceText(s: string): string | null {
    if (!s) return null;
    const t = s.trim();
    return t || null;
  }

  // ============= UPLOAD =============

  async function handleConfirmUpload() {
    if (!file) return;
    setStep('uploading');
    setError('');

    try {
      // 1. Upload file to Supabase Storage
      setProgress('Uploading file...');
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${agencyId}/${groupId}/${timestamp}-${safeName}`;

      const { error: storageError } = await supabase.storage
        .from('census-uploads')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'text/csv',
        });

      if (storageError) {
        throw new Error(`Upload failed: ${storageError.message}`);
      }

      // 2. Create census_uploads row
      setProgress('Saving upload record...');
      const { data: uploadRow, error: uploadInsertError } = await supabase
        .from('census_uploads')
        .insert({
          group_id: groupId,
          agency_id: agencyId,
          uploaded_by_user_id: userId,
          file_path: filePath,
          original_filename: file.name,
          file_size_bytes: file.size,
          row_count: rows.length,
          parse_status: 'parsed',
          column_mapping: mapping,
        })
        .select()
        .single();

      if (uploadInsertError || !uploadRow) {
        throw new Error(`Could not save upload metadata: ${uploadInsertError?.message || 'unknown'}`);
      }

      // 3. Wipe existing members for this group (replace, not append)
      setProgress('Clearing previous members...');
      await supabase.from('group_members').delete().eq('group_id', groupId);

      // 4. Build member rows from CSV using the mapping
      setProgress(`Parsing ${rows.length} members...`);
      const memberRows: any[] = [];

      // Reverse map: which header goes to which field?
      const fieldToHeader: Partial<Record<FieldKey, string>> = {};
      for (const [hdr, fld] of Object.entries(mapping)) {
        if (fld !== 'ignore') fieldToHeader[fld] = hdr;
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const dob = coerceDate(fieldToHeader.date_of_birth ? row[fieldToHeader.date_of_birth] : '');
        const ageRaw = fieldToHeader.age ? row[fieldToHeader.age] : '';
        memberRows.push({
          group_id: groupId,
          agency_id: agencyId,
          census_upload_id: uploadRow.id,
          first_name: coerceText(fieldToHeader.first_name ? row[fieldToHeader.first_name] : ''),
          last_name: coerceText(fieldToHeader.last_name ? row[fieldToHeader.last_name] : ''),
          email: coerceText(fieldToHeader.email ? row[fieldToHeader.email] : ''),
          date_of_birth: dob,
          age: coerceAge(ageRaw, dob),
          gender: coerceText(fieldToHeader.gender ? row[fieldToHeader.gender] : ''),
          relationship: coerceText(fieldToHeader.relationship ? row[fieldToHeader.relationship] : ''),
          salary_amount: coerceSalary(fieldToHeader.salary_amount ? row[fieldToHeader.salary_amount] : ''),
          tier: coerceText(fieldToHeader.tier ? row[fieldToHeader.tier] : ''),
          zip_code: coerceText(fieldToHeader.zip_code ? row[fieldToHeader.zip_code] : ''),
          state: coerceText(fieldToHeader.state ? row[fieldToHeader.state] : ''),
          coverage_type: coerceText(fieldToHeader.coverage_type ? row[fieldToHeader.coverage_type] : ''),
          current_plan: coerceText(fieldToHeader.current_plan ? row[fieldToHeader.current_plan] : ''),
          row_index: i,
        });
      }

      // 5. Insert members in batches of 500 (Supabase row limit per insert)
      setProgress(`Saving ${memberRows.length} members...`);
      const batchSize = 500;
      for (let i = 0; i < memberRows.length; i += batchSize) {
        const batch = memberRows.slice(i, i + batchSize);
        const { error: memberError } = await supabase.from('group_members').insert(batch);
        if (memberError) {
          throw new Error(`Failed to save members at batch ${i}: ${memberError.message}`);
        }
      }

      // 6. Update group's member_count
      setProgress('Updating group...');
      await supabase
        .from('groups')
        .update({ member_count: memberRows.length })
        .eq('id', groupId);

      // 7. Activity log entry
      await supabase.from('activity_log').insert({
        agency_id: agencyId,
        actor_user_id: userId,
        event_type: 'census_uploaded',
        event_summary: `Uploaded census with ${memberRows.length} members`,
        metadata: {
          group_id: groupId,
          row_count: memberRows.length,
          filename: file.name,
        },
      });

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Upload failed.');
      setStep('review'); // Allow user to go back and try again
    }
  }

  // ============= RENDER =============

  return (
    <div style={modalOverlay} onClick={() => step !== 'uploading' && onClose()}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeader}>
          <h2 style={modalTitle}>Upload Census</h2>
          {step !== 'uploading' && (
            <button style={closeBtn} onClick={onClose}>×</button>
          )}
        </div>

        {/* STEP 1: SELECT FILE */}
        {step === 'select' && (
          <>
            <p style={modalSubtitle}>
              Upload a CSV file containing your group's member roster. We'll detect the columns and let you confirm before saving.
            </p>

            <div
              style={{
                ...dropZone,
                ...(isDragging ? dropZoneActive : {}),
              }}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div style={{ fontSize: 48, marginBottom: 8 }}>📄</div>
              <strong style={{ color: '#1e3a5f', fontSize: 16 }}>
                Drop your CSV file here
              </strong>
              <p style={{ color: '#7a8a9b', fontSize: 13, margin: '8px 0 0' }}>
                or click to browse
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={handleFileInput}
              />
            </div>

            <p style={hintText}>
              💡 Headers in the first row work best. Common columns auto-detected: name, DOB, salary, zip, etc.
            </p>

            {error && <div style={errorBox}>{error}</div>}
          </>
        )}

        {/* STEP 2: REVIEW MAPPING */}
        {step === 'review' && (
          <>
            <p style={modalSubtitle}>
              Found <strong>{rows.length} rows</strong> in <strong>{file?.name}</strong>. Confirm the column mapping below — we auto-detected what we could.
            </p>

            <div style={mappingTable}>
              <div style={mappingHeaderRow}>
                <div style={mappingHeaderCell}>CSV Column</div>
                <div style={mappingHeaderCell}>Sample</div>
                <div style={mappingHeaderCell}>Maps To</div>
              </div>
              {headers.map((h) => {
                const sample = rows[0]?.[h] || '';
                const sample2 = rows[1]?.[h] || '';
                return (
                  <div key={h} style={mappingRow}>
                    <div style={mappingCell}>
                      <strong style={{ color: '#1e3a5f' }}>{h}</strong>
                    </div>
                    <div style={{ ...mappingCell, color: '#7a8a9b', fontSize: 12 }}>
                      {sample && <div>{sample}</div>}
                      {sample2 && <div style={{ marginTop: 2 }}>{sample2}</div>}
                    </div>
                    <div style={mappingCell}>
                      <select
                        value={mapping[h] || 'ignore'}
                        onChange={(e) => setMappingFor(h, e.target.value as FieldKey)}
                        style={selectInput}
                      >
                        <option value="ignore">— Ignore —</option>
                        {FIELD_DEFS.map((f) => (
                          <option key={f.key} value={f.key}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>

            <p style={warningBox}>
              ⚠️ Uploading will <strong>replace</strong> any existing census for this group.
            </p>

            {error && <div style={errorBox}>{error}</div>}

            <div style={modalFooter}>
              <button style={secondaryBtn} onClick={() => { setStep('select'); setFile(null); }}>
                ← Back
              </button>
              <button style={primaryBtn} onClick={handleConfirmUpload}>
                Confirm & Upload
              </button>
            </div>
          </>
        )}

        {/* STEP 3: UPLOADING */}
        {step === 'uploading' && (
          <>
            <div style={uploadingBox}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
              <strong style={{ color: '#1e3a5f', fontSize: 16 }}>Uploading census...</strong>
              <p style={{ color: '#3a4d68', fontSize: 14, margin: '8px 0 0' }}>
                {progress || 'Working...'}
              </p>
              <p style={{ color: '#7a8a9b', fontSize: 12, marginTop: 16 }}>
                Please don't close this window.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============= STYLES =============

const modalOverlay: React.CSSProperties = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(30, 58, 95, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
  padding: 20,
};

const modalCard: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 28,
  maxWidth: 760,
  width: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
  fontFamily: 'Figtree, sans-serif',
};

const modalHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 8,
};

const modalTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  color: '#1e3a5f',
  fontSize: 24,
  margin: 0,
};

const closeBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 28,
  color: '#7a8a9b',
  cursor: 'pointer',
  padding: 0,
  lineHeight: 1,
};

const modalSubtitle: React.CSSProperties = {
  color: '#3a4d68',
  fontSize: 14,
  lineHeight: 1.5,
  margin: '0 0 20px',
};

const dropZone: React.CSSProperties = {
  border: '2px dashed #cbd5e0',
  borderRadius: 12,
  padding: 50,
  textAlign: 'center',
  cursor: 'pointer',
  background: '#faf7f2',
  transition: 'all 0.15s ease',
};

const dropZoneActive: React.CSSProperties = {
  borderColor: '#7a9b76',
  background: '#f0f5ee',
};

const hintText: React.CSSProperties = {
  color: '#7a8a9b',
  fontSize: 12,
  margin: '12px 0 0',
  textAlign: 'center',
};

const mappingTable: React.CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  overflow: 'hidden',
  marginBottom: 16,
};

const mappingHeaderRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.2fr 1.5fr 1.3fr',
  background: '#eef1f4',
  padding: '10px 14px',
  borderBottom: '1px solid #e2e8f0',
};

const mappingHeaderCell: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#3a4d68',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

const mappingRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.2fr 1.5fr 1.3fr',
  padding: '12px 14px',
  borderBottom: '1px solid #eef1f4',
  alignItems: 'center',
  fontSize: 13,
};

const mappingCell: React.CSSProperties = {
  paddingRight: 10,
};

const selectInput: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #cbd5e0',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'Figtree, sans-serif',
  color: '#1e3a5f',
  background: '#fff',
  cursor: 'pointer',
};

const warningBox: React.CSSProperties = {
  background: '#fef3e6',
  border: '1px solid #f0d4a0',
  color: '#a06d2a',
  padding: '10px 14px',
  borderRadius: 6,
  fontSize: 13,
  margin: '0 0 16px',
};

const errorBox: React.CSSProperties = {
  background: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#991b1b',
  padding: '10px 12px',
  borderRadius: 6,
  fontSize: 13,
  marginTop: 12,
};

const uploadingBox: React.CSSProperties = {
  textAlign: 'center',
  padding: '40px 20px',
};

const modalFooter: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  marginTop: 8,
};

const primaryBtn: React.CSSProperties = {
  background: '#7a9b76',
  color: '#fff',
  border: 'none',
  padding: '12px 22px',
  borderRadius: 8,
  fontFamily: 'Figtree, sans-serif',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  background: '#fff',
  color: '#3a4d68',
  border: '1px solid #cbd5e0',
  padding: '12px 22px',
  borderRadius: 8,
  fontFamily: 'Figtree, sans-serif',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
};