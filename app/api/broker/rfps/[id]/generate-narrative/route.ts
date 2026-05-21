import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-4-5';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const rfpId = params.id;

  try {
    // --- Auth ---
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: 'Missing authorization' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }
    const userId = userData.user.id;
    const userMeta = userData.user.user_metadata || {};
    const actorName =
      [userMeta.first_name, userMeta.last_name].filter(Boolean).join(' ').trim() ||
      userData.user.email ||
      'Broker';

    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // --- Verify broker + agency match ---
    const { data: brokerRow, error: brokerErr } = await admin
      .from('brokers')
      .select('agency_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (brokerErr || !brokerRow) {
      return NextResponse.json({
        error: 'Broker profile not found',
        debug: { user_id: userId, error_message: brokerErr?.message },
      }, { status: 403 });
    }
    const agencyId = brokerRow.agency_id;

    // --- Fetch RFP + current plan baseline ---
    // CHANGED S42: clients(employer_name) → groups(name) since rfps now FK to groups
    const { data: rfp, error: rfpErr } = await admin
      .from('rfps')
      .select('id, name, agency_id, current_annual_cost, current_plan_design, effective_date, groups(name)')
      .eq('id', rfpId)
      .maybeSingle();

    if (rfpErr || !rfp) {
      return NextResponse.json({
        error: 'RFP not found',
        debug: { rfp_id: rfpId, error_message: rfpErr?.message },
      }, { status: 404 });
    }

    if (rfp.agency_id !== agencyId) {
      return NextResponse.json({
        error: 'RFP does not belong to your agency',
        debug: { rfp_agency_id: rfp.agency_id, broker_agency_id: agencyId },
      }, { status: 403 });
    }

    // --- Fetch all quotes + lines for this RFP ---
    const { data: quotes, error: quotesErr } = await admin
      .from('quotes')
      .select(`
        id,
        carrier_id,
        monthly_cost,
        total_annual_cost,
        cost_change_pct,
        status,
        notes,
        submitted_at,
        carriers ( name ),
        quote_lines (
          benefit_type,
          plan_name,
          rate_structure,
          rates,
          monthly_premium,
          annual_cost,
          plan_design,
          display_order
        )
      `)
      .eq('rfp_id', rfpId)
      .order('submitted_at', { ascending: true, nullsFirst: false });

    if (quotesErr) {
      return NextResponse.json({
        error: 'Could not load quotes for this RFP',
        debug: { error_message: quotesErr.message },
      }, { status: 500 });
    }

    if (!quotes || quotes.length === 0) {
      return NextResponse.json({
        error: 'No quotes have been submitted for this RFP yet',
        debug: { rfp_id: rfpId },
      }, { status: 400 });
    }

    const quoteIds = quotes.map((q: any) => q.id);

    // --- Build the prompt context ---
    // CHANGED S42: rfp.clients → rfp.groups (and the field is 'name' not 'employer_name')
    const employerName = (rfp.groups as any)?.name || 'the client';
    const rfpName = rfp.name || 'this RFP';
    const baseline = rfp.current_annual_cost;
    const currentPlan = rfp.current_plan_design || {};

    const quotesContext = quotes.map((q: any) => ({
      carrier: q.carriers?.name || 'Unknown carrier',
      monthly_cost: q.monthly_cost,
      total_annual_cost: q.total_annual_cost,
      cost_change_pct: q.cost_change_pct,
      notes: q.notes,
      lines: (q.quote_lines || [])
        .sort((a: any, b: any) => a.display_order - b.display_order)
        .map((l: any) => ({
          benefit_type: l.benefit_type,
          plan_name: l.plan_name,
          monthly_premium: l.monthly_premium,
          annual_cost: l.annual_cost,
          rates: l.rates,
          plan_design: l.plan_design,
        })),
    }));

    const prompt = `You are a senior employee benefits broker reviewing carrier proposals for a renewal.
Write 3 to 5 short bullet point highlights summarizing how the submitted quote(s) compare to the client's current plan.
Each bullet should be a single concise sentence (under 25 words). Be specific and broker-grade — mention dollar amounts, percentages, and plan design tradeoffs by name. No fluff, no preamble.

CLIENT: ${employerName}
RFP: ${rfpName}
CURRENT ANNUAL COST: ${baseline != null ? '$' + baseline.toLocaleString() : 'not provided (omit dollar comparisons in bullets)'}

CURRENT PLAN DESIGN (jsonb):
${JSON.stringify(currentPlan, null, 2)}

SUBMITTED QUOTES (${quotes.length} carrier${quotes.length === 1 ? '' : 's'}):
${JSON.stringify(quotesContext, null, 2)}

Return ONLY a JSON object with this exact shape (no markdown fences, no commentary):
{ "bullets": ["bullet 1", "bullet 2", "bullet 3"] }

Examples of strong bullets:
- "Total annual cost is up 5.4% vs current ($737K vs $700K baseline)."
- "Medical deductibles dropped from $400 individual to $2,000 — significantly less rich coverage."
- "Rx tier 1 generics held at $15 copay, but specialty Rx switched to 30% coinsurance up to $300."
- "Vision and dental terms are roughly equivalent to current plan."
- "No life insurance included in this quote — client currently has $5K group life."`;

    // --- Call Claude ---
    let aiResponse;
    try {
      aiResponse = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });
    } catch (apiErr: any) {
      console.error('Anthropic API error:', apiErr);
      return NextResponse.json({
        error: 'AI generation failed',
        debug: { message: apiErr?.message || String(apiErr) },
      }, { status: 500 });
    }

    const aiText = aiResponse.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('')
      .trim();

    // --- Parse the JSON response ---
    let bullets: string[];
    try {
      const cleaned = aiText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed.bullets) || parsed.bullets.length === 0) {
        throw new Error('No bullets in response');
      }
      bullets = parsed.bullets
        .filter((b: any) => typeof b === 'string' && b.trim().length > 0)
        .slice(0, 5);
      if (bullets.length === 0) throw new Error('All bullets were empty');
    } catch (parseErr: any) {
      console.error('Failed to parse AI response:', { aiText, parseErr });
      return NextResponse.json({
        error: 'AI returned unparseable response',
        debug: { ai_text: aiText.slice(0, 500), parse_error: parseErr.message },
      }, { status: 500 });
    }

    // --- UPSERT into rfp_ai_narratives ---
    const { data: upserted, error: upsertErr } = await admin
      .from('rfp_ai_narratives')
      .upsert({
        rfp_id: rfpId,
        agency_id: agencyId,
        bullets: bullets,
        quotes_count: quotes.length,
        quote_ids: quoteIds,
        model: MODEL,
        generated_by_user_id: userId,
        generated_by_name: actorName,
        created_at: new Date().toISOString(),
      }, {
        onConflict: 'rfp_id',
      })
      .select()
      .single();

    if (upsertErr) {
      return NextResponse.json({
        error: 'Could not save generated narrative',
        debug: { error_message: upsertErr.message, error_code: upsertErr.code },
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      narrative: upserted,
    });
  } catch (err: any) {
    console.error('Generate-narrative API error:', err);
    return NextResponse.json({
      error: 'Internal server error',
      debug: { message: err?.message || String(err) },
    }, { status: 500 });
  }
}