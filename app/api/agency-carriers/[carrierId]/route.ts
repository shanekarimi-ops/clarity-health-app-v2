import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { carrierId: string } }
) {
  try {
    const carrierId = params.carrierId;
    if (!carrierId) {
      return NextResponse.json({ error: 'Carrier ID required' }, { status: 400 });
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userError } = await supabaseUser.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }
    const userId = userData.user.id;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: brokerRow, error: brokerErr } = await supabaseAdmin
      .from('brokers')
      .select('agency_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (brokerErr || !brokerRow?.agency_id) {
      return NextResponse.json({ error: 'Not a broker' }, { status: 403 });
    }
    const agencyId = brokerRow.agency_id;

    // Parse body, only accept the fields we allow updating here
    const body = await req.json();
    const updates: Record<string, any> = {};

    if (typeof body.is_favorite === 'boolean') {
      updates.is_favorite = body.is_favorite;
    }
    if (typeof body.notes === 'string') {
      updates.notes = body.notes.trim() || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Update by (agency_id, carrier_id) — RLS would also gate this, but we're explicit
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('agency_carriers')
      .update(updates)
      .eq('agency_id', agencyId)
      .eq('carrier_id', carrierId)
      .select('id, agency_id, carrier_id, default_carrier_user_id, notes, is_favorite')
      .maybeSingle();

    if (updateErr) {
      console.error('Failed to update agency_carriers:', updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: 'Carrier not in your agency roster' }, { status: 404 });
    }

    return NextResponse.json({ agencyCarrier: updated }, { status: 200 });
  } catch (e: any) {
    console.error('PATCH /api/agency-carriers/[carrierId] error:', e);
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}