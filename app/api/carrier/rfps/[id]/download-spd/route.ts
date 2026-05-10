import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type DownloadSpdBody = {
  doc_type?: 'current' | 'renewal';
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rfpId = params.id;
    if (!rfpId) {
      return NextResponse.json({ error: 'Missing RFP id' }, { status: 400 });
    }

    // Step 1: parse body
    let body: DownloadSpdBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const docType = body.doc_type ?? 'current';
    if (docType !== 'current' && docType !== 'renewal') {
      return NextResponse.json({ error: 'doc_type must be "current" or "renewal"' }, { status: 400 });
    }

    // Step 2: extract bearer token
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Step 3: user-scoped client to identify the caller
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }
    const userId = userData.user.id;

    // Step 4: admin client for the rest
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Step 5: confirm caller is a carrier_user assigned to this RFP
    const { data: rfpCarrierRow, error: rcError } = await admin
      .from('rfp_carriers')
      .select(`
        id,
        rfp_id,
        carrier_id,
        assigned_carrier_user_id,
        downloaded_at,
        carrier_users!inner ( id, user_id, carrier_id )
      `)
      .eq('rfp_id', rfpId)
      .eq('carrier_users.user_id', userId)
      .maybeSingle();

    if (rcError) {
      console.error('[download-spd] rfp_carriers lookup error:', rcError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!rfpCarrierRow) {
      return NextResponse.json(
        { error: 'You do not have access to this RFP' },
        { status: 403 }
      );
    }

    // Step 6: fetch the RFP doc URL
    const { data: rfp, error: rfpError } = await admin
      .from('rfps')
      .select('id, current_plan_doc_url, renewal_plan_doc_url')
      .eq('id', rfpId)
      .maybeSingle();

    if (rfpError || !rfp) {
      console.error('[download-spd] rfp lookup error:', rfpError);
      return NextResponse.json({ error: 'RFP not found' }, { status: 404 });
    }

    const docUrl = docType === 'current' ? rfp.current_plan_doc_url : rfp.renewal_plan_doc_url;
    if (!docUrl) {
      return NextResponse.json(
        { error: `No ${docType} plan document is available for this RFP.` },
        { status: 404 }
      );
    }

    // Step 7: extract the storage path from the URL
    // The doc URL format is typically a Supabase storage URL or just a path.
    // We need the path relative to the bucket for createSignedUrl.
    const storagePath = extractStoragePath(docUrl);
    if (!storagePath) {
      console.error('[download-spd] could not parse storage path from URL:', docUrl);
      return NextResponse.json(
        { error: 'Plan document URL is malformed' },
        { status: 500 }
      );
    }

    // Step 8: generate signed URL (10 minutes)
    const { data: signedData, error: signedError } = await admin.storage
      .from('rfp-documents')
      .createSignedUrl(storagePath, 600);

    if (signedError || !signedData?.signedUrl) {
      console.error('[download-spd] createSignedUrl error:', signedError);
      return NextResponse.json(
        { error: 'Could not generate download link' },
        { status: 500 }
      );
    }

    // Step 9: log engagement event + update rfp_carriers.downloaded_at
    const nowIso = new Date().toISOString();

    const { error: logError } = await admin
      .from('rfp_engagement_log')
      .insert({
        rfp_id: rfpId,
        rfp_carrier_id: rfpCarrierRow.id,
        carrier_user_id: rfpCarrierRow.assigned_carrier_user_id,
        event_type: 'rfp_downloaded',
        metadata: { doc_type: docType, storage_path: storagePath },
        occurred_at: nowIso,
      });

    if (logError) {
      // Non-fatal — observability event, don't block the download
      console.error('[download-spd] engagement log error:', logError);
    }

    // Update downloaded_at only if not already set, AND bump status pre-quote
    const { error: updateError } = await admin
      .from('rfp_carriers')
      .update({
        downloaded_at: rfpCarrierRow.downloaded_at ?? nowIso,
        status: 'downloaded',
        updated_at: nowIso,
      })
      .eq('id', rfpCarrierRow.id)
      .in('status', ['sent', 'opened']); // only advance from these statuses

    if (updateError) {
      console.error('[download-spd] update rfp_carriers error:', updateError);
    }

    // Step 10: return signed URL
    return NextResponse.json({
      success: true,
      signedUrl: signedData.signedUrl,
      docType,
    });
  } catch (err) {
    console.error('[download-spd] uncaught error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Extract the storage path (relative to bucket) from a doc URL.
 * Handles both full Supabase URLs and bare paths.
 */
function extractStoragePath(url: string): string | null {
  if (!url) return null;

  // If it's already a path (no protocol), return as-is
  if (!url.startsWith('http')) {
    return url.replace(/^\/+/, ''); // trim leading slashes
  }

  // Try to parse as a Supabase storage public/signed URL
  // Pattern: https://[project].supabase.co/storage/v1/object/[public|sign]/[bucket]/[path]
  const match = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/rfp-documents\/(.+?)(?:\?|$)/);
  if (match && match[1]) {
    return decodeURIComponent(match[1]);
  }

  // Last resort: take everything after the last '/rfp-documents/'
  const idx = url.lastIndexOf('/rfp-documents/');
  if (idx >= 0) {
    const after = url.slice(idx + '/rfp-documents/'.length);
    const queryIdx = after.indexOf('?');
    return decodeURIComponent(queryIdx >= 0 ? after.slice(0, queryIdx) : after);
  }

  return null;
}