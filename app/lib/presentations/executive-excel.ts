import ExcelJS from 'exceljs';
import type { ExecutiveTemplateData } from './executive-template';

const hexToArgb = (hex: string | null | undefined, fallback: string = '1A1919'): string => {
  if (!hex) return `FF${fallback}`;
  const clean = hex.replace('#', '').toUpperCase();
  if (clean.length === 6) return `FF${clean}`;
  return `FF${fallback}`;
};

export async function buildExecutiveExcel(data: ExecutiveTemplateData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = data.agency.name;
  workbook.created = new Date(data.generated_at);
  workbook.title = `${data.client.employer_name} - Executive Summary`;

  const primaryArgb = hexToArgb(data.agency.primary_color, '1A1919');
  const accentArgb = hexToArgb(data.agency.accent_color, '4C58AE');

  // Merge: custom_takeaways override narrative_bullets if non-empty
  const effectiveBullets = (data.custom_takeaways && data.custom_takeaways.length > 0)
    ? data.custom_takeaways
    : (data.narrative_bullets && data.narrative_bullets.length > 0)
      ? data.narrative_bullets
      : null;

  const customRecommendation = data.custom_recommendation && data.custom_recommendation.trim()
    ? data.custom_recommendation.trim()
    : null;

  // Custom footer note (Commit 2). Italic gray note appended at the bottom
  // of the Executive Summary sheet. Excel has no page-footer concept, so we
  // anchor it to the single sheet — same pattern as standard-excel and
  // detailed-excel's Summary sheet.
  const footerNote = data.custom_footer_note && data.custom_footer_note.trim()
    ? data.custom_footer_note.trim()
    : null;

  // ==========================================================================
  // SINGLE SHEET: Executive Summary
  // Tab color: accent (vs primary for Standard, primary for Detailed)
  // ==========================================================================
  const sheet = workbook.addWorksheet('Executive Summary', {
    properties: { tabColor: { argb: accentArgb } },
    views: [{ showGridLines: false }],
  });

  sheet.columns = [
    { width: 32 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
  ];

  // ---- Title bar ----
  sheet.mergeCells('A1:D1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = data.rfp.name;
  titleCell.font = { size: 20, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 36;

  // ---- Eyebrow ----
  sheet.mergeCells('A2:D2');
  const eyebrow = sheet.getCell('A2');
  eyebrow.value = 'EXECUTIVE SUMMARY';
  eyebrow.font = { size: 9, bold: true, color: { argb: accentArgb } };
  eyebrow.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(2).height = 18;

  // ---- Subtitle ----
  sheet.mergeCells('A3:D3');
  const subtitle = sheet.getCell('A3');
  const subtitleParts = [
    `Prepared for ${data.client.employer_name}`,
    data.client.member_count ? `${data.client.member_count} employees` : null,
    data.rfp.effective_date ? `Effective ${new Date(data.rfp.effective_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}` : null,
  ].filter(Boolean);
  subtitle.value = subtitleParts.join(' · ');
  subtitle.font = { size: 11, color: { argb: 'FF666666' } };
  subtitle.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(3).height = 22;

  sheet.addRow([]);

  // ---- HERO COST BLOCK ----
  const validQuotes = data.quotes.filter(q => q.total_annual_cost !== null);
  const lowestQuote = validQuotes.length > 0
    ? validQuotes.reduce((acc, q) =>
        (q.total_annual_cost ?? Infinity) < (acc.total_annual_cost ?? Infinity) ? q : acc
      )
    : null;

  if (lowestQuote) {
    // Hero label
    sheet.mergeCells('A5:D5');
    const heroLabel = sheet.getCell('A5');
    heroLabel.value = 'RECOMMENDED CARRIER';
    heroLabel.font = { size: 9, bold: true, color: { argb: 'FF666666' } };
    heroLabel.alignment = { vertical: 'middle', horizontal: 'center' };
    heroLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
    sheet.getRow(5).height = 20;

    // Hero amount
    sheet.mergeCells('A6:D6');
    const heroAmount = sheet.getCell('A6');
    heroAmount.value = lowestQuote.total_annual_cost;
    heroAmount.numFmt = '$#,##0';
    heroAmount.font = { size: 36, bold: true, color: { argb: primaryArgb } };
    heroAmount.alignment = { vertical: 'middle', horizontal: 'center' };
    heroAmount.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
    sheet.getRow(6).height = 48;

    // Hero carrier
    sheet.mergeCells('A7:D7');
    const heroCarrier = sheet.getCell('A7');
    heroCarrier.value = lowestQuote.carrier_name;
    heroCarrier.font = { size: 14, bold: true, color: { argb: '1A1A1A' } };
    heroCarrier.alignment = { vertical: 'middle', horizontal: 'center' };
    heroCarrier.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
    sheet.getRow(7).height = 22;

    // Hero monthly + change
    sheet.mergeCells('A8:D8');
    const heroSubtext = sheet.getCell('A8');
    const monthlyText = `${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(lowestQuote.monthly_cost ?? 0)} per month`;
    const changeText = lowestQuote.cost_change_pct !== null
      ? `  ·  ${lowestQuote.cost_change_pct > 0 ? '+' : ''}${lowestQuote.cost_change_pct.toFixed(1)}% vs current`
      : '';
    heroSubtext.value = monthlyText + changeText;
    heroSubtext.font = {
      size: 11,
      color: { argb: lowestQuote.cost_change_pct !== null && lowestQuote.cost_change_pct > 0 ? 'FFB91C1C' : 'FF15803D' },
    };
    heroSubtext.alignment = { vertical: 'middle', horizontal: 'center' };
    heroSubtext.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
    sheet.getRow(8).height = 22;

    // ---- Custom recommendation (custom_sections.recommendation) ----
    // Sits below the hero subtext, inside the same gray block.
    if (customRecommendation) {
      sheet.mergeCells('A9:D9');
      const heroCustomRec = sheet.getCell('A9');
      heroCustomRec.value = customRecommendation;
      heroCustomRec.font = { size: 10, italic: true, color: { argb: 'FF1A1A1A' } };
      heroCustomRec.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      heroCustomRec.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
      // Grow row roughly with text length
      sheet.getRow(9).height = Math.max(28, Math.min(80, Math.ceil(customRecommendation.length / 80) * 22));
    }
  } else {
    sheet.mergeCells('A5:D5');
    const noQuote = sheet.getCell('A5');
    noQuote.value = 'No carrier quotes available.';
    noQuote.font = { size: 11, italic: true, color: { argb: 'FF888888' } };
    noQuote.alignment = { vertical: 'middle', horizontal: 'center' };
  }

  sheet.addRow([]);
  sheet.addRow([]);

  // ---- COMPARISON ROW (other carriers, if any) ----
  const otherQuotes = lowestQuote
    ? data.quotes.filter(q => q.quote_id !== lowestQuote.quote_id)
    : data.quotes;

  if (otherQuotes.length > 0) {
    const compHeaderRow = sheet.addRow(['Other Carriers Quoted', 'Annual Cost', 'Monthly Cost', 'vs Current']);
    compHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accentArgb } };
      cell.alignment = { horizontal: 'left', indent: 1 };
    });
    compHeaderRow.height = 22;

    otherQuotes.forEach((q) => {
      const row = sheet.addRow([
        q.carrier_name,
        q.total_annual_cost,
        q.monthly_cost,
        q.cost_change_pct !== null ? q.cost_change_pct / 100 : null,
      ]);
      row.getCell(1).alignment = { horizontal: 'left', indent: 1 };
      row.getCell(2).numFmt = '$#,##0';
      row.getCell(3).numFmt = '$#,##0';
      row.getCell(4).numFmt = '+0.0%;-0.0%;0.0%';
      row.height = 22;
    });

    sheet.addRow([]);
    sheet.addRow([]);
  }

  // ---- KEY TAKEAWAYS (effective bullets — custom override or AI default) ----
  const takeawaysHeaderRow = sheet.addRow(['Key Takeaways']);
  sheet.mergeCells(`A${takeawaysHeaderRow.number}:D${takeawaysHeaderRow.number}`);
  const takeawaysHeader = sheet.getCell(`A${takeawaysHeaderRow.number}`);
  takeawaysHeader.font = { size: 12, bold: true, color: { argb: primaryArgb } };
  takeawaysHeader.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  takeawaysHeaderRow.height = 26;

  if (effectiveBullets) {
    effectiveBullets.forEach((bullet) => {
      const bulletRow = sheet.addRow([`•  ${bullet}`]);
      sheet.mergeCells(`A${bulletRow.number}:D${bulletRow.number}`);
      const cell = sheet.getCell(`A${bulletRow.number}`);
      cell.font = { size: 11, color: { argb: '1A1A1A' } };
      cell.alignment = { vertical: 'top', horizontal: 'left', indent: 1, wrapText: true };
      // Height grows roughly with text length
      bulletRow.height = Math.max(22, Math.min(60, Math.ceil(bullet.length / 80) * 22));
    });
  } else {
    const placeholderRow = sheet.addRow(['Generate an AI summary from the Quote Comparison view to populate this section with key talking points.']);
    sheet.mergeCells(`A${placeholderRow.number}:D${placeholderRow.number}`);
    const cell = sheet.getCell(`A${placeholderRow.number}`);
    cell.font = { size: 10, italic: true, color: { argb: 'FF888888' } };
    cell.alignment = { vertical: 'top', horizontal: 'left', indent: 1, wrapText: true };
    placeholderRow.height = 36;
  }

  // ---- Footer note (Commit 2) ----
  // Italic gray note appended at the bottom of the sheet, after Key Takeaways.
  if (footerNote) {
    sheet.addRow([]);
    sheet.addRow([]);
    const footerRow = sheet.addRow([footerNote, '', '', '']);
    sheet.mergeCells(`A${footerRow.number}:D${footerRow.number}`);
    const footerCell = sheet.getCell(`A${footerRow.number}`);
    footerCell.font = { italic: true, size: 9, color: { argb: 'FF999999' } };
    footerCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
    footerRow.height = 28;
  }

  // ---- Return as Buffer ----
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}