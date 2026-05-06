import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logAuditEvent } from '../../../team/_audit';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const BUCKET = 'agency-logos';
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
]);

const EXT_FOR_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/svg+xml': 'svg',
};

// Reject SVGs that contain script tags or event handler attributes — basic XSS hardening.
function svgIsSuspicious(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes('<script')) return true;
  if (/\son[a-z]+\s*=/.test(lower)) return true; // onload=, onclick=, etc.
  if (lower.includes('javascript:')) return true;
  if (lower.includes('<foreignobject')) return true;
  return false;
}

// =====================================================
// POST /api/agency/branding/logo
// multipart/form-data: { userId, file }
// Owner/Admin only. Replaces any existing logo.
// =====================================================
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const userId = formData.get('userId');
    const file = formData.get('file');

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const fileType = (file as any).type as string | undefined;
    if (!fileType || !ALLOWED_TYPES.has(fileType)) {
      return NextResponse.json(
        { error: 'Logo must be PNG, JPEG, or SVG' },
        { status: 400 }
      );
    }

    const fileSize = (file as any).size as number;
    if (typeof fileSize === 'number' && fileSize > MAX_LOGO_BYTES) {
      return NextResponse.json(
        { error: 'Logo file is too large (max 2 MB)' },
        { status: 400 }
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Auth check — Owner/Admin only
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
        { error: 'Only Owner or Admin can change the agency logo' },
        { status: 403 }
      );
    }

    const agencyId = brokerRow.agency_id as string;

    // Convert Blob to Buffer
    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    // SVG safety check
    if (fileType === 'image/svg+xml') {
      const text = buffer.toString('utf-8');
      if (svgIsSuspicious(text)) {
        return NextResponse.json(
          {
            error:
              'SVG contains scripts or event handlers, which are not allowed. Please re-export the logo as PNG or a clean SVG.',
          },
          { status: 400 }
        );
      }
    }

    const ext = EXT_FOR_TYPE[fileType];
    const objectPath = `${agencyId}/logo.${ext}`;

    // Clean up any existing logo with a different extension to avoid orphans
    const { data: existingFiles } = await admin.storage.from(BUCKET).list(agencyId);
    if (existingFiles && existingFiles.length > 0) {
      const stale = existingFiles
        .filter((f) => f.name.startsWith('logo.') && f.name !== `logo.${ext}`)
        .map((f) => `${agencyId}/${f.name}`);
      if (stale.length > 0) {
        await admin.storage.from(BUCKET).remove(stale);
      }
    }

    // Upload (upsert handles same-extension replacements)
    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(objectPath, buffer, {
        contentType: fileType,
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadErr) {
      console.error('Logo upload error:', uploadErr);
      return NextResponse.json({ error: 'Failed to upload logo' }, { status: 500 });
    }

    // Public URL with cache-buster
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(objectPath);
    const logoUrl = `${pub.publicUrl}?v=${Date.now()}`;

    // Read previous logo_url for audit diff
    const { data: existingAgency } = await admin
      .from('agencies')
      .select('logo_url')
      .eq('id', agencyId)
      .maybeSingle();

    // Persist URL on the agency row
    const { error: updateErr } = await admin
      .from('agencies')
      .update({ logo_url: logoUrl })
      .eq('id', agencyId);

    if (updateErr) {
      console.error('Logo URL persist error:', updateErr);
      return NextResponse.json({ error: 'Logo uploaded but URL save failed' }, { status: 500 });
    }

    await logAuditEvent(admin, {
        agency_id: agencyId,
        event_type: 'branding_updated',
        actor_user_id: userId,
        details: {
          changed_fields: ['logo_url'],
          logo_url: {
            before: existingAgency?.logo_url || null,
            after: logoUrl,
          },
          action: 'uploaded',
        },
      });

    return NextResponse.json({ success: true, logo_url: logoUrl });
  } catch (err: any) {
    console.error('POST /api/agency/branding/logo error:', err);
    return NextResponse.json(
      { error: 'Failed to upload logo', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

// =====================================================
// DELETE /api/agency/branding/logo
// Body: { userId }
// Removes the logo file from storage and clears agencies.logo_url.
// Owner/Admin only.
// =====================================================
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Auth check — Owner/Admin only
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
        { error: 'Only Owner or Admin can change the agency logo' },
        { status: 403 }
      );
    }

    const agencyId = brokerRow.agency_id as string;

    // Read current logo_url for audit + decide if there's anything to remove
    const { data: existingAgency } = await admin
      .from('agencies')
      .select('logo_url')
      .eq('id', agencyId)
      .maybeSingle();

    // Remove all files in the agency's folder
    const { data: existingFiles } = await admin.storage.from(BUCKET).list(agencyId);
    if (existingFiles && existingFiles.length > 0) {
      const paths = existingFiles.map((f) => `${agencyId}/${f.name}`);
      const { error: removeErr } = await admin.storage.from(BUCKET).remove(paths);
      if (removeErr) {
        console.error('Logo storage remove error:', removeErr);
        // Non-fatal — still clear the DB column
      }
    }

    // Clear URL on the agency row
    const { error: updateErr } = await admin
      .from('agencies')
      .update({ logo_url: null })
      .eq('id', agencyId);

    if (updateErr) {
      console.error('Logo URL clear error:', updateErr);
      return NextResponse.json({ error: 'Failed to clear logo URL' }, { status: 500 });
    }

    await logAuditEvent(admin, {
        agency_id: agencyId,
        event_type: 'branding_updated',
        actor_user_id: userId,
        details: {
          changed_fields: ['logo_url'],
          logo_url: {
            before: existingAgency?.logo_url || null,
            after: null,
          },
          action: 'removed',
        },
      });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('DELETE /api/agency/branding/logo error:', err);
    return NextResponse.json(
      { error: 'Failed to remove logo', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}