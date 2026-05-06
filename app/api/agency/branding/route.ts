import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logAuditEvent } from '../../team/_audit';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// =====================================================
// GET /api/agency/branding?userId=...
// Returns the agency's current branding for the caller's agency.
// Anyone in the agency can read; only Owner/Admin can write.
// =====================================================
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Look up broker -> agency
    const { data: brokerRow, error: brokerErr } = await admin
      .from('brokers')
      .select('agency_id, role, removed_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (brokerErr || !brokerRow) {
      return NextResponse.json({ error: 'Broker profile not found' }, { status: 404 });
    }

    if (brokerRow.removed_at) {
      return NextResponse.json({ error: 'Broker removed from agency' }, { status: 403 });
    }

    const agencyId = brokerRow.agency_id;

    const { data: agency, error: agencyErr } = await admin
      .from('agencies')
      .select('id, name, logo_url, primary_color, accent_color')
      .eq('id', agencyId)
      .maybeSingle();

    if (agencyErr || !agency) {
      return NextResponse.json({ error: 'Agency not found' }, { status: 404 });
    }

    const canEdit = brokerRow.role === 'owner' || brokerRow.role === 'admin';

    return NextResponse.json({
      success: true,
      agency: {
        id: agency.id,
        name: agency.name,
        logo_url: agency.logo_url,
        primary_color: agency.primary_color,
        accent_color: agency.accent_color,
      },
      canEdit,
      role: brokerRow.role,
    });
  } catch (err: any) {
    console.error('GET /api/agency/branding error:', err);
    return NextResponse.json(
      { error: 'Failed to load branding', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

// =====================================================
// POST /api/agency/branding
// Body: { userId, primary_color, accent_color }
// Updates the agency's color fields. Owner/Admin only.
// Pass null/undefined for either color to clear it (revert to defaults).
// =====================================================

const HEX_COLOR_RE = /^#([0-9A-Fa-f]{6})$/;

function validateColor(value: any): { ok: boolean; cleaned: string | null; error?: string } {
  // null / undefined / '' all mean "clear it"
  if (value === null || value === undefined || value === '') {
    return { ok: true, cleaned: null };
  }
  if (typeof value !== 'string') {
    return { ok: false, cleaned: null, error: 'Color must be a string or null' };
  }
  const trimmed = value.trim();
  if (!HEX_COLOR_RE.test(trimmed)) {
    return { ok: false, cleaned: null, error: `Color "${trimmed}" must be in #RRGGBB format` };
  }
  // Normalize to lowercase for stable storage
  return { ok: true, cleaned: trimmed.toLowerCase() };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, primary_color, accent_color } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Validate both colors before doing any DB work
    const primaryCheck = validateColor(primary_color);
    if (!primaryCheck.ok) {
      return NextResponse.json({ error: `primary_color: ${primaryCheck.error}` }, { status: 400 });
    }
    const accentCheck = validateColor(accent_color);
    if (!accentCheck.ok) {
      return NextResponse.json({ error: `accent_color: ${accentCheck.error}` }, { status: 400 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Auth: must be Owner or Admin and not removed
    const { data: brokerRow, error: brokerErr } = await admin
      .from('brokers')
      .select('agency_id, role, removed_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (brokerErr || !brokerRow) {
      return NextResponse.json({ error: 'Broker profile not found' }, { status: 404 });
    }
    if (brokerRow.removed_at) {
      return NextResponse.json({ error: 'Broker removed from agency' }, { status: 403 });
    }
    if (brokerRow.role !== 'owner' && brokerRow.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only Owner or Admin can update branding' },
        { status: 403 }
      );
    }

    const agencyId = brokerRow.agency_id;

    // Read current values so we can audit-log the diff
    const { data: existing } = await admin
      .from('agencies')
      .select('primary_color, accent_color')
      .eq('id', agencyId)
      .maybeSingle();

    // Update agencies row
    const { error: updateErr } = await admin
      .from('agencies')
      .update({
        primary_color: primaryCheck.cleaned,
        accent_color: accentCheck.cleaned,
      })
      .eq('id', agencyId);

    if (updateErr) {
      console.error('Branding update error:', updateErr);
      return NextResponse.json({ error: 'Failed to update branding' }, { status: 500 });
    }

    // Audit log (errors swallowed inside helper)
    await logAuditEvent({
      agency_id: agencyId,
      event_type: 'branding_updated',
      actor_user_id: userId,
      details: {
        changed_fields: ['primary_color', 'accent_color'],
        primary_color: {
          before: existing?.primary_color || null,
          after: primaryCheck.cleaned,
        },
        accent_color: {
          before: existing?.accent_color || null,
          after: accentCheck.cleaned,
        },
      },
    });

    return NextResponse.json({
      success: true,
      primary_color: primaryCheck.cleaned,
      accent_color: accentCheck.cleaned,
    });
  } catch (err: any) {
    console.error('POST /api/agency/branding error:', err);
    return NextResponse.json(
      { error: 'Failed to update branding', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}