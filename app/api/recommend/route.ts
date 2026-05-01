import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const MARKETPLACE_BASE = 'https://marketplace.api.healthcare.gov/api/v1';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const marketplaceKey = process.env.MARKETPLACE_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!marketplaceKey) {
    return NextResponse.json({ error: 'Missing MARKETPLACE_API_KEY' }, { status: 500 });
  }
  if (!anthropicKey) {
    return NextResponse.json({ error: 'Missing ANTHROPIC_API_KEY' }, { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { zipCode, householdSize, annualIncome, ages, usesTobacco, userId } = body;

  if (!zipCode || !householdSize || !annualIncome || !Array.isArray(ages) || ages.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    // ===== Step 0: Fetch parsed claims for this user (if userId provided) =====
    // This is OPTIONAL — if no userId or no claims, we fall back to demographic-only ranking.
    let parsedClaims: any[] = [];
    let claimsSummaryText = '';

    if (userId && supabaseUrl && serviceKey) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, serviceKey);
        const { data: claimsData, error: claimsError } = await supabaseAdmin
          .from('claims_parsed')
          .select('conditions, procedures, medications, specialty_visits_count, prescription_count, total_billed, total_out_of_pocket, summary_text, parse_status')
          .eq('user_id', userId)
          .eq('parse_status', 'success');

        if (!claimsError && claimsData) {
          parsedClaims = claimsData;
        }
      } catch (e) {
        // Don't fail the whole request if claims fetch breaks — just rank without them.
        console.error('Claims fetch failed, continuing without claims context:', e);
      }
    }

    // Build the claims summary block for Claude's prompt
    if (parsedClaims.length > 0) {
      const allConditions = Array.from(new Set(parsedClaims.flatMap((c) => c.conditions || []))).filter(Boolean);
      const allProcedures = Array.from(new Set(parsedClaims.flatMap((c) => c.procedures || []))).filter(Boolean);
      const allMedications = Array.from(new Set(parsedClaims.flatMap((c) => c.medications || []))).filter(Boolean);
      const totalSpecialtyVisits = parsedClaims.reduce((sum, c) => sum + (c.specialty_visits_count || 0), 0);
      const totalPrescriptions = parsedClaims.reduce((sum, c) => sum + (c.prescription_count || 0), 0);
      const totalBilled = parsedClaims.reduce((sum, c) => sum + (Number(c.total_billed) || 0), 0);
      const totalOOP = parsedClaims.reduce((sum, c) => sum + (Number(c.total_out_of_pocket) || 0), 0);
      const summaries = parsedClaims.map((c) => c.summary_text).filter(Boolean);

      claimsSummaryText = `
Claims history (${parsedClaims.length} document${parsedClaims.length === 1 ? '' : 's'} on file):
- Conditions/diagnoses: ${allConditions.length > 0 ? allConditions.join(', ') : 'none extracted'}
- Procedures/services: ${allProcedures.length > 0 ? allProcedures.join(', ') : 'none extracted'}
- Medications: ${allMedications.length > 0 ? allMedications.join(', ') : 'none extracted'}
- Specialist visits: ${totalSpecialtyVisits}
- Prescriptions: ${totalPrescriptions}
- Total billed across claims: $${totalBilled.toFixed(2)}
- Total out-of-pocket: $${totalOOP.toFixed(2)}
${summaries.length > 0 ? '\nNotes from documents:\n' + summaries.map((s) => `- ${s}`).join('\n') : ''}
`.trim();
    }

    // ===== Step 1: ZIP -> county FIPS code =====
    const countyRes = await fetch(
      `${MARKETPLACE_BASE}/counties/by/zip/${zipCode}?apikey=${marketplaceKey}`
    );

    if (!countyRes.ok) {
      const text = await countyRes.text();
      return NextResponse.json(
        { error: 'CMS county lookup failed', status: countyRes.status, detail: text },
        { status: 502 }
      );
    }

    const countyData = await countyRes.json();
    const counties = countyData.counties || [];
    if (counties.length === 0) {
      return NextResponse.json({ error: 'No county found for that ZIP code' }, { status: 404 });
    }

    const county = counties[0];
    const countyfips = county.fips;
    const state = county.state;

    // ===== Step 2: CMS plans/search =====
    const people = ages.map((age: number, i: number) => ({
      age: age,
      aptc_eligible: true,
      gender: 'Female',
      uses_tobacco: i === 0 ? !!usesTobacco : false,
    }));

    const searchPayload = {
      household: { income: annualIncome, people: people },
      market: 'Individual',
      place: { countyfips: countyfips, state: state, zipcode: zipCode },
      year: 2026,
    };

    const plansRes = await fetch(`${MARKETPLACE_BASE}/plans/search?apikey=${marketplaceKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchPayload),
    });

    if (!plansRes.ok) {
      const text = await plansRes.text();
      return NextResponse.json(
        { error: 'CMS plans search failed', status: plansRes.status, detail: text },
        { status: 502 }
      );
    }

    const plansData = await plansRes.json();
    const allPlans = plansData.plans || [];

    if (allPlans.length === 0) {
      return NextResponse.json({
        success: true,
        county: { fips: countyfips, state: state, name: county.name },
        planCount: 0,
        plans: [],
        message: 'No plans found for this household.',
        claimsUsed: parsedClaims.length,
      });
    }

    // Take top 10 by lowest premium-with-credit (most affordable to user)
    const topPlans = [...allPlans]
      .sort((a, b) => (a.premium_w_credit ?? a.premium ?? 0) - (b.premium_w_credit ?? b.premium ?? 0))
      .slice(0, 10);

    // Simplify before sending to Claude (less tokens, faster, cheaper)
    const simplified = topPlans.map((p: any) => ({
      id: p.id,
      name: p.name,
      issuer: p.issuer?.name,
      type: p.type,
      metalLevel: p.metal_level,
      premium: p.premium,
      premiumWithCredit: p.premium_w_credit,
      deductible: p.deductibles?.[0]?.amount ?? null,
      maxOutOfPocket: p.moops?.[0]?.amount ?? null,
      hsaEligible: p.hsa_eligible ?? false,
    }));

    // ===== Step 3: Send to Claude for ranking =====
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const claimsAwareGuidance = parsedClaims.length > 0
      ? `IMPORTANT — This household has uploaded medical claims. Use that history to weight the ranking:
- Heavy specialist usage or chronic conditions → favor plans with low deductibles, broad networks, lower specialist copays.
- Multiple prescriptions → favor plans with strong prescription drug coverage.
- High past out-of-pocket spending → favor plans with lower MOOP and predictable costs.
- Low/routine usage → favor plans with low premiums even if deductible is higher.
For each plan, briefly note in claimsInsight which aspect of the claims data influenced its ranking.`
      : `This household has not uploaded any claims yet, so rank based on demographics and price alone. Set claimsInsight to null for each plan.`;

    const prompt = `You are a health insurance advisor helping someone choose a Marketplace plan. Rank these ${simplified.length} plans for this household and explain your reasoning in plain English (no jargon).

Household profile:
- Location: ${county.name}, ${state} (ZIP ${zipCode})
- Household size: ${householdSize}
- Annual income: $${annualIncome.toLocaleString()}
- Ages: ${ages.join(', ')}
- Tobacco use: ${usesTobacco ? 'Yes' : 'No'}

${claimsSummaryText ? claimsSummaryText + '\n' : ''}${claimsAwareGuidance}

Plans available:
${JSON.stringify(simplified, null, 2)}

Return ONLY a valid JSON object (no markdown, no code fences, no preamble) with this exact shape:
{
  "rankedPlans": [
    {
      "id": "the plan id",
      "rank": 1,
      "matchScore": 95,
      "summary": "One sentence on why this plan is a strong fit (max 20 words).",
      "pros": ["Short bullet 1", "Short bullet 2", "Short bullet 3"],
      "cons": ["Short bullet 1", "Short bullet 2"],
      "claimsInsight": "Short note (max 25 words) on how claims data influenced this rank, or null if no claims."
    }
  ],
  "overallAdvice": "One paragraph (max 60 words) of overall guidance for this household. If claims were used, briefly mention how they shaped the recommendation."
}

Rules:
- Rank ALL ${simplified.length} plans (rank 1 = best).
- matchScore 0-100, where 100 = perfect fit. Spread the scores realistically (don't cluster everyone at 90+).
- Keep all text concise and free of insurance jargon.
- Pros/cons should be 2-4 items each.
- Return ONLY the JSON. No other text.`;

    const claudeRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    // Extract Claude's text response
    const textBlock = claudeRes.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json(
        { error: 'Claude returned no text', detail: claudeRes },
        { status: 500 }
      );
    }

    let claudeData;
    try {
      // Strip any accidental markdown fences
      const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
      claudeData = JSON.parse(cleaned);
    } catch (parseErr: any) {
      return NextResponse.json(
        {
          error: 'Could not parse Claude response as JSON',
          detail: parseErr?.message,
          rawResponse: textBlock.text,
        },
        { status: 500 }
      );
    }

    // Merge Claude's rankings with the original plan data
    const rankedWithDetails = (claudeData.rankedPlans || [])
      .map((ranking: any) => {
        const planDetails = simplified.find((p: any) => p.id === ranking.id);
        return planDetails ? { ...planDetails, ...ranking } : null;
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.rank - b.rank);

    return NextResponse.json({
      success: true,
      county: { fips: countyfips, state: state, name: county.name },
      totalPlansAvailable: allPlans.length,
      planCount: rankedWithDetails.length,
      plans: rankedWithDetails,
      overallAdvice: claudeData.overallAdvice || '',
      claimsUsed: parsedClaims.length,
      claimsContext: parsedClaims.length > 0 ? {
        documentCount: parsedClaims.length,
        summary: claimsSummaryText,
      } : null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Server error', detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}