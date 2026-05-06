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
    const { caller_user_id, target_broker_id, new_role } = await req.json();

    if (!caller_user_id || !target_broker_id || !new_role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['admin', 'broker'].includes(new_role)) {
      return NextResponse.json({ error: 'Invalid role. Use transfer-ownership endpoint to assign Owner.' }, { status: 400 });
    }

    const { data: target } = await supabaseAdmin
      .from('brokers')
      .select('id, user_id, agency_id, role, removed_at')
      .eq('id', target_broker_id)
      .maybeSingle();

    if (!target) {
      return NextResponse.json({ error: 'Broker not found' }, { status: 404 });
    }

    if (target.removed_at) {
      return NextResponse.json({ error: 'Cannot edit a removed broker' }, { status: 400 });
    }

    const { data: caller } = await supabaseAdmin
      .from('brokers')
      .select('id, role, agency_id, removed_at')
      .eq('user_id', caller_user_id)
      .eq('agency_id', target.agency_id)
      .is('removed_at', null)
      .maybeSingle();

    if (!caller) {
      return NextResponse.json({ error: 'Not authorized for this agency' }, { status: 403 });
    }

    if (caller.role !== 'owner' && caller.role !== 'admin') {
      return NextResponse.json({ error: 'Only Owners and Admins can change roles' }, { status: 403 });
    }

    if (target.role === 'owner') {
      return NextResponse.json({ error: 'Use transfer-ownership endpoint to change the Owner role' }, { status: 400 });
    }

    if (target.user_id === caller_user_id) {
      return NextResponse.json({ error: 'You cannot change your own role' }, { status: 400 });
    }

    const { error: updateErr } = await supabaseAdmin
      .from('brokers')
      .update({ role: new_role })
      .eq('id', target_broker_id);

    if (updateErr) {
      console.error('Role update error:', updateErr);
      return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('update-role error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}