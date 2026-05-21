import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { StandardTemplate, type StandardTemplateData } from '../../../../../lib/presentations/standard-template';
import { buildStandardExcel } from '../../../../../lib/presentations/standard-excel';
import { ExecutiveTemplate, type ExecutiveTemplateData } from '../../../../../lib/presentations/executive-template';
import { buildExecutiveExcel } from '../../../../../lib/presentations/executive-excel';
import { DetailedTemplate, type DetailedTemplateData } from '../../../../../lib/presentations/detailed-template';
import { buildDetailedExcel } from '../../../../../lib/presentations/detailed-excel';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

type CustomSectionsExtracted = {
  custom_takeaways?: string[];
  custom_recommendation?: string;
  custom_footer_note?: string;
};

function extractCustomSections(raw: any): CustomSectionsExtracted {
  if (!raw || typeof raw !== 'object') return {};
  const out: CustomSectionsExtracted = {};

  if (Array.isArray(raw.takeaways)) {
    const cleaned = raw.takeaways
      .filter((b: any): b is string => typeof b === 'string' && b.trim().length > 0)
      .map((b: string) => b.trim());
    if (cleaned.length > 0) {
      out.custom_takeaways = cleaned;
    }
  }

  if (typeof raw.recommendation === 'string' && raw.recommendation.trim().length > 0) {
    out.custom_recommendation = raw.recommendation.trim();
  }

  if (typeof raw.footer_note === 'string' && raw.footer_note.trim().length > 0) {
    out.custom_footer_note = raw.footer_note.trim();
  }

  return out;
}

