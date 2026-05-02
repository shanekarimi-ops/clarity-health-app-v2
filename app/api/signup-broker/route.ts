import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    // Create the agency
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

    // Create the broker as the agency owner
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

    return NextResponse.json({
      success: true,
      agency_id: agency.id,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Unexpected error: ' + (err?.message || 'unknown') },
      { status: 500 }
    );
  }
}