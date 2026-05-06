import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logAuditEvent } from '../_audit';

export const runtime = 'nodejs';
export const maxDuration = 30;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET — validate a token and return invite info
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from('agency_invitations')
      .select('id, agency_id, invited_email, invited_role, status, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (inviteErr) {
      console.error('Invite lookup error:', inviteErr);
      return NextResponse.json({ error: 'Failed to look up invite' }, { status: 500 });
    }

    if (!invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    if (invite.status !== 'pending') {
      return NextResponse.json({ error: `Invite is ${invite.status}` }, { status: 400 });
    }

    if (new Date(invite.expires_at) < new Date()) {
      await supabaseAdmin
        .from('agency_invitations')
        .update({ status: 'expired' })
        .eq('id', invite.id);
      return NextResponse.json({ error: 'Invite has expired' }, { status: 400 });
    }

    // Fetch the agency name separately (no FK relationship declared)
    const { data: agency } = await supabaseAdmin
      .from('agencies')
      .select('name')
      .eq('id', invite.agency_id)
      .maybeSingle();

    return NextResponse.json({
      invite: {
        id: invite.id,
        agency_id: invite.agency_id,
        agency_name: agency?.name || 'an agency',
        invited_email: invite.invited_email,
        invited_role: invite.invited_role,
      },
    });
  } catch (err: any) {
    console.error('accept-invite GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — accept an invite for an authenticated user
export async function POST(req: NextRequest) {
  try {
    const { token, user_id } = await req.json();

    if (!token || !user_id) {
      return NextResponse.json({ error: 'Missing token or user_id' }, { status: 400 });
    }

    const { data: invite } = await supabaseAdmin
      .from('agency_invitations')
      .select('id, agency_id, invited_email, invited_role, status, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (!invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    if (invite.status !== 'pending') {
      return NextResponse.json({ error: `Invite is ${invite.status}` }, { status: 400 });
    }

    if (new Date(invite.expires_at) < new Date()) {
      await supabaseAdmin
        .from('agency_invitations')
        .update({ status: 'expired' })
        .eq('id', invite.id);
      return NextResponse.json({ error: 'Invite has expired' }, { status: 400 });
    }

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(user_id);
    if (!userData?.user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userEmail = (userData.user.email || '').toLowerCase();
    if (userEmail !== invite.invited_email.toLowerCase()) {
      return NextResponse.json({
        error: `This invite was sent to ${invite.invited_email}. Please log in with that email to accept.`,
      }, { status: 403 });
    }

    const { data: existing } = await supabaseAdmin
      .from('brokers')
      .select('id, removed_at')
      .eq('user_id', user_id)
      .eq('agency_id', invite.agency_id)
      .maybeSingle();

    if (existing && !existing.removed_at) {
      return NextResponse.json({ error: 'You are already a member of this agency' }, { status: 400 });
    }

    const { data: otherAgency } = await supabaseAdmin
      .from('brokers')
      .select('id, agency_id')
      .eq('user_id', user_id)
      .is('removed_at', null)
      .maybeSingle();

    if (otherAgency && otherAgency.agency_id !== invite.agency_id) {
      return NextResponse.json({
        error: 'You already belong to a different agency. Leave it before joining this one.',
      }, { status: 400 });
    }

    if (existing && existing.removed_at) {
      const { error: updateErr } = await supabaseAdmin
        .from('brokers')
        .update({
          role: invite.invited_role,
          removed_at: null,
          removed_by_user_id: null,
        })
        .eq('id', existing.id);

      if (updateErr) {
        console.error('Reactivate broker error:', updateErr);
        return NextResponse.json({ error: 'Failed to reactivate broker' }, { status: 500 });
      }
    } else {
      const { error: insertErr } = await supabaseAdmin
        .from('brokers')
        .insert({
          user_id,
          agency_id: invite.agency_id,
          role: invite.invited_role,
        });

      if (insertErr) {
        console.error('Broker insert error:', insertErr);
        return NextResponse.json({ error: 'Failed to add broker' }, { status: 500 });
      }
    }

    await supabaseAdmin
      .from('agency_invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_by_user_id: user_id,
      })
      .eq('id', invite.id);

    await logAuditEvent(supabaseAdmin, {
      agency_id: invite.agency_id,
      event_type: 'invite_accepted',
      actor_user_id: user_id,
      details: {
        invited_email: invite.invited_email,
        invited_role: invite.invited_role,
      },
    });

    return NextResponse.json({ success: true, agency_id: invite.agency_id });
  } catch (err: any) {
    console.error('accept-invite POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}