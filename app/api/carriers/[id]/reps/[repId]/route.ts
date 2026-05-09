import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function authorize(req: NextRequest, carrierId: string) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return { error: 'Not authenticated', status: 401 as const };
  const token = authHeader.replace('Bearer ', '');

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await supabaseUser.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: 'Invalid session', status: 401 as const };
  }
  const userId = userData.user.id;

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const { data: brokerRow, error: brokerErr } = await supabaseAdmin
    .from('brokers')
    .select('agency_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (brokerErr || !brokerRow?.agency_id) {
    return { error: 'Not a broker', status: 403 as const };
  }
  const agencyId = brokerRow.agency_id;

  const { data: agencyCarrier, error: acErr } = await supabaseAdmin
    .from('agency_carriers')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('carrier_id', carrierId)
    .maybeSingle();

  if (acErr || !agencyCarrier) {
    return { error: 'Carrier not in your agency roster', status: 403 as const };
  }

  return { supabaseAdmin, agencyId };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; repId: string } }
) {
  try {
    const carrierId = params.id;
    const repId = params.repId;
    if (!carrierId || !repId) {
      return NextResponse.json({ error: 'Carrier ID and Rep ID required' }, { status: 400 });
    }

    const auth = await authorize(req, carrierId);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { supabaseAdmin } = auth;

    // Verify rep belongs to this carrier
    const { data: existingRep, error: fetchErr } = await supabaseAdmin
      .from('carrier_users')
      .select('id, carrier_id')
      .eq('id', repId)
      .maybeSingle();

    if (fetchErr || !existingRep) {
      return NextResponse.json({ error: 'Rep not found' }, { status: 404 });
    }
    if (existingRep.carrier_id !== carrierId) {
      return NextResponse.json({ error: 'Rep does not belong to this carrier' }, { status: 403 });
    }

    const body = await req.json();
    const email = (body.email || '').trim().toLowerCase();
    const full_name = (body.full_name || '').trim() || null;
    const title = (body.title || '').trim() || null;
    const phone = (body.phone || '').trim() || null;
    const region = (body.region || '').trim() || null;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    const { data: updatedRep, error: updateErr } = await supabaseAdmin
      .from('carrier_users')
      .update({ email, full_name, title, phone, region })
      .eq('id', repId)
      .select('id, user_id, carrier_id, email, full_name, title, phone, region, status, created_at')
      .single();

    if (updateErr) {
      console.error('Failed to update carrier_user:', updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ rep: updatedRep }, { status: 200 });
  } catch (e: any) {
    console.error('PATCH /api/carriers/[id]/reps/[repId] error:', e);
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; repId: string } }
) {
  try {
    const carrierId = params.id;
    const repId = params.repId;
    if (!carrierId || !repId) {
      return NextResponse.json({ error: 'Carrier ID and Rep ID required' }, { status: 400 });
    }

    const auth = await authorize(req, carrierId);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { supabaseAdmin } = auth;

    const { data: existingRep, error: fetchErr } = await supabaseAdmin
      .from('carrier_users')
      .select('id, carrier_id')
      .eq('id', repId)
      .maybeSingle();

    if (fetchErr || !existingRep) {
      return NextResponse.json({ error: 'Rep not found' }, { status: 404 });
    }
    if (existingRep.carrier_id !== carrierId) {
      return NextResponse.json({ error: 'Rep does not belong to this carrier' }, { status: 403 });
    }

    const { error: deleteErr } = await supabaseAdmin
      .from('carrier_users')
      .delete()
      .eq('id', repId);

    if (deleteErr) {
      console.error('Failed to delete carrier_user:', deleteErr);
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error('DELETE /api/carriers/[id]/reps/[repId] error:', e);
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}