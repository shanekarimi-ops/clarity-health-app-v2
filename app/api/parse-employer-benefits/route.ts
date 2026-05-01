import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 90;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EXTRACTION_PROMPT = `You are reviewing an employer benefits packet. The user uploaded this to compare their employer-offered medical plans against marketplace alternatives.

Extract ONLY the MEDICAL/HEALTH INSURANCE plans. Ignore dental, vision, 401k, life insurance, disability, FSA/HSA standalone enrollment forms unless they're directly part of a medical plan.

Return ONLY a valid JSON object (no markdown, no code fences, no preamble) with this exact shape:

{
  "employer_name": "<employer/company name if findable, else null>",
  "plan_year": <4-digit year if findable, else null>,
  "summary_text": "<2-4 sentence plain-English overview of the medical benefits offered>",
  "plans": [
    {
      "plan_name": "<plan name as written in document>",
      "plan_type": "<HMO | PPO | EPO | HDHP | POS | other, or null>",
      "metal_level": "<Bronze | Silver | Gold | Platinum if mentioned, else null>",
      "network_description": "<short description of network if mentioned, else null>",
      "monthly_premium_employee": <number or null — employee-only monthly cost>,
      "monthly_premium_employee_plus_family": <number or null — employee + family monthly cost>,
      "deductible_individual": <number or null>,
      "deductible_family": <number or null>,
      "out_of_pocket_max_individual": <number or null>,
      "out_of_pocket_max_family": <number or null>,
      "primary_care_copay": "<text — could be '$25' or '20% after deductible' or null>",
      "specialist_copay": "<text or null>",
      "er_copay": "<text or null>",
      "generic_rx_copay": "<text or null>",
      "brand_rx_copay": "<text or null>",
      "hsa_eligible": <boolean>,
      "fsa_offered": <boolean>,
      "highlights": "<1-2 sentence plain-English summary of this plan's strengths and trade-offs>"
    }
  ]
}

Rules:
- "plans" array MUST contain ONE entry per medical plan offered. Most employer packets list 2-4 medical plans (e.g. "PPO Plus", "HDHP", "HMO Basic"). Capture all of them.
- Premiums should be the EMPLOYEE'S share, not the total cost (employer contribution varies). If only total premium is shown, use that and note it in highlights.
- Deductibles, MOOPs, and copays use number for currency fields, text for percentage-based fields.
- If a field can't be determined, use null. Do NOT invent values.
- HSA-eligible plans are typically called "HDHP" or "High Deductible Health Plan" with deductibles >$1600/individual.
- "highlights" should help a non-expert understand who this plan is good for.
- If you can't find ANY medical plans (e.g. document is about dental only), return plans: [] and explain in summary_text.`;

