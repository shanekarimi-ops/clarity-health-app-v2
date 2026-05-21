import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Body field is still named clientId so the UI doesn't need to change today;
// internally we treat it as group_id since rfps now FK to groups (post-S42).
type SaveRfpBody = {
  agencyId: string;
  userId: string;
  userName?: string | null;
  clientId: string; // actually a group_id post-S42
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

export async function POST(request: NextRequest) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Supabase env vars missing');
    return NextResponse.json(
      { error: 'server_misconfigured', message: 'Server is not configured.' },
      { status: 500 }
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: SaveRfpBody;
  try {
    body = await request.json();
  } catch (err) {
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

  // clientId from body is actually a group_id post-S42
  const groupId = body.clientId;

  let rfpId: string | null = null;

  try {
    const planDesign = {
      planYear: body.planYear,
      planOptions: body.planOptions || [],
      rx: body.rx,
      dental: body.dental,
      vision: body.vision,
      life: body.life,
      extractedData: body.extractedData,
    };

    // CHANGED S42: client_id → group_id
    const { data: rfpRow, error: insertErr } = await admin
      .from('rfps')
      .insert({
        agency_id: body.agencyId,
        group_id: groupId,
        created_by_user_id: body.userId,
        name: body.rfpName.trim(),
        effective_date: body.effectiveDate || null,
        employee_lives: body.censusSize,
        current_annual_cost: body.currentAnnualCost,
        current_plan_design: planDesign,
      })
      .select('id')
      .single();

    if (insertErr || !rfpRow) {
      console.error('rfps insert failed:', insertErr);
      return NextResponse.json(
        {
          error: 'rfp_insert_failed',
          message: insertErr?.message || 'Failed to create RFP.',
        },
        { status: 500 }
      );
    }

    rfpId = rfpRow.id;

    let storagePath: string | null = null;

    if (body.spdBase64 && body.spdFilename) {
      try {
        const pdfBuffer = Buffer.from(body.spdBase64, 'base64');
        const safeName = body.spdFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
        storagePath = `${body.agencyId}/${rfpId}/${safeName}`;

        const { error: uploadErr } = await admin.storage
          .from('rfp-documents')
          .upload(storagePath, pdfBuffer, {
            contentType: 'application/pdf',
            upsert: true,
          });

        if (uploadErr) {
          throw new Error(uploadErr.message);
        }

        const { error: updateErr } = await admin
          .from('rfps')
          .update({ current_plan_doc_url: storagePath })
          .eq('id', rfpId);

        if (updateErr) {
          throw new Error(`URL update failed: ${updateErr.message}`);
        }
      } catch (storageErr) {
        await admin.from('rfps').delete().eq('id', rfpId);
        console.error('SPD upload/update failed, rolled back rfps row:', storageErr);
        const msg =
          storageErr instanceof Error ? storageErr.message : 'Storage upload failed.';
        return NextResponse.json(
          { error: 'spd_upload_failed', message: msg },
          { status: 500 }
        );
      }
    }

    const benefitRows: Array<{
      rfp_id: string;
      benefit_type: string;
      display_order: number;
    }> = [];

    if ((body.planOptions || []).length > 0) {
      benefitRows.push({ rfp_id: rfpId!, benefit_type: 'medical', display_order: 0 });
    }
    if (body.dental?.carrier) {
      benefitRows.push({ rfp_id: rfpId!, benefit_type: 'dental', display_order: 2 });
    }
    if (body.vision?.carrier) {
      benefitRows.push({ rfp_id: rfpId!, benefit_type: 'vision', display_order: 3 });
    }
    if (body.life?.carrier || body.life?.amount) {
      benefitRows.push({ rfp_id: rfpId!, benefit_type: 'life', display_order: 4 });
    }

    if (benefitRows.length > 0) {
      const { error: benefitsErr } = await admin
        .from('rfp_benefits')
        .insert(benefitRows);

      if (benefitsErr) {
        if (storagePath) {
          await admin.storage.from('rfp-documents').remove([storagePath]);
        }
        await admin.from('rfps').delete().eq('id', rfpId);
        console.error('rfp_benefits insert failed, rolled back:', benefitsErr);
        return NextResponse.json(
          {
            error: 'benefits_insert_failed',
            message: benefitsErr.message || 'Failed to record benefit lines.',
          },
          { status: 500 }
        );
      }
    }

    // ---- Activity log: now reads from groups instead of clients ----
    try {
      const { data: groupRow } = await admin
        .from('groups')
        .select('name')
        .eq('id', groupId)
        .maybeSingle();

      const groupLabel = groupRow?.name || 'group';

      await admin.from('activity_log').insert({
        agency_id: body.agencyId,
        actor_user_id: body.userId,
        actor_name: body.userName || null,
        event_type: 'rfp_created',
        event_summary: `Created RFP "${body.rfpName.trim()}" for ${groupLabel}`,
        metadata: {
          rfp_id: rfpId,
          group_id: groupId,
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
    console.error('Unexpected error in POST /api/rfps:', err);
    if (rfpId) {
      await admin.from('rfps').delete().eq('id', rfpId);
    }
    const message = err instanceof Error ? err.message : 'Unknown error.';
    return NextResponse.json(
      { error: 'save_failed', message },
      { status: 500 }
    );
  }
}