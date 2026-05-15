import ExcelJS from 'exceljs';
import type { DetailedTemplateData } from './detailed-template';

// ============================================================================
// CONSTANTS
// ============================================================================

const BENEFIT_TYPE_LABELS: Record<string, string> = {
  medical: 'Medical',
  dental: 'Dental',
  vision: 'Vision',
  life: 'Life',
  std: 'Short-Term Disability',
  ltd: 'Long-Term Disability',
};

const PLAN_DESIGN_FIELDS: Record<string, { key: string; label: string; format?: 'currency' | 'percent' | 'text' }[]> = {
  medical: [
    { key: 'deductible_individual', label: 'Deductible (Individual)', format: 'currency' },
    { key: 'deductible_family', label: 'Deductible (Family)', format: 'currency' },
    { key: 'oop_max_individual', label: 'OOP Max (Individual)', format: 'currency' },
    { key: 'oop_max_family', label: 'OOP Max (Family)', format: 'currency' },
    { key: 'coinsurance_pct', label: 'Coinsurance %', format: 'percent' },
    { key: 'pcp_copay', label: 'PCP Copay', format: 'currency' },
    { key: 'specialist_copay', label: 'Specialist Copay', format: 'currency' },
    { key: 'urgent_care_copay', label: 'Urgent Care Copay', format: 'currency' },
    { key: 'telehealth_copay', label: 'Telehealth Copay', format: 'currency' },
    { key: 'er_copay', label: 'ER Copay', format: 'currency' },
    { key: 'rx_generic', label: 'Rx Generic', format: 'currency' },
    { key: 'rx_preferred_brand', label: 'Rx Preferred Brand', format: 'currency' },
    { key: 'rx_non_preferred_brand', label: 'Rx Non-Preferred Brand', format: 'currency' },
    { key: 'rx_specialty', label: 'Rx Specialty', format: 'currency' },
  ],
  dental: [
    { key: 'annual_max', label: 'Annual Max', format: 'currency' },
    { key: 'deductible_individual', label: 'Deductible (Individual)', format: 'currency' },
    { key: 'deductible_family', label: 'Deductible (Family)', format: 'currency' },
    { key: 'preventive_coverage_pct', label: 'Preventive %', format: 'percent' },
    { key: 'basic_coverage_pct', label: 'Basic %', format: 'percent' },
    { key: 'major_coverage_pct', label: 'Major %', format: 'percent' },
    { key: 'ortho_coverage_pct', label: 'Ortho %', format: 'percent' },
    { key: 'ortho_lifetime_max', label: 'Ortho Lifetime Max', format: 'currency' },
    { key: 'ortho_covered', label: 'Ortho Covered', format: 'text' },
  ],
  vision: [
    { key: 'exam_copay', label: 'Exam Copay', format: 'currency' },
    { key: 'exam_frequency', label: 'Exam Frequency', format: 'text' },
    { key: 'frames_allowance', label: 'Frames Allowance', format: 'currency' },
    { key: 'frames_frequency', label: 'Frames Frequency', format: 'text' },
    { key: 'lenses_copay', label: 'Lenses Copay', format: 'currency' },
    { key: 'lenses_frequency', label: 'Lenses Frequency', format: 'text' },
    { key: 'contacts_allowance', label: 'Contacts Allowance', format: 'currency' },
    { key: 'contacts_frequency', label: 'Contacts Frequency', format: 'text' },
  ],
  life: [
    { key: 'benefit_amount', label: 'Benefit Amount', format: 'currency' },
    { key: 'salary_multiple', label: 'Salary Multiple', format: 'text' },
    { key: 'max_benefit', label: 'Max Benefit', format: 'currency' },
    { key: 'age_reduction_schedule', label: 'Age Reduction', format: 'text' },
  ],
  std: [
    { key: 'benefit_pct', label: 'Benefit %', format: 'percent' },
    { key: 'max_weekly_benefit', label: 'Max Weekly', format: 'currency' },
    { key: 'elimination_period_days', label: 'Elimination (days)', format: 'text' },
    { key: 'max_benefit_duration', label: 'Max Duration', format: 'text' },
  ],
  ltd: [
    { key: 'benefit_pct', label: 'Benefit %', format: 'percent' },
    { key: 'max_monthly_benefit', label: 'Max Monthly', format: 'currency' },
    { key: 'elimination_period_days', label: 'Elimination (days)', format: 'text' },
    { key: 'max_benefit_duration', label: 'Max Duration', format: 'text' },
  ],
};

const TIER_LABELS: Record<string, string> = {
  employee_only: 'Employee Only',
  employee_spouse: 'Employee + Spouse',
  employee_children: 'Employee + Children',
  family: 'Family',
};

