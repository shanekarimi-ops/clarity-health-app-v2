import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ---------- Types ----------
type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ChatRequestBody = {
  user_id: string;
  messages: ChatMessage[];
  current_page?: string;
};

// ---------- Helpers ----------
function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n as number)) return '—';
  return '$' + Math.round(n as number).toLocaleString();
}

function pageContextHint(pathname?: string): string {
  if (!pathname) return 'Unknown';
  if (pathname.startsWith('/profile')) return 'Dashboard / profile overview';
  if (pathname.startsWith('/household')) return 'Editing household profile';
  if (pathname.startsWith('/find-plans')) return 'Browsing marketplace plan recommendations';
  if (pathname.startsWith('/my-plans')) return 'Viewing recommended plans';
  if (pathname.startsWith('/compare-plans')) return 'Side-by-side plan comparison';
  if (pathname.startsWith('/employer-benefits/coordinate')) return 'Coordinating benefits with spouse';
  if (pathname.startsWith('/employer-benefits/compare')) return 'Comparing employer plans';
  if (pathname.startsWith('/employer-benefits')) return 'Reviewing employer benefits packet';
  if (pathname.startsWith('/claims')) return 'Managing claims';
  if (pathname.startsWith('/uploaded-files')) return 'Reviewing uploaded files';
  if (pathname.startsWith('/settings')) return 'Account settings';
  if (pathname.startsWith('/help')) return 'Help / support page';
  if (pathname.startsWith('/billing')) return 'Billing page';
  return pathname;
}

// ---------- Build user context block ----------
async function buildUserContext(supabase: any, userId: string): Promise<string> {
  const lines: string[] = [];

  // Household
  const { data: household } = await supabase
    .from('households')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (household) {
    lines.push('## Household');
    lines.push(`- Coverage scope: ${household.coverage_scope || 'not set'}`);
    lines.push(`- Household size: ${household.household_size || 'not set'}`);
    lines.push(`- ZIP: ${household.zip_code || 'not set'}`);
    lines.push(`- Annual income: ${household.annual_income ? fmtMoney(household.annual_income) : 'not set'}`);
    if (household.monthly_budget) lines.push(`- Monthly budget: ${fmtMoney(household.monthly_budget)}`);
    if (household.conditions && household.conditions.length > 0) {
      lines.push(`- Conditions: ${household.conditions.join(', ')}`);
    }
    if (household.medications) lines.push(`- Medications: ${household.medications}`);
    if (household.preferred_providers) lines.push(`- Preferred providers: ${household.preferred_providers}`);
    lines.push(`- Tobacco: ${household.tobacco_any ? 'yes (someone in household)' : 'no'}`);
    lines.push(
      `- Priorities (1=low, 5=high): low-deductible=${household.priority_low_deductible ?? '—'}, mental-health=${household.priority_mental_health ?? '—'}, dental-vision=${household.priority_dental_vision ?? '—'}, nationwide=${household.priority_nationwide ?? '—'}`
    );

    // Members
    const { data: members } = await supabase
      .from('household_members')
      .select('*')
      .eq('household_id', household.id)
      .order('member_order', { ascending: true });

    if (members && members.length > 0) {
      lines.push('');
      lines.push('### Household members');
      members.forEach((m: any) => {
        lines.push(`- ${m.relationship || 'member'}, age ${m.age ?? '?'}, tobacco: ${m.tobacco_user ? 'yes' : 'no'}`);
      });
    }
  } else {
    lines.push('## Household');
    lines.push('No household profile created yet.');
  }

  // Employer benefits packets
  const { data: packets } = await supabase
    .from('employer_benefits_packets')
    .select('id, employer_name, plan_year, parse_status, is_spouse_packet')
    .eq('user_id', userId)
    .order('uploaded_at', { ascending: false });

  if (packets && packets.length > 0) {
    lines.push('');
    lines.push('## Employer benefits packets');
    for (const p of packets) {
      const role = p.is_spouse_packet ? "Spouse's" : 'Yours';
      lines.push(`- ${role}: ${p.employer_name || 'unnamed'} (${p.parse_status})`);
    }
  }

  // Claims (latest 10 only)
  const { data: claims } = await supabase
    .from('claims_uploads')
    .select('id, file_name, uploaded_at, status')
    .eq('user_id', userId)
    .order('uploaded_at', { ascending: false })
    .limit(10);

  if (claims && claims.length > 0) {
    lines.push('');
    lines.push(`## Recent claims uploads (${claims.length})`);
    claims.forEach((c: any) => {
      lines.push(`- ${c.file_name} — ${c.status || 'uploaded'}`);
    });
  }

  // Latest recommendation
  const { data: recommendation } = await supabase
    .from('recommendations')
    .select('id, created_at, coverage_scope, utilization_level, expected_annual_medical_spend, plans')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recommendation) {
    lines.push('');
    lines.push('## Latest plan recommendation');
    lines.push(`- Generated: ${new Date(recommendation.created_at).toLocaleDateString()}`);
    lines.push(`- Utilization estimate: ${recommendation.utilization_level || '—'}`);
    lines.push(`- Expected annual medical spend: ${fmtMoney(recommendation.expected_annual_medical_spend)}`);
    if (Array.isArray(recommendation.plans) && recommendation.plans.length > 0) {
      lines.push(`- Top recommended plans (${recommendation.plans.length}):`);
      recommendation.plans.slice(0, 3).forEach((p: any, i: number) => {
        const name = p.plan_marketing_name || p.name || `Plan ${i + 1}`;
        const annual = p.annualPremium ? fmtMoney(p.annualPremium) : '—';
        const expected = p.expectedAnnualCost ? fmtMoney(p.expectedAnnualCost) : '—';
        lines.push(`  ${i + 1}. ${name} — annual premium ${annual}, expected total ${expected}`);
      });
    }
  }

  if (lines.length === 0) return 'No user data available yet.';
  return lines.join('\n');
}

