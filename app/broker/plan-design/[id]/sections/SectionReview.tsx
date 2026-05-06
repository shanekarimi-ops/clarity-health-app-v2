'use client';

import React, { useState } from 'react';
import { supabase } from '../../../../supabase';

type FundingModel = 'level_funded' | 'self_funded';
type Status = 'draft' | 'finalized' | 'archived';

type SectionStateMap = {
  group: 'empty' | 'partial' | 'complete' | 'locked';
  plan: 'empty' | 'partial' | 'complete' | 'locked';
  network: 'empty' | 'partial' | 'complete' | 'locked';
  stoploss: 'empty' | 'partial' | 'complete' | 'locked';
  tpa: 'empty' | 'partial' | 'complete' | 'locked';
  pbm: 'empty' | 'partial' | 'complete' | 'locked';
  eligibility: 'empty' | 'partial' | 'complete' | 'locked';
  carveouts: 'empty' | 'partial' | 'complete' | 'locked';
  projection: 'empty' | 'partial' | 'complete' | 'locked';
};

export default function SectionReview({
  designId,
  design,
  fundingModel,
  status,
  clientLabel,
  effectiveDate,
  aiProjection,
  sectionStates,
  statusUpdating,
  onStatusChange,
  onJumpToSection,
}: {
  designId: string;
  design: any;
  fundingModel: FundingModel;
  status: Status;
  clientLabel: string;
  effectiveDate: string | null;
  aiProjection: any;
  sectionStates: SectionStateMap;
  statusUpdating: boolean;
  onStatusChange: (newStatus: Status) => Promise<void>;
  onJumpToSection: (sectionIndex: number) => void;
}) {
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const group = design.group || {};
  const plan = design.plan || {};
  const network = design.network || {};
  const stoploss = design.stoploss || {};
  const tpa = design.tpa || {};
  const pbm = design.pbm || {};
  const eligibility = design.eligibility || {};
  const carveouts = design.carveouts || {};

  const sectionIndices: Record<keyof SectionStateMap, number> = {
    group: 0, plan: 1, network: 2, stoploss: 3, tpa: 4, pbm: 5,
    eligibility: 6, carveouts: 7, projection: 8,
  };

  const requiredSections: (keyof SectionStateMap)[] =
    fundingModel === 'self_funded'
      ? ['group', 'plan', 'network', 'stoploss', 'tpa', 'pbm', 'eligibility']
      : ['group', 'plan', 'eligibility'];

  const optionalSections: (keyof SectionStateMap)[] = ['carveouts', 'projection'];

  const completeCount = requiredSections.filter(s => sectionStates[s] === 'complete').length;
  const allRequiredComplete = completeCount === requiredSections.length;

  // ============================================
  // PDF download handler
  // ============================================
  async function handleDownloadPdf() {
    setDownloading(true);
    setDownloadError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setDownloadError('Not authenticated. Please log in again.');
        setDownloading(false);
        return;
      }

      const res = await fetch(`/api/plan-designs/${designId}/export-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: session.access_token }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setDownloadError(json?.error || json?.detail || 'Failed to generate PDF');
        setDownloading(false);
        return;
      }

      // Pull down the PDF blob
      const blob = await res.blob();

      // Read the filename from the Content-Disposition header if present
      const contentDisposition = res.headers.get('Content-Disposition') || '';
      const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
      const fileName = fileNameMatch ? fileNameMatch[1] : 'plan_design.pdf';

      // Trigger the download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setDownloading(false);
    } catch (e: any) {
      console.error(e);
      setDownloadError(e?.message || 'Unexpected error');
      setDownloading(false);
    }
  }

  return (
    <div>
      {/* Status banner */}
      {status === 'finalized' && (
        <div style={finalizedBanner}>
          <span style={{ fontSize: 22 }}>✓</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 16, color: '#166534' }}>
              This design is finalized
            </div>
            <div style={{ fontSize: 12, color: '#3a4d68', marginTop: 2 }}>
              Finalized designs can still be edited if needed. To make changes, revert to draft first.
            </div>
          </div>
          <button
            onClick={() => onStatusChange('draft')}
            disabled={statusUpdating}
            style={revertBtn}
          >
            {statusUpdating ? 'Updating...' : 'Revert to draft'}
          </button>
        </div>
      )}

      {/* At-a-glance card */}
      <div style={glanceCard}>
        <div style={glanceLabel}>At a glance</div>
        <h3 style={glanceTitle}>{clientLabel}</h3>
        <div style={glanceGrid}>
          <GlanceItem label="Funding model" value={fundingModel === 'self_funded' ? 'Self-funded' : 'Level-funded'} />
          <GlanceItem label="Effective date" value={fmtDate(group.effectiveDate || effectiveDate)} />
          <GlanceItem label="Group size" value={group.groupSize ? `${group.groupSize} employees` : '—'} />
          <GlanceItem
            label="Projected annual cost"
            value={aiProjection?.summary?.totalAnnualCost ? fmtMoney(aiProjection.summary.totalAnnualCost) : '— (run projection)'}
          />
        </div>
      </div>

      {/* Completeness checklist */}
      <div style={checklistCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h4 style={cardTitle}>Completeness</h4>
          <span style={{
            fontSize: 12,
            color: allRequiredComplete ? '#7a9b76' : '#d97706',
            fontWeight: 600,
            fontFamily: 'Figtree, sans-serif',
          }}>
            {completeCount} of {requiredSections.length} required sections complete
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {requiredSections.map(key => (
            <ChecklistRow
              key={key}
              label={SECTION_LABELS[key]}
              state={sectionStates[key]}
              required
              onJump={() => onJumpToSection(sectionIndices[key])}
            />
          ))}
          {optionalSections.map(key => (
            <ChecklistRow
              key={key}
              label={SECTION_LABELS[key]}
              state={sectionStates[key]}
              required={false}
              onJump={() => onJumpToSection(sectionIndices[key])}
            />
          ))}
        </div>
      </div>

      {/* Read-only summary */}
      <h3 style={summaryHeading}>Design summary</h3>

      {/* Group */}
      <SummaryBlock title="Group basics" onEdit={() => onJumpToSection(0)}>
        <SummaryRow label="Effective date" value={fmtDate(group.effectiveDate)} />
        <SummaryRow label="Plan year type" value={planYearLabel(group.planYear)} />
        <SummaryRow label="Group size" value={group.groupSize ? `${group.groupSize} employees` : null} />
        <SummaryRow label="Industry" value={industryLabel(group.industry)} />
        <SummaryRow label="State" value={group.state || null} />
        <SummaryRow label="Avg employee age" value={group.avgEmployeeAge || null} />
        <SummaryRow label="% female" value={group.pctFemale ? `${group.pctFemale}%` : null} />
        <SummaryRow label="% tobacco users" value={group.pctTobacco ? `${group.pctTobacco}%` : null} />
        {group.notes && <SummaryRow label="Notes" value={group.notes} multiline />}
      </SummaryBlock>

      {/* Plan structure */}
      <SummaryBlock title="Plan structure" onEdit={() => onJumpToSection(1)}>
        <SummaryRow label="Deductible structure" value={plan.deductibleStructure ? cap(plan.deductibleStructure) : null} />
        <SummaryRow label="In-network deductible" value={dollarPair(plan.deductibleInNetSingle, plan.deductibleInNetFamily)} />
        <SummaryRow label="In-network OOP max" value={dollarPair(plan.oopMaxInNetSingle, plan.oopMaxInNetFamily)} />
        <SummaryRow label="In-network coinsurance" value={pctOrDash(plan.coinsuranceInNet)} />
        {plan.includeOON && (
          <>
            <SummaryRow label="OON deductible" value={dollarPair(plan.deductibleOonSingle, plan.deductibleOonFamily)} />
            <SummaryRow label="OON OOP max" value={dollarPair(plan.oopMaxOonSingle, plan.oopMaxOonFamily)} />
            <SummaryRow label="OON coinsurance" value={pctOrDash(plan.coinsuranceOon)} />
          </>
        )}
        <SummaryRow label="HSA-qualifying" value={plan.hsaEligible ? 'Yes' : 'No'} />
        {(plan.copayPcp || plan.copaySpecialist || plan.copayUrgent || plan.copayEr) && (
          <SummaryRow
            label="Copays"
            value={`PCP $${plan.copayPcp || '—'} · Spec $${plan.copaySpecialist || '—'} · Urgent $${plan.copayUrgent || '—'} · ER $${plan.copayEr || '—'}${plan.copayErWaived ? ' (waived if admitted)' : ''}`}
          />
        )}
        {(plan.rxTier1Generic || plan.rxTier2PreferredBrand || plan.rxTier3NonPreferredBrand || plan.rxTier4Specialty) && (
          <SummaryRow
            label="Rx tiers"
            value={`Generic $${plan.rxTier1Generic || '—'} · Pref $${plan.rxTier2PreferredBrand || '—'} · Non-pref $${plan.rxTier3NonPreferredBrand || '—'} · Spec $${plan.rxTier4Specialty || '—'}`}
          />
        )}
        {plan.rxDeductibleSeparate && (
          <SummaryRow label="Separate Rx deductible" value={`$${plan.rxDeductibleAmount || '—'}`} />
        )}
      </SummaryBlock>

      {/* Network — self-funded only */}
      {fundingModel === 'self_funded' && (
        <SummaryBlock title="Network" onEdit={() => onJumpToSection(2)}>
          <SummaryRow label="Type" value={networkTypeLabel(network.networkType)} />
          {network.networkType !== 'rbp' && (
            <>
              <SummaryRow label="Carrier" value={network.networkCarrierOther || carrierLabel(network.networkCarrier)} />
              <SummaryRow label="Breadth" value={network.networkTier ? cap(network.networkTier) : null} />
            </>
          )}
          {network.networkType === 'rbp' && (
            <>
              <SummaryRow label="Reference price" value={network.rbpMultiplier ? `${network.rbpMultiplier}% of Medicare` : null} />
              {network.networkCarrier && (
                <SummaryRow label="PPO wraparound" value={carrierLabel(network.networkCarrier)} />
              )}
            </>
          )}
          {network.outOfAreaNetwork && <SummaryRow label="Out-of-area" value={network.outOfAreaNotes || 'Yes'} />}
          {network.telehealthVendor && <SummaryRow label="Telehealth" value={`${network.telehealthVendor}${network.telehealthCopay !== undefined ? ` ($${network.telehealthCopay} copay)` : ''}`} />}
          {network.umVendor && <SummaryRow label="UM vendor" value={network.umVendor} />}
        </SummaryBlock>
      )}

      {/* Stop-loss — self-funded only */}
      {fundingModel === 'self_funded' && (
        <SummaryBlock title="Stop-loss" onEdit={() => onJumpToSection(3)}>
          <SummaryRow label="Specific deductible" value={stoploss.specificDeductible ? `$${Number(stoploss.specificDeductible).toLocaleString()}` : null} />
          <SummaryRow label="Carrier" value={stoploss.specificCarrierOther || carrierLabel(stoploss.specificCarrier)} />
          {stoploss.aggregateEnabled && (
            <SummaryRow label="Aggregate corridor" value={`${stoploss.aggregateCorridor || 125}%${stoploss.aggregatingSpecific ? ' (aggregating specific)' : ''}`} />
          )}
          <SummaryRow label="Contract type" value={contractLabel(stoploss.contractType)} />
          {(stoploss.lasers || []).length > 0 && (
            <SummaryRow label="Lasers" value={`${(stoploss.lasers || []).length} laser${(stoploss.lasers || []).length === 1 ? '' : 's'}`} />
          )}
          {stoploss.noNewLasers && <SummaryRow label="No-new-lasers" value="Yes" />}
          {stoploss.rateCap && <SummaryRow label="Rate cap at renewal" value={`${stoploss.rateCap}%`} />}
          <SummaryRow label="Disclosure" value={disclosureLabel(stoploss.disclosure)} />
        </SummaryBlock>
      )}

      {/* TPA — self-funded only */}
      {fundingModel === 'self_funded' && (
        <SummaryBlock title="TPA" onEdit={() => onJumpToSection(4)}>
          <SummaryRow label="TPA" value={tpa.tpaNameOther || tpaLabel(tpa.tpaName)} />
          <SummaryRow label="Fee structure" value={tpaFeeLabel(tpa)} />
          <SummaryRow label="Funding model" value={fundingModelLabel(tpa.fundingModel)} />
          <SummaryRow label="ID card branding" value={tpa.idCardBranding ? cap(tpa.idCardBranding.replace(/_/g, ' ')) : null} />
          <SummaryRow label="COBRA admin" value={cobraLabel(tpa)} />
          {tpa.runoutMonths && <SummaryRow label="Run-out" value={`${tpa.runoutMonths} months${tpa.runoutAdmin === 'add_on' ? ' (add-on fee)' : ''}`} />}
          {tpa.implementationDate && <SummaryRow label="Implementation date" value={fmtDate(tpa.implementationDate)} />}
        </SummaryBlock>
      )}

      {/* PBM — self-funded only */}
      {fundingModel === 'self_funded' && (
        <SummaryBlock title="PBM" onEdit={() => onJumpToSection(5)}>
          <SummaryRow label="PBM" value={pbm.pbmNameOther || pbmLabel(pbm.pbmName)} />
          <SummaryRow label="Pricing model" value={pbm.pricingModel ? cap(pbm.pricingModel.replace(/_/g, ' ')) : null} />
          {pbm.adminFeePepm && <SummaryRow label="Admin fee" value={`$${pbm.adminFeePepm} PEPM`} />}
          {pbm.rebatePassThroughPct !== undefined && <SummaryRow label="Rebate pass-through" value={`${pbm.rebatePassThroughPct}%`} />}
          {pbm.specialtyCarveOut && <SummaryRow label="Specialty Rx carve-out" value={pbm.specialtyVendor || 'Yes'} />}
          {pbm.mailOrderEnabled && <SummaryRow label="Mail order" value={`${pbm.mailOrderCopayMultiplier || '2x'} copay multiplier`} />}
          {pbm.formularyType && <SummaryRow label="Formulary" value={cap(pbm.formularyType)} />}
          {pbm.utilizationManagement && <SummaryRow label="UM intensity" value={cap(pbm.utilizationManagement.replace(/_/g, ' '))} />}
        </SummaryBlock>
      )}

      {/* Eligibility */}
      <SummaryBlock title="Eligibility" onEdit={() => onJumpToSection(6)}>
        <SummaryRow label="Waiting period" value={waitingPeriodLabel(eligibility)} />
        <SummaryRow label="Max dependent age" value={eligibility.dependentMaxAge || '26'} />
        {eligibility.studentExtension && <SummaryRow label="Student extension" value="Yes" />}
        <SummaryRow label="Domestic partner" value={domesticPartnerLabel(eligibility.domesticPartner)} />
        {eligibility.spousalCarveOut && <SummaryRow label="Spousal surcharge" value={`$${eligibility.spousalSurcharge || 0}/month`} />}
        {eligibility.tobaccoSurcharge && <SummaryRow label="Tobacco surcharge" value={`$${eligibility.tobaccoSurchargeAmount || 0}/month`} />}
        {eligibility.wellnessIncentive && <SummaryRow label="Wellness incentive" value={`$${eligibility.wellnessIncentiveAmount || 0}/month`} />}
        {eligibility.openEnrollmentStart && (
          <SummaryRow label="Open enrollment" value={`${fmtDate(eligibility.openEnrollmentStart)}, ${eligibility.openEnrollmentDays || 14} days`} />
        )}
        {eligibility.hasMultipleClasses && <SummaryRow label="Multiple classes" value="Yes" />}
      </SummaryBlock>

      {/* Carve-outs */}
      <SummaryBlock title="Carve-outs" onEdit={() => onJumpToSection(7)}>
        {!hasAnyCarveouts(carveouts) && <SummaryRow label="" value="No carve-outs configured" />}
        {carveouts.dentalEnabled && <SummaryRow label="Dental" value={`${carveouts.dentalCarrier || '—'}${carveouts.dentalEmployerContribution ? ` (${carveouts.dentalEmployerContribution}% employer)` : ''}`} />}
        {carveouts.visionEnabled && <SummaryRow label="Vision" value={`${carveouts.visionCarrier || '—'}${carveouts.visionEmployerContribution ? ` (${carveouts.visionEmployerContribution}% employer)` : ''}`} />}
        {carveouts.eapEnabled && <SummaryRow label="EAP" value={`${carveouts.eapVendor || '—'}${carveouts.eapSessionsPerYear ? `, ${carveouts.eapSessionsPerYear} sessions` : ''}`} />}
        {carveouts.lifeEnabled && <SummaryRow label="Life / AD&D" value={`${carveouts.lifeCarrier || '—'} — ${carveouts.lifeBenefit || '—'}`} />}
        {carveouts.stdEnabled && <SummaryRow label="Short-term disability" value={`${carveouts.stdCarrier || '—'} — ${carveouts.stdBenefitPct || 60}%, ${carveouts.stdMaxWeeks || 26}wks`} />}
        {carveouts.ltdEnabled && <SummaryRow label="Long-term disability" value={`${carveouts.ltdCarrier || '—'} — ${carveouts.ltdBenefitPct || 60}%, to age ${carveouts.ltdMaxAge || 65}`} />}
        {(carveouts.accidentEnabled || carveouts.hospitalIndemnityEnabled || carveouts.criticalIllnessEnabled) && (
          <SummaryRow
            label="Voluntary supplemental"
            value={[
              carveouts.accidentEnabled && 'Accident',
              carveouts.hospitalIndemnityEnabled && 'Hospital indemnity',
              carveouts.criticalIllnessEnabled && 'Critical illness',
            ].filter(Boolean).join(', ') + (carveouts.voluntaryCarrier ? ` (${carveouts.voluntaryCarrier})` : '')}
          />
        )}
        {carveouts.spendingAccountType && carveouts.spendingAccountType !== 'none' && (
          <SummaryRow
            label="Spending accounts"
            value={`${spendingAccountLabel(carveouts.spendingAccountType)}${carveouts.spendingAccountVendor ? ` — ${carveouts.spendingAccountVendor}` : ''}${carveouts.hsaEmployerContribution ? `, $${carveouts.hsaEmployerContribution}/yr employer HSA` : ''}${carveouts.hraAllowance ? `, $${carveouts.hraAllowance}/yr HRA` : ''}`}
          />
        )}
      </SummaryBlock>

      {/* Projection summary */}
      {aiProjection && (
        <SummaryBlock title="AI cost projection" onEdit={() => onJumpToSection(8)}>
          <SummaryRow label="Headline" value={aiProjection.summary?.headline} />
          <SummaryRow label="Total annual cost" value={fmtMoney(aiProjection.summary?.totalAnnualCost)} />
          <SummaryRow label="Range" value={`${fmtMoney(aiProjection.summary?.totalAnnualCostBest)} (best) — ${fmtMoney(aiProjection.summary?.totalAnnualCostWorst)} (worst)`} />
          <SummaryRow label="PMPM" value={fmtMoney(aiProjection.summary?.pmpm)} />
          <SummaryRow label="Max liability" value={fmtMoney(aiProjection.maxLiability?.amount)} />
          <SummaryRow label="Confidence" value={aiProjection.confidenceLevel ? cap(aiProjection.confidenceLevel) : null} />
        </SummaryBlock>
      )}

      {/* Action panel */}
      <div style={actionPanel}>
        <h3 style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, color: '#1e3a5f', margin: '0 0 12px' }}>
          Finalize this design
        </h3>

        {!allRequiredComplete && status === 'draft' && (
          <div style={warningBox}>
            ⚠️ {requiredSections.length - completeCount} required section{requiredSections.length - completeCount === 1 ? '' : 's'} still incomplete.
            You can finalize anyway, but consider filling them in first.
          </div>
        )}

        {status === 'draft' && (
          <>
            <p style={{ fontSize: 13, color: '#3a4d68', lineHeight: 1.5, margin: '0 0 16px' }}>
              Finalizing marks this design as ready to present to the client. You can still edit it after finalizing — just revert to draft when you need to make changes.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => onStatusChange('finalized')}
                disabled={statusUpdating}
                style={primaryBtn}
              >
                {statusUpdating ? 'Finalizing...' : 'Mark as finalized →'}
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={downloading}
                style={downloading ? { ...secondaryBtn, opacity: 0.6, cursor: 'wait' } : secondaryBtn}
              >
                {downloading ? 'Generating PDF...' : '📄 Download PDF proposal'}
              </button>
            </div>
          </>
        )}

        {status === 'finalized' && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={handleDownloadPdf}
              disabled={downloading}
              style={downloading ? { ...primaryBtn, opacity: 0.6, cursor: 'wait' } : primaryBtn}
            >
              {downloading ? 'Generating PDF...' : '📄 Download PDF proposal'}
            </button>
          </div>
        )}

        {downloadError && (
          <div style={errorBox}>
            <strong>PDF error:</strong> {downloadError}
          </div>
        )}

        {/* Archive section */}
        <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'Figtree, sans-serif', marginBottom: 8 }}>
            Other actions
          </div>
          {!confirmArchive ? (
            <button
              onClick={() => setConfirmArchive(true)}
              style={archiveLink}
            >
              Archive this design
            </button>
          ) : (
            <div style={confirmRow}>
              <span style={{ fontSize: 13, color: '#3a4d68' }}>
                Archive this design? It&apos;ll be hidden from the main list.
              </span>
              <button
                onClick={() => onStatusChange('archived')}
                disabled={statusUpdating}
                style={confirmYesBtn}
              >
                Yes, archive
              </button>
              <button
                onClick={() => setConfirmArchive(false)}
                style={confirmNoBtn}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Sub-components
// ============================================
function GlanceItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#a8c4a4', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: '#fff', fontWeight: 500, fontFamily: 'Figtree, sans-serif' }}>
        {value || '—'}
      </div>
    </div>
  );
}

function ChecklistRow({
  label,
  state,
  required,
  onJump,
}: {
  label: string;
  state: 'empty' | 'partial' | 'complete' | 'locked';
  required: boolean;
  onJump: () => void;
}) {
  const icon =
    state === 'complete' ? '✓' :
    state === 'partial' ? '◐' :
    state === 'locked' ? '🔒' :
    '○';
  const color =
    state === 'complete' ? '#7a9b76' :
    state === 'partial' ? '#d97706' :
    state === 'locked' ? '#94a3b8' :
    (required ? '#dc2626' : '#94a3b8');

  return (
    <div style={checklistRow}>
      <span style={{ width: 18, color, fontWeight: 600, fontSize: 14 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13, color: '#1e3a5f', fontFamily: 'Figtree, sans-serif' }}>
        {label} {!required && <span style={{ fontSize: 11, color: '#94a3b8' }}>(optional)</span>}
      </span>
      {state !== 'complete' && state !== 'locked' && (
        <button onClick={onJump} style={jumpLink}>
          {state === 'empty' ? 'Fill in →' : 'Finish →'}
        </button>
      )}
    </div>
  );
}

function SummaryBlock({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={summaryBlock}>
      <div style={summaryBlockHeader}>
        <h4 style={{ fontFamily: 'Playfair Display, serif', fontSize: 17, color: '#1e3a5f', margin: 0 }}>
          {title}
        </h4>
        <button onClick={onEdit} style={editLink}>Edit ✎</button>
      </div>
      <div>{children}</div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string | number | null | undefined;
  multiline?: boolean;
}) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div style={{
      display: multiline ? 'block' : 'flex',
      justifyContent: multiline ? 'unset' : 'space-between',
      alignItems: 'baseline',
      padding: '6px 0',
      borderBottom: '1px solid #f1f5f9',
      fontSize: 13,
      fontFamily: 'Figtree, sans-serif',
      gap: 12,
    }}>
      {label && (
        <span style={{ color: '#94a3b8', fontWeight: 500, minWidth: 160 }}>{label}</span>
      )}
      <span style={{ color: '#1e3a5f', fontWeight: 500, textAlign: multiline ? 'left' : 'right', flex: 1, marginTop: multiline ? 4 : 0 }}>
        {value}
      </span>
    </div>
  );
}

// ============================================
// Helpers
// ============================================
const SECTION_LABELS: Record<keyof SectionStateMap, string> = {
  group: 'Group basics',
  plan: 'Plan structure',
  network: 'Network',
  stoploss: 'Stop-loss',
  tpa: 'TPA',
  pbm: 'PBM',
  eligibility: 'Eligibility',
  carveouts: 'Carve-outs',
  projection: 'AI cost projection',
};

function fmtMoney(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(n as number)) return '—';
  if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (n >= 10000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function dollarPair(single: any, family: any): string | null {
  if (!single && !family) return null;
  return `$${single ? Number(single).toLocaleString() : '—'} single / $${family ? Number(family).toLocaleString() : '—'} family`;
}

function pctOrDash(v: any): string | null {
  if (v === undefined || v === null || v === '') return null;
  return `${v}%`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function planYearLabel(s: string | undefined): string | null {
  if (!s) return null;
  if (s === 'calendar') return 'Calendar year';
  if (s === 'plan_year') return 'Plan year (anniversary)';
  return s;
}

function industryLabel(s: string | undefined): string | null {
  if (!s) return null;
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function networkTypeLabel(s: string | undefined): string | null {
  if (!s) return null;
  if (s === 'rbp') return 'Reference-based pricing';
  return s.toUpperCase();
}

function carrierLabel(s: string | undefined): string | null {
  if (!s) return null;
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function contractLabel(s: string | undefined): string | null {
  if (!s) return null;
  if (s === 'paid') return 'Paid contract';
  return s.replace('_', '/');
}

function disclosureLabel(s: string | undefined): string | null {
  if (!s) return null;
  if (s === 'no_disclosure') return 'No-disclosure quote';
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function tpaLabel(s: string | undefined): string | null {
  if (!s) return null;
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function pbmLabel(s: string | undefined): string | null {
  if (!s) return null;
  if (s === 'bundled_with_tpa') return 'Bundled with TPA';
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function tpaFeeLabel(tpa: any): string | null {
  if (tpa.adminFeeStructure === 'pepm' && tpa.adminFeePepm) return `$${tpa.adminFeePepm} PEPM`;
  if (tpa.adminFeeStructure === 'pct_claims' && tpa.adminFeePctClaims) return `${tpa.adminFeePctClaims}% of claims`;
  if (tpa.adminFeeStructure === 'flat' && tpa.adminFeeFlat) return `$${Number(tpa.adminFeeFlat).toLocaleString()}/year flat`;
  if (tpa.adminFeeStructure) return cap(tpa.adminFeeStructure.replace(/_/g, ' '));
  return null;
}

function fundingModelLabel(s: string | undefined): string | null {
  if (!s) return null;
  if (s === 'monthly_bank') return 'Monthly claims bank';
  if (s === 'pay_as_you_go') return 'Pay-as-you-go';
  if (s === 'fully_pre_funded') return 'Fully pre-funded';
  return s;
}

function cobraLabel(tpa: any): string | null {
  if (!tpa.cobraAdmin) return null;
  if (tpa.cobraAdmin === 'separate_vendor') return `Separate vendor${tpa.cobraVendor ? ` (${tpa.cobraVendor})` : ''}`;
  return tpa.cobraAdmin.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
}

function waitingPeriodLabel(e: any): string | null {
  if (!e.waitingPeriod) return null;
  const map: Record<string, string> = {
    'none': 'None — eligible day of hire',
    '30_days': '30 days from hire',
    '60_days': '60 days from hire',
    '90_days': '90 days from hire',
    'fom_after_30': 'First of month after 30 days',
    'fom_after_60': 'First of month after 60 days',
    'custom': e.waitingPeriodCustom || 'Custom',
  };
  return map[e.waitingPeriod] || e.waitingPeriod;
}

function domesticPartnerLabel(s: string | undefined): string | null {
  if (!s) return null;
  if (s === 'none') return 'Not covered';
  if (s === 'same_sex') return 'Same-sex domestic partners only';
  if (s === 'all_partners') return 'All unmarried domestic partners';
  return s;
}

function spendingAccountLabel(s: string): string {
  const map: Record<string, string> = {
    hsa: 'HSA',
    hra: 'HRA',
    fsa: 'FSA',
    hsa_fsa: 'HSA + Limited FSA',
    hra_fsa: 'HRA + FSA',
  };
  return map[s] || s;
}

function hasAnyCarveouts(c: any): boolean {
  return !!(
    c.dentalEnabled || c.visionEnabled || c.eapEnabled || c.lifeEnabled ||
    c.stdEnabled || c.ltdEnabled || c.accidentEnabled || c.hospitalIndemnityEnabled ||
    c.criticalIllnessEnabled || c.identityTheftEnabled || c.petInsuranceEnabled ||
    c.legalEnabled || (c.spendingAccountType && c.spendingAccountType !== 'none')
  );
}

// ============================================
// Styles
// ============================================
const finalizedBanner: React.CSSProperties = {
  background: '#f0fdf4',
  border: '1px solid #bbf7d0',
  borderRadius: 10,
  padding: 14,
  marginBottom: 20,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  fontFamily: 'Figtree, sans-serif',
};

const revertBtn: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #bbf7d0',
  color: '#166534',
  padding: '6px 12px',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'Figtree, sans-serif',
  cursor: 'pointer',
};

const glanceCard: React.CSSProperties = {
  background: '#1e3a5f',
  color: '#fff',
  borderRadius: 12,
  padding: 22,
  marginBottom: 20,
  fontFamily: 'Figtree, sans-serif',
};

const glanceLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  opacity: 0.6,
  marginBottom: 4,
};

const glanceTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 24,
  margin: '0 0 14px',
};

const glanceGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 12,
};

const checklistCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 18,
  marginBottom: 24,
  fontFamily: 'Figtree, sans-serif',
};

const cardTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 17,
  color: '#1e3a5f',
  margin: 0,
};

const checklistRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '4px 0',
  gap: 6,
};

const jumpLink: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#7a9b76',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'Figtree, sans-serif',
  padding: '2px 6px',
};

const summaryHeading: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: 20,
  color: '#1e3a5f',
  margin: '8px 0 14px',
};

const summaryBlock: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 16,
  marginBottom: 12,
};

const summaryBlockHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: 8,
  paddingBottom: 8,
  borderBottom: '1px solid #f1f5f9',
};

const editLink: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#94a3b8',
  fontSize: 12,
  fontFamily: 'Figtree, sans-serif',
  cursor: 'pointer',
  fontWeight: 500,
};

const actionPanel: React.CSSProperties = {
  background: '#faf7f2',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: 22,
  marginTop: 24,
  fontFamily: 'Figtree, sans-serif',
};

const warningBox: React.CSSProperties = {
  background: '#fffbeb',
  border: '1px solid #fde68a',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 13,
  color: '#92400e',
  marginBottom: 14,
  lineHeight: 1.5,
};

const errorBox: React.CSSProperties = {
  background: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#991b1b',
  borderRadius: 8,
  padding: '10px 14px',
  marginTop: 12,
  fontFamily: 'Figtree, sans-serif',
  fontSize: 13,
  lineHeight: 1.5,
};

const primaryBtn: React.CSSProperties = {
  background: '#1e3a5f',
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

const archiveLink: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#94a3b8',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'Figtree, sans-serif',
  textDecoration: 'underline',
  padding: 0,
};

const confirmRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  fontFamily: 'Figtree, sans-serif',
};

const confirmYesBtn: React.CSSProperties = {
  background: '#dc2626',
  color: '#fff',
  border: 'none',
  padding: '6px 14px',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'Figtree, sans-serif',
};

const confirmNoBtn: React.CSSProperties = {
  background: '#fff',
  color: '#3a4d68',
  border: '1px solid #cbd5e0',
  padding: '6px 14px',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'Figtree, sans-serif',
};