export async function POST(request: Request) {
  try {
    const { packet_id, user_id } = await request.json();

    if (!packet_id || !user_id) {
      return NextResponse.json(
        { error: 'Missing packet_id or user_id' },
        { status: 400 }
      );
    }

    // 1. Fetch the packet record
    const { data: packet, error: packetError } = await supabaseAdmin
      .from('employer_benefits_packets')
      .select('*')
      .eq('id', packet_id)
      .eq('user_id', user_id)
      .single();

    if (packetError || !packet) {
      return NextResponse.json(
        { error: 'Packet not found', details: packetError?.message },
        { status: 404 }
      );
    }

    // 2. Download PDF from Storage
    const { data: fileData, error: downloadError } = await supabaseAdmin
      .storage
      .from('employer-benefits')
      .download(packet.file_path);

    if (downloadError || !fileData) {
      await supabaseAdmin
        .from('employer_benefits_packets')
        .update({
          parse_status: 'download_failed',
          parse_error: downloadError?.message || 'Unknown download error',
        })
        .eq('id', packet_id);

      return NextResponse.json(
        { error: 'Could not download file', details: downloadError?.message },
        { status: 500 }
      );
    }

    // 3. Convert to base64
    const buffer = Buffer.from(await fileData.arrayBuffer());
    const base64Data = buffer.toString('base64');

    // 4. Determine media type
    const isPdf = packet.file_type?.includes('pdf') || packet.file_name?.toLowerCase().endsWith('.pdf');
    const isImage = packet.file_type?.startsWith('image/');

    if (!isPdf && !isImage) {
      await supabaseAdmin
        .from('employer_benefits_packets')
        .update({
          parse_status: 'unsupported_format',
          parse_error: `File type ${packet.file_type} not supported for parsing`,
        })
        .eq('id', packet_id);

      return NextResponse.json(
        { error: 'Unsupported file type', file_type: packet.file_type },
        { status: 400 }
      );
    }

    // 5. Build content block
    const contentBlock: any = isPdf
      ? {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64Data },
        }
      : {
          type: 'image',
          source: { type: 'base64', media_type: packet.file_type, data: base64Data },
        };

    // 6. Send to Claude
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 6000,
      messages: [
        {
          role: 'user',
          content: [contentBlock, { type: 'text', text: EXTRACTION_PROMPT }],
        },
      ],
    });

    const textBlock = message.content.find((b: any) => b.type === 'text') as any;
    let responseText = textBlock?.text || '';

    // Strip code fences just in case
    responseText = responseText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    // 7. Parse JSON
    let extracted: any;
    try {
      extracted = JSON.parse(responseText);
    } catch (e) {
      await supabaseAdmin
        .from('employer_benefits_packets')
        .update({
          parse_status: 'json_parse_failed',
          parse_error: `Could not parse Claude response: ${responseText.slice(0, 500)}`,
          raw_extraction: { raw_response: responseText },
        })
        .eq('id', packet_id);

      return NextResponse.json(
        { error: 'Could not parse extraction result', raw: responseText.slice(0, 500) },
        { status: 500 }
      );
    }

    // 8. Update packet record with metadata
    const { error: packetUpdateError } = await supabaseAdmin
      .from('employer_benefits_packets')
      .update({
        employer_name: extracted.employer_name || null,
        plan_year: extracted.plan_year || null,
        summary_text: extracted.summary_text || null,
        raw_extraction: extracted,
        parse_status: 'success',
        parse_error: null,
        parsed_at: new Date().toISOString(),
      })
      .eq('id', packet_id);

    if (packetUpdateError) {
      return NextResponse.json(
        { error: 'Could not update packet record', details: packetUpdateError.message },
        { status: 500 }
      );
    }

    // 9. Insert each extracted plan as its own row
    const plansToInsert = (extracted.plans || []).map((p: any) => ({
      packet_id,
      user_id,
      plan_name: p.plan_name || 'Unnamed Plan',
      plan_type: p.plan_type || null,
      metal_level: p.metal_level || null,
      network_description: p.network_description || null,
      monthly_premium_employee: p.monthly_premium_employee,
      monthly_premium_employee_plus_family: p.monthly_premium_employee_plus_family,
      deductible_individual: p.deductible_individual,
      deductible_family: p.deductible_family,
      out_of_pocket_max_individual: p.out_of_pocket_max_individual,
      out_of_pocket_max_family: p.out_of_pocket_max_family,
      primary_care_copay: p.primary_care_copay || null,
      specialist_copay: p.specialist_copay || null,
      er_copay: p.er_copay || null,
      generic_rx_copay: p.generic_rx_copay || null,
      brand_rx_copay: p.brand_rx_copay || null,
      hsa_eligible: !!p.hsa_eligible,
      fsa_offered: !!p.fsa_offered,
      highlights: p.highlights || null,
      raw_plan_data: p,
    }));

    let insertedPlans: any[] = [];
    if (plansToInsert.length > 0) {
      const { data: planRows, error: plansError } = await supabaseAdmin
        .from('employer_plans')
        .insert(plansToInsert)
        .select();

      if (plansError) {
        return NextResponse.json(
          { error: 'Saved packet but could not save plans', details: plansError.message },
          { status: 500 }
        );
      }
      insertedPlans = planRows || [];
    }

    return NextResponse.json({
      success: true,
      packet: {
        id: packet_id,
        employer_name: extracted.employer_name,
        plan_year: extracted.plan_year,
        summary_text: extracted.summary_text,
      },
      plans_extracted: insertedPlans.length,
      plans: insertedPlans,
    });
  } catch (error: any) {
    console.error('Parse employer benefits error:', error);
    return NextResponse.json(
      { error: 'Unexpected error', details: error.message },
      { status: 500 }
    );
  }
}