// ============================================================================
// HELPERS
// ============================================================================

const hexToArgb = (hex: string | null | undefined, fallback: string = '1A1919'): string => {
  if (!hex) return `FF${fallback}`;
  const clean = hex.replace('#', '').toUpperCase();
  if (clean.length === 6) return `FF${clean}`;
  return `FF${fallback}`;
};

// Excel tab names have constraints (no special chars, max 31 chars)
const safeSheetName = (raw: string, suffix?: string): string => {
  const clean = raw.replace(/[\\\/\*\?\[\]:]/g, '').trim() || 'Carrier';
  const limit = suffix ? 31 - suffix.length - 1 : 31;
  const truncated = clean.length > limit ? clean.slice(0, limit) : clean;
  return suffix ? `${truncated} ${suffix}` : truncated;
};

// ============================================================================
// BUILDER
// ============================================================================

export async function buildDetailedExcel(data: DetailedTemplateData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = data.agency.name;
  workbook.created = new Date(data.generated_at);
  workbook.title = `${data.client.employer_name} - Detailed Proposal`;

  const primaryArgb = hexToArgb(data.agency.primary_color, '1A1919');
  const accentArgb = hexToArgb(data.agency.accent_color, '4C58AE');

  // ==========================================================================
  // SHEET 1: Summary (primary tab color)
  // ==========================================================================
  const summary = workbook.addWorksheet('Summary', {
    properties: { tabColor: { argb: primaryArgb } },
    views: [{ showGridLines: false }],
  });

  summary.columns = [
    { width: 28 },
    { width: 22 },
    { width: 22 },
    { width: 20 },
  ];

  // Title bar
  summary.mergeCells('A1:D1');
  const titleCell = summary.getCell('A1');
  titleCell.value = data.rfp.name;
  titleCell.font = { size: 20, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  summary.getRow(1).height = 36;

  // Eyebrow
  summary.mergeCells('A2:D2');
  const eyebrow = summary.getCell('A2');
  eyebrow.value = 'DETAILED PROPOSAL';
  eyebrow.font = { size: 9, bold: true, color: { argb: accentArgb } };
  eyebrow.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  summary.getRow(2).height = 18;

  // Subtitle
  summary.mergeCells('A3:D3');
  const subtitle = summary.getCell('A3');
  const subtitleParts = [
    `Prepared for ${data.client.employer_name}`,
    data.client.member_count ? `${data.client.member_count} employees` : null,
    data.rfp.effective_date ? `Effective ${new Date(data.rfp.effective_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}` : null,
  ].filter(Boolean);
  subtitle.value = subtitleParts.join(' · ');
  subtitle.font = { size: 11, color: { argb: 'FF666666' } };
  subtitle.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  summary.getRow(3).height = 22;

  summary.addRow([]);

  // Stats row
  const validQuotes = data.quotes.filter(q => q.total_annual_cost !== null);
  const lowestCost = validQuotes.length > 0
    ? Math.min(...validQuotes.map(q => q.total_annual_cost!))
    : null;
  const lowestVsCurrent = (lowestCost !== null && data.rfp.current_annual_cost)
    ? ((lowestCost - data.rfp.current_annual_cost) / data.rfp.current_annual_cost) * 100
    : null;

  const statsHeaderRow = summary.addRow(['Carriers Reviewed', 'Lowest Annual Cost', 'Current Annual Cost', 'Lowest vs Current']);
  statsHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, size: 9, color: { argb: 'FF666666' } };
    cell.alignment = { horizontal: 'left' };
  });

  const statsValueRow = summary.addRow([
    data.quotes.length,
    lowestCost,
    data.rfp.current_annual_cost,
    lowestVsCurrent !== null ? lowestVsCurrent / 100 : null,
  ]);
  statsValueRow.getCell(1).font = { bold: true, size: 16 };
  statsValueRow.getCell(2).font = { bold: true, size: 16 };
  statsValueRow.getCell(2).numFmt = '$#,##0';
  statsValueRow.getCell(3).font = { bold: true, size: 16 };
  statsValueRow.getCell(3).numFmt = '$#,##0';
  statsValueRow.getCell(4).font = { bold: true, size: 16 };
  statsValueRow.getCell(4).numFmt = '+0.0%;-0.0%;0.0%';
  statsValueRow.height = 26;

  summary.addRow([]);

  // Narrative bullets
  const bullets = data.narrative_bullets && data.narrative_bullets.length > 0
    ? data.narrative_bullets
    : null;

  if (bullets) {
    const takeawaysHeaderRow = summary.addRow(['Key Takeaways']);
    summary.mergeCells(`A${takeawaysHeaderRow.number}:D${takeawaysHeaderRow.number}`);
    const takeawaysHeader = summary.getCell(`A${takeawaysHeaderRow.number}`);
    takeawaysHeader.font = { size: 12, bold: true, color: { argb: primaryArgb } };
    takeawaysHeader.alignment = { vertical: 'middle', horizontal: 'left' };
    takeawaysHeaderRow.height = 24;

    bullets.forEach((bullet) => {
      const bulletRow = summary.addRow([`•  ${bullet}`]);
      summary.mergeCells(`A${bulletRow.number}:D${bulletRow.number}`);
      const cell = summary.getCell(`A${bulletRow.number}`);
      cell.font = { size: 11, color: { argb: '1A1A1A' } };
      cell.alignment = { vertical: 'top', horizontal: 'left', indent: 1, wrapText: true };
      bulletRow.height = Math.max(22, Math.min(60, Math.ceil(bullet.length / 80) * 22));
    });

    summary.addRow([]);
  }

  // Cost comparison header
  const compTitleRow = summary.addRow(['Cost Comparison']);
  summary.mergeCells(`A${compTitleRow.number}:D${compTitleRow.number}`);
  const compTitle = summary.getCell(`A${compTitleRow.number}`);
  compTitle.font = { size: 12, bold: true, color: { argb: primaryArgb } };
  compTitleRow.height = 24;

  const compHeaderRow = summary.addRow(['Carrier', 'Annual Cost', 'Monthly Cost', 'vs Current']);
  compHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accentArgb } };
    cell.alignment = { horizontal: 'left', indent: 1 };
  });
  compHeaderRow.height = 22;

  data.quotes.forEach((quote) => {
    const row = summary.addRow([
      quote.carrier_name + (quote.total_annual_cost === lowestCost ? '  ★' : ''),
      quote.total_annual_cost,
      quote.monthly_cost,
      quote.cost_change_pct !== null ? quote.cost_change_pct / 100 : null,
    ]);
    row.getCell(1).alignment = { horizontal: 'left', indent: 1 };
    row.getCell(2).numFmt = '$#,##0.00';
    row.getCell(3).numFmt = '$#,##0.00';
    row.getCell(4).numFmt = '+0.0%;-0.0%;0.0%';
    if (quote.total_annual_cost === lowestCost) {
      row.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
      });
    }
    row.height = 22;
  });

  // ==========================================================================
  // PER-CARRIER SHEETS (one per quote, primary tab color)
  // ==========================================================================
  data.quotes.forEach((quote) => {
    const sheetName = safeSheetName(quote.carrier_name);
    const sheet = workbook.addWorksheet(sheetName, {
      properties: { tabColor: { argb: hexToArgb(quote.carrier_brand_color, '666666') } },
      views: [{ showGridLines: false }],
    });

    sheet.columns = [
      { width: 32 },
      { width: 22 },
      { width: 22 },
    ];

    // Carrier title bar
    sheet.mergeCells('A1:C1');
    const carrierTitle = sheet.getCell('A1');
    carrierTitle.value = quote.carrier_name;
    carrierTitle.font = { size: 20, bold: true, color: { argb: 'FFFFFFFF' } };
    carrierTitle.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: hexToArgb(quote.carrier_brand_color, '1A1A1A') },
    };
    carrierTitle.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    sheet.getRow(1).height = 36;

    // Cost row
    sheet.mergeCells('A2:C2');
    const costRow = sheet.getCell('A2');
    const costText = `${quote.total_annual_cost !== null ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(quote.total_annual_cost) : '—'} / year  ·  ${quote.monthly_cost !== null ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(quote.monthly_cost) : '—'} / month`;
    const changeSuffix = quote.cost_change_pct !== null
      ? `  ·  ${quote.cost_change_pct > 0 ? '+' : ''}${quote.cost_change_pct.toFixed(1)}% vs current`
      : '';
    costRow.value = costText + changeSuffix;
    costRow.font = { size: 12, color: { argb: 'FF1A1A1A' } };
    costRow.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    sheet.getRow(2).height = 24;

    sheet.addRow([]);

    // Per-benefit blocks
    (quote.lines || []).forEach((line) => {
      const fields = PLAN_DESIGN_FIELDS[line.benefit_type] || [];

      // Benefit header
      const benefitHeaderRow = sheet.addRow([
        BENEFIT_TYPE_LABELS[line.benefit_type] || line.benefit_type,
        line.plan_name || '—',
        '',
      ]);
      sheet.mergeCells(`B${benefitHeaderRow.number}:C${benefitHeaderRow.number}`);
      benefitHeaderRow.getCell(1).font = { bold: true, size: 11, color: { argb: primaryArgb } };
      benefitHeaderRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
      benefitHeaderRow.getCell(2).font = { size: 11, color: { argb: 'FF666666' } };
      benefitHeaderRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
      benefitHeaderRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
      });
      benefitHeaderRow.height = 24;

      // Cost row for this benefit
      const benefitCostRow = sheet.addRow(['Monthly Premium', line.monthly_premium, line.annual_cost]);
      benefitCostRow.getCell(1).font = { size: 9, color: { argb: 'FF666666' } };
      benefitCostRow.getCell(1).alignment = { horizontal: 'left', indent: 1 };
      benefitCostRow.getCell(2).numFmt = '$#,##0.00';
      benefitCostRow.getCell(2).font = { bold: true };
      benefitCostRow.getCell(3).numFmt = '$#,##0.00';
      benefitCostRow.getCell(3).font = { bold: true };
      benefitCostRow.height = 20;

      const annualLabelRow = sheet.addRow(['', '  per month', '  annual']);
      annualLabelRow.getCell(2).font = { size: 8, italic: true, color: { argb: 'FF888888' } };
      annualLabelRow.getCell(3).font = { size: 8, italic: true, color: { argb: 'FF888888' } };
      annualLabelRow.height = 14;

      // Plan design rows
      if (line.plan_design && fields.length > 0) {
        fields.forEach((f) => {
          const raw = (line.plan_design as any)?.[f.key];
          let formattedValue: any = raw == null || raw === '' ? '—' : raw;
          let numFmt: string | undefined;
          if (f.format === 'currency' && typeof raw === 'number') {
            formattedValue = raw;
            numFmt = '$#,##0';
          } else if (f.format === 'percent' && typeof raw === 'number') {
            formattedValue = raw / 100;
            numFmt = '0.0%';
          }
          const row = sheet.addRow([f.label, formattedValue, '']);
          sheet.mergeCells(`B${row.number}:C${row.number}`);
          row.getCell(1).font = { size: 9, color: { argb: 'FF666666' } };
          row.getCell(1).alignment = { horizontal: 'left', indent: 1 };
          row.getCell(2).font = { size: 9, color: { argb: '1A1A1A' } };
          row.getCell(2).alignment = { horizontal: 'right', indent: 1 };
          if (numFmt) row.getCell(2).numFmt = numFmt;
          row.height = 18;
        });
      }

      // Tier rates
      const tierRates = (line.plan_design as any)?.tier_rates || (line as any).tier_rates || null;
      if (tierRates && typeof tierRates === 'object' && Object.keys(tierRates).length > 0) {
        const tierTitleRow = sheet.addRow(['Tier Rates']);
        sheet.mergeCells(`A${tierTitleRow.number}:C${tierTitleRow.number}`);
        tierTitleRow.getCell(1).font = { size: 9, italic: true, bold: true, color: { argb: 'FF666666' } };
        tierTitleRow.getCell(1).alignment = { horizontal: 'left', indent: 1 };
        tierTitleRow.height = 18;

        Object.entries(tierRates).forEach(([tierKey, rate]) => {
          if (rate === null || rate === undefined) return;
          const row = sheet.addRow([TIER_LABELS[tierKey] || tierKey, typeof rate === 'number' ? rate : String(rate), '']);
          sheet.mergeCells(`B${row.number}:C${row.number}`);
          row.getCell(1).font = { size: 9, color: { argb: '1A1A1A' } };
          row.getCell(1).alignment = { horizontal: 'left', indent: 1 };
          row.getCell(2).font = { size: 9, bold: true, color: { argb: '1A1A1A' } };
          row.getCell(2).alignment = { horizontal: 'right', indent: 1 };
          if (typeof rate === 'number') row.getCell(2).numFmt = '$#,##0';
          row.height = 18;
        });
      }

      sheet.addRow([]);
    });

    // Carrier notes
    if (quote.notes && quote.notes.trim()) {
      const notesHeaderRow = sheet.addRow(['Carrier Notes']);
      sheet.mergeCells(`A${notesHeaderRow.number}:C${notesHeaderRow.number}`);
      notesHeaderRow.getCell(1).font = { bold: true, size: 10, color: { argb: primaryArgb } };
      notesHeaderRow.getCell(1).alignment = { horizontal: 'left', indent: 1 };
      notesHeaderRow.height = 22;

      const notesRow = sheet.addRow([quote.notes]);
      sheet.mergeCells(`A${notesRow.number}:C${notesRow.number}`);
      notesRow.getCell(1).font = { size: 10, color: { argb: '1A1A1A' } };
      notesRow.getCell(1).alignment = { horizontal: 'left', vertical: 'top', indent: 1, wrapText: true };
      notesRow.height = Math.max(40, Math.min(120, Math.ceil(quote.notes.length / 80) * 22));
    }
  });

  // ---- Return as Buffer ----
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}