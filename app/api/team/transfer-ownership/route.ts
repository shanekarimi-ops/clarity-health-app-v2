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
    const { caller_user_id, target_broker_id, confirmation } = await req.json();

    if (!caller_user_id || !target_broker_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Confirmation guard — client must send the literal string 'TRANSFER'
    if (confirmation !== 'TRANSFER') {
      return NextResponse.json({ error: 'Confirmation phrase required' }, { status: 400 });
    }

    // Get target
    const { data: target } = await supabaseAdmin
      .from('brokers')
      .select('id, user_id, agency_id, role, removed_at')
      .eq('id', target_broker_id)
      .maybeSingle();

    if (!target) {
      return NextResponse.json({ error: 'Target broker not found' }, { status: 404 });
    }

    if (target.removed_at) {
      return NextResponse.json({ error: 'Cannot transfer ownership to a removed broker' }, { status: 400 });
    }

    // Get caller
    const { data: caller } = await supabaseAdmin
      .from('brokers')
      .select('id, user_id, role, agency_id, removed_at')
      .eq('user_id', caller_user_id)
      .eq('agency_id', target.agency_id)
      .is('removed_at', null)
      .maybeSingle();

    if (!caller) {
      return NextResponse.json({ error: 'Not authorized for this agency' }, { status: 403 });
    }

    // Only the current Owner can transfer ownership
    if (caller.role !== 'owner') {
      return NextResponse.json({ error: 'Only the current Owner can transfer ownership' }, { status: 403 });
    }

    // Cannot transfer to self
    if (target.user_id === caller_user_id) {
      return NextResponse.json({ error: 'You are already the Owner' }, { status: 400 });
    }

    // Promote target to Owner
    const { error: promoteErr } = await supabaseAdmin
      .from('brokers')
      .update({ role: 'owner' })
      .eq('id', target_broker_id);

    if (promoteErr) {
      console.error('Promote error:', promoteErr);
      return NextResponse.json({ error: 'Failed to promote target' }, { status: 500 });
    }

    // Demote current Owner to Admin
    const { error: demoteErr } = await supabaseAdmin
      .from('brokers')
      .update({ role: 'admin' })
      .eq('id', caller.id);

    if (demoteErr) {
      console.error('Demote error:', demoteErr);
      // Try to revert the promotion
      await supabaseAdmin
        .from('brokers')
        .update({ role: target.role })
        .eq('id', target_broker_id);
      return NextResponse.json({ error: 'Failed to demote previous Owner — transfer reverted' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('transfer-ownership error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}