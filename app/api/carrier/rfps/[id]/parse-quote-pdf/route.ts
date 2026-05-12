import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Build the prompt dynamically based on which benefit lines the RFP requested
function buildExtractionPrompt(requestedBenefits: string[]) {
  const benefitList = requestedBenefits.length
    ? requestedBenefits.join(', ')
    : 'medical, dental, vision';

  return `You are reviewing a carrier insurance quote / proposal PDF. Extract structured quote data for these benefit lines: ${benefitList}.

Return ONLY a valid JSON object (no markdown, no code fences, no preamble) with this exact shape:

{
  "carrier_name": "<carrier name as it appears, or null>",
  "effective_date": "<YYYY-MM-DD or null>",
  "total_annual_cost": <total annual premium across all lines as number, or null>,
  "monthly_cost": <total monthly premium across all lines as number, or null>,
  "lines": [ <one entry per benefit line — see per-type schemas below> ]
}

Each entry in "lines" has these COMMON fields, then a "plan_design" object whose shape depends on benefit_type:

COMMON FIELDS (every line):
{
  "benefit_type": "medical" | "dental" | "vision" | "life" | "std" | "ltd",
  "plan_name": "<plan name or null>",
  "rate_structure": "tiered_4" | "tiered_2" | "composite" | "age_banded",
  "monthly_premium": <total monthly premium for this line, or null>,
  "annual_cost": <total annual cost for this line, or null>,
  "rates": {
    "employee_only": <number or null>,
    "employee_spouse": <number or null>,
    "employee_children": <number or null>,
    "family": <number or null>
  },
  "plan_design": { <see per-type schemas below> }
}

PER-TYPE PLAN_DESIGN SCHEMAS:

For benefit_type = "medical":
{
  "deductible_individual": <number or null>,
  "deductible_family": <number or null>,
  "oop_max_individual": <number or null>,
  "oop_max_family": <number or null>,
  "coinsurance_pct": <number 0-100 or null>,
  "pcp_copay": <number or null>,
  "specialist_copay": <number or null>,
  "er_copay": <number or null>,
  "urgent_care_copay": <number or null>,
  "telehealth_copay": <number or null>,
  "rx_generic": <number or null>,
  "rx_preferred_brand": <number or null>,
  "rx_non_preferred_brand": <number or null>,
  "rx_specialty": <number or null — for percentage-based specialty (e.g. "30% up to $300"), use the cap as the number AND describe the structure in notes>,
  "rx_specialty_is_percentage": <true if rx specialty is percentage-based, false if flat copay, or null>,
  "notes": "<short free text for anything notable about the medical plan, or null>"
}

For benefit_type = "dental":
{
  "annual_max": <annual max benefit per person as number, or null>,
  "deductible_individual": <number or null>,
  "deductible_family": <number or null>,
  "preventive_coverage_pct": <number 0-100 or null — typically 100>,
  "basic_coverage_pct": <number 0-100 or null — typically 80>,
  "major_coverage_pct": <number 0-100 or null — typically 50>,
  "ortho_coverage_pct": <number 0-100 or null>,
  "ortho_lifetime_max": <number or null>,
  "ortho_covered": "<who orthodontia covers: child_only | adult_and_child | none | null>",
  "notes": "<short free text for anything notable about the dental plan, or null>"
}

For benefit_type = "vision":
{
  "exam_copay": <number or null>,
  "exam_frequency_months": <number — how many months between covered exams, typically 12 or 24, or null>,
  "frames_allowance": <number or null>,
  "frames_frequency_months": <number, or null>,
  "lenses_copay": <number or null>,
  "lenses_frequency_months": <number, or null>,
  "contacts_allowance": <number or null>,
  "contacts_frequency_months": <number, or null>,
  "notes": "<short free text for anything notable about the vision plan, or null>"
}

For benefit_type = "life":
{
  "benefit_amount": <flat life benefit amount, or null>,
  "ad_d_amount": <AD&D benefit amount, or null>,
  "is_multiple_of_salary": <true if benefit is X times salary (e.g. 1x annual salary), false if flat dollar amount, or null>,
  "salary_multiple": <number — e.g. 1.5 for "1.5x salary", or null>,
  "max_benefit": <maximum cap on the benefit if salary-multiple-based, or null>,
  "age_reduction_schedule": "<short text describing age-based benefit reduction, e.g. '35% at age 65, 50% at age 70', or null>",
  "notes": "<short free text for anything notable about the life plan, or null>"
}

For benefit_type = "std" (Short-Term Disability):
{
  "benefit_pct": <percentage of salary replaced, 0-100, or null>,
  "max_weekly_benefit": <weekly cap in dollars, or null>,
  "elimination_period_days": <number of days before benefits start, or null>,
  "max_benefit_duration_weeks": <max number of weeks benefits last, or null>,
  "notes": "<short free text for anything notable about the STD plan, or null>"
}

For benefit_type = "ltd" (Long-Term Disability):
{
  "benefit_pct": <percentage of salary replaced, 0-100, or null>,
  "max_monthly_benefit": <monthly cap in dollars, or null>,
  "elimination_period_days": <number of days before benefits start, typically 90 or 180, or null>,
  "max_benefit_duration": "<text describing duration, e.g. 'to age 65', '5 years', or null>",
  "notes": "<short free text for anything notable about the LTD plan, or null>"
}

Rate structure rules:
- "tiered_4": four-tier (EE / EE+spouse / EE+children / family) — most common for medical, dental, vision
- "tiered_2": two-tier (EE / family)
- "composite": single blended rate for all employees
- "age_banded": rates vary by age (common for voluntary life and disability)

Field rules:
- Only include benefit lines you actually find in the document. Do NOT invent lines that aren't there.
- Only include the benefit types listed above (${benefitList}). Skip any others.
- For tiered_4 rates, fill in all four tiers. For tiered_2, fill employee_only + family, leave the other two null. For composite, fill employee_only only.
- The plan_design object MUST use the schema matching the benefit_type. Do NOT mix fields across types (e.g. don't put dental annual max into medical's oop_max_individual).
- For fields not present in the document, use null. Do NOT guess.
- monthly_premium and annual_cost on a line are the TOTAL for that line (employer + employee combined, or as quoted), not per-employee.
- Numbers should be plain numbers (no currency symbols, no commas).
- Dates in YYYY-MM-DD format.
- Percentages as numbers 0-100 (e.g. 80 for "80%"), not decimals.

Do not invent data. If a field is unclear, use null.`;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const rfpId = params.id;

    // 1. Auth: extract user from Bearer token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }
    const token = authHeader.substring(7);
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    // 2. Resolve carrier_user for this auth user
    const { data: carrierUser, error: cuError } = await supabaseAdmin
      .from('carrier_users')
      .select('id, carrier_id')
      .eq('user_id', user.id)
      .single();
    if (cuError || !carrierUser) {
      return NextResponse.json({ error: 'No carrier account linked to this user' }, { status: 403 });
    }

    // 3. Verify this carrier_user is assigned to this RFP, and fetch RFP info we need
    console.log('[parse-quote-pdf] looking up rfp_carriers', { rfp_id: rfpId, assigned_carrier_user_id: carrierUser.id });
    const { data: rfpCarrier, error: rcError } = await supabaseAdmin
      .from('rfp_carriers')
      .select(`
        id,
        carrier_id,
        status,
        requested_benefits,
        rfps:rfp_id (
          id,
          agency_id
        )
      `)
      .eq('rfp_id', rfpId)
      .eq('assigned_carrier_user_id', carrierUser.id)
      .single();
    if (rcError || !rfpCarrier) {
      console.error('[parse-quote-pdf] rfp_carriers lookup failed', {
        rfpId,
        carrierUserId: carrierUser.id,
        carrierUserCarrierId: carrierUser.carrier_id,
        rcError,
        rfpCarrier,
      });
      return NextResponse.json({
        error: 'RFP not found or not assigned to you',
        debug: {
          rfp_id_used: rfpId,
          carrier_user_id_used: carrierUser.id,
          rc_error_message: rcError?.message ?? null,
          rc_error_code: rcError?.code ?? null,
        },
      }, { status: 404 });
    }

    const rfp = rfpCarrier.rfps as any;
    if (!rfp) {
      return NextResponse.json({ error: 'RFP record missing' }, { status: 404 });
    }

    // 4. Disallow parsing if already submitted/declined
    if (['submitted', 'won', 'lost'].includes(rfpCarrier.status)) {
      return NextResponse.json(
        { error: `Quote already submitted (current status: ${rfpCarrier.status}). Cannot upload another.` },
        { status: 409 }
      );
    }
    if (rfpCarrier.status === 'declined') {
      return NextResponse.json(
        { error: 'This RFP was declined. Cannot upload a quote.' },
        { status: 409 }
      );
    }

    // 5. Parse request body
    const { pdf_base64, filename } = await request.json();
    if (!pdf_base64 || !filename) {
      return NextResponse.json({ error: 'Missing pdf_base64 or filename' }, { status: 400 });
    }
    if (!filename.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
    }

    // 6. Build storage path matching RLS: {agency_id}/{rfp_id}/{carrier_id}/{filename}
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    const storagePath = `${rfp.agency_id}/${rfp.id}/${carrierUser.carrier_id}/${timestamp}-${safeFilename}`;

    // 7. Upload to quote-proposals bucket
    const pdfBuffer = Buffer.from(pdf_base64, 'base64');
    const { error: uploadError } = await supabaseAdmin
      .storage
      .from('quote-proposals')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });
    if (uploadError) {
      console.error('quote-proposals upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload PDF to storage', details: uploadError.message },
        { status: 500 }
      );
    }

    // 8. Call Claude with the PDF
    const requestedBenefits: string[] = Array.isArray((rfpCarrier as any).requested_benefits)
      ? (rfpCarrier as any).requested_benefits
      : [];
    const prompt = buildExtractionPrompt(requestedBenefits);

    let extracted: any;
    let extractionError: string | null = null;

    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: pdf_base64,
                },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      });

      const textBlock = message.content.find((b: any) => b.type === 'text') as any;
      let responseText = textBlock?.text || '';

      // Strip code fences if Claude added them
      responseText = responseText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();

      try {
        extracted = JSON.parse(responseText);
      } catch (e: any) {
        extractionError = `Could not parse extraction result as JSON. Raw: ${responseText.slice(0, 500)}`;
        extracted = null;
      }
    } catch (e: any) {
      console.error('Claude API error:', e);
      extractionError = `Claude API error: ${e.message || 'unknown'}`;
      extracted = null;
    }

    // 9. Return result — PDF is uploaded regardless. UI decides what to do on extraction failure.
    return NextResponse.json({
      success: true,
      proposal_doc_url: storagePath,
      extracted_data: extracted,
      extraction_error: extractionError,
    });
  } catch (error: any) {
    console.error('Unexpected parse-quote-pdf error:', error);
    return NextResponse.json(
      { error: 'Unexpected error', details: error.message },
      { status: 500 }
    );
  }
}