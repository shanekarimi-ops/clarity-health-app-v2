import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Allowed values from CHECK constraints (S36 discovery)
const ALLOWED_BENEFIT_TYPES = ['medical', 'dental', 'vision', 'life', 'std', 'ltd'];
const ALLOWED_RATE_STRUCTURES = ['tiered_4', 'tiered_2', 'composite', 'age_banded'];

// Shape of a benefit line in the request body
type LineInput = {
  benefit_type: string;
  plan_name: string | null;
  rate_structure: string | null;
  monthly_premium: number | null;
  annual_cost: number | null;
  rates: any;            // { employee_only, employee_spouse, employee_children, family }
  plan_design: any;      // per-type schema (see parse-quote-pdf prompt)
};

// Shape of the request body
type SubmitBody = {
  proposal_doc_url: string | null;
  extracted_data: any | null;   // raw AI extraction (for audit trail in quotes.extracted_data)
  carrier_name: string | null;
  effective_date: string | null;
  total_annual_cost: number | null;
  monthly_cost: number | null;
  lines: LineInput[];
  notes: string | null;
  extraction_status: 'extracted' | 'manual';
};

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const rfpId = params.id;

    // 1. Auth
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }
    const token = authHeader.substring(7);
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    // 2. Resolve carrier_user
    const { data: carrierUser, error: cuError } = await supabaseAdmin
      .from('carrier_users')
      .select('id, carrier_id')
      .eq('user_id', user.id)
      .single();
    if (cuError || !carrierUser) {
      return NextResponse.json({ error: 'No carrier account linked to this user' }, { status: 403 });
    }

    // 3. Verify assignment + get the rfp_carrier row
    const { data: rfpCarrier, error: rcError } = await supabaseAdmin
      .from('rfp_carriers')
      .select('id, carrier_id, status, rfp_id')
      .eq('rfp_id', rfpId)
      .eq('assigned_carrier_user_id', carrierUser.id)
      .single();
    if (rcError || !rfpCarrier) {
      console.error('[submit-quote] rfp_carriers lookup failed', { rfpId, carrierUserId: carrierUser.id, rcError });
      return NextResponse.json({
        error: 'RFP not found or not assigned to you',
        debug: {
          rfp_id_used: rfpId,
          carrier_user_id_used: carrierUser.id,
          rc_error_message: rcError?.message ?? null,
        },
      }, { status: 404 });
    }

    // 4. Status guards
    if (rfpCarrier.status === 'declined') {
      return NextResponse.json({ error: 'This RFP was declined. Cannot submit a quote.' }, { status: 409 });
    }
    if (['won', 'lost'].includes(rfpCarrier.status)) {
      return NextResponse.json({ error: `RFP is closed (status: ${rfpCarrier.status}). Cannot submit a quote.` }, { status: 409 });
    }
    // status === 'submitted' is allowed — that means a revision

    // 5. Parse request body
    let body: SubmitBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body || !Array.isArray(body.lines)) {
      return NextResponse.json({ error: 'Body must include a "lines" array' }, { status: 400 });
    }

    // 6. Validate lines and clean up
    const cleanedLines: Array<{
      benefit_type: string;
      plan_name: string | null;
      rate_structure: string | null;
      monthly_premium: number | null;
      annual_cost: number | null;
      rates: any;
      plan_design: any;
      display_order: number;
    }> = [];

    for (let i = 0; i < body.lines.length; i++) {
      const line = body.lines[i];
      if (!line || typeof line !== 'object') {
        return NextResponse.json({ error: `Line ${i} is not a valid object` }, { status: 400 });
      }
      if (!ALLOWED_BENEFIT_TYPES.includes(line.benefit_type)) {
        return NextResponse.json(
          { error: `Line ${i}: invalid benefit_type "${line.benefit_type}". Must be one of: ${ALLOWED_BENEFIT_TYPES.join(', ')}` },
          { status: 400 }
        );
      }
      const cleanedRateStructure = line.rate_structure && ALLOWED_RATE_STRUCTURES.includes(line.rate_structure)
        ? line.rate_structure
        : null;
      cleanedLines.push({
        benefit_type: line.benefit_type,
        plan_name: line.plan_name || null,
        rate_structure: cleanedRateStructure,
        monthly_premium: typeof line.monthly_premium === 'number' ? line.monthly_premium : null,
        annual_cost: typeof line.annual_cost === 'number' ? line.annual_cost : null,
        rates: line.rates || null,
        plan_design: line.plan_design || null,
        display_order: i,
      });
    }

    // 7. Determine if this is a revision (existing quote) or first submit
    const { data: existingQuote, error: existingError } = await supabaseAdmin
      .from('quotes')
      .select('id')
      .eq('rfp_carrier_id', rfpCarrier.id)
      .maybeSingle();

    if (existingError) {
      console.error('[submit-quote] existing quote lookup error:', existingError);
      return NextResponse.json({ error: 'Database error looking up existing quote', details: existingError.message }, { status: 500 });
    }

    const isRevision = !!existingQuote;
    const nowIso = new Date().toISOString();

    let quoteId: string;

    if (isRevision) {
      // 8a. UPDATE existing quote row
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('quotes')
        .update({
          submitted_by_carrier_user_id: carrierUser.id,
          proposal_doc_url: body.proposal_doc_url || null,
          extracted_data: body.extracted_data || null,
          extraction_status: body.extraction_status === 'manual' ? 'manual' : 'extracted',
          extraction_error: null,
          total_annual_cost: typeof body.total_annual_cost === 'number' ? body.total_annual_cost : null,
          monthly_cost: typeof body.monthly_cost === 'number' ? body.monthly_cost : null,
          status: 'submitted',
          notes: body.notes || null,
          submitted_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', existingQuote!.id)
        .select('id')
        .single();
      if (updateError || !updated) {
        console.error('[submit-quote] quotes update failed:', updateError);
        return NextResponse.json({ error: 'Could not update quote', details: updateError?.message }, { status: 500 });
      }
      quoteId = updated.id;

      // Delete existing quote_lines so we can re-insert
      const { error: deleteLinesError } = await supabaseAdmin
        .from('quote_lines')
        .delete()
        .eq('quote_id', quoteId);
      if (deleteLinesError) {
        console.error('[submit-quote] quote_lines delete failed:', deleteLinesError);
        return NextResponse.json({ error: 'Could not clear existing quote lines', details: deleteLinesError.message }, { status: 500 });
      }
    } else {
      // 8b. INSERT new quote row
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('quotes')
        .insert({
          rfp_id: rfpCarrier.rfp_id,
          rfp_carrier_id: rfpCarrier.id,
          carrier_id: rfpCarrier.carrier_id,
          submitted_by_carrier_user_id: carrierUser.id,
          proposal_doc_url: body.proposal_doc_url || null,
          extracted_data: body.extracted_data || null,
          extraction_status: body.extraction_status === 'manual' ? 'manual' : 'extracted',
          total_annual_cost: typeof body.total_annual_cost === 'number' ? body.total_annual_cost : null,
          monthly_cost: typeof body.monthly_cost === 'number' ? body.monthly_cost : null,
          status: 'submitted',
          notes: body.notes || null,
          submitted_at: nowIso,
        })
        .select('id')
        .single();
      if (insertError || !inserted) {
        console.error('[submit-quote] quotes insert failed:', insertError);
        return NextResponse.json({ error: 'Could not create quote', details: insertError?.message }, { status: 500 });
      }
      quoteId = inserted.id;
    }

    // 9. INSERT quote_lines
    if (cleanedLines.length > 0) {
      const linesToInsert = cleanedLines.map(l => ({
        quote_id: quoteId,
        benefit_type: l.benefit_type,
        plan_name: l.plan_name,
        plan_design: l.plan_design,
        rate_structure: l.rate_structure,
        rates: l.rates,
        monthly_premium: l.monthly_premium,
        annual_cost: l.annual_cost,
        display_order: l.display_order,
      }));
      const { error: linesError } = await supabaseAdmin
        .from('quote_lines')
        .insert(linesToInsert);
      if (linesError) {
        console.error('[submit-quote] quote_lines insert failed:', linesError);
        // Quote header already inserted/updated. Don't try to roll back — leave the header and let the carrier retry.
        return NextResponse.json({
          error: 'Could not save quote line details',
          details: linesError.message,
          partial_quote_id: quoteId,
        }, { status: 500 });
      }
    }

    // 10. Update rfp_carriers status to 'submitted' (only if not already)
    if (rfpCarrier.status !== 'submitted') {
      const { error: rcUpdateError } = await supabaseAdmin
        .from('rfp_carriers')
        .update({
          status: 'submitted',
          updated_at: nowIso,
        })
        .eq('id', rfpCarrier.id);
      if (rcUpdateError) {
        console.error('[submit-quote] rfp_carriers update failed:', rcUpdateError);
        // Non-fatal — the quote is saved. Log and continue.
      }
    }

    // 11. Log engagement event
    const { error: logError } = await supabaseAdmin
      .from('rfp_engagement_log')
      .insert({
        rfp_id: rfpCarrier.rfp_id,
        rfp_carrier_id: rfpCarrier.id,
        carrier_user_id: carrierUser.id,
        event_type: 'proposal_uploaded',
        occurred_at: nowIso,
        metadata: {
          quote_id: quoteId,
          is_revision: isRevision,
          line_count: cleanedLines.length,
          extraction_status: body.extraction_status,
        },
      });
    if (logError) {
      console.error('[submit-quote] engagement_log insert failed:', logError);
      // Non-fatal
    }

    // 12. Done
    return NextResponse.json({
      success: true,
      quote_id: quoteId,
      is_revision: isRevision,
      line_count: cleanedLines.length,
    });
  } catch (error: any) {
    console.error('[submit-quote] unexpected error:', error);
    return NextResponse.json({ error: 'Unexpected error', details: error.message }, { status: 500 });
  }
}