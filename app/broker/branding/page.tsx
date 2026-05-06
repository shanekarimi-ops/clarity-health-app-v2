'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';
import BrokerSidebar from '../../components/BrokerSidebar';

const DEFAULT_PRIMARY = '#1e3a5f'; // Clarity navy
const DEFAULT_ACCENT = '#7a9b76';  // Clarity sage

const HEX_RE = /^#([0-9A-Fa-f]{6})$/;

type AgencyBranding = {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
};

export default function BrandingPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth/user state
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [userId, setUserId] = useState('');

  // Branding state
  const [agency, setAgency] = useState<AgencyBranding | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [role, setRole] = useState<string>('broker');

  // Working copies (what's in the inputs right now)
  const [primaryHex, setPrimaryHex] = useState(DEFAULT_PRIMARY);
  const [accentHex, setAccentHex] = useState(DEFAULT_ACCENT);
  const [primaryError, setPrimaryError] = useState<string | null>(null);
  const [accentError, setAccentError] = useState<string | null>(null);

  // Async ops
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    setUserId(user.id);

    const meta = user.user_metadata || {};
    setFirstName(meta.first_name || '');
    setLastName(meta.last_name || '');

    await loadBranding(user.id);
    setLoading(false);
  }

  async function loadBranding(uid: string) {
    setError(null);
    try {
      const res = await fetch(`/api/agency/branding?userId=${encodeURIComponent(uid)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to load branding');
        return;
      }
      setAgency(data.agency);
      setCanEdit(!!data.canEdit);
      setRole(data.role || 'broker');
      setAgencyName(data.agency.name || '');
      setPrimaryHex(data.agency.primary_color || DEFAULT_PRIMARY);
      setAccentHex(data.agency.accent_color || DEFAULT_ACCENT);
    } catch (e: any) {
      setError(e?.message || 'Network error loading branding');
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  // ---- Color handling ----

  function isValidHex(v: string): boolean {
    return HEX_RE.test(v.trim());
  }

  function onPrimaryChange(value: string) {
    setPrimaryHex(value);
    setPrimaryError(isValidHex(value) ? null : 'Must be #RRGGBB');
  }

  function onAccentChange(value: string) {
    setAccentHex(value);
    setAccentError(isValidHex(value) ? null : 'Must be #RRGGBB');
  }

  function resetPrimary() {
    setPrimaryHex(DEFAULT_PRIMARY);
    setPrimaryError(null);
  }

  function resetAccent() {
    setAccentHex(DEFAULT_ACCENT);
    setAccentError(null);
  }

  const isDirty =
    !agency ||
    (agency.primary_color || DEFAULT_PRIMARY).toLowerCase() !== primaryHex.toLowerCase() ||
    (agency.accent_color || DEFAULT_ACCENT).toLowerCase() !== accentHex.toLowerCase();

  const canSave = canEdit && isDirty && !primaryError && !accentError && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/agency/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          primary_color: primaryHex,
          accent_color: accentHex,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to save');
        setSaving(false);
        return;
      }
      // Refresh from server so isDirty resets cleanly
      await loadBranding(userId);
      showToast('✅ Branding saved');
    } catch (e: any) {
      setError(e?.message || 'Network error saving branding');
    } finally {
      setSaving(false);
    }
  }

  // ---- Logo handling ----

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  function triggerLogoPicker() {
    if (!canEdit || uploading) return;
    fileInputRef.current?.click();
  }

  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so the same file can be re-selected after a removal
    if (e.target) e.target.value = '';
    if (!file) return;

    // Client-side guards (server enforces too)
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      setError('Logo must be PNG, JPEG, or SVG');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo file is too large (max 2 MB)');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const fd = new FormData();
      fd.append('userId', userId);
      fd.append('file', file);

      const res = await fetch('/api/agency/branding/logo', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to upload logo');
        setUploading(false);
        return;
      }
      await loadBranding(userId);
      showToast('✅ Logo uploaded');
    } catch (err: any) {
      setError(err?.message || 'Network error uploading logo');
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveLogo() {
    if (!canEdit || uploading) return;
    if (!agency?.logo_url) return;
    const ok = confirm('Remove the agency logo? PDFs will revert to the default Clarity Health header.');
    if (!ok) return;

    setError(null);
    setUploading(true);

    try {
      const res = await fetch('/api/agency/branding/logo', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to remove logo');
        setUploading(false);
        return;
      }
      await loadBranding(userId);
      showToast('✅ Logo removed');
    } catch (err: any) {
      setError(err?.message || 'Network error removing logo');
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, color: '#1e3a5f', fontFamily: 'Figtree, sans-serif' }}>
        Loading...
      </div>
    );
  }

  // Effective preview values — use what's in the inputs, falling back to defaults if empty/invalid
  const previewPrimary = isValidHex(primaryHex) ? primaryHex : DEFAULT_PRIMARY;
  const previewAccent = isValidHex(accentHex) ? accentHex : DEFAULT_ACCENT;

  return (
    <div className="dash-layout">
      <BrokerSidebar
        active="branding"
        firstName={firstName}
        lastName={lastName}
        agencyName={agencyName}
        onLogout={handleLogout}
      />

      <main className="dash-main">
        <div style={headerRow}>
          <div>
            <h1 style={pageTitle}>Agency Branding</h1>
            <p style={pageSubtitle}>
              Customize the logo and colors that appear on white-label PDF reports your clients see
            </p>
          </div>
        </div>

        {!canEdit && (
          <div style={readOnlyBanner}>
            <span style={{ fontSize: 18, marginRight: 10 }}>🔒</span>
            <strong>Read-only.</strong>
            <span style={{ marginLeft: 8 }}>
              Only Owners and Admins can edit branding. You're signed in as <strong>{role}</strong>.
            </span>
          </div>
        )}

        {error && (
          <div style={errorBanner}>
            <span style={{ fontSize: 16, marginRight: 8 }}>⚠️</span>
            {error}
            <button
              onClick={() => setError(null)}
              style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: '#a44', fontSize: 16 }}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {/* ===== LOGO SECTION ===== */}
        <div style={card}>
          <div style={cardHeader}>
            <h2 style={cardTitle}>Agency Logo</h2>
            <span style={cardHint}>PNG, JPEG, or SVG · max 2 MB</span>
          </div>
          <div style={cardBody}>
            <div style={logoPreviewWrap}>
              {agency?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={agency.logo_url}
                  alt="Current agency logo"
                  style={logoPreviewImg}
                />
              ) : (
                <div style={logoPlaceholder}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>🎨</div>
                  <div style={{ fontSize: 13, color: '#7a8a9b' }}>No logo yet</div>
                </div>
              )}
            </div>

            <div style={logoActions}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                onChange={handleLogoFile}
                style={{ display: 'none' }}
              />
              <button
                onClick={triggerLogoPicker}
                disabled={!canEdit || uploading}
                style={canEdit && !uploading ? primaryBtn : disabledBtn}
              >
                {uploading
                  ? '⏳ Uploading...'
                  : agency?.logo_url
                  ? '↻ Replace logo'
                  : '⬆ Upload logo'}
              </button>
              {agency?.logo_url && (
                <button
                  onClick={handleRemoveLogo}
                  disabled={!canEdit || uploading}
                  style={canEdit && !uploading ? secondaryDangerBtn : disabledBtn}
                >
                  🗑 Remove
                </button>
              )}
            </div>

            <div style={logoTip}>
              💡 For best results: clean PNG with transparent background, around 600×200px (3:1 ratio).
            </div>
          </div>
        </div>

        {/* ===== COLORS SECTION ===== */}
        <div style={card}>
          <div style={cardHeader}>
            <h2 style={cardTitle}>Brand Colors</h2>
            <span style={cardHint}>Used in PDF headers, accent bars, and table headers</span>
          </div>
          <div style={cardBody}>
            <ColorRow
              label="Primary color"
              hint="Used for PDF headings and primary accents"
              value={primaryHex}
              error={primaryError}
              defaultValue={DEFAULT_PRIMARY}
              isAtDefault={primaryHex.toLowerCase() === DEFAULT_PRIMARY.toLowerCase()}
              onChange={onPrimaryChange}
              onReset={resetPrimary}
              disabled={!canEdit}
            />
            <div style={{ height: 14 }} />
            <ColorRow
              label="Accent color"
              hint="Used for highlights, table header bars, and badges"
              value={accentHex}
              error={accentError}
              defaultValue={DEFAULT_ACCENT}
              isAtDefault={accentHex.toLowerCase() === DEFAULT_ACCENT.toLowerCase()}
              onChange={onAccentChange}
              onReset={resetAccent}
              disabled={!canEdit}
            />
          </div>
        </div>

        {/* ===== LIVE PREVIEW SECTION ===== */}
        <div style={card}>
          <div style={cardHeader}>
            <h2 style={cardTitle}>Live Preview</h2>
            <span style={cardHint}>What your clients will see at the top of every PDF</span>
          </div>
          <div style={cardBody}>
            <PdfHeaderPreview
              logoUrl={agency?.logo_url || null}
              agencyName={agencyName || 'Your Agency'}
              primary={previewPrimary}
              accent={previewAccent}
            />
            <div style={{ marginTop: 14, fontSize: 12, color: '#7a8a9b', fontStyle: 'italic' }}>
              Preview reflects unsaved changes. Click <strong>Save changes</strong> below to apply.
            </div>
          </div>
        </div>

        {/* ===== SAVE BAR ===== */}
        {canEdit && (
          <div style={saveBar}>
            <div style={{ fontSize: 13, color: '#3a4d68' }}>
              {isDirty ? (
                <span>📝 You have unsaved changes</span>
              ) : (
                <span style={{ color: '#7a9b76' }}>✓ All changes saved</span>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={!canSave}
              style={canSave ? primaryBtn : disabledBtn}
            >
              {saving ? '⏳ Saving...' : '💾 Save changes'}
            </button>
          </div>
        )}
      </main>

      {toast && (
        <div style={toastStyle}>{toast}</div>
      )}
    </div>
  );
}

// =====================================================
// SUBCOMPONENTS
// =====================================================

function ColorRow({
  label,
  hint,
  value,
  error,
  defaultValue,
  isAtDefault,
  onChange,
  onReset,
  disabled,
}: {
  label: string;
  hint: string;
  value: string;
  error: string | null;
  defaultValue: string;
  isAtDefault: boolean;
  onChange: (v: string) => void;
  onReset: () => void;
  disabled: boolean;
}) {
  // Native color picker requires #RRGGBB lowercase. If current value is invalid,
  // fall back to defaultValue so the picker still renders something.
  const safeValue = HEX_RE.test(value.trim()) ? value.trim().toLowerCase() : defaultValue;

  return (
    <div style={colorRow}>
      <div style={colorRowLeft}>
        <div style={colorLabel}>{label}</div>
        <div style={colorHint}>{hint}</div>
      </div>
      <div style={colorRowRight}>
        <input
          type="color"
          value={safeValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={colorPickerInput}
          aria-label={`${label} picker`}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={defaultValue}
          style={{
            ...hexTextInput,
            borderColor: error ? '#d97373' : '#d4dae2',
          }}
          aria-label={`${label} hex code`}
        />
        <button
          onClick={onReset}
          disabled={disabled || isAtDefault}
          style={(!disabled && !isAtDefault) ? linkBtn : linkBtnMuted}
          title="Reset to Clarity Health default"
        >
          Reset
        </button>
      </div>
      {error && (
        <div style={colorErrorText}>{error}</div>
      )}
    </div>
  );
}

function PdfHeaderPreview({
  logoUrl,
  agencyName,
  primary,
  accent,
}: {
  logoUrl: string | null;
  agencyName: string;
  primary: string;
  accent: string;
}) {
  return (
    <div style={previewOuter}>
      {/* Top accent bar */}
      <div style={{ height: 6, background: primary }} />

      {/* Header content */}
      <div style={previewInner}>
        <div style={previewLeft}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={agencyName} style={previewLogoImg} />
          ) : (
            <div style={{ ...previewLogoPlaceholder, color: primary }}>
              {agencyName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ ...previewAgencyName, color: primary }}>{agencyName}</div>
            <div style={previewSubtitle}>White-label report</div>
          </div>
        </div>

        <div style={{ ...previewBadge, background: accent }}>
          SAMPLE REPORT
        </div>
      </div>

      {/* Faux table header to show the accent color in action */}
      <div style={{ ...previewTableHeader, background: accent }}>
        <div style={{ flex: 2 }}>Plan</div>
        <div style={{ flex: 1 }}>Premium</div>
        <div style={{ flex: 1 }}>Match</div>
      </div>
      <div style={previewTableRow}>
        <div style={{ flex: 2, color: '#1e3a5f', fontWeight: 600 }}>Sample Plan A</div>
        <div style={{ flex: 1, color: '#3a4d68' }}>$348/mo</div>
        <div style={{ flex: 1, color: primary, fontWeight: 700 }}>92</div>
      </div>
      <div style={previewTableRow}>
        <div style={{ flex: 2, color: '#1e3a5f', fontWeight: 600 }}>Sample Plan B</div>
        <div style={{ flex: 1, color: '#3a4d68' }}>$412/mo</div>
        <div style={{ flex: 1, color: primary, fontWeight: 700 }}>87</div>
      </div>
    </div>
  );
}

// =====================================================
// STYLES
// =====================================================

const headerRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  marginBottom: 24,
  flexWrap: 'wrap',
  gap: 16,
};

const pageTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 36,
  color: '#1e3a5f',
  margin: 0,
  marginBottom: 4,
};

const pageSubtitle: React.CSSProperties = {
  fontFamily: 'Figtree, sans-serif',
  color: '#3a4d68',
  margin: 0,
  fontSize: 15,
};

const readOnlyBanner: React.CSSProperties = {
  background: '#fff8e8',
  border: '1px solid #e0c46a',
  color: '#7a6500',
  borderRadius: 10,
  padding: '12px 16px',
  fontFamily: 'Figtree, sans-serif',
  fontSize: 14,
  marginBottom: 20,
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
};

const errorBanner: React.CSSProperties = {
  background: '#fee',
  border: '1px solid #f8b4b4',
  color: '#a44',
  borderRadius: 10,
  padding: '12px 16px',
  fontFamily: 'Figtree, sans-serif',
  fontSize: 14,
  marginBottom: 20,
  display: 'flex',
  alignItems: 'center',
};

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  marginBottom: 18,
  fontFamily: 'Figtree, sans-serif',
  overflow: 'hidden',
};

const cardHeader: React.CSSProperties = {
  padding: '16px 22px',
  borderBottom: '1px solid #f0f3f7',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  flexWrap: 'wrap',
  gap: 8,
};

const cardTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 20,
  color: '#1e3a5f',
  margin: 0,
};

const cardHint: React.CSSProperties = {
  fontSize: 12,
  color: '#7a8a9b',
  fontStyle: 'italic',
};

const cardBody: React.CSSProperties = {
  padding: '20px 22px',
};

const logoPreviewWrap: React.CSSProperties = {
  background: '#faf7f2',
  border: '1px dashed #d4dae2',
  borderRadius: 10,
  padding: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 120,
  marginBottom: 14,
};

const logoPreviewImg: React.CSSProperties = {
  maxWidth: 280,
  maxHeight: 90,
  objectFit: 'contain',
};

const logoPlaceholder: React.CSSProperties = {
  textAlign: 'center',
};

const logoActions: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  marginBottom: 10,
};

const logoTip: React.CSSProperties = {
  fontSize: 12,
  color: '#7a8a9b',
  fontStyle: 'italic',
};

const colorRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 14,
};

const colorRowLeft: React.CSSProperties = {
  flex: '1 1 240px',
  minWidth: 200,
};

const colorRowRight: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
};

const colorLabel: React.CSSProperties = {
  fontSize: 14,
  color: '#1e3a5f',
  fontWeight: 600,
};

const colorHint: React.CSSProperties = {
  fontSize: 12,
  color: '#7a8a9b',
  marginTop: 2,
};

const colorErrorText: React.CSSProperties = {
  flexBasis: '100%',
  fontSize: 12,
  color: '#a44',
  marginTop: 4,
};

const colorPickerInput: React.CSSProperties = {
  width: 44,
  height: 36,
  border: '1px solid #d4dae2',
  borderRadius: 6,
  padding: 0,
  cursor: 'pointer',
  background: '#fff',
};

const hexTextInput: React.CSSProperties = {
  width: 110,
  padding: '8px 10px',
  border: '1px solid #d4dae2',
  borderRadius: 6,
  fontFamily: 'monospace',
  fontSize: 13,
  color: '#1e3a5f',
  textTransform: 'lowercase',
};

const linkBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#5b7a99',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
  padding: '4px 6px',
  textDecoration: 'underline',
};

const linkBtnMuted: React.CSSProperties = {
  ...linkBtn,
  color: '#c0c8d2',
  cursor: 'not-allowed',
  textDecoration: 'none',
};

const primaryBtn: React.CSSProperties = {
  background: '#7a9b76',
  color: '#fff',
  border: 'none',
  padding: '10px 18px',
  borderRadius: 6,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryDangerBtn: React.CSSProperties = {
  background: '#fff',
  color: '#a44',
  border: '1px solid #f0b4b4',
  padding: '10px 14px',
  borderRadius: 6,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const disabledBtn: React.CSSProperties = {
  background: '#e2e8f0',
  color: '#9ca3af',
  border: 'none',
  padding: '10px 18px',
  borderRadius: 6,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'not-allowed',
};

const saveBar: React.CSSProperties = {
  position: 'sticky',
  bottom: 0,
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: '14px 22px',
  marginTop: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 14,
  flexWrap: 'wrap',
  fontFamily: 'Figtree, sans-serif',
  boxShadow: '0 -2px 8px rgba(0,0,0,0.04)',
};

const previewOuter: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  overflow: 'hidden',
  fontFamily: 'Figtree, sans-serif',
};

const previewInner: React.CSSProperties = {
  padding: '18px 22px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 14,
  flexWrap: 'wrap',
};

const previewLeft: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
};

const previewLogoImg: React.CSSProperties = {
  maxWidth: 140,
  maxHeight: 50,
  objectFit: 'contain',
};

const previewLogoPlaceholder: React.CSSProperties = {
  width: 50,
  height: 50,
  borderRadius: 8,
  background: '#faf7f2',
  border: '1px solid #e2e8f0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'Playfair Display, serif',
  fontSize: 24,
  fontWeight: 700,
};

const previewAgencyName: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 20,
  fontWeight: 700,
  marginBottom: 2,
};

const previewSubtitle: React.CSSProperties = {
  fontSize: 12,
  color: '#7a8a9b',
};

const previewBadge: React.CSSProperties = {
  color: '#fff',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.5,
  padding: '5px 12px',
  borderRadius: 999,
};

const previewTableHeader: React.CSSProperties = {
  display: 'flex',
  padding: '8px 22px',
  color: '#fff',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
};

const previewTableRow: React.CSSProperties = {
  display: 'flex',
  padding: '10px 22px',
  fontSize: 13,
  borderTop: '1px solid #f0f3f7',
};

const toastStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 24,
  right: 24,
  background: '#1e3a5f',
  color: '#fff',
  padding: '12px 18px',
  borderRadius: 8,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 14,
  fontWeight: 600,
  boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
  zIndex: 1100,
};