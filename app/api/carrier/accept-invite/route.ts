import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

type AcceptInviteBody = {
  token?: string;
};

export async function POST(req: NextRequest) {
  try {
    // Step 1: parse + validate body
    let body: AcceptInviteBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const token = body.token?.trim();
    if (!token || typeof token !== 'string' || token.length < 10) {
      return NextResponse.json(
        { error: 'Missing or invalid token' },
        { status: 400 }
      );
    }

    // Step 2: admin client
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Step 3: look up carrier_user by token
    const { data: carrierUser, error: lookupError } = await admin
      .from('carrier_users')
      .select('id, email, full_name, carrier_id, user_id, status, invite_token, invite_token_expires_at')
      .eq('invite_token', token)
      .maybeSingle();

    if (lookupError) {
      console.error('[accept-invite] lookup error:', lookupError);
      return NextResponse.json(
        { error: 'Database error during token lookup' },
        { status: 500 }
      );
    }

    if (!carrierUser) {
      return NextResponse.json(
        { error: 'Invite link is invalid or has already been used.', code: 'INVALID_TOKEN' },
        { status: 404 }
      );
    }

    // Step 4: check expiry
    const now = new Date();
    const expiresAt = carrierUser.invite_token_expires_at
      ? new Date(carrierUser.invite_token_expires_at)
      : null;

    if (!expiresAt || expiresAt < now) {
      return NextResponse.json(
        { error: 'This invite link has expired. Please ask your broker to resend.', code: 'EXPIRED' },
        { status: 410 }
      );
    }

    // Step 5: find or create auth.users record
    let authUserId = carrierUser.user_id;

    if (!authUserId) {
      // Try to find existing auth user by email
      const { data: existingUsersList, error: listError } = await admin.auth.admin.listUsers();

      if (listError) {
        console.error('[accept-invite] listUsers error:', listError);
        return NextResponse.json(
          { error: 'Auth lookup failed' },
          { status: 500 }
        );
      }

      const existing = existingUsersList?.users?.find(
        (u) => u.email?.toLowerCase() === carrierUser.email.toLowerCase()
      );

      if (existing) {
        authUserId = existing.id;
      } else {
        // Create a new auth user (no password — magic link only)
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email: carrierUser.email,
          email_confirm: true,
          user_metadata: {
            full_name: carrierUser.full_name ?? '',
            carrier_user_id: carrierUser.id,
          },
        });

        if (createError || !created?.user) {
          console.error('[accept-invite] createUser error:', createError);
          return NextResponse.json(
            { error: 'Failed to create user account' },
            { status: 500 }
          );
        }

        authUserId = created.user.id;
      }
    }

    // Step 6: update carrier_users — link user_id, clear token, flip status
    const { error: updateError } = await admin
      .from('carrier_users')
      .update({
        user_id: authUserId,
        invite_token: null,
        invite_token_expires_at: null,
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', carrierUser.id);

    if (updateError) {
      console.error('[accept-invite] update carrier_users error:', updateError);
      return NextResponse.json(
        { error: 'Failed to activate account' },
        { status: 500 }
      );
    }

    // Step 7: generate a Supabase magic link to bootstrap the session
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: carrierUser.email,
      options: {
        redirectTo: `${APP_URL}/carrier/rfps`,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('[accept-invite] generateLink error:', linkError);
      return NextResponse.json(
        { error: 'Failed to generate session link' },
        { status: 500 }
      );
    }

    // Step 8: return success with the magic link URL
    return NextResponse.json({
      success: true,
      magicLinkUrl: linkData.properties.action_link,
      carrierUserId: carrierUser.id,
      email: carrierUser.email,
    });
  } catch (err) {
    console.error('[accept-invite] uncaught error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}