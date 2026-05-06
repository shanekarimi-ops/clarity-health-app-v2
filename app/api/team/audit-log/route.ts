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
    const { agency_id, user_id, limit } = await req.json();

    if (!agency_id || !user_id) {
      return NextResponse.json({ error: 'Missing agency_id or user_id' }, { status: 400 });
    }

    // Verify caller is in the agency (and active)
    const { data: caller } = await supabaseAdmin
      .from('brokers')
      .select('id')
      .eq('user_id', user_id)
      .eq('agency_id', agency_id)
      .is('removed_at', null)
      .maybeSingle();

    if (!caller) {
      return NextResponse.json({ error: 'Not authorized for this agency' }, { status: 403 });
    }

    // Fetch the audit log
    const cap = Math.min(limit || 100, 500);
    const { data: events, error } = await supabaseAdmin
      .from('agency_audit_log')
      .select('id, event_type, actor_user_id, details, created_at')
      .eq('agency_id', agency_id)
      .order('created_at', { ascending: false })
      .limit(cap);

    if (error) {
      console.error('Audit log fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 });
    }

    if (!events || events.length === 0) {
      return NextResponse.json({ events: [] });
    }

    // Resolve actor names by fetching user metadata
    const actorIds = Array.from(new Set(events.map(e => e.actor_user_id).filter(Boolean)));
    const actorMap: Record<string, { email: string; first_name: string; last_name: string }> = {};

    for (const uid of actorIds) {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(uid);
      if (userData?.user) {
        const meta = userData.user.user_metadata || {};
        actorMap[uid] = {
          email: userData.user.email || '',
          first_name: meta.first_name || '',
          last_name: meta.last_name || '',
        };
      }
    }

    const enriched = events.map(e => ({
      id: e.id,
      event_type: e.event_type,
      actor_user_id: e.actor_user_id,
      actor_first_name: e.actor_user_id ? actorMap[e.actor_user_id]?.first_name || '' : '',
      actor_last_name: e.actor_user_id ? actorMap[e.actor_user_id]?.last_name || '' : '',
      actor_email: e.actor_user_id ? actorMap[e.actor_user_id]?.email || '' : '',
      details: e.details,
      created_at: e.created_at,
    }));

    return NextResponse.json({ events: enriched });
  } catch (err: any) {
    console.error('audit-log error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}