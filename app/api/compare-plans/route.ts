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

type CompareMode = 'employer-only' | 'employer-vs-marketplace';

export async function POST(request: Request) {
  try {
    const { user_id, mode } = (await request.json()) as { user_id?: string; mode?: CompareMode };

    if (!user_id) {
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }
    if (mode !== 'employer-only' && mode !== 'employer-vs-marketplace') {
      return NextResponse.json({ error: 'Invalid mode. Use employer-only or employer-vs-marketplace.' }, { status: 400 });
    }

    // ===== Fetch most recent employer packet + its plans =====
    const { data: latestPacket, error: packetErr } = await supabaseAdmin
      .from('employer_benefits_packets')
      .select('*')
      .eq('user_id', user_id)
      .eq('parse_status', 'success')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (packetErr) {
      return NextResponse.json({ error: 'Failed to fetch employer packet', details: packetErr.message }, { status: 500 });
    }
    if (!latestPacket) {
      return NextResponse.json(
        { error: 'No employer benefits packet found. Upload one first.' },
        { status: 404 }
      );
    }

    const { data: employerPlans, error: planErr } = await supabaseAdmin
      .from('employer_plans')
      .select('*')
      .eq('packet_id', latestPacket.id)
      .order('created_at', { ascending: true });

    if (planErr) {
      return NextResponse.json({ error: 'Failed to fetch employer plans', details: planErr.message }, { status: 500 });
    }
    if (!employerPlans || employerPlans.length === 0) {
      return NextResponse.json(
        { error: 'No medical plans were extracted from your packet. Try re-uploading.' },
        { status: 404 }
      );
    }

    // ===== Fetch parsed claims for context (optional, same as recommend route) =====
    const { data: claims } = await supabaseAdmin
      .from('claims_parsed')
      .select('conditions, procedures, medications, specialty_visits_count, prescription_count, total_billed, total_out_of_pocket, summary_text')
      .eq('user_id', user_id)
      .eq('parse_status', 'success');

    let claimsSummaryText = '';
    if (claims && claims.length > 0) {
      const allConditions = Array.from(new Set(claims.flatMap((c) => c.conditions || []))).filter(Boolean);
      const allProcedures = Array.from(new Set(claims.flatMap((c) => c.procedures || []))).filter(Boolean);
      const allMeds = Array.from(new Set(claims.flatMap((c) => c.medications || []))).filter(Boolean);
      const totalSpecialty = claims.reduce((s, c) => s + (c.specialty_visits_count || 0), 0);
      const totalRx = claims.reduce((s, c) => s + (c.prescription_count || 0), 0);
      claimsSummaryText = `
Claims history (${claims.length} document${claims.length === 1 ? '' : 's'}):
- Conditions: ${allConditions.length ? allConditions.join(', ') : 'none extracted'}
- Procedures: ${allProcedures.length ? allProcedures.join(', ') : 'none extracted'}
- Medications: ${allMeds.length ? allMeds.join(', ') : 'none extracted'}
- Specialist visits: ${totalSpecialty}
- Prescriptions: ${totalRx}
`.trim();
    }

    // ===== Branch on mode =====
    if (mode === 'employer-only') {
      // Rank the employer plans against EACH OTHER, claims-aware if available.
      const simplified = employerPlans.map((p) => ({
        id: p.id,
        plan_name: p.plan_name,
        plan_type: p.plan_type,
        monthly_premium_employee: p.monthly_premium_employee,
        deductible_individual: p.deductible_individual,
        out_of_pocket_max_individual: p.out_of_pocket_max_individual,
        primary_care_copay: p.primary_care_copay,
        specialist_copay: p.specialist_copay,
        generic_rx_copay: p.generic_rx_copay,
        brand_rx_copay: p.brand_rx_copay,
        hsa_eligible: p.hsa_eligible,
        highlights: p.highlights,
      }));

      const prompt = `You are a benefits advisor. The user works at ${latestPacket.employer_name || 'a company'} and is choosing among the medical plans their employer offers. Rank these plans for THIS person and explain in plain English (no jargon).

${claimsSummaryText ? claimsSummaryText + '\n' : ''}${claimsSummaryText ? 'Use the claims history to weight your ranking (chronic conditions → low deductible/broad network; multiple Rx → strong drug coverage; high past spend → low MOOP; low/routine usage → low premium).' : 'No claims history is available, so rank based on typical-user trade-offs.'}

Employer-offered medical plans:
${JSON.stringify(simplified, null, 2)}

Return ONLY a valid JSON object (no markdown, no code fences) with this shape:
{
  "rankedPlans": [
    {
      "id": "the plan id",
      "rank": 1,
      "matchScore": 92,
      "summary": "One sentence on why this fits (max 25 words).",
      "pros": ["Short bullet 1", "Short bullet 2", "Short bullet 3"],
      "cons": ["Short bullet 1", "Short bullet 2"],
      "claimsInsight": "Short note (max 30 words) on how claims data shaped this rank, or null if no claims."
    }
  ],
  "overallAdvice": "One paragraph (max 70 words) of plain-English guidance on which plan to pick and why."
}

Rules:
- Rank ALL ${simplified.length} plans.
- matchScore 0-100. Spread realistically (don't cluster at 90+).
- Return ONLY JSON.`;

      const claudeRes = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = claudeRes.content.find((b: any) => b.type === 'text') as any;
      let responseText = textBlock?.text || '';
      responseText = responseText.replace(/```json|```/g, '').trim();

      let claudeData;
      try {
        claudeData = JSON.parse(responseText);
      } catch {
        return NextResponse.json(
          { error: 'Could not parse Claude response', raw: responseText.slice(0, 500) },
          { status: 500 }
        );
      }

      // Merge ranking with full plan details
      const rankedFull = (claudeData.rankedPlans || [])
        .map((r: any) => {
          const planDetails = employerPlans.find((p) => p.id === r.id);
          return planDetails ? { ...planDetails, ...r } : null;
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.rank - b.rank);

      return NextResponse.json({
        success: true,
        mode: 'employer-only',
        employer_name: latestPacket.employer_name,
        plan_year: latestPacket.plan_year,
        plans: rankedFull,
        overallAdvice: claudeData.overallAdvice || '',
        claimsUsed: claims?.length || 0,
      });
    }

    // ===== Mode: employer-vs-marketplace =====
    // We need the user's most recent Marketplace recommendation. We don't re-run /api/recommend
    // here — that requires the household form. We grab the latest saved recommendation.
    const { data: latestRec, error: recErr } = await supabaseAdmin
      .from('recommendations')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recErr) {
      return NextResponse.json({ error: 'Failed to fetch marketplace recommendation', details: recErr.message }, { status: 500 });
    }
    if (!latestRec || !Array.isArray(latestRec.plans) || latestRec.plans.length === 0) {
      return NextResponse.json(
        {
          error: 'No marketplace recommendation found. Run "Find Plans" first to generate one, then come back to compare.',
          requiresMarketplaceRun: true,
        },
        { status: 404 }
      );
    }

    // Take the top employer plan and the top marketplace plan for the head-to-head comparison.
    // Send all employer plans + top 3 marketplace plans for context.
    const topMarketplacePlans = (latestRec.plans as any[]).slice(0, 3);

    const prompt = `You are a benefits advisor helping someone decide between their EMPLOYER's medical plans and the FEDERAL MARKETPLACE alternatives. Be candid about trade-offs in plain English (no jargon).

Household context:
- Location: ${latestRec.county_name || 'unknown'}, ${latestRec.state || 'unknown'} (ZIP ${latestRec.zip_code})
- Household size: ${latestRec.household_size}
- Annual income: $${(latestRec.annual_income || 0).toLocaleString()}

${claimsSummaryText ? claimsSummaryText + '\n' : ''}

EMPLOYER plans offered by ${latestPacket.employer_name || 'their employer'}:
${JSON.stringify(employerPlans.map((p) => ({
  id: p.id,
  plan_name: p.plan_name,
  plan_type: p.plan_type,
  monthly_premium_employee: p.monthly_premium_employee,
  deductible_individual: p.deductible_individual,
  out_of_pocket_max_individual: p.out_of_pocket_max_individual,
  primary_care_copay: p.primary_care_copay,
  specialist_copay: p.specialist_copay,
  hsa_eligible: p.hsa_eligible,
  highlights: p.highlights,
})), null, 2)}

Top 3 MARKETPLACE plans (already pre-ranked for this household):
${JSON.stringify(topMarketplacePlans.map((p: any) => ({
  id: p.id,
  name: p.name,
  issuer: p.issuer,
  type: p.type,
  metalLevel: p.metalLevel,
  premium: p.premium,
  premiumWithCredit: p.premiumWithCredit,
  deductible: p.deductible,
  maxOutOfPocket: p.maxOutOfPocket,
  hsaEligible: p.hsaEligible,
  matchScore: p.matchScore,
  summary: p.summary,
})), null, 2)}

Return ONLY a valid JSON object with this shape:
{
  "winner": "employer" or "marketplace" or "tie",
  "winnerPlanId": "id of the winning plan (employer plan id or marketplace plan id)",
  "winnerPlanName": "name of the winning plan",
  "winnerSource": "employer" or "marketplace",
  "summary": "One paragraph (max 80 words) on which is the better deal for THIS person and why.",
  "tradeoffs": [
    "Short bullet describing a key trade-off",
    "Short bullet describing another trade-off",
    "Short bullet describing another trade-off"
  ],
  "annualCostComparison": {
    "employerBestPlan": {
      "id": "employer plan id",
      "name": "employer plan name",
      "estimatedAnnualCost": <number — premium*12 + estimated typical out-of-pocket>
    },
    "marketplaceBestPlan": {
      "id": "marketplace plan id",
      "name": "marketplace plan name",
      "estimatedAnnualCost": <number>
    }
  },
  "claimsInsight": "Short note (max 40 words) on how claims data shaped this conclusion, or null if no claims."
}

Rules:
- Use the EMPLOYEE'S share of premiums for employer plans (not total cost).
- Marketplace premiumWithCredit reflects the subsidy applied; use that.
- Estimated annual cost = (premium * 12) + reasonable typical-utilization out-of-pocket. Be transparent in summary about assumptions.
- Be honest. If the employer plan is clearly better, say so. If marketplace wins, say so.
- Return ONLY JSON.`;

    const claudeRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = claudeRes.content.find((b: any) => b.type === 'text') as any;
    let responseText = textBlock?.text || '';
    responseText = responseText.replace(/```json|```/g, '').trim();

    let claudeData;
    try {
      claudeData = JSON.parse(responseText);
    } catch {
      return NextResponse.json(
        { error: 'Could not parse Claude response', raw: responseText.slice(0, 500) },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      mode: 'employer-vs-marketplace',
      employer_name: latestPacket.employer_name,
      plan_year: latestPacket.plan_year,
      employerPlans,
      marketplacePlans: topMarketplacePlans,
      verdict: claudeData,
      claimsUsed: claims?.length || 0,
    });
  } catch (error: any) {
    console.error('Compare plans error:', error);
    return NextResponse.json(
      { error: 'Unexpected error', details: error.message },
      { status: 500 }
    );
  }
}