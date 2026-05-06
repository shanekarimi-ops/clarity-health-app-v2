import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const designId = params.id;
    const body = await req.json();
    const { accessToken } = body;

    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
    }

    // Verify the user
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Look up the broker's agency
    const { data: brokerRow } = await admin
      .from('brokers')
      .select('agency_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!brokerRow) {
      return NextResponse.json({ error: 'Broker profile not found' }, { status: 403 });
    }
    const agencyId = brokerRow.agency_id;

    // 2. Load the plan design + client info
    const { data: planDesign, error: fetchErr } = await admin
      .from('plan_designs')
      .select(`
        id, agency_id, name, funding_model, design,
        clients(id, employer_name, member_count, state, zip)
      `)
      .eq('id', designId)
      .maybeSingle();

    if (fetchErr || !planDesign) {
      return NextResponse.json({ error: 'Plan design not found' }, { status: 404 });
    }
    if (planDesign.agency_id !== agencyId) {
      return NextResponse.json({ error: 'Not authorized for this plan design' }, { status: 403 });
    }

    // 3. Validate that we have enough design info to project
    const design = planDesign.design || {};
    const validation = validateDesignReadyForProjection(design, planDesign.funding_model);
    if (!validation.ready) {
      return NextResponse.json({
        error: 'Plan design incomplete',
        detail: 'Cannot project costs yet — fill in required fields first.',
        missing: validation.missing,
      }, { status: 400 });
    }

    // 4. Build the prompt
    const client: any = Array.isArray(planDesign.clients) ? planDesign.clients[0] : planDesign.clients;
    const prompt = buildProjectionPrompt({
      design,
      fundingModel: planDesign.funding_model,
      clientName: client?.employer_name || 'Unnamed group',
      memberCount: client?.member_count || null,
      state: client?.state || null,
    });

    // 5. Call Claude
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    // 6. Parse response
    const firstBlock = completion.content[0];
    if (!firstBlock || firstBlock.type !== 'text') {
      return NextResponse.json({ error: 'Empty AI response' }, { status: 500 });
    }
    const responseText = firstBlock.text;
    const cleanText = responseText.replace(/```json|```/g, '').trim();

    let projection: any;
    try {
      projection = JSON.parse(cleanText);
    } catch (e) {
      console.error('Failed to parse Claude JSON:', cleanText.slice(0, 500));
      return NextResponse.json({
        error: 'AI returned invalid JSON',
        rawSample: cleanText.slice(0, 300),
      }, { status: 500 });
    }

    // 7. Persist the projection
    const generatedAt = new Date().toISOString();
    const { error: updateErr } = await admin
      .from('plan_designs')
      .update({
        ai_projection: projection,
        ai_projection_generated_at: generatedAt,
      })
      .eq('id', designId);

    if (updateErr) {
      console.error('Failed to save projection:', updateErr);
      return NextResponse.json({ error: 'Failed to save projection', detail: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      projection,
      generatedAt,
    });
  } catch (e: any) {
    console.error('project plan design error:', e);
    return NextResponse.json(
      { error: 'Server error', detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}

// ============================================
// Validation
// ============================================
function validateDesignReadyForProjection(design: any, fundingModel: string): { ready: boolean; missing: string[] } {
  const missing: string[] = [];

  // Group basics
  if (!design.group?.effectiveDate) missing.push('Group: Effective date');
  if (!design.group?.groupSize) missing.push('Group: Group size');

  // Plan structure
  if (!design.plan?.deductibleInNetSingle) missing.push('Plan structure: In-network single deductible');
  if (!design.plan?.deductibleInNetFamily) missing.push('Plan structure: In-network family deductible');
  if (!design.plan?.oopMaxInNetSingle) missing.push('Plan structure: In-network single OOP max');
  if (!design.plan?.oopMaxInNetFamily) missing.push('Plan structure: In-network family OOP max');
  if (design.plan?.coinsuranceInNet === undefined || design.plan?.coinsuranceInNet === '') {
    missing.push('Plan structure: In-network coinsurance');
  }

  // Self-funded only requirements
  if (fundingModel === 'self_funded') {
    if (!design.network?.networkType) missing.push('Network: Network type');
    if (!design.stoploss?.specificDeductible) missing.push('Stop-loss: Specific deductible');
    if (!design.stoploss?.specificCarrier) missing.push('Stop-loss: Stop-loss carrier');
    if (!design.tpa?.tpaName) missing.push('TPA: TPA selection');
    if (!design.pbm?.pbmName) missing.push('PBM: PBM selection');
  }

  return { ready: missing.length === 0, missing };
}

// ============================================
// Prompt builder
// ============================================
function buildProjectionPrompt(args: {
  design: any;
  fundingModel: string;
  clientName: string;
  memberCount: number | null;
  state: string | null;
}): string {
  const { design, fundingModel, clientName, memberCount, state } = args;

  return `You are an experienced employee-benefits actuary helping a broker design a self-funded or level-funded health plan. The broker has built a plan design and needs you to project the expected annual cost.

Your job is to produce a realistic cost projection, breaking out expected claims (medical and Rx), fixed costs, and total maximum liability. You should also flag any sensitivity points and offer concise design recommendations.

# CRITICAL CONSTRAINTS
- You are NOT a licensed actuary providing certified projections. Your output is an educated estimate based on the design and 2026 industry benchmarks.
- All dollar figures are estimates with appropriate confidence bands. Be honest about uncertainty.
- Use 2026 US healthcare market trend rates and actuarial benchmarks.
- Output ONLY valid JSON — no preamble, no markdown fences, no commentary outside the JSON.

# GROUP CONTEXT
- Client: ${clientName}
- Funding model: ${fundingModel}
- State: ${state || 'unknown'}
- Member count: ${memberCount || 'unknown'} (use this if design.group.groupSize is not set)

# PLAN DESIGN (the broker's input)
${JSON.stringify(design, null, 2)}

# YOUR TASK
Produce a JSON object with this exact shape. All dollar values should be whole numbers (no decimals). Percentages as numbers (e.g. 12 not "12%").

{
  "summary": {
    "headline": "One-line summary of the projection (15 words max)",
    "totalAnnualCost": <number, the expected total cost: claims + fixed costs>,
    "totalAnnualCostBest": <number, ~10-15% below expected>,
    "totalAnnualCostWorst": <number, ~25-35% above expected — represents a bad-claims year>,
    "pmpm": <number, total cost per-member-per-month>,
    "comparedToFullyInsured": "<short string explaining how this compares to a fully-insured equivalent, with a percentage estimate>"
  },
  "expectedClaims": {
    "medicalClaims": <number, expected medical claims for the year>,
    "rxClaims": <number, expected Rx claims for the year>,
    "totalExpectedClaims": <number, sum of medical + rx>,
    "claimsPmpm": <number, per-member-per-month claims cost>
  },
  "fixedCosts": {
    "tpaAdmin": <number, annual TPA admin fees>,
    "stopLossPremium": <number, annual stop-loss premium — 0 for level-funded as it's bundled>,
    "pbmAdmin": <number, annual PBM admin fees>,
    "ancillaryAndOther": <number, dental/vision/life/disability if present, plus any other fixed costs>,
    "totalFixed": <number, sum of all fixed costs>,
    "fixedPmpm": <number, fixed costs per-member-per-month>
  },
  "maxLiability": {
    "amount": <number, the maximum amount the employer could pay if claims hit aggregate stop-loss attachment>,
    "explanation": "<2 sentences explaining how max liability works for this design>"
  },
  "assumptions": [
    "<short bullet, e.g. 'Assumed industry-average utilization for ${state || 'US'} group'>",
    "<another assumption>",
    "<3-6 total assumptions>"
  ],
  "sensitivityFlags": [
    {
      "field": "<which design field>",
      "impact": "<how a change would shift the projection — 1 short sentence>"
    }
  ],
  "recommendations": [
    {
      "title": "<short recommendation, 6-8 words>",
      "rationale": "<2-3 sentences explaining why this would improve the design>",
      "estimatedImpact": "<estimated $ savings or risk reduction, or 'no impact on cost' for non-financial recs>"
    }
  ],
  "confidenceLevel": "<one of: 'high', 'medium', 'low'>",
  "confidenceExplanation": "<2 sentences explaining what would raise or lower confidence>"
}

# GUIDANCE FOR YOUR PROJECTION

For ${fundingModel === 'self_funded' ? 'SELF-FUNDED' : 'LEVEL-FUNDED'} plans:
${fundingModel === 'self_funded' ? `
- Expected medical PMPM for groups under 100 lives is typically $450-$650 in 2026 (varies by industry, geography, demographics)
- Rx PMPM is typically $120-$180 (specialty Rx is the main variable)
- TPA admin fees: $30-$50 PEPM is standard
- Stop-loss premium: typically 12-18% of expected claims for groups under 200 lives
- Aggregate corridor: 120-125% is standard, applied to expected claims
- Max liability = Fixed costs + Aggregate stop-loss attachment point` : `
- Level-funded plans bundle TPA, network, stop-loss, and PBM into a carrier package
- Total monthly composite cost is typically equivalent to fully-insured ACA rates minus 5-15%
- The "fixed costs" line should reflect the carrier-bundled monthly composite premium
- Stop-loss premium is $0 because it's bundled into the carrier rate
- Max liability is typically the annual aggregate cap set by the carrier (often 125% of expected)`}

Adjust expected claims based on:
- Industry (manufacturing/construction trend +10-15%, tech/finance trend -5-10%)
- Average age (each year over 40 adds ~3% to claims; under 35 subtracts ~5%)
- Tobacco % (each 10% tobacco users adds ~4% to claims)
- Plan design (lower deductible/OOP increases utilization 5-15%; HDHP reduces 10-15%)
- Carve-outs included (each adds proportional fixed cost)

Be specific in your assumptions and recommendations. The broker is sophisticated — don't dumb it down.

Now produce the JSON:`;
}