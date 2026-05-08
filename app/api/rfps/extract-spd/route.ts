import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { extractPages, selectBenefitsPages, formatSliceForAI } from '@/app/lib/spd-extractor';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB
const MIN_TEXT_CHARS = 500; // below this, treat as scanned/image-only and reject

const EXTRACTION_PROMPT = `You are extracting structured benefits data from text excerpted from a Summary Plan Description (SPD) or benefits guide. The text below was selected from the densest "Summary of Benefits" pages of the source PDF. Each page is prefixed with [Page N] so you can cite source pages.

The reader will use this to prefill an RFP wizard, so accuracy matters more than completeness — when in doubt, mark a field as low confidence rather than guessing.

Return ONLY a JSON object (no markdown, no commentary, no code fences) with this exact shape:

{
  "plan_year": "string, e.g. '2026' — null if not stated",
  "effective_date": "ISO date string YYYY-MM-DD — null if not stated",
  "employer_name": "string — the plan sponsor or employer name",
  "plan_options": [
    {
      "name": "string, e.g. 'PPO Plan', 'HDHP', 'Low Option'",
      "type": "one of: PPO, HMO, EPO, POS, HDHP, Indemnity, Other",
      "hsa_eligible": "boolean or null",
      "tiers": [
        {
          "tier_name": "string, e.g. 'In-Network', 'Out-of-Network', 'Out-of-Area'",
          "deductible_individual": "number in dollars or null",
          "deductible_family": "number in dollars or null",
          "coinsurance_oop_individual": "number or null",
          "coinsurance_oop_family": "number or null",
          "aca_oop_individual": "number or null",
          "aca_oop_family": "number or null",
          "lifetime_max": "string ('Unlimited') or number or null",
          "office_visit_pcp_copay": "number or null",
          "office_visit_specialist_copay": "number or null",
          "telehealth_copay": "number or null",
          "er_copay": "number or null",
          "urgent_care_copay": "number or null",
          "inpatient_hospital_coinsurance_pct": "number 0-100 or null",
          "preventive_covered_100pct": "boolean or null"
        }
      ]
    }
  ],
  "rx": {
    "carrier": "string or null, e.g. 'Express Scripts', 'CVS Caremark'",
    "retail_30day": {
      "generic": "number or null",
      "preferred_brand": "number or null",
      "non_preferred_brand": "number or null",
      "specialty": "number or null"
    },
    "mail_90day": {
      "generic": "number or null",
      "preferred_brand": "number or null",
      "non_preferred_brand": "number or null",
      "specialty": "number or null"
    }
  },
  "dental": {
    "carrier": "string or null",
    "deductible_individual": "number or null",
    "annual_max": "number or null",
    "preventive_coverage_pct": "number 0-100 or null",
    "basic_coverage_pct": "number 0-100 or null",
    "major_coverage_pct": "number 0-100 or null",
    "ortho_lifetime_max": "number or null"
  },
  "vision": {
    "carrier": "string or null",
    "exam_copay": "number or null",
    "frames_allowance": "number or null",
    "contacts_allowance": "number or null",
    "exam_frequency_months": "number or null"
  },
  "life": {
    "carrier": "string or null",
    "amount": "number in dollars or null",
    "ad_d_amount": "number or null"
  },
  "mental_health_parity": "boolean or null — true if MHPAEA compliance is mentioned",
  "extraction_confidence": {
    "plan_options": "high | medium | low",
    "rx": "high | medium | low",
    "dental": "high | medium | low",
    "vision": "high | medium | low",
    "life": "high | medium | low"
  },
  "source_pages": {
    "plan_features": "array of integers — page numbers where you found this data",
    "rx": "array of integers",
    "dental": "array of integers",
    "vision": "array of integers",
    "life": "array of integers"
  },
  "warnings": "array of strings — flag anything ambiguous, missing, or that the broker should manually verify"
}

Rules:
- Use null for any field you cannot find. Do NOT guess.
- All dollar amounts as numbers without symbols or commas.
- All percentages as numbers 0-100.
- If a field has multiple values for different participant groups (active vs. retiree, full-time vs. part-time), use the value for ACTIVE FULL-TIME participants and add a warning noting the variation.
- For 'extraction_confidence': 'high' if clearly tabulated, 'medium' if interpretation needed, 'low' if inferred or thin.
- For 'source_pages': use the [Page N] markers in the text below.
- 'warnings' should call out: missing sections, ambiguous values, multi-tier complexity, unusual structures.
- If the text does not contain benefits content at all, return: {"error": "not_a_benefits_document", "reason": "<short explanation>"}

Return ONLY the JSON. No preamble. No markdown fences.

--- DOCUMENT TEXT ---

`;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'missing_file', message: 'No PDF file provided.' },
        { status: 400 }
      );
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'invalid_file_type', message: 'File must be a PDF.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json(
        {
          error: 'file_too_large',
          message: `PDF must be under ${MAX_PDF_BYTES / 1024 / 1024} MB. Yours is ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Magic-byte check
    const header = buffer.slice(0, 5).toString('ascii');
    if (header !== '%PDF-') {
      return NextResponse.json(
        { error: 'invalid_file_type', message: 'File is not a valid PDF.' },
        { status: 400 }
      );
    }

    // Extract text per page
    let pages;
    try {
      pages = await extractPages(buffer);
    } catch (extractErr) {
      console.error('PDF text extraction failed:', extractErr);
      return NextResponse.json(
        {
          error: 'pdf_parse_failed',
          message: 'Unable to read this PDF. It may be corrupted or password-protected.',
        },
        { status: 422 }
      );
    }

    const totalChars = pages.reduce((sum, p) => sum + p.text.length, 0);
    if (totalChars < MIN_TEXT_CHARS) {
      return NextResponse.json(
        {
          error: 'no_extractable_text',
          message:
            'This PDF appears to be scanned or image-based and has no extractable text. Please upload a text-based PDF.',
        },
        { status: 422 }
      );
    }

    // Slice down to the highest-density benefits section
    const slice = selectBenefitsPages(pages);
    const slicedText = formatSliceForAI(slice);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not set');
      return NextResponse.json(
        { error: 'server_misconfigured', message: 'AI extraction is not configured.' },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: EXTRACTION_PROMPT + slicedText,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((c) => c.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      console.error('No text block in Anthropic response:', response.content);
      return NextResponse.json(
        { error: 'extraction_failed', message: 'AI returned an unexpected response.' },
        { status: 500 }
      );
    }

    const responseText = textBlock.text.replace(/```json|```/g, '').trim();

    let extracted;
    try {
      extracted = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('Failed to parse AI JSON. Raw text:', responseText.slice(0, 500));
      return NextResponse.json(
        {
          error: 'extraction_parse_failed',
          message: 'AI response was not valid JSON. Please try again.',
        },
        { status: 500 }
      );
    }

    if (extracted.error === 'not_a_benefits_document') {
      return NextResponse.json(
        {
          error: 'not_a_benefits_document',
          message: extracted.reason || 'This document does not appear to be a benefits SPD.',
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      extracted,
      meta: {
        filename: file.name,
        size_bytes: file.size,
        model: 'claude-sonnet-4-5',
        input_tokens: response.usage?.input_tokens,
        output_tokens: response.usage?.output_tokens,
        total_pdf_pages: slice.totalPages,
        selected_pages: `${slice.selectedRange.start}–${slice.selectedRange.end}`,
        approx_tokens_sent: slice.approxTokens,
      },
    });
  } catch (err) {
    console.error('SPD extraction error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error during extraction.';
    return NextResponse.json(
      { error: 'extraction_failed', message },
      { status: 500 }
    );
  }
}