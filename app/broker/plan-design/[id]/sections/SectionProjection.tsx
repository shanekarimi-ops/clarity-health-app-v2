'use client';

import React, { useState } from 'react';
import { supabase } from '../../../../supabase';

type Projection = {
  summary?: {
    headline?: string;
    totalAnnualCost?: number;
    totalAnnualCostBest?: number;
    totalAnnualCostWorst?: number;
    pmpm?: number;
    comparedToFullyInsured?: string;
  };
  expectedClaims?: {
    medicalClaims?: number;
    rxClaims?: number;
    totalExpectedClaims?: number;
    claimsPmpm?: number;
  };
  fixedCosts?: {
    tpaAdmin?: number;
    stopLossPremium?: number;
    pbmAdmin?: number;
    ancillaryAndOther?: number;
    totalFixed?: number;
    fixedPmpm?: number;
  };
  maxLiability?: {
    amount?: number;
    explanation?: string;
  };
  assumptions?: string[];
  sensitivityFlags?: { field: string; impact: string }[];
  recommendations?: { title: string; rationale: string; estimatedImpact: string }[];
  confidenceLevel?: 'high' | 'medium' | 'low';
  confidenceExplanation?: string;
};

export default function SectionProjection({
  designId,
  projection,
  generatedAt,
  onProjectionGenerated,
}: {
  designId: string;
  projection: Projection | null;
  generatedAt: string | null;
  onProjectionGenerated: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState<string[]>([]);

  async function handleRunProjection() {
    setRunning(true);
    setError('');
    setMissing([]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Not authenticated. Please log in again.');
        setRunning(false);
        return;
      }

      const res = await fetch(`/api/plan-designs/${designId}/project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: session.access_token }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.missing && Array.isArray(json.missing)) {
          setMissing(json.missing);
          setError(json.detail || 'Plan design incomplete');
        } else {
          setError(json?.error || json?.detail || 'Failed to generate projection');
        }
        setRunning(false);
        return;
      }

      // Trigger reload of the parent's plan design
      onProjectionGenerated();
      setRunning(false);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Unexpected error');
      setRunning(false);
    }
  }

  // ============================================
  // Loading state
  // ============================================
  if (running) {
    return (
      <div style={loadingCard}>
        <div style={spinnerStyle}>⏳</div>
        <h3 style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, color: '#1e3a5f', margin: '12px 0 6px' }}>
          Generating cost projection...
        </h3>
        <p style={{ color: '#3a4d68', fontSize: 13, lineHeight: 1.5, margin: '0 auto', maxWidth: 480 }}>
          Claude is analyzing your full plan design and building a cost projection. This usually takes 15-30 seconds.
        </p>
      </div>
    );
  }

  // ============================================
  // Empty state — no projection yet
  // ============================================
  if (!projection) {
    return (
      <div>
        <div style={emptyCard}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
          <h3 style={{ fontFamily: 'Playfair Display, serif', fontSize: 24, color: '#1e3a5f', margin: '0 0 10px' }}>
            Generate a cost projection
          </h3>
          <p style={{ color: '#3a4d68', fontSize: 14, lineHeight: 1.6, margin: '0 auto 24px', maxWidth: 540 }}>
            Once you&apos;ve filled in the core sections of your plan design, our AI can project the expected total annual cost,
            per-member-per-month breakdown, fixed costs, and maximum liability — with a confidence band and design recommendations.
          </p>
          <button onClick={handleRunProjection} style={primaryBtnLarge}>
            Generate cost projection →
          </button>
        </div>

        {error && (
          <div style={errorCard}>
            <strong>Error:</strong> {error}
            {missing.length > 0 && (
              <>
                <div style={{ marginTop: 10, marginBottom: 6, fontWeight: 600 }}>Missing required fields:</div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {missing.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // ============================================
  // Results state
  // ============================================
  const summary = projection.summary || {};
  const claims = projection.expectedClaims || {};
  const fixed = projection.fixedCosts || {};
  const maxLiability = projection.maxLiability || {};
  const assumptions = projection.assumptions || [];
  const sensitivities = projection.sensitivityFlags || [];
  const recommendations = projection.recommendations || [];
  const confidence = projection.confidenceLevel || 'medium';
  const confidenceColor =
    confidence === 'high' ? '#7a9b76' :
    confidence === 'low' ? '#dc2626' : '#d97706';

  return (
    <div>
      {/* Header strip */}
      <div style={headerStrip}>
        <div>
          <div style={{ fontSize: 11, color: '#7a9b76', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            AI projection
          </div>
          <h3 style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, color: '#1e3a5f', margin: '4px 0 0' }}>
            {summary.headline || 'Cost projection'}
          </h3>
          {generatedAt && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              Last generated {new Date(generatedAt).toLocaleString()}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ ...confidencePill, background: confidenceColor + '15', color: confidenceColor }}>
            {confidence.toUpperCase()} CONFIDENCE
          </span>
          <button onClick={handleRunProjection} style={secondaryBtn}>
            ↻ Re-run
          </button>
        </div>
      </div>

      {/* Top-line summary cards */}
      <div style={summaryGrid}>
        <SummaryCard
          label="Total annual cost"
          value={fmtMoney(summary.totalAnnualCost)}
          sub={`${fmtMoney(summary.pmpm)} PMPM`}
          highlight
        />
        <SummaryCard
          label="Best case"
          value={fmtMoney(summary.totalAnnualCostBest)}
          sub="~10-15% under expected"
        />
        <SummaryCard
          label="Worst case"
          value={fmtMoney(summary.totalAnnualCostWorst)}
          sub="bad-claims year"
        />
        <SummaryCard
          label="Max liability"
          value={fmtMoney(maxLiability.amount)}
          sub="if aggregate stop-loss hits"
        />
      </div>

      {/* Comparison */}
      {summary.comparedToFullyInsured && (
        <div style={compareBanner}>
          <strong>vs. fully-insured:</strong> {summary.comparedToFullyInsured}
        </div>
      )}

      {/* Expected claims breakdown */}
      <div style={twoColRow}>
        <div style={breakdownCard}>
          <h4 style={breakdownTitle}>Expected claims</h4>
          <BreakdownRow label="Medical claims" value={fmtMoney(claims.medicalClaims)} />
          <BreakdownRow label="Rx claims" value={fmtMoney(claims.rxClaims)} />
          <BreakdownRow label="Total expected claims" value={fmtMoney(claims.totalExpectedClaims)} bold />
          <BreakdownRow label="Claims PMPM" value={fmtMoney(claims.claimsPmpm)} small />
        </div>

        <div style={breakdownCard}>
          <h4 style={breakdownTitle}>Fixed costs</h4>
          <BreakdownRow label="TPA admin" value={fmtMoney(fixed.tpaAdmin)} />
          <BreakdownRow label="Stop-loss premium" value={fmtMoney(fixed.stopLossPremium)} />
          <BreakdownRow label="PBM admin" value={fmtMoney(fixed.pbmAdmin)} />
          <BreakdownRow label="Ancillary & other" value={fmtMoney(fixed.ancillaryAndOther)} />
          <BreakdownRow label="Total fixed" value={fmtMoney(fixed.totalFixed)} bold />
          <BreakdownRow label="Fixed PMPM" value={fmtMoney(fixed.fixedPmpm)} small />
        </div>
      </div>

      {/* Max liability explanation */}
      {maxLiability.explanation && (
        <div style={infoCard}>
          <div style={infoCardLabel}>About max liability</div>
          <p style={infoCardText}>{maxLiability.explanation}</p>
        </div>
      )}

      {/* Assumptions */}
      {assumptions.length > 0 && (
        <div style={assumptionsCard}>
          <h4 style={assumptionsTitle}>Key assumptions</h4>
          <ul style={assumptionsList}>
            {assumptions.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}

      {/* Sensitivity flags */}
      {sensitivities.length > 0 && (
        <div style={sensitivityCard}>
          <h4 style={sensitivityTitle}>Sensitivity flags</h4>
          <p style={{ fontSize: 12, color: '#3a4d68', margin: '0 0 12px', lineHeight: 1.5 }}>
            Fields that, if changed, would materially shift this projection.
          </p>
          {sensitivities.map((s, i) => (
            <div key={i} style={sensitivityRow}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#1e3a5f' }}>{s.field}</div>
              <div style={{ fontSize: 12, color: '#3a4d68', marginTop: 2 }}>{s.impact}</div>
            </div>
          ))}
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div style={recommendationsCard}>
          <h4 style={recommendationsTitle}>Design recommendations</h4>
          <p style={{ fontSize: 12, color: '#3a4d68', margin: '0 0 14px', lineHeight: 1.5 }}>
            Concrete suggestions to improve this design.
          </p>
          {recommendations.map((r, i) => (
            <div key={i} style={recommendationRow}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#1e3a5f' }}>{r.title}</div>
                <div style={{ fontSize: 11, color: '#7a9b76', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.estimatedImpact}</div>
              </div>
              <div style={{ fontSize: 13, color: '#3a4d68', lineHeight: 1.5 }}>{r.rationale}</div>
            </div>
          ))}
        </div>
      )}

      {/* Confidence explanation */}
      {projection.confidenceExplanation && (
        <div style={confidenceCard}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ ...confidencePill, background: confidenceColor + '15', color: confidenceColor }}>
              {confidence.toUpperCase()}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1e3a5f' }}>
              Confidence in this projection
            </span>
          </div>
          <p style={{ fontSize: 13, color: '#3a4d68', margin: 0, lineHeight: 1.5 }}>
            {projection.confidenceExplanation}
          </p>
        </div>
      )}

      {/* Footnote */}
      <div style={footnote}>
        ⚠️ This is an AI-generated estimate, not a certified actuarial projection. Final pricing should be validated
        with a licensed actuary and stop-loss carrier quotes.
      </div>

      {error && (
        <div style={{ ...errorCard, marginTop: 16 }}>
          <strong>Re-run error:</strong> {error}
        </div>
      )}
    </div>
  );
}

// ============================================
// Sub-components
// ============================================
function SummaryCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div style={{
      background: highlight ? '#1e3a5f' : '#fff',
      color: highlight ? '#fff' : '#1e3a5f',
      border: highlight ? 'none' : '1px solid #e2e8f0',
      borderRadius: 10,
      padding: 18,
      fontFamily: 'Figtree, sans-serif',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, opacity: highlight ? 0.8 : 0.6, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 26, fontWeight: 600, lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, opacity: highlight ? 0.7 : 0.55, marginTop: 6 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  bold,
  small,
}: {
  label: string;
  value: string;
  bold?: boolean;
  small?: boolean;
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      padding: '6px 0',
      borderBottom: bold ? '1px solid #e2e8f0' : '1px solid #f1f5f9',
      fontFamily: 'Figtree, sans-serif',
      fontWeight: bold ? 600 : 400,
      fontSize: small ? 12 : 13,
      color: small ? '#94a3b8' : '#1e3a5f',
      marginTop: bold ? 4 : 0,
      paddingTop: bold ? 8 : 6,
    }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// ============================================
// Helpers
// ============================================
function fmtMoney(n: number | undefined): string {
  if (n === undefined || n === null || isNaN(n)) return '—';
  if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (n >= 10000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

// ============================================
// Styles
// ============================================
const emptyCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: '48px 32px',
  textAlign: 'center',
  fontFamily: 'Figtree, sans-serif',
};

const loadingCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: '64px 32px',
  textAlign: 'center',
  fontFamily: 'Figtree, sans-serif',
};

const spinnerStyle: React.CSSProperties = {
  fontSize: 48,
  display: 'inline-block',
  animation: 'spin 1.5s linear infinite',
};

const primaryBtnLarge: React.CSSProperties = {
  background: '#1e3a5f',
  color: '#fff',
  border: 'none',
  padding: '14px 28px',
  borderRadius: 8,
  fontFamily: 'Figtree, sans-serif',
  fontWeight: 600,
  fontSize: 15,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  background: '#fff',
  color: '#3a4d68',
  border: '1px solid #cbd5e0',
  padding: '8px 16px',
  borderRadius: 6,
  fontFamily: 'Figtree, sans-serif',
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer',
};

const errorCard: React.CSSProperties = {
  background: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#991b1b',
  borderRadius: 8,
  padding: '12px 16px',
  marginTop: 16,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  lineHeight: 1.5,
};

const headerStrip: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  background: '#faf7f2',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 16,
  marginBottom: 20,
  fontFamily: 'Figtree, sans-serif',
  flexWrap: 'wrap',
  gap: 12,
};

const confidencePill: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: '4px 10px',
  borderRadius: 999,
  letterSpacing: 0.6,
};

const summaryGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 12,
  marginBottom: 20,
};

const compareBanner: React.CSSProperties = {
  background: '#f0f7fa',
  border: '1px solid #bae6e6',
  color: '#0e7490',
  borderRadius: 8,
  padding: '10px 14px',
  marginBottom: 20,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  lineHeight: 1.5,
};

const twoColRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 16,
  marginBottom: 20,
};

const breakdownCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 18,
  fontFamily: 'Figtree, sans-serif',
};

const breakdownTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 16,
  color: '#1e3a5f',
  margin: '0 0 8px',
};

const infoCard: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '12px 16px',
  marginBottom: 20,
  fontFamily: 'Figtree, sans-serif',
};

const infoCardLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#7a9b76',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 4,
};

const infoCardText: React.CSSProperties = {
  fontSize: 13,
  color: '#3a4d68',
  lineHeight: 1.5,
  margin: 0,
};

const assumptionsCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 18,
  marginBottom: 20,
  fontFamily: 'Figtree, sans-serif',
};

const assumptionsTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 16,
  color: '#1e3a5f',
  margin: '0 0 10px',
};

const assumptionsList: React.CSSProperties = {
  margin: 0,
  paddingLeft: 22,
  color: '#3a4d68',
  fontSize: 13,
  lineHeight: 1.7,
};

const sensitivityCard: React.CSSProperties = {
  background: '#fffbeb',
  border: '1px solid #fde68a',
  borderRadius: 10,
  padding: 18,
  marginBottom: 20,
  fontFamily: 'Figtree, sans-serif',
};

const sensitivityTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 16,
  color: '#92400e',
  margin: '0 0 6px',
};

const sensitivityRow: React.CSSProperties = {
  padding: '8px 0',
  borderTop: '1px solid #fde68a',
};

const recommendationsCard: React.CSSProperties = {
  background: '#f0fdf4',
  border: '1px solid #bbf7d0',
  borderRadius: 10,
  padding: 18,
  marginBottom: 20,
  fontFamily: 'Figtree, sans-serif',
};

const recommendationsTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 16,
  color: '#166534',
  margin: '0 0 4px',
};

const recommendationRow: React.CSSProperties = {
  padding: '10px 0',
  borderTop: '1px solid #bbf7d0',
};

const confidenceCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 16,
  marginBottom: 20,
  fontFamily: 'Figtree, sans-serif',
};

const footnote: React.CSSProperties = {
  fontSize: 11,
  color: '#94a3b8',
  fontFamily: 'Figtree, sans-serif',
  fontStyle: 'italic',
  textAlign: 'center',
  padding: '10px 0',
  lineHeight: 1.5,
};