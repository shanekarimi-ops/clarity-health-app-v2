import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

type UpdateRfpBody = {
  agencyId: string;
  userId: string;
  userName?: string | null;
  clientId: string;
  rfpName: string;
  effectiveDate: string | null;
  censusSize: number | null;
  currentAnnualCost: number | null;
  spdFilename: string | null;
  spdBase64: string | null;
  planYear: number | null;
  extractedData: any | null;
  planOptions: any[];
  rx: any | null;
  dental: any | null;
  vision: any | null;
  life: any | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'server_misconfigured', message: 'Server is not configured.' },
      { status: 500 }
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const rfpId = params.id;
  if (!rfpId) {
    return NextResponse.json(
      { error: 'missing_id', message: 'RFP id is required.' },
      { status: 400 }
    );
  }

  const { data, error } = await admin
    .from('rfps')
    .select(
      `
      id, agency_id, client_id, created_by_user_id, name, rfp_type,
      effective_date, status, current_plan_doc_url, current_plan_design,
      employee_lives, current_annual_cost, created_at, updated_at,
      clients ( id, first_name, last_name, employer_name )
    `
    )
    .eq('id', rfpId)
    .maybeSingle();

  if (error) {
    console.error('GET /api/rfps/[id] error:', error);
    return NextResponse.json(
      { error: 'fetch_failed', message: error.message },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: 'not_found', message: 'RFP not found.' },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, rfp: data });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'server_misconfigured', message: 'Server is not configured.' },
      { status: 500 }
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const rfpId = params.id;
  if (!rfpId) {
    return NextResponse.json(
      { error: 'missing_id', message: 'RFP id is required.' },
      { status: 400 }
    );
  }

  let body: UpdateRfpBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_body', message: 'Invalid request body.' },
      { status: 400 }
    );
  }

  if (!body.agencyId || !body.userId || !body.clientId || !body.rfpName?.trim()) {
    return NextResponse.json(
      {
        error: 'missing_required',
        message: 'agencyId, userId, clientId, and rfpName are required.',
      },
      { status: 400 }
    );
  }

  // Load existing RFP so we know whether a SPD already exists and the agency matches
  const { data: existing, error: existingErr } = await admin
    .from('rfps')
    .select('id, agency_id, current_plan_doc_url')
    .eq('id', rfpId)
    .maybeSingle();

  if (existingErr) {
    console.error('Existing RFP lookup failed:', existingErr);
    return NextResponse.json(
      { error: 'lookup_failed', message: existingErr.message },
      { status: 500 }
    );
  }
  if (!existing) {
    return NextResponse.json(
      { error: 'not_found', message: 'RFP not found.' },
      { status: 404 }
    );
  }
  if (existing.agency_id !== body.agencyId) {
    return NextResponse.json(
      { error: 'forbidden', message: 'This RFP belongs to a different agency.' },
      { status: 403 }
    );
  }

  try {
    // ---- Step 1: Build plan_design JSON and update the rfps row ----
    const planDesign = {
      planYear: body.planYear,
      planOptions: body.planOptions || [],
      rx: body.rx,
      dental: body.dental,
      vision: body.vision,
      life: body.life,
      extractedData: body.extractedData,
    };

    const { error: updateErr } = await admin
      .from('rfps')
      .update({
        client_id: body.clientId,
        name: body.rfpName.trim(),
        effective_date: body.effectiveDate || null,
        employee_lives: body.censusSize,
        current_annual_cost: body.currentAnnualCost,
        current_plan_design: planDesign,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rfpId);

    if (updateErr) {
      console.error('rfps update failed:', updateErr);
      return NextResponse.json(
        { error: 'rfp_update_failed', message: updateErr.message },
        { status: 500 }
      );
    }

    // ---- Step 2: Optional SPD re-upload ----
    // Only re-upload if the broker chose a new file (spdBase64 is non-null)
    let storagePath: string | null = existing.current_plan_doc_url;

    if (body.spdBase64 && body.spdFilename) {
      try {
        const pdfBuffer = Buffer.from(body.spdBase64, 'base64');
        const safeName = body.spdFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const newPath = `${body.agencyId}/${rfpId}/${safeName}`;

        const { error: uploadErr } = await admin.storage
          .from('rfp-documents')
          .upload(newPath, pdfBuffer, {
            contentType: 'application/pdf',
            upsert: true,
          });

        if (uploadErr) {
          throw new Error(uploadErr.message);
        }

        // If the path changed (new filename), update the column
        if (newPath !== existing.current_plan_doc_url) {
          const { error: pathErr } = await admin
            .from('rfps')
            .update({ current_plan_doc_url: newPath })
            .eq('id', rfpId);
          if (pathErr) {
            throw new Error(`Path update failed: ${pathErr.message}`);
          }
        }

        storagePath = newPath;
      } catch (storageErr) {
        // Don't roll back the metadata update — the RFP is still valid, just SPD upload failed.
        // Surface the error to the user so they can retry.
        console.error('SPD re-upload failed on edit:', storageErr);
        const msg =
          storageErr instanceof Error ? storageErr.message : 'Storage upload failed.';
        return NextResponse.json(
          { error: 'spd_upload_failed', message: msg },
          { status: 500 }
        );
      }
    }

    // ---- Step 3: Replace rfp_benefits rows (delete + reinsert) ----
    const { error: deleteErr } = await admin
      .from('rfp_benefits')
      .delete()
      .eq('rfp_id', rfpId);

    if (deleteErr) {
      console.error('rfp_benefits delete failed:', deleteErr);
      return NextResponse.json(
        { error: 'benefits_delete_failed', message: deleteErr.message },
        { status: 500 }
      );
    }

    const benefitRows: Array<{
      rfp_id: string;
      benefit_type: string;
      display_order: number;
    }> = [];

    if ((body.planOptions || []).length > 0) {
      benefitRows.push({ rfp_id: rfpId, benefit_type: 'medical', display_order: 0 });
    }
    if (body.dental?.carrier) {
      benefitRows.push({ rfp_id: rfpId, benefit_type: 'dental', display_order: 2 });
    }
    if (body.vision?.carrier) {
      benefitRows.push({ rfp_id: rfpId, benefit_type: 'vision', display_order: 3 });
    }
    if (body.life?.carrier || body.life?.amount) {
      benefitRows.push({ rfp_id: rfpId, benefit_type: 'life', display_order: 4 });
    }

    if (benefitRows.length > 0) {
      const { error: insertErr } = await admin
        .from('rfp_benefits')
        .insert(benefitRows);

      if (insertErr) {
        console.error('rfp_benefits reinsert failed:', insertErr);
        return NextResponse.json(
          { error: 'benefits_insert_failed', message: insertErr.message },
          { status: 500 }
        );
      }
    }

    // ---- Step 4: Activity log (best-effort) ----
    try {
      const { data: clientRow } = await admin
        .from('clients')
        .select('first_name, last_name, employer_name')
        .eq('id', body.clientId)
        .maybeSingle();

      const clientLabel =
        clientRow?.employer_name ||
        [clientRow?.first_name, clientRow?.last_name].filter(Boolean).join(' ') ||
        'client';

      await admin.from('activity_log').insert({
        agency_id: body.agencyId,
        client_id: body.clientId,
        actor_user_id: body.userId,
        actor_name: body.userName || null,
        event_type: 'rfp_updated',
        event_summary: `Updated RFP "${body.rfpName.trim()}" for ${clientLabel}`,
        metadata: {
          rfp_id: rfpId,
          client_id: body.clientId,
          rfp_name: body.rfpName.trim(),
          benefit_lines: benefitRows.map((b) => b.benefit_type),
        },
      });
    } catch (logErr) {
      console.warn('activity_log insert failed (non-fatal):', logErr);
    }

    return NextResponse.json({
      success: true,
      rfp_id: rfpId,
      storage_path: storagePath,
    });
  } catch (err) {
    console.error('Unexpected error in PUT /api/rfps/[id]:', err);
    const message = err instanceof Error ? err.message : 'Unknown error.';
    return NextResponse.json(
      { error: 'update_failed', message },
      { status: 500 }
    );
  }
}