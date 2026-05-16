import ExcelJS from 'exceljs';
import type { StandardTemplateData } from './standard-template';

// ============================================================================
// HELPERS
// ============================================================================

const BENEFIT_TYPE_LABELS: Record<string, string> = {
  medical: 'Medical',
  dental: 'Dental',
  vision: 'Vision',
  life: 'Life',
  std: 'Short-Term Disability',
  ltd: 'Long-Term Disability',
};

const hexToArgb = (hex: string | null | undefined, fallback: string = '1A1919'): string => {
  if (!hex) return `FF${fallback}`;
  const clean = hex.replace('#', '').toUpperCase();
  if (clean.length === 6) return `FF${clean}`;
  return `FF${fallback}`;
};

// ============================================================================
// BUILDER
// ============================================================================

export async function buildStandardExcel(data: StandardTemplateData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = data.agency.name;
  workbook.created = new Date(data.generated_at);
  workbook.title = `${data.client.employer_name} - ${data.rfp.name}`;

  const primaryArgb = hexToArgb(data.agency.primary_color, '1A1919');
  const accentArgb = hexToArgb(data.agency.accent_color, '4C58AE');

  // Normalize custom_sections inputs (Commit 2)
  const takeaways = Array.isArray(data.custom_takeaways)
    ? data.custom_takeaways.filter(t => typeof t === 'string' && t.trim().length > 0).map(t => t.trim())
    : [];
  const hasTakeaways = takeaways.length > 0;
  const footerNote = data.custom_footer_note && data.custom_footer_note.trim()
    ? data.custom_footer_note.trim()
    : null;

  // ==========================================================================
  // SHEET 1: Summary
  // ==========================================================================
  const summary = workbook.addWorksheet('Summary', {
    properties: { tabColor: { argb: primaryArgb } },
    views: [{ showGridLines: false }],
  });

  summary.columns = [
    { width: 28 },
    { width: 28 },
    { width: 20 },
    { width: 20 },
  ];

  // Title row
  summary.mergeCells('A1:D1');
  const titleCell = summary.getCell('A1');
  titleCell.value = data.rfp.name;
  titleCell.font = { size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  summary.getRow(1).height = 32;

  // Subtitle
  summary.mergeCells('A2:D2');
  const subtitleCell = summary.getCell('A2');
  const subtitleParts = [
    `Prepared for ${data.client.employer_name}`,
    data.client.member_count ? `${data.client.member_count} employees` : null,
    data.rfp.effective_date ? `Effective ${new Date(data.rfp.effective_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}` : null,
  ].filter(Boolean);
  subtitleCell.value = subtitleParts.join(' · ');
  subtitleCell.font = { size: 10, color: { argb: 'FF666666' } };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  summary.getRow(2).height = 20;

  summary.addRow([]);

  // Stats
  const validQuotes = data.quotes.filter(q => q.total_annual_cost !== null);
  const lowestCost = validQuotes.length > 0
    ? Math.min(...validQuotes.map(q => q.total_annual_cost!))
    : null;

  const statsHeaderRow = summary.addRow(['Carriers Reviewed', 'Lowest Annual Cost', 'Current Annual Cost', 'Lowest vs Current']);
  statsHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, size: 9, color: { argb: 'FF666666' } };
    cell.alignment = { horizontal: 'left' };
  });

  const lowestVsCurrent = (lowestCost !== null && data.rfp.current_annual_cost)
    ? ((lowestCost - data.rfp.current_annual_cost) / data.rfp.current_annual_cost) * 100
    : null;

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
  summary.addRow([]);

  // Carrier comparison header
  const compHeaderRow = summary.addRow(['Carrier', 'Annual Cost', 'Monthly Cost', 'vs Current']);
  compHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accentArgb } };
    cell.alignment = { horizontal: 'left', indent: 1 };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    };
  });
  compHeaderRow.height = 22;

  data.quotes.forEach((quote) => {
    const row = summary.addRow([
      quote.carrier_name,
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
    row.height = 20;
  });

  // ----- Key Takeaways block (Commit 2) -----
  // Renders only when broker has written custom_takeaways. No narrative fallback
  // in Standard — matches the Standard PDF behavior.
  if (hasTakeaways) {
    summary.addRow([]);
    summary.addRow([]);

    // Section header band (matches the title styling for visual consistency)
    const takeawaysHeaderRow = summary.addRow(['KEY TAKEAWAYS', '', '', '']);
    summary.mergeCells(`A${takeawaysHeaderRow.number}:D${takeawaysHeaderRow.number}`);
    const takeawaysHeaderCell = summary.getCell(`A${takeawaysHeaderRow.number}`);
    takeawaysHeaderCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    takeawaysHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
    takeawaysHeaderCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    takeawaysHeaderRow.height = 22;

    // One row per bullet: column A = bullet char, B:D merged = text
    takeaways.forEach((t) => {
      const row = summary.addRow(['•', t, '', '']);
      summary.mergeCells(`B${row.number}:D${row.number}`);
      row.getCell(1).font = { bold: true, size: 11, color: { argb: primaryArgb } };
      row.getCell(1).alignment = { vertical: 'top', horizontal: 'center' };
      row.getCell(2).font = { size: 10, color: { argb: 'FF1A1A1A' } };
      row.getCell(2).alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
      row.height = 28;
    });
  }

  // ----- Footer note (Commit 2) -----
  // Italic gray note at the bottom of Summary sheet. Excel files have no
  // page-footer concept, so we anchor it to the cover sheet only.
  if (footerNote) {
    summary.addRow([]);
    summary.addRow([]);
    const footerRow = summary.addRow([footerNote, '', '', '']);
    summary.mergeCells(`A${footerRow.number}:D${footerRow.number}`);
    const footerCell = summary.getCell(`A${footerRow.number}`);
    footerCell.font = { italic: true, size: 9, color: { argb: 'FF999999' } };
    footerCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
    footerRow.height = 28;
  }

  // ==========================================================================
  // SHEET 2: Cost Modeling (editable)
  // ==========================================================================
  const modeling = workbook.addWorksheet('Cost Modeling', {
    views: [{ showGridLines: true }],
  });

  modeling.columns = [
    { width: 30 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ];

  modeling.mergeCells('A1:E1');
  const modelTitle = modeling.getCell('A1');
  modelTitle.value = 'Cost Modeling — Edit yellow cells to recalculate';
  modelTitle.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  modelTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
  modelTitle.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  modeling.getRow(1).height = 28;

  modeling.addRow([]);

  // Per-carrier model rows
  const modelHeader = modeling.addRow(['Carrier', 'Annual Cost', 'Employees', 'Cost per Employee', 'Monthly Cost']);
  modelHeader.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accentArgb } };
    cell.alignment = { horizontal: 'left', indent: 1 };
  });
  modelHeader.height = 22;

  const memberCount = data.client.member_count || 1;

  data.quotes.forEach((quote) => {
    const row = modeling.addRow([
      quote.carrier_name,
      quote.total_annual_cost,
      memberCount,
      null, // formula below
      null, // formula below
    ]);
    const rowNum = row.number;
    row.getCell(1).alignment = { horizontal: 'left', indent: 1 };
    row.getCell(2).numFmt = '$#,##0.00';
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } }; // yellow = editable
    row.getCell(3).numFmt = '0';
    row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } }; // yellow = editable
    // Cost per employee = annual / employees
    row.getCell(4).value = { formula: `IFERROR(B${rowNum}/C${rowNum},0)` };
    row.getCell(4).numFmt = '$#,##0.00';
    row.getCell(4).font = { color: { argb: 'FF666666' } };
    // Monthly = annual / 12
    row.getCell(5).value = { formula: `IFERROR(B${rowNum}/12,0)` };
    row.getCell(5).numFmt = '$#,##0.00';
    row.getCell(5).font = { color: { argb: 'FF666666' } };
    row.height = 20;
  });

  modeling.addRow([]);
  const legendRow = modeling.addRow(['', 'Yellow = editable', '', 'Gray = calculated', '']);
  legendRow.getCell(2).font = { italic: true, size: 9, color: { argb: 'FF888888' } };
  legendRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
  legendRow.getCell(4).font = { italic: true, size: 9, color: { argb: 'FF888888' } };

  // ==========================================================================
  // SHEET 3: Plan Details (one row per quote_line)
  // ==========================================================================
  const detail = workbook.addWorksheet('Plan Details', {
    views: [{ showGridLines: false }],
  });

  detail.columns = [
    { width: 18 },
    { width: 14 },
    { width: 40 },
    { width: 16 },
    { width: 16 },
  ];

  detail.mergeCells('A1:E1');
  const detailTitle = detail.getCell('A1');
  detailTitle.value = 'Plan Details — All quoted benefit lines';
  detailTitle.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  detailTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
  detailTitle.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  detail.getRow(1).height = 28;

  detail.addRow([]);

  const detailHeader = detail.addRow(['Carrier', 'Type', 'Plan Name', 'Monthly', 'Annual']);
  detailHeader.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accentArgb } };
    cell.alignment = { horizontal: 'left', indent: 1 };
  });
  detailHeader.height = 22;

  data.quotes.forEach((quote) => {
    if (!quote.lines || quote.lines.length === 0) {
      const row = detail.addRow([
        quote.carrier_name,
        '—',
        'No line items',
        null,
        null,
      ]);
      row.getCell(1).alignment = { horizontal: 'left', indent: 1 };
      row.getCell(3).font = { italic: true, color: { argb: 'FF888888' } };
      return;
    }
    quote.lines.forEach((line) => {
      const row = detail.addRow([
        quote.carrier_name,
        BENEFIT_TYPE_LABELS[line.benefit_type] || line.benefit_type,
        line.plan_name || '—',
        line.monthly_premium,
        line.annual_cost,
      ]);
      row.getCell(1).alignment = { horizontal: 'left', indent: 1 };
      row.getCell(4).numFmt = '$#,##0.00';
      row.getCell(5).numFmt = '$#,##0.00';
      row.height = 18;
    });
  });

  // ==========================================================================
  // Return as Buffer
  // ==========================================================================
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}