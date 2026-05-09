import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const carrierId = params.id;
    if (!carrierId) {
      return NextResponse.json({ error: 'Carrier ID required' }, { status: 400 });
    }

    // Auth: extract user from the request's Authorization header
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

    // Verify broker + get agency_id
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

    // Security gate: this agency must have this carrier in its roster
    const { data: agencyCarrier, error: acErr } = await supabaseAdmin
      .from('agency_carriers')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('carrier_id', carrierId)
      .maybeSingle();

    if (acErr || !agencyCarrier) {
      return NextResponse.json({ error: 'Carrier not in your agency roster' }, { status: 403 });
    }

    // Parse + validate body
    const body = await req.json();
    const email = (body.email || '').trim().toLowerCase();
    const full_name = (body.full_name || '').trim() || null;
    const title = (body.title || '').trim() || null;
    const phone = (body.phone || '').trim() || null;
    const region = (body.region || '').trim() || null;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Basic email shape check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Insert (status defaults to 'invited' via the column default)
    const { data: newRep, error: insertErr } = await supabaseAdmin
      .from('carrier_users')
      .insert({
        carrier_id: carrierId,
        email,
        full_name,
        title,
        phone,
        region,
      })
      .select('id, user_id, carrier_id, email, full_name, title, phone, region, status, created_at')
      .single();

    if (insertErr) {
      console.error('Failed to insert carrier_user:', insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ rep: newRep }, { status: 200 });
  } catch (e: any) {
    console.error('POST /api/carriers/[id]/reps error:', e);
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}