import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const MARKETPLACE_BASE = 'https://marketplace.api.healthcare.gov/api/v1';

export async function POST(req: NextRequest) {
  const marketplaceKey = process.env.MARKETPLACE_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

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

  const { zipCode, householdSize, annualIncome, ages, usesTobacco } = body;

  if (!zipCode || !householdSize || !annualIncome || !Array.isArray(ages) || ages.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
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

    const prompt = `You are a health insurance advisor helping someone choose a Marketplace plan. Rank these ${simplified.length} plans for this household and explain your reasoning in plain English (no jargon).

Household profile:
- Location: ${county.name}, ${state} (ZIP ${zipCode})
- Household size: ${householdSize}
- Annual income: $${annualIncome.toLocaleString()}
- Ages: ${ages.join(', ')}
- Tobacco use: ${usesTobacco ? 'Yes' : 'No'}

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
      "cons": ["Short bullet 1", "Short bullet 2"]
    }
  ],
  "overallAdvice": "One paragraph (max 60 words) of overall guidance for this household."
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
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Server error', detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}