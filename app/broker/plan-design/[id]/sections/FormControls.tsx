'use client';

import React from 'react';

// ============================================
// Field group (label + helper + control)
// ============================================
export function Field({
  label,
  helper,
  required,
  children,
  width,
}: {
  label: string;
  helper?: string;
  required?: boolean;
  children: React.ReactNode;
  width?: 'full' | 'half' | 'third' | 'quarter';
}) {
  const widthStyle: React.CSSProperties = {
    full: { gridColumn: '1 / -1' },
    half: { gridColumn: 'span 6' },
    third: { gridColumn: 'span 4' },
    quarter: { gridColumn: 'span 3' },
  }[width || 'full'];

  return (
    <div style={{ ...fieldWrap, ...widthStyle }}>
      <label style={fieldLabel}>
        {label}
        {required && <span style={{ color: '#dc2626', marginLeft: 4 }}>*</span>}
      </label>
      {children}
      {helper && <div style={fieldHelper}>{helper}</div>}
    </div>
  );
}

// ============================================
// Text input
// ============================================
export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  prefix,
  suffix,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'number' | 'date';
  prefix?: string;
  suffix?: string;
}) {
  if (prefix || suffix) {
    return (
      <div style={inputWithAffix}>
        {prefix && <span style={affix}>{prefix}</span>}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...textInput, border: 'none', boxShadow: 'none', flex: 1, paddingLeft: prefix ? 4 : 12, paddingRight: suffix ? 4 : 12 }}
        />
        {suffix && <span style={affix}>{suffix}</span>}
      </div>
    );
  }
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={textInput}
    />
  );
}

// ============================================
// Number input with $ prefix
// ============================================
export function MoneyInput({
  value,
  onChange,
  placeholder,
}: {
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const display = value === null || value === undefined ? '' : String(value);
  return <TextInput value={display} onChange={onChange} placeholder={placeholder} type="number" prefix="$" />;
}

// ============================================
// Percent input
// ============================================
export function PercentInput({
  value,
  onChange,
  placeholder,
}: {
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const display = value === null || value === undefined ? '' : String(value);
  return <TextInput value={display} onChange={onChange} placeholder={placeholder} type="number" suffix="%" />;
}

// ============================================
// Select / dropdown
// ============================================
export function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)} style={selectInput}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ============================================
// Textarea
// ============================================
export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={textareaInput}
    />
  );
}

// ============================================
// Toggle / checkbox
// ============================================
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label style={toggleWrap}>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={e => onChange(e.target.checked)}
        style={{ marginRight: 8, accentColor: '#7a9b76', width: 16, height: 16 }}
      />
      <span style={{ fontSize: 14, color: '#1e3a5f', fontFamily: 'Figtree, sans-serif' }}>{label}</span>
    </label>
  );
}

// ============================================
// Radio group
// ============================================
export function RadioGroup({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; helper?: string }[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map(o => (
        <label key={o.value} style={radioOption}>
          <input
            type="radio"
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            style={{ marginRight: 10, accentColor: '#1e3a5f', marginTop: 2 }}
          />
          <span>
            <span style={{ fontSize: 14, color: '#1e3a5f', fontWeight: 600, fontFamily: 'Figtree, sans-serif' }}>
              {o.label}
            </span>
            {o.helper && (
              <span style={{ display: 'block', fontSize: 12, color: '#3a4d68', marginTop: 2, fontFamily: 'Figtree, sans-serif' }}>
                {o.helper}
              </span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}

// ============================================
// Section subheading
// ============================================
export function SubHeading({ title, helper }: { title: string; helper?: string }) {
  return (
    <div style={{ gridColumn: '1 / -1', marginTop: 12, marginBottom: -4 }}>
      <h3 style={{
        fontFamily: 'Playfair Display, serif',
        fontSize: 16,
        color: '#1e3a5f',
        margin: '0 0 4px',
      }}>
        {title}
      </h3>
      {helper && (
        <p style={{
          fontFamily: 'Figtree, sans-serif',
          fontSize: 12,
          color: '#3a4d68',
          margin: 0,
          lineHeight: 1.4,
        }}>
          {helper}
        </p>
      )}
    </div>
  );
}

// ============================================
// Form grid container
// ============================================
export function FormGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(12, 1fr)',
      gap: 16,
    }}>
      {children}
    </div>
  );
}

// ============================================
// Info / warning callout
// ============================================
export function Callout({
  children,
  variant = 'info',
}: {
  children: React.ReactNode;
  variant?: 'info' | 'warning' | 'success';
}) {
  const colors = {
    info:    { bg: '#f0f7fa', border: '#bae6e6', text: '#0e7490' },
    warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
    success: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
  }[variant];

  return (
    <div style={{
      gridColumn: '1 / -1',
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: 8,
      padding: '10px 14px',
      fontSize: 13,
      color: colors.text,
      fontFamily: 'Figtree, sans-serif',
      lineHeight: 1.5,
    }}>
      {children}
    </div>
  );
}

// ============================================
// Styles
// ============================================
const fieldWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const fieldLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#1e3a5f',
  fontFamily: 'Figtree, sans-serif',
};

const fieldHelper: React.CSSProperties = {
  fontSize: 11,
  color: '#94a3b8',
  fontFamily: 'Figtree, sans-serif',
  lineHeight: 1.4,
};

const textInput: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #cbd5e0',
  borderRadius: 6,
  fontSize: 14,
  fontFamily: 'Figtree, sans-serif',
  color: '#1e3a5f',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
};

const inputWithAffix: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  border: '1px solid #cbd5e0',
  borderRadius: 6,
  background: '#fff',
  overflow: 'hidden',
};

const affix: React.CSSProperties = {
  padding: '0 10px',
  fontSize: 14,
  color: '#94a3b8',
  fontFamily: 'Figtree, sans-serif',
  background: '#f8fafc',
  alignSelf: 'stretch',
  display: 'flex',
  alignItems: 'center',
};

const selectInput: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #cbd5e0',
  borderRadius: 6,
  fontSize: 14,
  fontFamily: 'Figtree, sans-serif',
  color: '#1e3a5f',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
  cursor: 'pointer',
};

const textareaInput: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #cbd5e0',
  borderRadius: 6,
  fontSize: 14,
  fontFamily: 'Figtree, sans-serif',
  color: '#1e3a5f',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
  resize: 'vertical',
  minHeight: 60,
};

const toggleWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
  padding: '8px 0',
};

const radioOption: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  cursor: 'pointer',
  padding: '8px 12px',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  background: '#fff',
};