import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 30;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Field definitions sent to Claude. Keep these in sync with FIELD_DEFS in
// app/components/CensusUpload.tsx — the `key` values must match exactly.
const FIELD_GUIDE = `Available target fields (return one of these strings, or "ignore"):

- "first_name"        — employee/member first name
- "last_name"         — employee/member last name
- "email"             — email address
- "date_of_birth"     — DOB in any format (we coerce to YYYY-MM-DD)
- "age"               — numeric age in years
- "gender"            — gender / sex (M/F/Male/Female/Other)
- "relationship"      — Employee, Spouse, Child, Domestic Partner, etc.
- "salary_amount"     — annual salary / compensation, numeric
- "tier"              — coverage tier (EE, EE+Spouse, Family, etc.)
- "zip_code"          — US zip code
- "state"             — US state (2-letter or full name)
- "coverage_type"     — Medical / Dental / Vision / etc.
- "current_plan"      — name of current insurance plan
- "ignore"            — column should not be imported`;

const SYSTEM_PROMPT = `You are a benefits-broker data assistant helping map columns from a census spreadsheet to a standard schema.

You will receive:
- A list of CSV column headers (in original order)
- A few sample data rows (so you can see the actual values)

Your job: for each CSV column, decide which target field it represents.

${FIELD_GUIDE}

Return ONLY a valid JSON object (no markdown, no code fences, no preamble) with this exact shape:

{
  "mappings": [
    {
      "csvColumn": "<exact header text>",
      "mappedField": "<one of the field keys above, or 'ignore'>",
      "confidence": "high" | "medium" | "low",
      "reasoning": "<one short sentence>"
    }
  ],
  "warnings": ["<string>", "..."],
  "detectedRows": <integer estimate of likely real data rows>
}

Rules:
- Output one entry per CSV column, in the same order as input
- Each target field can be used AT MOST ONCE — if two columns look like the same field, pick the better fit and mark the other "ignore"
- "high" confidence = obvious match (e.g., header literally says "First Name")
- "medium" = likely but ambiguous (e.g., "EE Comp" -> salary_amount)
- "low" = guess based on sample values
- Use "ignore" liberally for columns that don't map to any target field (IDs, internal codes, hire date, department, etc.)
- warnings: include short notes about anything unusual — values in cents instead of dollars, mixed date formats, blank columns, etc.
- detectedRows: your best estimate of how many of the sample rows look like real member data (vs header/junk rows)
- Do not invent data. If unclear, mark "low" confidence and explain in reasoning.`;

interface ParseCensusRequest {
  headers: string[];
  sampleRows: string[][];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ParseCensusRequest;
    const { headers, sampleRows } = body;

    if (!Array.isArray(headers) || headers.length === 0) {
      return NextResponse.json(
        { error: 'Missing or empty headers array' },
        { status: 400 }
      );
    }
    if (!Array.isArray(sampleRows)) {
      return NextResponse.json(
        { error: 'sampleRows must be an array' },
        { status: 400 }
      );
    }

    // Cap at 5 sample rows to keep tokens cheap
    const trimmedSamples = sampleRows.slice(0, 5);

    const userPrompt = `CSV column headers (${headers.length} columns):
${JSON.stringify(headers)}

Sample rows (${trimmedSamples.length} of ${sampleRows.length} total):
${JSON.stringify(trimmedSamples, null, 2)}

Return the JSON now.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    // Extract text response
    const textBlock = message.content.find((b: any) => b.type === 'text') as any;
    let responseText = textBlock?.text || '';

    // Strip code fences if Claude added them anyway
    responseText = responseText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      console.error('parse-census JSON parse failed:', responseText.slice(0, 500));
      return NextResponse.json(
        {
          error: 'Could not parse Claude response as JSON',
          raw: responseText.slice(0, 500),
        },
        { status: 500 }
      );
    }

    // Light validation
    if (!Array.isArray(parsed.mappings)) {
      return NextResponse.json(
        { error: 'Response missing mappings array', raw: parsed },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      mappings: parsed.mappings,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      detectedRows:
        typeof parsed.detectedRows === 'number' ? parsed.detectedRows : null,
    });
  } catch (error: any) {
    console.error('Unexpected parse-census error:', error);
    return NextResponse.json(
      { error: 'Unexpected error', details: error.message },
      { status: 500 }
    );
  }
}