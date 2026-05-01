import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Service role client for server-side access to Storage + DB
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EXTRACTION_PROMPT = `You are reviewing a medical claim or Explanation of Benefits (EOB) document. Extract structured information that will help recommend the right health insurance plan.

Return ONLY a valid JSON object (no markdown, no code fences, no preamble) with this exact shape:

{
  "conditions": ["array of medical conditions/diagnoses mentioned, plain language"],
  "procedures": ["array of procedures, treatments, or services performed"],
  "medications": ["array of medications/prescriptions mentioned"],
  "specialty_visits_count": <integer count of specialist visits>,
  "prescription_count": <integer count of distinct prescriptions>,
  "total_billed": <total amount billed as number, or null>,
  "total_out_of_pocket": <patient responsibility/out of pocket as number, or null>,
  "date_of_service": "<YYYY-MM-DD or null>",
  "provider_name": "<primary provider/facility name or null>",
  "summary_text": "<2-3 sentence plain-English summary of what this document shows about the patient's healthcare needs>"
}

Rules:
- If a field can't be determined, use null (or 0 for counts, or [] for arrays)
- conditions/procedures/medications: keep entries short and human-readable
- summary_text should focus on what this tells us about insurance needs (chronic conditions, specialist usage, prescription burden, etc.)
- Do not invent data. If unclear, leave it null.`;

export async function POST(request: Request) {
  try {
    const { claim_id, user_id } = await request.json();

    if (!claim_id || !user_id) {
      return NextResponse.json(
        { error: 'Missing claim_id or user_id' },
        { status: 400 }
      );
    }

    // 1. Fetch claim record
    const { data: claim, error: claimError } = await supabaseAdmin
      .from('claims')
      .select('*')
      .eq('id', claim_id)
      .eq('user_id', user_id)
      .single();

    if (claimError || !claim) {
      return NextResponse.json(
        { error: 'Claim not found', details: claimError?.message },
        { status: 404 }
      );
    }

    // 2. Download PDF from Storage
    const { data: fileData, error: downloadError } = await supabaseAdmin
      .storage
      .from('claims')
      .download(claim.file_path);

    if (downloadError || !fileData) {
      return NextResponse.json(
        { error: 'Could not download file', details: downloadError?.message },
        { status: 500 }
      );
    }

    // 3. Convert to base64 for Claude
    const buffer = Buffer.from(await fileData.arrayBuffer());
    const base64Data = buffer.toString('base64');

    // 4. Determine media type
    const isPdf = claim.file_type?.includes('pdf') || claim.file_name?.toLowerCase().endsWith('.pdf');
    const isImage = claim.file_type?.startsWith('image/');

    if (!isPdf && !isImage) {
      // Save as failed parse so we don't retry
      await supabaseAdmin.from('claims_parsed').upsert({
        claim_id,
        user_id,
        parse_status: 'unsupported_format',
        parse_error: `File type ${claim.file_type} not supported for parsing`,
      });
      return NextResponse.json(
        { error: 'Unsupported file type for parsing', file_type: claim.file_type },
        { status: 400 }
      );
    }

    // 5. Build content block based on type
    const contentBlock: any = isPdf
      ? {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: base64Data,
          },
        }
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: claim.file_type,
            data: base64Data,
          },
        };

    // 6. Send to Claude
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            contentBlock,
            { type: 'text', text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });

    // 7. Extract text response
    const textBlock = message.content.find((b: any) => b.type === 'text') as any;
    let responseText = textBlock?.text || '';

    // Strip code fences if Claude added them anyway
    responseText = responseText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    // 8. Parse JSON
    let extracted;
    try {
      extracted = JSON.parse(responseText);
    } catch (e) {
      await supabaseAdmin.from('claims_parsed').upsert({
        claim_id,
        user_id,
        parse_status: 'json_parse_failed',
        parse_error: `Could not parse Claude response as JSON: ${responseText.slice(0, 500)}`,
        raw_extraction: { raw_response: responseText },
      });
      return NextResponse.json(
        { error: 'Could not parse extraction result', raw: responseText.slice(0, 500) },
        { status: 500 }
      );
    }

    // 9. Save to claims_parsed
    const { data: saved, error: saveError } = await supabaseAdmin
      .from('claims_parsed')
      .upsert({
        claim_id,
        user_id,
        conditions: extracted.conditions || [],
        procedures: extracted.procedures || [],
        medications: extracted.medications || [],
        specialty_visits_count: extracted.specialty_visits_count || 0,
        prescription_count: extracted.prescription_count || 0,
        total_billed: extracted.total_billed,
        total_out_of_pocket: extracted.total_out_of_pocket,
        date_of_service: extracted.date_of_service,
        provider_name: extracted.provider_name,
        summary_text: extracted.summary_text,
        raw_extraction: extracted,
        parse_status: 'success',
        parse_error: null,
      })
      .select()
      .single();

    if (saveError) {
      return NextResponse.json(
        { error: 'Could not save parsed claim', details: saveError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      parsed: saved,
    });
  } catch (error: any) {
    console.error('Parse claim error:', error);
    return NextResponse.json(
      { error: 'Unexpected error', details: error.message },
      { status: 500 }
    );
  }
}