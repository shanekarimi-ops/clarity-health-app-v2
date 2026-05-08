// Server-only helper for extracting and slicing SPD text.
//
// We use pdfjs-dist (Mozilla's PDF.js) directly rather than pdf-parse, because
// pdf-parse pulls in pdfjs-dist as a peer in a way that breaks the Next.js
// webpack build.
//
// Strategy:
//   1. Extract text per page from the PDF
//   2. Score each page on benefits-keyword density
//   3. Select the highest-scoring contiguous window (default 25 pages)
//   4. Trim low-score pages from the edges of that window
//
// This drops a 250-page SPD from ~250K tokens to ~12-15K tokens — fits well
// within Tier 1 rate limits and is ~10x cheaper per call.

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PageText {
  pageNum: number;
  text: string;
  score: number;
}

export interface SliceResult {
  pages: PageText[];
  totalPages: number;
  selectedRange: { start: number; end: number };
  approxTokens: number;
}

const BENEFITS_KEYWORDS = [
  'deductible',
  'coinsurance',
  'copay',
  'copayment',
  'in-network',
  'out-of-network',
  'in network',
  'out of network',
  'out-of-pocket',
  'out of pocket',
  'office visit',
  'preventive',
  'specialist',
  'emergency room',
  'urgent care',
  'inpatient',
  'outpatient',
  'prescription',
  'generic',
  'formulary',
  'mail order',
  'retail',
  'preferred brand',
  'specialty drug',
  'annual maximum',
  'lifetime maximum',
];

function scorePage(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of BENEFITS_KEYWORDS) {
    if (lower.includes(kw)) score += 1;
  }
  // Dollar amounts and percentages are strong signals of a benefits table
  const dollarMatches = (text.match(/\$\s?\d/g) || []).length;
  const percentMatches = (text.match(/\d+\s?%/g) || []).length;
  score += Math.min(dollarMatches, 10) * 0.5;
  score += Math.min(percentMatches, 10) * 0.5;
  return score;
}

export async function extractPages(buffer: Buffer): Promise<PageText[]> {
  const data = new Uint8Array(buffer);
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const pages: PageText[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ');
    pages.push({
      pageNum: i,
      text,
      score: scorePage(text),
    });
  }

  return pages;
}

export function selectBenefitsPages(pages: PageText[]): SliceResult {
  const totalPages = pages.length;
  if (totalPages === 0) {
    return { pages: [], totalPages: 0, selectedRange: { start: 0, end: 0 }, approxTokens: 0 };
  }

  const MAX_PAGES = 25;
  const MIN_PAGES = 5;
  const TRIM_THRESHOLD = 2;

  // If the doc is short, return everything
  if (totalPages <= MAX_PAGES) {
    const totalChars = pages.reduce((sum, p) => sum + p.text.length, 0);
    return {
      pages,
      totalPages,
      selectedRange: { start: pages[0].pageNum, end: pages[pages.length - 1].pageNum },
      approxTokens: Math.ceil(totalChars / 4),
    };
  }

  // Find the highest-scoring window of MAX_PAGES contiguous pages
  let bestStart = 0;
  let bestScore = -1;
  for (let s = 0; s <= totalPages - MAX_PAGES; s++) {
    const windowScore = pages
      .slice(s, s + MAX_PAGES)
      .reduce((sum, p) => sum + p.score, 0);
    if (windowScore > bestScore) {
      bestScore = windowScore;
      bestStart = s;
    }
  }

  // Trim low-score edges
  let trimStart = bestStart;
  let trimEnd = bestStart + MAX_PAGES - 1;
  while (
    trimStart < trimEnd &&
    pages[trimStart].score < TRIM_THRESHOLD &&
    trimEnd - trimStart + 1 > MIN_PAGES
  ) {
    trimStart++;
  }
  while (
    trimEnd > trimStart &&
    pages[trimEnd].score < TRIM_THRESHOLD &&
    trimEnd - trimStart + 1 > MIN_PAGES
  ) {
    trimEnd--;
  }

  const selected = pages.slice(trimStart, trimEnd + 1);
  const totalChars = selected.reduce((sum, p) => sum + p.text.length, 0);

  return {
    pages: selected,
    totalPages,
    selectedRange: {
      start: selected[0].pageNum,
      end: selected[selected.length - 1].pageNum,
    },
    approxTokens: Math.ceil(totalChars / 4),
  };
}

// Format slice result for sending to the AI as a single text block.
// Each page is prefixed with [Page N] so the AI can cite source pages.
export function formatSliceForAI(slice: SliceResult): string {
  return slice.pages
    .map((p) => `[Page ${p.pageNum}]\n${p.text}`)
    .join('\n\n');
}