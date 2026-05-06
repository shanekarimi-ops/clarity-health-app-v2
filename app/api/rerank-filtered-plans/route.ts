import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ===== Types (mirror recommend route) =====
type SimplifiedPlan = {
  id: string;
  name: string;
  issuer: string;
  type: string;
  metalLevel: string;
  premium: number;
  premiumWithCredit: number;
  deductible: number | null;
  maxOutOfPocket: number | null;
  hsaEligible: boolean;
  annualPremium: number;
  expectedAnnualCost: number;
  worstCaseAnnualCost: number;
  costRank: number | null;
};

type CoverageScope = 'individual' | 'employee_plus_spouse' | 'employee_plus_children' | 'family';

export async function POST(req: NextRequest) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!anthropicKey) {
    return NextResponse.json({ error: 'Missing ANTHROPIC_API_KEY' }, { status: 500 });
  }
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { recommendationId, planIds, userId } = body;

  if (!recommendationId || !Array.isArray(planIds) || planIds.length === 0 || !userId) {
    return NextResponse.json(
      { error: 'Missing recommendationId, planIds, or userId' },
      { status: 400 }
    );
  }

  if (planIds.length > 10) {
    return NextResponse.json(
      { error: 'Too many plans for AI ranking. Narrow filters to 10 or fewer plans.' },
      { status: 400 }
    );
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Load the recommendation row (must belong to this user)
    const { data: rec, error: recErr } = await supabaseAdmin
      .from('recommendations')
      .select('*')
      .eq('id', recommendationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (recErr || !rec) {
      return NextResponse.json(
        { error: 'Recommendation not found or access denied' },
        { status: 404 }
      );
    }

    const allPlans: SimplifiedPlan[] = Array.isArray(rec.all_plans) ? rec.all_plans : [];
    if (allPlans.length === 0) {
      return NextResponse.json(
        { error: 'No all_plans data on this recommendation. Re-run /find-plans first.' },
        { status: 400 }
      );
    }

    // Filter to just the requested plan IDs, preserving order
    const filteredPlans = planIds
      .map((id: string) => allPlans.find((p) => p.id === id))
      .filter(Boolean) as SimplifiedPlan[];

    if (filteredPlans.length === 0) {
      return NextResponse.json(
        { error: 'None of the requested plan IDs were found in this recommendation' },
        { status: 404 }
      );
    }

    // Load household for context
    const { data: household } = await supabaseAdmin
      .from('households')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const coverageScope: CoverageScope = (household?.coverage_scope as CoverageScope) || 'individual';
    const householdConditions: string[] = household?.conditions || [];
    const householdMedications: string = household?.medications || '';
    const householdProviders: string = household?.preferred_providers || '';
    const householdMonthlyBudget: number | null = household?.monthly_budget || null;
    const priorityLowDeductible = household?.priority_low_deductible || 3;
    const priorityMentalHealth = household?.priority_mental_health || 3;
    const priorityDentalVision = household?.priority_dental_vision || 3;
    const priorityNationwideNetwork = household?.priority_nationwide_network || 3;

    // Load parsed claims (same shape as recommend route)
    let parsedClaims: any[] = [];
    let claimsSummaryText = '';
    try {
      const { data: claimsData } = await supabaseAdmin
        .from('claims_parsed')
        .select(
          'conditions, procedures, medications, specialty_visits_count, prescription_count, total_billed, total_out_of_pocket, summary_text, parse_status'
        )
        .eq('parse_status', 'success')
        .eq('user_id', userId);
      if (Array.isArray(claimsData)) parsedClaims = claimsData;
    } catch (e) {
      console.error('Claims fetch failed in rerank route:', e);
    }

    if (parsedClaims.length > 0) {
      const allConditions = Array.from(new Set(parsedClaims.flatMap((c) => c.conditions || []))).filter(Boolean);
      const allProcedures = Array.from(new Set(parsedClaims.flatMap((c) => c.procedures || []))).filter(Boolean);
      const allMedications = Array.from(new Set(parsedClaims.flatMap((c) => c.medications || []))).filter(Boolean);
      const totalSpecialty = parsedClaims.reduce((sum, c) => sum + (c.specialty_visits_count || 0), 0);
      const totalRx = parsedClaims.reduce((sum, c) => sum + (c.prescription_count || 0), 0);
      const totalBilled = parsedClaims.reduce((sum, c) => sum + (Number(c.total_billed) || 0), 0);
      const totalClaimsOOP = parsedClaims.reduce((sum, c) => sum + (Number(c.total_out_of_pocket) || 0), 0);
      const summaries = parsedClaims.map((c) => c.summary_text).filter(Boolean);

      claimsSummaryText = `
Claims history (${parsedClaims.length} document${parsedClaims.length === 1 ? '' : 's'} on file):
- Conditions/diagnoses: ${allConditions.length > 0 ? allConditions.join(', ') : 'none extracted'}
- Procedures/services: ${allProcedures.length > 0 ? allProcedures.join(', ') : 'none extracted'}
- Medications: ${allMedications.length > 0 ? allMedications.join(', ') : 'none extracted'}
- Specialist visits: ${totalSpecialty}
- Prescriptions: ${totalRx}
- Total billed across claims: $${totalBilled.toFixed(2)}
- Total out-of-pocket: $${totalClaimsOOP.toFixed(2)}
${summaries.length > 0 ? '\nNotes from documents:\n' + summaries.map((s: string) => `- ${s}`).join('\n') : ''}
`.trim();
    }

    const householdProfileText = `
Household profile:
- Location: ${rec.county_name || '—'}, ${rec.state || '—'} (ZIP ${rec.zip_code || '—'})
- Coverage scope: ${prettyCoverageScope(coverageScope)}
- Household size: ${rec.household_size}
- Annual income: $${Number(rec.annual_income || 0).toLocaleString()}
- Ages: ${(rec.ages || []).join(', ')}
- Tobacco use: ${rec.uses_tobacco ? 'Yes' : 'No'}
${householdConditions.length > 0 ? '- Stated conditions: ' + householdConditions.join(', ') : ''}
${householdMedications ? '- Stated medications: ' + householdMedications : ''}
${householdProviders ? '- Preferred providers: ' + householdProviders : ''}
${householdMonthlyBudget ? '- Monthly budget target: $' + householdMonthlyBudget : ''}
- Priorities (1-5): low deductible ${priorityLowDeductible}, mental health ${priorityMentalHealth}, dental/vision ${priorityDentalVision}, nationwide network ${priorityNationwideNetwork}
- Estimated medical utilization level: ${rec.utilization_level || 'unknown'}
- Estimated annual medical spend before insurance: $${Number(rec.expected_annual_medical_spend || 0).toLocaleString()}
`.trim();

    const claimsAwareGuidance =
      parsedClaims.length > 0
        ? `IMPORTANT — This household has uploaded medical claims. Use that history to weight the ranking:
- Heavy specialist usage or chronic conditions → favor plans with low deductibles, broad networks, lower specialist copays.
- Multiple prescriptions → favor plans with strong prescription drug coverage.
- High past out-of-pocket spending → favor plans with lower MOOP and predictable costs.
- Low/routine usage → favor plans with low premiums even if deductible is higher.
For each plan, briefly note in claimsInsight which aspect of the claims data influenced its ranking.`
        : `This household has not uploaded any claims yet, so rank based on demographics, household profile, and price. Set claimsInsight to null for each plan.`;

    const prompt = `You are a health insurance advisor helping someone choose a Marketplace plan. The user has FILTERED their full plan list and wants AI ranking on these ${filteredPlans.length} specific plans they've narrowed to.

${householdProfileText}

${claimsSummaryText ? claimsSummaryText + '\n' : ''}${claimsAwareGuidance}

IMPORTANT: The "annualPremium", "expectedAnnualCost", and "worstCaseAnnualCost" fields below have ALREADY been calculated for this household. Use those numbers — do not recalculate. Reference household composition (e.g. "for your family of 4") in your summaries where relevant.

Plans to rank (filtered subset):
${JSON.stringify(filteredPlans, null, 2)}

Return ONLY a valid JSON object (no markdown, no code fences, no preamble) with this exact shape:
{
  "rankedPlans": [
    {
      "id": "the plan id",
      "rank": 1,
      "matchScore": 95,
      "summary": "One sentence on why this plan is a strong fit FOR THIS HOUSEHOLD (max 25 words). Reference composition where relevant.",
      "pros": ["Short bullet 1", "Short bullet 2", "Short bullet 3"],
      "cons": ["Short bullet 1", "Short bullet 2"],
      "claimsInsight": "Short note (max 25 words) on how claims data influenced this rank, or null if no claims."
    }
  ],
  "overallAdvice": "One paragraph (max 70 words) on this filtered set. Mention what the user's filters reveal about their priorities (e.g. 'Since you filtered to Gold-tier HMO plans...')."
}

Rules:
- Rank ALL ${filteredPlans.length} plans (rank 1 = best).
- matchScore 0-100. Spread realistically.
- The match score reflects overall fit — NOT just cost.
- Keep all text concise and free of insurance jargon.
- Pros/cons should be 2-4 items each.
- Return ONLY the JSON. No other text.`;

    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const claudeRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = claudeRes.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json(
        { error: 'Claude returned no text' },
        { status: 500 }
      );
    }

    let claudeData;
    try {
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

    // Merge Claude's rankings with the filtered plan data
    const rankedWithDetails = (claudeData.rankedPlans || [])
      .map((ranking: any) => {
        const planDetails = filteredPlans.find((p) => p.id === ranking.id);
        if (!planDetails) return null;
        return {
          ...planDetails,
          ...ranking,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.rank - b.rank);

    return NextResponse.json({
      success: true,
      filteredCount: filteredPlans.length,
      rankedPlans: rankedWithDetails,
      overallAdvice: claudeData.overallAdvice || '',
      claimsUsed: parsedClaims.length,
    });
  } catch (err: any) {
    console.error('Rerank route error:', err);
    return NextResponse.json(
      { error: 'Server error', detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}

function prettyCoverageScope(scope: CoverageScope): string {
  const map: Record<CoverageScope, string> = {
    individual: 'Just you (employee-only)',
    employee_plus_spouse: 'You + spouse',
    employee_plus_children: 'You + child(ren)',
    family: 'Whole family',
  };
  return map[scope] || scope;
}