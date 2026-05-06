import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { logAuditEvent } from '../_audit';

export const runtime = 'nodejs';
export const maxDuration = 30;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { caller_user_id, agency_id, invited_email, invited_role } = await req.json();

    if (!caller_user_id || !agency_id || !invited_email || !invited_role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['admin', 'broker'].includes(invited_role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const normalizedEmail = invited_email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    // Verify caller is Owner or Admin in the agency
    const { data: caller } = await supabaseAdmin
      .from('brokers')
      .select('id, role, removed_at')
      .eq('user_id', caller_user_id)
      .eq('agency_id', agency_id)
      .is('removed_at', null)
      .maybeSingle();

    if (!caller) {
      return NextResponse.json({ error: 'Not authorized for this agency' }, { status: 403 });
    }

    if (caller.role !== 'owner' && caller.role !== 'admin') {
      return NextResponse.json({ error: 'Only Owners and Admins can invite' }, { status: 403 });
    }

    // Admins cannot invite Admins (only Owners can)
    if (caller.role === 'admin' && invited_role === 'admin') {
      return NextResponse.json({ error: 'Only Owners can invite Admins' }, { status: 403 });
    }

    // Check if email is already an active broker in this agency
    const { data: existingBrokers } = await supabaseAdmin
      .from('brokers')
      .select('id, user_id, removed_at')
      .eq('agency_id', agency_id)
      .is('removed_at', null);

    if (existingBrokers && existingBrokers.length > 0) {
      const userIds = existingBrokers.map(b => b.user_id);
      for (const uid of userIds) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (u?.user?.email?.toLowerCase() === normalizedEmail) {
          return NextResponse.json({ error: 'This email is already an active broker in your agency' }, { status: 400 });
        }
      }
    }

    // Cancel any existing pending invites for this email + agency
    await supabaseAdmin
      .from('agency_invitations')
      .update({ status: 'cancelled' })
      .eq('agency_id', agency_id)
      .eq('invited_email', normalizedEmail)
      .eq('status', 'pending');

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');

    const { data: invite, error: insertErr } = await supabaseAdmin
      .from('agency_invitations')
      .insert({
        agency_id,
        invited_email: normalizedEmail,
        invited_role,
        token,
        invited_by_user_id: caller_user_id,
      })
      .select('id, token, expires_at')
      .single();

    if (insertErr) {
      console.error('Invite insert error:', insertErr);
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
    }

    await logAuditEvent(supabaseAdmin, {
        agency_id,
        event_type: 'broker_invited',
        actor_user_id: caller_user_id,
        details: {
          invited_email: normalizedEmail,
          invited_role,
        },
      });
  
      return NextResponse.json({
        success: true,
        invite_id: invite.id,
        token: invite.token,
        expires_at: invite.expires_at,
      });
  } catch (err: any) {
    console.error('invite error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}