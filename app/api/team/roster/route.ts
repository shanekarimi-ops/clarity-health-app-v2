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
    const { agency_id, user_id } = await req.json();

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

    // Fetch all ACTIVE brokers in the agency
    const { data: brokerRows, error: brokerErr } = await supabaseAdmin
      .from('brokers')
      .select('id, user_id, role')
      .eq('agency_id', agency_id)
      .is('removed_at', null);

    if (brokerErr) {
      console.error('Error fetching brokers:', brokerErr);
      return NextResponse.json({ error: 'Failed to fetch brokers' }, { status: 500 });
    }

    if (!brokerRows || brokerRows.length === 0) {
      return NextResponse.json({ brokers: [] });
    }

    const brokerIds = brokerRows.map(b => b.id);
    const userIds = brokerRows.map(b => b.user_id);

    // Fetch user emails + metadata via auth admin
    const userMap: Record<string, { email: string; first_name: string; last_name: string }> = {};
    for (const uid of userIds) {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(uid);
      if (userData?.user) {
        const meta = userData.user.user_metadata || {};
        userMap[uid] = {
          email: userData.user.email || '',
          first_name: meta.first_name || '',
          last_name: meta.last_name || '',
        };
      }
    }

    // Client counts (joined on broker.id)
    const { data: clientRows } = await supabaseAdmin
      .from('clients')
      .select('id, assigned_broker_id')
      .eq('agency_id', agency_id)
      .in('assigned_broker_id', brokerIds);

    const clientCounts: Record<string, number> = {};
    (clientRows || []).forEach(c => {
      if (c.assigned_broker_id) {
        clientCounts[c.assigned_broker_id] = (clientCounts[c.assigned_broker_id] || 0) + 1;
      }
    });

    // Recommendations count (recommendations.user_id is the broker who ran it)
    const recCounts: Record<string, number> = {};
    for (const uid of userIds) {
      const { count } = await supabaseAdmin
        .from('recommendations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid);
      recCounts[uid] = count || 0;
    }

    // Finalized plan designs count
    const designCounts: Record<string, number> = {};
    for (const uid of userIds) {
      const { count } = await supabaseAdmin
        .from('plan_designs')
        .select('id', { count: 'exact', head: true })
        .eq('agency_id', agency_id)
        .eq('created_by_user_id', uid)
        .eq('status', 'finalized');
      designCounts[uid] = count || 0;
    }

    const brokers = brokerRows.map(b => ({
      id: b.id,
      user_id: b.user_id,
      role: b.role,
      email: userMap[b.user_id]?.email || '',
      first_name: userMap[b.user_id]?.first_name || '',
      last_name: userMap[b.user_id]?.last_name || '',
      client_count: clientCounts[b.id] || 0,
      recommendations_count: recCounts[b.user_id] || 0,
      finalized_designs_count: designCounts[b.user_id] || 0,
      is_you: b.user_id === user_id,
    }));

    // Sort: you first, then owner, then admin, then broker, then alphabetical by last name
    brokers.sort((a, b) => {
      if (a.is_you && !b.is_you) return -1;
      if (!a.is_you && b.is_you) return 1;
      const roleOrder: Record<string, number> = { owner: 0, admin: 1, broker: 2 };
      const ar = roleOrder[a.role] ?? 3;
      const br = roleOrder[b.role] ?? 3;
      if (ar !== br) return ar - br;
      return (a.last_name || '').localeCompare(b.last_name || '');
    });

    return NextResponse.json({ brokers });
  } catch (err: any) {
    console.error('Team roster error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}