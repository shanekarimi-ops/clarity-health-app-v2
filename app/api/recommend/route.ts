import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const MARKETPLACE_BASE = 'https://marketplace.api.healthcare.gov/api/v1';

export const runtime = 'nodejs';
export const maxDuration = 60;

type CoverageScope = 'individual' | 'employee_plus_spouse' | 'employee_plus_children' | 'family';
type UtilizationLevel = 'low' | 'moderate' | 'high';

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

  const { zipCode, householdSize, annualIncome, ages, usesTobacco, userId, clientId } = body;

  if (!zipCode || !householdSize || !annualIncome || !Array.isArray(ages) || ages.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    // ===== Step 0a: Broker access check (unchanged) =====
    if (clientId && userId && supabaseUrl && serviceKey) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, serviceKey);

        const { data: brokerRow, error: brokerErr } = await supabaseAdmin
          .from('brokers')
          .select('agency_id, role')
          .eq('user_id', userId)
          .single();

        if (brokerErr || !brokerRow) {
          return NextResponse.json(
            { error: 'You are not registered as a broker' },
            { status: 403 }
          );
        }

        const { data: clientRow, error: clientErr } = await supabaseAdmin
          .from('clients')
          .select('agency_id')
          .eq('id', clientId)
          .single();

        if (clientErr || !clientRow) {
          return NextResponse.json(
            { error: 'Client not found' },
            { status: 404 }
          );
        }

        if (clientRow.agency_id !== brokerRow.agency_id) {
          return NextResponse.json(
            { error: 'You do not have access to this client' },
            { status: 403 }
          );
        }
      } catch (e: any) {
        console.error('Access check failed:', e);
        return NextResponse.json(
          { error: 'Access check failed', detail: e?.message },
          { status: 500 }
        );
      }
    }

    // ===== Step 0b: Load household + claims for context =====
    let householdContext: any = null;
    let coverageScope: CoverageScope = 'individual';
    let householdConditions: string[] = [];
    let householdMedications = '';
    let householdProviders = '';
    let householdMonthlyBudget: number | null = null;
    let priorityLowDeductible = 3;
    let priorityMentalHealth = 3;
    let priorityDentalVision = 3;
    let priorityNationwideNetwork = 3;

    if (supabaseUrl && serviceKey && userId && !clientId) {
      // Individual flow — pull from households table
      try {
        const supabaseAdmin = createClient(supabaseUrl, serviceKey);
        const { data: household } = await supabaseAdmin
          .from('households')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (household) {
          householdContext = household;
          coverageScope = (household.coverage_scope as CoverageScope) || 'individual';
          householdConditions = household.conditions || [];
          householdMedications = household.medications || '';
          householdProviders = household.preferred_providers || '';
          householdMonthlyBudget = household.monthly_budget || null;
          priorityLowDeductible = household.priority_low_deductible || 3;
          priorityMentalHealth = household.priority_mental_health || 3;
          priorityDentalVision = household.priority_dental_vision || 3;
          priorityNationwideNetwork = household.priority_nationwide_network || 3;
        }
      } catch (e) {
        console.error('Household fetch failed, continuing with defaults:', e);
      }
    }

    // ===== Step 0c: Fetch parsed claims =====
    let parsedClaims: any[] = [];
    let claimsSummaryText = '';
    let totalClaimsOOP = 0;
    let totalSpecialty = 0;
    let totalRx = 0;
    let allConditions: string[] = [];
    let allProcedures: string[] = [];
    let allMedications: string[] = [];

    if (supabaseUrl && serviceKey && (clientId || userId)) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, serviceKey);

        let query = supabaseAdmin
          .from('claims_parsed')
          .select('conditions, procedures, medications, specialty_visits_count, prescription_count, total_billed, total_out_of_pocket, summary_text, parse_status')
          .eq('parse_status', 'success');

        if (clientId) {
          query = query.eq('client_id', clientId);
        } else if (userId) {
          query = query.eq('user_id', userId);
        }

        const { data: claimsData, error: claimsError } = await query;

        if (!claimsError && claimsData) {
          parsedClaims = claimsData;
        }
      } catch (e) {
        console.error('Claims fetch failed, continuing without claims context:', e);
      }
    }

    if (parsedClaims.length > 0) {
      allConditions = Array.from(new Set(parsedClaims.flatMap((c) => c.conditions || []))).filter(Boolean);
      allProcedures = Array.from(new Set(parsedClaims.flatMap((c) => c.procedures || []))).filter(Boolean);
      allMedications = Array.from(new Set(parsedClaims.flatMap((c) => c.medications || []))).filter(Boolean);
      totalSpecialty = parsedClaims.reduce((sum, c) => sum + (c.specialty_visits_count || 0), 0);
      totalRx = parsedClaims.reduce((sum, c) => sum + (c.prescription_count || 0), 0);
      const totalBilled = parsedClaims.reduce((sum, c) => sum + (Number(c.total_billed) || 0), 0);
      totalClaimsOOP = parsedClaims.reduce((sum, c) => sum + (Number(c.total_out_of_pocket) || 0), 0);
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
${summaries.length > 0 ? '\nNotes from documents:\n' + summaries.map((s) => `- ${s}`).join('\n') : ''}
`.trim();
    }

    // ===== RULES LAYER: Determine utilization level + expected annual spend =====
    const utilizationLevel = estimateUtilizationLevel({
      claimsCount: parsedClaims.length,
      conditions: [...allConditions, ...householdConditions],
      specialty: totalSpecialty,
      rx: totalRx,
      claimsOOP: totalClaimsOOP,
      householdSize,
    });
    const expectedAnnualMedicalSpend = expectedSpendForLevel(utilizationLevel, householdSize);

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

    // Take top 10 by lowest premium-with-credit
    const topPlans = [...allPlans]
      .sort((a, b) => (a.premium_w_credit ?? a.premium ?? 0) - (b.premium_w_credit ?? b.premium ?? 0))
      .slice(0, 10);

    // Simplify + attach projections (Marketplace plans are always whole-household priced)
    const simplified = topPlans.map((p: any) => {
      const monthlyPremium = p.premium_w_credit ?? p.premium ?? 0;
      const annualPremium = monthlyPremium * 12;
      const deductible = p.deductibles?.[0]?.amount ?? 0;
      const oopMax = p.moops?.[0]?.amount ?? deductible;
      const expectedOOP = expectedOOPGivenSpend(expectedAnnualMedicalSpend, deductible, oopMax);
      const expectedAnnualCost = annualPremium + expectedOOP;
      const worstCaseAnnualCost = annualPremium + oopMax;
      return {
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
        // Projection fields
        annualPremium,
        expectedAnnualCost,
        worstCaseAnnualCost,
      };
    });

    // Compute cost rank (lowest expectedAnnualCost = rank 1)
    const costRanked = [...simplified]
      .map((p, i) => ({ id: p.id, exp: p.expectedAnnualCost, originalIdx: i }))
      .sort((a, b) => a.exp - b.exp);
    const costRankById: Record<string, number> = {};
    costRanked.forEach((entry, i) => {
      costRankById[entry.id] = i + 1;
    });

    // ===== Step 3: Send to Claude for AI ranking =====
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const householdProfileText = `
Household profile:
- Location: ${county.name}, ${state} (ZIP ${zipCode})
- Coverage scope: ${prettyCoverageScope(coverageScope)}
- Household size: ${householdSize}
- Annual income: $${annualIncome.toLocaleString()}
- Ages: ${ages.join(', ')}
- Tobacco use: ${usesTobacco ? 'Yes' : 'No'}
${householdConditions.length > 0 ? '- Stated conditions: ' + householdConditions.join(', ') : ''}
${householdMedications ? '- Stated medications: ' + householdMedications : ''}
${householdProviders ? '- Preferred providers: ' + householdProviders : ''}
${householdMonthlyBudget ? '- Monthly budget target: $' + householdMonthlyBudget : ''}
- Priorities (1-5): low deductible ${priorityLowDeductible}, mental health ${priorityMentalHealth}, dental/vision ${priorityDentalVision}, nationwide network ${priorityNationwideNetwork}
- Estimated medical utilization level (rules-derived): ${utilizationLevel}
- Estimated annual medical spend before insurance: $${expectedAnnualMedicalSpend.toLocaleString()}
`.trim();

    const claimsAwareGuidance = parsedClaims.length > 0
      ? `IMPORTANT — This household has uploaded medical claims. Use that history to weight the ranking:
- Heavy specialist usage or chronic conditions → favor plans with low deductibles, broad networks, lower specialist copays.
- Multiple prescriptions → favor plans with strong prescription drug coverage.
- High past out-of-pocket spending → favor plans with lower MOOP and predictable costs.
- Low/routine usage → favor plans with low premiums even if deductible is higher.
For each plan, briefly note in claimsInsight which aspect of the claims data influenced its ranking.`
      : `This household has not uploaded any claims yet, so rank based on demographics, household profile, and price. Set claimsInsight to null for each plan.`;

    const prompt = `You are a health insurance advisor helping someone choose a Marketplace plan. Rank these ${simplified.length} plans for this household and explain your reasoning in plain English (no jargon).

${householdProfileText}

${claimsSummaryText ? claimsSummaryText + '\n' : ''}${claimsAwareGuidance}

IMPORTANT: The "annualPremium", "expectedAnnualCost", and "worstCaseAnnualCost" fields below have ALREADY been calculated for this household. Use those numbers — do not recalculate. Reference household composition (e.g. "for your family of 4") in your summaries where relevant.

Plans available:
${JSON.stringify(simplified, null, 2)}

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
  "overallAdvice": "One paragraph (max 70 words) of overall guidance. Reference the household composition. If claims were used, briefly mention how they shaped the recommendation."
}

