import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB hard cap (Anthropic PDF limit is 32 MB; we leave headroom)

const EXTRACTION_PROMPT = `You are extracting structured benefits data from a Summary Plan Description (SPD) or benefits guide PDF. The reader will use this to prefill an RFP wizard, so accuracy matters more than completeness — when in doubt, mark a field as low confidence rather than guessing.

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
- Use null for any field you cannot find or cannot determine with reasonable confidence. Do NOT guess.
- All dollar amounts as numbers without symbols or commas (e.g. 1500, not "$1,500").
- All percentages as numbers 0-100 (e.g. 80, not 0.8 and not "80%").
- If a field appears with multiple values for different participant groups (active vs. retiree, full-time vs. part-time), use the value for ACTIVE FULL-TIME participants and add a warning noting the variation.
- For 'extraction_confidence': mark 'high' if the data was clearly tabulated and unambiguous, 'medium' if it required interpretation, 'low' if you had to infer or the section was thin.
- For 'source_pages': use 1-indexed page numbers as they appear in the PDF.
- 'warnings' should call out: missing sections, ambiguous values, multi-tier complexity (e.g. union plans with retiree carve-outs), unusual structures.
- If the document is not a benefits SPD or guide at all, return: {"error": "not_a_benefits_document", "reason": "<short explanation>"}
- If the document appears to be scanned with no extractable text, return: {"error": "no_extractable_text", "reason": "<short explanation>"}
- If the document is a benefits guide but is missing the Summary of Benefits section entirely, return what you can with low confidence and a warning.

Return ONLY the JSON. No preamble. No markdown fences.`;

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

    // Lightweight PDF magic-byte check: real PDFs start with "%PDF-"
    const header = buffer.slice(0, 5).toString('ascii');
    if (header !== '%PDF-') {
      return NextResponse.json(
        {
          error: 'invalid_file_type',
          message: 'File is not a valid PDF (missing PDF header).',
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not set');
      return NextResponse.json(
        { error: 'server_misconfigured', message: 'AI extraction is not configured. Contact support.' },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    const base64Pdf = buffer.toString('base64');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64Pdf,
              },
            },
            {
              type: 'text',
              text: EXTRACTION_PROMPT,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((c) => c.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      console.error('No text block in Anthropic response:', response.content);
      return NextResponse.json(
        { error: 'extraction_failed', message: 'AI returned an unexpected response. Try again.' },
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
          message: 'AI response was not valid JSON. Please try again or use a different PDF.',
        },
        { status: 500 }
      );
    }

    // AI-flagged structural errors get surfaced as 422s
    if (extracted.error === 'not_a_benefits_document') {
      return NextResponse.json(
        {
          error: 'not_a_benefits_document',
          message: extracted.reason || 'This document does not appear to be a benefits SPD.',
        },
        { status: 422 }
      );
    }
    if (extracted.error === 'no_extractable_text') {
      return NextResponse.json(
        {
          error: 'no_extractable_text',
          message: extracted.reason || 'This PDF appears to be scanned with no extractable text.',
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