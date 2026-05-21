import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // clientId in the body is actually a group_id post-S42; the UI hasn't been
    // updated to rename it yet.
    const { clientId, fundingModel, name, accessToken } = body;
    const groupId = clientId;

    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
    }
    if (!groupId) {
      return NextResponse.json({ error: 'Missing clientId' }, { status: 400 });
    }
    if (!fundingModel || !['level_funded', 'self_funded'].includes(fundingModel)) {
      return NextResponse.json({ error: 'Invalid fundingModel' }, { status: 400 });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: brokerRow, error: brokerErr } = await admin
      .from('brokers')
      .select('agency_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (brokerErr || !brokerRow) {
      return NextResponse.json({ error: 'Broker profile not found' }, { status: 403 });
    }
    const agencyId = brokerRow.agency_id;

    // CHANGED S42: clients lookup → groups lookup
    const { data: groupRow, error: groupErr } = await admin
      .from('groups')
      .select('id, agency_id, name')
      .eq('id', groupId)
      .maybeSingle();

    if (groupErr || !groupRow) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    if (groupRow.agency_id !== agencyId) {
      return NextResponse.json({ error: 'Group does not belong to your agency' }, { status: 403 });
    }

    const groupLabel = groupRow.name?.trim() || 'New group';
    const defaultName =
      (name && name.trim()) ||
      `${groupLabel} — ${fundingModel === 'self_funded' ? 'Self-funded' : 'Level-funded'} plan`;

    // CHANGED S42: client_id → group_id on plan_designs
    const { data: inserted, error: insertErr } = await admin
      .from('plan_designs')
      .insert({
        group_id: groupId,
        agency_id: agencyId,
        created_by_user_id: userId,
        name: defaultName,
        funding_model: fundingModel,
        status: 'draft',
        design: {},
      })
      .select('id')
      .single();

    if (insertErr || !inserted) {
      console.error('plan_designs insert failed:', insertErr);
      return NextResponse.json(
        { error: 'Failed to create plan design', detail: insertErr?.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: inserted.id, name: defaultName });
  } catch (e: any) {
    console.error('create plan design error:', e);
    return NextResponse.json(
      { error: 'Server error', detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}