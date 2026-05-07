import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type RouteResult = {
  user_type: 'individual' | 'broker' | 'carrier_user' | 'multi';
  active_product: 'individual' | 'broker' | 'carrier';
  destination: string;
};

function destinationFor(
  userType: RouteResult['user_type'],
  activeProduct: RouteResult['active_product']
): string {
  if (userType === 'multi') return '/select-product';
  if (userType === 'broker') return '/broker/dashboard';
  if (userType === 'carrier_user') return '/carrier/dashboard';
  return '/individual/dashboard';
}

export async function POST(request: Request) {
  try {
    // Caller must pass the access token in the Authorization header.
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
    }

    // Verify the token by asking Supabase who this user is.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userId = userData.user.id;

    // Use the service role to read profiles (bypasses RLS for a safe lookup).
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('user_type, active_product')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('route-user profile lookup error', profileError);
      return NextResponse.json({ error: 'Profile lookup failed' }, { status: 500 });
    }

    // No profile row yet (e.g., user predates Migration 3 backfill, or signup
    // didn't create one). Create one now defaulting to individual.
    if (!profile) {
      const { error: insertError } = await adminClient
        .from('profiles')
        .insert({
          id: userId,
          email: userData.user.email,
          full_name: userData.user.user_metadata?.full_name || userData.user.email,
          user_type: 'individual',
          active_product: 'individual',
        });

      if (insertError) {
        console.error('route-user profile insert error', insertError);
        return NextResponse.json({ error: 'Profile create failed' }, { status: 500 });
      }

      const result: RouteResult = {
        user_type: 'individual',
        active_product: 'individual',
        destination: destinationFor('individual', 'individual'),
      };
      return NextResponse.json(result);
    }

    const userType = profile.user_type as RouteResult['user_type'];
    const activeProduct = profile.active_product as RouteResult['active_product'];

    const result: RouteResult = {
      user_type: userType,
      active_product: activeProduct,
      destination: destinationFor(userType, activeProduct),
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error('route-user unexpected error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}