Rules:
- Rank ALL ${simplified.length} plans (rank 1 = best).
- matchScore 0-100, where 100 = perfect fit. Spread the scores realistically (don't cluster everyone at 90+).
- The match score reflects overall fit — NOT just cost. Cost projection rank is calculated separately and shown to the user.
- Keep all text concise and free of insurance jargon.
- Pros/cons should be 2-4 items each.
- Return ONLY the JSON. No other text.`;

    const claudeRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = claudeRes.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json(
        { error: 'Claude returned no text', detail: claudeRes },
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

    // Merge Claude's rankings with the original plan data + projections + cost rank
    const rankedWithDetails = (claudeData.rankedPlans || [])
      .map((ranking: any) => {
        const planDetails = simplified.find((p: any) => p.id === ranking.id);
        if (!planDetails) return null;
        return {
          ...planDetails,
          ...ranking,
          costRank: costRankById[planDetails.id] || null,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.rank - b.rank);

    // ===== Step 4: Save the recommendation row =====
    let savedRecId: string | null = null;
    if (supabaseUrl && serviceKey && userId) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, serviceKey);
        const { data: savedRec, error: saveErr } = await supabaseAdmin
          .from('recommendations')
          .insert({
            user_id: userId,
            client_id: clientId || null,
            zip_code: zipCode,
            county_name: county.name,
            state: state,
            household_size: householdSize,
            annual_income: annualIncome,
            ages: ages,
            uses_tobacco: !!usesTobacco,
            total_plans_available: allPlans.length,
            overall_advice: claudeData.overallAdvice || '',
            plans: rankedWithDetails,
            // P6 new fields
            coverage_scope: coverageScope,
            utilization_level: utilizationLevel,
            expected_annual_medical_spend: expectedAnnualMedicalSpend,
          })
          .select('id')
          .single();

        if (!saveErr && savedRec) {
          savedRecId = savedRec.id;
        } else if (saveErr) {
          console.error('Failed to save recommendation row:', saveErr);
        }
      } catch (e) {
        console.error('Recommendation save failed:', e);
      }
    }

    return NextResponse.json({
      success: true,
      recommendationId: savedRecId,
      county: { fips: countyfips, state: state, name: county.name },
      totalPlansAvailable: allPlans.length,
      planCount: rankedWithDetails.length,
      plans: rankedWithDetails,
      overallAdvice: claudeData.overallAdvice || '',
      coverageScope,
      utilizationLevel,
      expectedAnnualMedicalSpend,
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

// ============================================================
// RULES LAYER HELPERS (mirror compare-plans/route.ts for consistency)
// ============================================================

function prettyCoverageScope(scope: CoverageScope): string {
  const map: Record<CoverageScope, string> = {
    individual: 'Just you (employee-only)',
    employee_plus_spouse: 'You + spouse',
    employee_plus_children: 'You + child(ren)',
    family: 'Whole family',
  };
  return map[scope] || scope;
}

function estimateUtilizationLevel(input: {
  claimsCount: number;
  conditions: string[];
  specialty: number;
  rx: number;
  claimsOOP: number;
  householdSize: number;
}): UtilizationLevel {
  const { claimsCount, conditions, specialty, rx, claimsOOP, householdSize } = input;

  const highSeverityConditions = ['cancer', 'heart disease', 'autoimmune', 'chronic pain', 'pregnancy'];
  const moderateSeverityConditions = ['diabetes', 'hypertension', 'asthma', 'mental health'];

  const conditionsLower = conditions.map((c) => c.toLowerCase());
  const hasHighCondition = highSeverityConditions.some((hc) => conditionsLower.some((c) => c.includes(hc)));
  const hasModerateCondition = moderateSeverityConditions.some((mc) => conditionsLower.some((c) => c.includes(mc)));

  let score = 0;
  if (hasHighCondition) score += 3;
  if (hasModerateCondition) score += 1.5;
  if (specialty >= 5) score += 2;
  else if (specialty >= 2) score += 1;
  if (rx >= 10) score += 2;
  else if (rx >= 4) score += 1;
  if (claimsOOP >= 5000) score += 2;
  else if (claimsOOP >= 1500) score += 1;
  if (householdSize >= 4) score += 0.5;

  if (claimsCount === 0 && !hasHighCondition && !hasModerateCondition) return 'low';

  if (score >= 4) return 'high';
  if (score >= 1.5) return 'moderate';
  return 'low';
}

function expectedSpendForLevel(level: UtilizationLevel, householdSize: number): number {
  const perPersonBase: Record<UtilizationLevel, number> = {
    low: 800,
    moderate: 3500,
    high: 9000,
  };
  const effectivePeople = householdSize === 1 ? 1 : 1 + (householdSize - 1) * 0.6;
  return Math.round(perPersonBase[level] * effectivePeople);
}

function expectedOOPGivenSpend(annualSpend: number, deductible: number, oopMax: number): number {
  if (annualSpend <= 0) return 0;
  if (deductible <= 0) {
    return Math.min(annualSpend * 0.2, oopMax);
  }
  if (annualSpend <= deductible) {
    return annualSpend;
  }
  const overDeductible = annualSpend - deductible;
  const coinsurance = overDeductible * 0.2;
  const total = deductible + coinsurance;
  return Math.min(total, oopMax || total);
}