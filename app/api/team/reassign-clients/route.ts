import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { caller_user_id, client_ids, target_broker_id } = await req.json();

    if (!caller_user_id || !target_broker_id || !Array.isArray(client_ids) || client_ids.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get target broker
    const { data: target } = await supabaseAdmin
      .from('brokers')
      .select('id, agency_id, removed_at')
      .eq('id', target_broker_id)
      .maybeSingle();

    if (!target) {
      return NextResponse.json({ error: 'Target broker not found' }, { status: 404 });
    }

    if (target.removed_at) {
      return NextResponse.json({ error: 'Cannot reassign to a removed broker' }, { status: 400 });
    }

    // Get caller's broker row (must be in same agency, active)
    const { data: caller } = await supabaseAdmin
      .from('brokers')
      .select('id, role, removed_at, agency_id')
      .eq('user_id', caller_user_id)
      .eq('agency_id', target.agency_id)
      .is('removed_at', null)
      .maybeSingle();

    if (!caller) {
      return NextResponse.json({ error: 'Not authorized for this agency' }, { status: 403 });
    }

    // Fetch the clients to validate they belong to the agency + check current assignment
    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('id, agency_id, assigned_broker_id, employer_name')
      .in('id', client_ids);

    if (!clients || clients.length !== client_ids.length) {
      return NextResponse.json({ error: 'One or more clients not found' }, { status: 404 });
    }

    // All clients must be in the same agency as the caller
    for (const c of clients) {
      if (c.agency_id !== caller.agency_id) {
        return NextResponse.json({ error: 'Clients must belong to your agency' }, { status: 403 });
      }
    }

    // Permission check:
    // - Owner/Admin can reassign anything
    // - Broker can only reassign clients currently assigned to themselves
    if (caller.role === 'broker') {
      for (const c of clients) {
        if (c.assigned_broker_id !== caller.id) {
          return NextResponse.json({
            error: 'Brokers can only reassign their own clients',
          }, { status: 403 });
        }
      }
    }

    // Perform the reassignment
    const { error: updateErr } = await supabaseAdmin
      .from('clients')
      .update({ assigned_broker_id: target_broker_id })
      .in('id', client_ids);

    if (updateErr) {
      console.error('Reassignment error:', updateErr);
      return NextResponse.json({ error: 'Failed to reassign clients' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      reassigned_count: client_ids.length,
    });
  } catch (err: any) {
    console.error('reassign-clients error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}