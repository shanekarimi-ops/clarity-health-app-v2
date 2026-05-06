import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const designId = params.id;
    const body = await req.json();
    const { accessToken, name, design, status, effectiveDate } = body;

    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
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

    // 2. Confirm the plan design belongs to the broker's agency
    const { data: existing, error: fetchErr } = await admin
      .from('plan_designs')
      .select('id, agency_id')
      .eq('id', designId)
      .maybeSingle();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Plan design not found' }, { status: 404 });
    }
    if (existing.agency_id !== agencyId) {
      return NextResponse.json({ error: 'Not authorized for this plan design' }, { status: 403 });
    }

    // 3. Build the update object (only include fields that were sent)
    const update: any = {};
    if (typeof name === 'string') update.name = name.trim() || 'Untitled plan design';
    if (design && typeof design === 'object') update.design = design;
    if (typeof status === 'string' && ['draft', 'finalized', 'archived'].includes(status)) {
      update.status = status;
    }
    if (effectiveDate === null) {
      update.effective_date = null;
    } else if (typeof effectiveDate === 'string' && effectiveDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      update.effective_date = effectiveDate;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { error: updateErr } = await admin
      .from('plan_designs')
      .update(update)
      .eq('id', designId);

    if (updateErr) {
      console.error('plan_designs update failed:', updateErr);
      return NextResponse.json(
        { error: 'Failed to update plan design', detail: updateErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('update plan design error:', e);
    return NextResponse.json(
      { error: 'Server error', detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}