// ---------- System prompt ----------
function buildSystemPrompt(userContext: string, pageHint: string): string {
  return `You are the AI Assistant for Clarity Health, a benefits recommendation platform that helps people understand and choose health insurance.

# Your job
Help the user understand their health benefits, their options, and the tradeoffs they're weighing. You can:
- Explain insurance terminology (deductible, OOP max, HSA, HDHP, coinsurance, etc.) in plain language
- Help them interpret their own household profile and plan options
- Walk through the math behind cost projections
- Suggest features in Clarity Health that would help with their question (e.g. "you could try the Coordinate with Spouse tool")
- Acknowledge when something is genuinely uncertain or outside your knowledge

# Your boundaries
You are NOT a licensed insurance broker, financial advisor, doctor, or lawyer. You must:
- Never recommend a specific plan as "the right one" — instead, explain tradeoffs and let the user decide
- Never give tax, legal, or medical advice — point to a professional
- Never claim numbers are guaranteed — they're projections based on the data the user provided
- If asked about something outside health benefits (random trivia, unrelated topics), gently redirect to what you can help with
- If a user is in a clearly distressing health situation that needs urgent care, recommend they contact a doctor or 911 — don't try to handle it conversationally

# Tone
Warm, calm, direct. Plain English. No corporate jargon. Match the user's level — if they ask basic questions, explain simply; if they ask sophisticated ones, engage at that level. Keep responses concise unless they ask for depth. Use markdown sparingly (headers, bullets) when it helps clarity. Don't over-format simple answers.

# What you know about this user
The following data was loaded from their Clarity Health account. Reference it naturally when relevant. Don't dump it back at them — use it to inform your answers.

${userContext}

# Where they are in the app right now
${pageHint}

If the user asks "what should I do?" or "where do I go?", their current page is a clue — you can tell them what's on this page or suggest navigating elsewhere if more relevant.

# Important
- If you don't know something, say so. Don't invent facts about plans, prices, or coverage details.
- If the user's question would benefit from data you don't have (e.g. "what does Plan X cover?" but no plan details are in context), say "I don't have that detail in your account — can you check your plan documents or upload them via Employer Benefits?"
- Suggest using Clarity Health features when they fit (Compare Plans, Coordinate with Spouse, Find Plans, etc.)
- For complex decisions, you can suggest contacting a licensed broker — Clarity Health does not currently offer broker support directly, but most employers and state marketplaces do.`;
}

// ---------- Route ----------
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ChatRequestBody;

    if (!body?.user_id || !Array.isArray(body?.messages) || body.messages.length === 0) {
      return NextResponse.json(
        { error: 'Missing user_id or messages' },
        { status: 400 }
      );
    }

    // Sanity-cap message history to last 20 turns
    const messages = body.messages.slice(-20);

    // Build user context server-side via service-role Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      console.error('Missing Supabase env vars for chat route');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const userContext = await buildUserContext(supabase, body.user_id);
    const pageHint = pageContextHint(body.current_page);
    const systemPrompt = buildSystemPrompt(userContext, pageHint);

    // Call Anthropic
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('Missing ANTHROPIC_API_KEY for chat route');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    // Extract text from response
    let responseText = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        responseText += block.text;
      }
    }
    responseText = responseText.replace(/```json|```/g, '').trim();

    return NextResponse.json({
      success: true,
      reply: responseText,
      usage: {
        input_tokens: response.usage?.input_tokens,
        output_tokens: response.usage?.output_tokens,
      },
    });
  } catch (e: any) {
    console.error('Chat route error:', e);
    return NextResponse.json(
      { error: e?.message || 'Chat request failed' },
      { status: 500 }
    );
  }
}