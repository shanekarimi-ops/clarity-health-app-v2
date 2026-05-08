import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { user_id, agency_name } = await req.json();

    if (!user_id || !agency_name) {
      return NextResponse.json(
        { error: 'Missing user_id or agency_name' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Verify the user exists
    const { data: userCheck, error: userError } = await supabaseAdmin.auth.admin.getUserById(user_id);
    if (userError || !userCheck?.user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const authUser = userCheck.user;
    const userEmail = authUser.email || '';
    const fullName = [
      authUser.user_metadata?.first_name,
      authUser.user_metadata?.last_name,
    ].filter(Boolean).join(' ') || userEmail;

    // 1. Create the agency
    const { data: agency, error: agencyError } = await supabaseAdmin
      .from('agencies')
      .insert({ name: agency_name.trim() })
      .select()
      .single();

    if (agencyError) {
      return NextResponse.json(
        { error: 'Agency creation failed: ' + agencyError.message },
        { status: 500 }
      );
    }

    // 2. Create the broker as the agency owner
    const { error: brokerError } = await supabaseAdmin
      .from('brokers')
      .insert({
        user_id,
        agency_id: agency.id,
        role: 'owner',
      });

    if (brokerError) {
      // Roll back the agency we just created so we don't leave orphans
      await supabaseAdmin.from('agencies').delete().eq('id', agency.id);

      return NextResponse.json(
        { error: 'Broker setup failed: ' + brokerError.message },
        { status: 500 }
      );
    }

    // 3. Create or update the profiles row to mark this user as a broker.
    //    Use upsert in case a profile row already exists (e.g. user signed up
    //    earlier as individual, then got promoted, or the auth signup trigger
    //    fired). user_type = 'broker', active_product = 'broker'.
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: user_id,
        email: userEmail,
        full_name: fullName,
        user_type: 'broker',
        active_product: 'broker',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (profileError) {
      // Roll back broker + agency to avoid a half-built broker account.
      await supabaseAdmin.from('brokers').delete().eq('user_id', user_id).eq('agency_id', agency.id);
      await supabaseAdmin.from('agencies').delete().eq('id', agency.id);

      return NextResponse.json(
        { error: 'Profile creation failed: ' + profileError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      agency_id: agency.id,
    });
  } catch (err: any) {
    console.error('signup-broker error', err);
    return NextResponse.json(
      { error: 'Unexpected error: ' + (err?.message || 'unknown') },
      { status: 500 }
    );
  }
}