// Best-effort: parse a 2-letter state code out of a group.location string
// like "Phoenix, Az" or "Scottsdale, AZ". Returns null if nothing matches.
function parseStateFromLocation(location: string | null): string | null {
  if (!location) return null;
  const match = location.match(/,\s*([A-Za-z]{2})\s*$/);
  return match ? match[1].toUpperCase() : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const presentationId = params.id;

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing Authorization header' },
        { status: 401 }
      );
    }
    const accessToken = authHeader.slice(7);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Invalid session', debug: { error: userError?.message } },
        { status: 401 }
      );
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: broker } = await admin
      .from('brokers')
      .select('agency_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!broker) {
      return NextResponse.json(
        { error: 'No broker profile for this user', debug: { user_id: user.id } },
        { status: 403 }
      );
    }

    const { data: presentation, error: presError } = await admin
      .from('broker_presentations')
      .select('*')
      .eq('id', presentationId)
      .maybeSingle();

    if (presError || !presentation) {
      return NextResponse.json(
        { error: 'Presentation not found', debug: { presentation_id: presentationId, error: presError?.message } },
        { status: 404 }
      );
    }

    if (presentation.agency_id !== broker.agency_id) {
      return NextResponse.json(
        { error: 'Presentation does not belong to your agency' },
        { status: 403 }
      );
    }

    const template = presentation.template as 'standard' | 'executive' | 'detailed';
    if (!['standard', 'executive', 'detailed'].includes(template)) {
      return NextResponse.json(
        { error: 'Invalid template', debug: { template } },
        { status: 400 }
      );
    }

    const customSections = extractCustomSections(presentation.custom_sections);

    // 1. Agency (branding)
    const { data: agency, error: agencyError } = await admin
      .from('agencies')
      .select('id, name, logo_url, primary_color, accent_color')
      .eq('id', presentation.agency_id)
      .maybeSingle();

    if (agencyError || !agency) {
      return NextResponse.json(
        { error: 'Agency not found', debug: { agency_id: presentation.agency_id, error: agencyError?.message } },
        { status: 500 }
      );
    }

    // 2. Group (replaces former client query)
    if (!presentation.group_id) {
      return NextResponse.json(
        { error: 'Presentation has no associated group', debug: { presentation_id: presentationId } },
        { status: 500 }
      );
    }

    const { data: group, error: groupError } = await admin
      .from('groups')
      .select('id, name, member_count, location, industry')
      .eq('id', presentation.group_id)
      .maybeSingle();

    if (groupError || !group) {
      return NextResponse.json(
        { error: 'Group not found', debug: { group_id: presentation.group_id, error: groupError?.message } },
        { status: 500 }
      );
    }

    // 3. RFP
    const { data: rfp, error: rfpError } = await admin
      .from('rfps')
      .select('id, name, effective_date, current_annual_cost')
      .eq('id', presentation.rfp_id)
      .maybeSingle();

    if (rfpError || !rfp) {
      return NextResponse.json(
        { error: 'RFP not found', debug: { rfp_id: presentation.rfp_id, error: rfpError?.message } },
        { status: 500 }
      );
    }

    // 3.5. Package line filter (same as before)
    let allowedQuoteLineIds: Set<string> | null = null;
    if (presentation.package_id) {
      const { data: pkgLines, error: pkgLinesError } = await admin
        .from('package_lines')
        .select('quote_line_id')
        .eq('package_id', presentation.package_id);

      if (pkgLinesError) {
        return NextResponse.json(
          { error: 'Failed to load package lines', debug: { error: pkgLinesError.message } },
          { status: 500 }
        );
      }
      allowedQuoteLineIds = new Set((pkgLines || []).map((pl: any) => pl.quote_line_id).filter(Boolean));

      if (allowedQuoteLineIds.size === 0) {
        return NextResponse.json(
          { error: 'Package has no lines. Add at least one line before generating.', debug: { package_id: presentation.package_id } },
          { status: 400 }
        );
      }
    }

    // 4. Quotes
    const includedIds: string[] = Array.isArray(presentation.included_quote_ids)
      ? presentation.included_quote_ids
      : [];

    let quotesQuery = admin
      .from('quotes')
      .select(`
        id, carrier_id, total_annual_cost, monthly_cost, cost_change_pct, status, notes, submitted_at,
        carrier:carriers(id, name, logo_url, brand_color)
      `)
      .eq('rfp_id', rfp.id);

    if (includedIds.length > 0) {
      quotesQuery = quotesQuery.in('id', includedIds);
    } else {
      quotesQuery = quotesQuery.in('status', ['submitted', 'reviewed', 'shortlisted']);
    }

    const { data: quotes, error: quotesError } = await quotesQuery;

    if (quotesError) {
      return NextResponse.json(
        { error: 'Failed to load quotes', debug: { error: quotesError.message } },
        { status: 500 }
      );
    }

    // 5. Quote lines
    const quoteIds = (quotes || []).map((q: any) => q.id);
    let lines: any[] = [];
    if (quoteIds.length > 0) {
      const { data: lineRows, error: linesError } = await admin
        .from('quote_lines')
        .select('*')
        .in('quote_id', quoteIds);

      if (linesError) {
        return NextResponse.json(
          { error: 'Failed to load quote lines', debug: { error: linesError.message } },
          { status: 500 }
        );
      }
      lines = lineRows || [];

      if (allowedQuoteLineIds) {
        lines = lines.filter((l: any) => allowedQuoteLineIds!.has(l.id));
      }
    }

    // 6. AI narrative
    let narrativeBullets: string[] | undefined = undefined;
    if (template === 'executive' || template === 'detailed') {
      const { data: narrative } = await admin
        .from('rfp_ai_narratives')
        .select('bullets')
        .eq('rfp_id', rfp.id)
        .maybeSingle();
      if (narrative && Array.isArray(narrative.bullets)) {
        narrativeBullets = narrative.bullets as string[];
      }
    }

    // Build template data. Note: we keep the `client` key in the shape so the
    // PDF/Excel templates don't need to change. It's now populated from the group.
    const baseTemplateData: StandardTemplateData = {
      agency: {
        name: agency.name,
        logo_url: agency.logo_url,
        primary_color: agency.primary_color,
        accent_color: agency.accent_color,
      },
      client: {
        employer_name: group.name,
        member_count: group.member_count,
        state: parseStateFromLocation(group.location),
      },
      rfp: {
        id: rfp.id,
        name: rfp.name,
        effective_date: rfp.effective_date,
        current_annual_cost: rfp.current_annual_cost,
      },
      quotes: (quotes || [])
        .map((q: any) => ({
          quote_id: q.id,
          carrier_name: q.carrier?.name || 'Unknown Carrier',
          carrier_logo_url: q.carrier?.logo_url || null,
          carrier_brand_color: q.carrier?.brand_color || null,
          total_annual_cost: q.total_annual_cost,
          monthly_cost: q.monthly_cost,
          cost_change_pct: q.cost_change_pct,
          status: q.status,
          notes: q.notes,
          lines: lines
            .filter((l: any) => l.quote_id === q.id)
            .map((l: any) => ({
              id: l.id,
              benefit_type: l.benefit_type,
              plan_name: l.plan_name,
              monthly_premium: l.monthly_premium,
              annual_cost: l.annual_cost,
              plan_design: l.plan_design,
              tier_rates: l.tier_rates,
            })),
        }))
        .filter((q: any) => !allowedQuoteLineIds || q.lines.length > 0),
      generated_by_name: presentation.generated_by_name,
      generated_at: new Date().toISOString(),
      ...customSections,
    };

    let pdfBuffer: Buffer;
    let excelBuffer: Buffer;

    try {
      if (template === 'executive') {
        const execData: ExecutiveTemplateData = { ...baseTemplateData, narrative_bullets: narrativeBullets };
        pdfBuffer = await renderToBuffer(
          React.createElement(ExecutiveTemplate, { data: execData }) as any
        );
        excelBuffer = await buildExecutiveExcel(execData);
      } else if (template === 'detailed') {
        const detailedData: DetailedTemplateData = { ...baseTemplateData, narrative_bullets: narrativeBullets };
        pdfBuffer = await renderToBuffer(
          React.createElement(DetailedTemplate, { data: detailedData }) as any
        );
        excelBuffer = await buildDetailedExcel(detailedData);
      } else {
        pdfBuffer = await renderToBuffer(
          React.createElement(StandardTemplate, { data: baseTemplateData }) as any
        );
        excelBuffer = await buildStandardExcel(baseTemplateData);
      }
    } catch (renderErr: any) {
      console.error(`Render error for template "${template}":`, renderErr);
      return NextResponse.json(
        { error: 'Rendering failed', debug: { template, message: renderErr?.message } },
        { status: 500 }
      );
    }

    const timestamp = Date.now();
    const safeTitle = (presentation.title || 'presentation')
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .slice(0, 60);
    const pdfPath = `${presentation.agency_id}/${presentationId}/${safeTitle}_${timestamp}.pdf`;
    const excelPath = `${presentation.agency_id}/${presentationId}/${safeTitle}_${timestamp}.xlsx`;

    const { error: pdfUploadError } = await admin.storage
      .from('presentations')
      .upload(pdfPath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (pdfUploadError) {
      return NextResponse.json(
        { error: 'Failed to upload PDF', debug: { error: pdfUploadError.message, path: pdfPath } },
        { status: 500 }
      );
    }

    const { error: excelUploadError } = await admin.storage
      .from('presentations')
      .upload(excelPath, excelBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      });

    if (excelUploadError) {
      return NextResponse.json(
        { error: 'Failed to upload Excel', debug: { error: excelUploadError.message, path: excelPath } },
        { status: 500 }
      );
    }

    const { data: pdfSigned, error: pdfSignError } = await admin.storage
      .from('presentations')
      .createSignedUrl(pdfPath, SIGNED_URL_TTL_SECONDS);

    const { data: excelSigned, error: excelSignError } = await admin.storage
      .from('presentations')
      .createSignedUrl(excelPath, SIGNED_URL_TTL_SECONDS);

    if (pdfSignError || excelSignError) {
      return NextResponse.json(
        {
          error: 'Failed to sign URLs',
          debug: {
            pdf_error: pdfSignError?.message,
            excel_error: excelSignError?.message,
          },
        },
        { status: 500 }
      );
    }

    const { data: updated, error: updateError } = await admin
      .from('broker_presentations')
      .update({
        pdf_url: pdfPath,
        excel_url: excelPath,
        updated_at: new Date().toISOString(),
      })
      .eq('id', presentationId)
      .select('*')
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update presentation row', debug: { error: updateError.message } },
        { status: 500 }
      );
    }

    try {
      const meta = user.user_metadata || {};
      const brokerName = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim() || null;
      await admin.from('activity_log').insert({
        agency_id: presentation.agency_id,
        actor_user_id: user.id,
        actor_name: brokerName,
        event_type: 'presentation_generated',
        event_summary: `Generated ${template} presentation "${presentation.title}"${presentation.package_id ? ' from package' : ''}`,
        metadata: {
          presentation_id: presentationId,
          rfp_id: rfp.id,
          group_id: presentation.group_id,
          template,
          quote_count: baseTemplateData.quotes.length,
          pdf_size_bytes: pdfBuffer.length,
          excel_size_bytes: excelBuffer.length,
          narrative_used: narrativeBullets !== undefined,
          package_id: presentation.package_id || null,
          is_package_sourced: !!presentation.package_id,
          custom_sections_applied: {
            takeaways: !!customSections.custom_takeaways,
            recommendation: !!customSections.custom_recommendation,
            footer_note: !!customSections.custom_footer_note,
          },
        },
      });
    } catch (logErr) {
      console.warn('activity_log insert failed (non-blocking):', logErr);
    }

    return NextResponse.json(
      {
        success: true,
        presentation: updated,
        pdf_signed_url: pdfSigned?.signedUrl,
        excel_signed_url: excelSigned?.signedUrl,
        quote_count: baseTemplateData.quotes.length,
        template,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('POST /api/broker/presentations/[id]/generate error:', err);
    return NextResponse.json(
      { error: 'Internal server error', debug: { message: err?.message } },
      { status: 500 }
    );
  }
}