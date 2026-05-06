import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logAuditEvent } from '../_audit';

export const runtime = 'nodejs';
export const maxDuration = 30;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { caller_user_id, target_broker_id } = await req.json();

    if (!caller_user_id || !target_broker_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get target
    const { data: target } = await supabaseAdmin
      .from('brokers')
      .select('id, user_id, agency_id, role, removed_at')
      .eq('id', target_broker_id)
      .maybeSingle();

    if (!target) {
      return NextResponse.json({ error: 'Broker not found' }, { status: 404 });
    }

    if (target.removed_at) {
      return NextResponse.json({ error: 'Broker already removed' }, { status: 400 });
    }

    // Get caller (must be in same agency, active)
    const { data: caller } = await supabaseAdmin
      .from('brokers')
      .select('id, user_id, role, removed_at')
      .eq('user_id', caller_user_id)
      .eq('agency_id', target.agency_id)
      .is('removed_at', null)
      .maybeSingle();

    if (!caller) {
      return NextResponse.json({ error: 'Not authorized for this agency' }, { status: 403 });
    }

    // Permission rules:
    // - Owner can remove anyone except self
    // - Admin can remove Brokers only (not Owner, not other Admins, not self)
    if (target.user_id === caller_user_id) {
      return NextResponse.json({ error: 'You cannot remove yourself' }, { status: 400 });
    }

    if (target.role === 'owner') {
      return NextResponse.json({ error: 'The Owner cannot be removed. Transfer ownership first.' }, { status: 400 });
    }

    if (caller.role === 'admin' && target.role !== 'broker') {
      return NextResponse.json({ error: 'Admins can only remove Brokers' }, { status: 403 });
    }

    if (caller.role !== 'owner' && caller.role !== 'admin') {
      return NextResponse.json({ error: 'Only Owners and Admins can remove brokers' }, { status: 403 });
    }

    // Find the Owner of this agency to reassign clients to
    const { data: owner } = await supabaseAdmin
      .from('brokers')
      .select('id')
      .eq('agency_id', target.agency_id)
      .eq('role', 'owner')
      .is('removed_at', null)
      .maybeSingle();

    if (!owner) {
      return NextResponse.json({ error: 'Agency has no active Owner — cannot reassign clients' }, { status: 500 });
    }

    // Reassign all of target's clients to Owner
    const { error: reassignErr } = await supabaseAdmin
      .from('clients')
      .update({ assigned_broker_id: owner.id })
      .eq('agency_id', target.agency_id)
      .eq('assigned_broker_id', target.id);

    if (reassignErr) {
      console.error('Client reassignment error:', reassignErr);
      return NextResponse.json({ error: 'Failed to reassign clients' }, { status: 500 });
    }

    // Soft-delete the broker
    const { error: removeErr } = await supabaseAdmin
      .from('brokers')
      .update({
        removed_at: new Date().toISOString(),
        removed_by_user_id: caller_user_id,
      })
      .eq('id', target_broker_id);

    if (removeErr) {
      console.error('Broker remove error:', removeErr);
      return NextResponse.json({ error: 'Failed to remove broker' }, { status: 500 });
    }

    await logAuditEvent(supabaseAdmin, {
        agency_id: target.agency_id,
        event_type: 'broker_removed',
        actor_user_id: caller_user_id,
        details: {
          target_broker_id,
          target_user_id: target.user_id,
          target_role: target.role,
          reassigned_to_owner_broker_id: owner.id,
        },
      });
  
      return NextResponse.json({ success: true });
    } catch (err: any) {
      console.error('remove-broker error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}