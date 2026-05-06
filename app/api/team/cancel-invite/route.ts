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
    const { caller_user_id, invite_id } = await req.json();

    if (!caller_user_id || !invite_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data: invite } = await supabaseAdmin
      .from('agency_invitations')
      .select('id, agency_id, status')
      .eq('id', invite_id)
      .maybeSingle();

    if (!invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    if (invite.status !== 'pending') {
      return NextResponse.json({ error: 'Invite is not pending' }, { status: 400 });
    }

    const { data: caller } = await supabaseAdmin
      .from('brokers')
      .select('role, removed_at')
      .eq('user_id', caller_user_id)
      .eq('agency_id', invite.agency_id)
      .is('removed_at', null)
      .maybeSingle();

    if (!caller) {
      return NextResponse.json({ error: 'Not authorized for this agency' }, { status: 403 });
    }

    if (caller.role !== 'owner' && caller.role !== 'admin') {
      return NextResponse.json({ error: 'Only Owners and Admins can cancel invites' }, { status: 403 });
    }

    const { error: updateErr } = await supabaseAdmin
      .from('agency_invitations')
      .update({ status: 'cancelled' })
      .eq('id', invite_id);

    if (updateErr) {
      console.error('Cancel invite error:', updateErr);
      return NextResponse.json({ error: 'Failed to cancel invite' }, { status: 500 });
    }

    await logAuditEvent(supabaseAdmin, {
        agency_id: invite.agency_id,
        event_type: 'invite_cancelled',
        actor_user_id: caller_user_id,
        details: { invite_id: invite_id },
      });
  
      return NextResponse.json({ success: true });
    } catch (err: any) {
      console.error('cancel-invite error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}