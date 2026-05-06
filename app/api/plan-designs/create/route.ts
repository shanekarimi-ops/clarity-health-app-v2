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
    const { clientId, fundingModel, name, accessToken } = body;

    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
    }
    if (!clientId) {
      return NextResponse.json({ error: 'Missing clientId' }, { status: 400 });
    }
    if (!fundingModel || !['level_funded', 'self_funded'].includes(fundingModel)) {
      return NextResponse.json({ error: 'Invalid fundingModel' }, { status: 400 });
    }

    // Verify the user
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = userData.user.id;

    // Service role client for the trusted insert
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Look up the broker's agency
    const { data: brokerRow, error: brokerErr } = await admin
      .from('brokers')
      .select('agency_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (brokerErr || !brokerRow) {
      return NextResponse.json({ error: 'Broker profile not found' }, { status: 403 });
    }
    const agencyId = brokerRow.agency_id;

    // 2. Confirm the client belongs to the same agency (security check)
    const { data: clientRow, error: clientErr } = await admin
      .from('clients')
      .select('id, agency_id, employer_name, first_name, last_name')
      .eq('id', clientId)
      .maybeSingle();

    if (clientErr || !clientRow) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    if (clientRow.agency_id !== agencyId) {
      return NextResponse.json({ error: 'Client does not belong to your agency' }, { status: 403 });
    }

    // 3. Build a default name if not provided
    const clientLabel =
      clientRow.employer_name?.trim() ||
      `${clientRow.first_name} ${clientRow.last_name}`.trim() ||
      'New client';
    const defaultName =
      (name && name.trim()) ||
      `${clientLabel} — ${fundingModel === 'self_funded' ? 'Self-funded' : 'Level-funded'} plan`;

    // 4. Insert the plan design
    const { data: inserted, error: insertErr } = await admin
      .from('plan_designs')
      .insert({
        client_id: clientId,
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