import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { sendEmail, buildCarrierMagicLink } from '../../../../lib/email';
import { filterValidBenefitLines, BENEFIT_LINE_LABELS, BenefitLineValue } from '../../../../lib/benefit-lines';

export const runtime = 'nodejs';
export const maxDuration = 60;

const INVITE_TOKEN_EXPIRY_DAYS = 14;

type SendRequestBody = {
  recipients: {
    carrier_id: string;
    carrier_user_ids: string[];
    requested_benefits: string[];
  }[];
};

type SendResultRow = {
  rfp_carrier_id: string;
  carrier_id: string;
  carrier_user_id: string;
  email: string;
  status: 'sent' | 'resent' | 'failed';
  error?: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const rfpId = params.id;

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }
    const token = authHeader.slice('Bearer '.length);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: brokerRow, error: brokerErr } = await admin
      .from('brokers')
      .select('agency_id, agencies(name)')
      .eq('user_id', userId)
      .maybeSingle();

    if (brokerErr || !brokerRow?.agency_id) {
      return NextResponse.json({ error: 'Not a broker user' }, { status: 403 });
    }
    const agencyId = brokerRow.agency_id;
    const agencyName = (brokerRow.agencies as any)?.name || 'an agency';

    // CHANGED S42: clients(...) join → groups(name) join
    const { data: rfpRow, error: rfpErr } = await admin
      .from('rfps')
      .select('id, name, agency_id, status, effective_date, current_plan_design, groups(name)')
      .eq('id', rfpId)
      .maybeSingle();

    if (rfpErr || !rfpRow) {
      return NextResponse.json({ error: 'RFP not found' }, { status: 404 });
    }
    if (rfpRow.agency_id !== agencyId) {
      return NextResponse.json({ error: 'RFP does not belong to your agency' }, { status: 403 });
    }

    // CHANGED S42: clientLabel now comes from group.name
    const groupObj = (rfpRow.groups as any) || {};
    const clientLabel = groupObj.name || 'a client';

    const planYear = (rfpRow.current_plan_design as any)?.planYear || null;

    const body = (await req.json()) as SendRequestBody;
    if (!body?.recipients || !Array.isArray(body.recipients) || body.recipients.length === 0) {
      return NextResponse.json({ error: 'recipients array required' }, { status: 400 });
    }

    type FlatRecipient = {
      carrier_id: string;
      carrier_user_id: string;
      requested_benefits: BenefitLineValue[];
    };
    const flat: FlatRecipient[] = [];
    for (const r of body.recipients) {
      if (!r.carrier_id || !Array.isArray(r.carrier_user_ids) || r.carrier_user_ids.length === 0) {
        return NextResponse.json(
          { error: 'Each recipient needs carrier_id and at least one carrier_user_id' },
          { status: 400 }
        );
      }
      const validBenefits = filterValidBenefitLines(r.requested_benefits || []);
      if (validBenefits.length === 0) {
        return NextResponse.json(
          { error: `Recipient for carrier ${r.carrier_id} needs at least one valid benefit line` },
          { status: 400 }
        );
      }
      for (const cuid of r.carrier_user_ids) {
        flat.push({
          carrier_id: r.carrier_id,
          carrier_user_id: cuid,
          requested_benefits: validBenefits,
        });
      }
    }

    const uniqueCarrierIds = Array.from(new Set(flat.map(f => f.carrier_id)));
    const { data: agencyCarriersRows, error: acErr } = await admin
      .from('agency_carriers')
      .select('carrier_id')
      .eq('agency_id', agencyId)
      .in('carrier_id', uniqueCarrierIds);

    if (acErr) {
      return NextResponse.json({ error: 'Failed to verify agency_carriers: ' + acErr.message }, { status: 500 });
    }
    const verifiedCarrierIds = new Set((agencyCarriersRows || []).map(r => r.carrier_id));
    const missingCarrierIds = uniqueCarrierIds.filter(cid => !verifiedCarrierIds.has(cid));
    if (missingCarrierIds.length > 0) {
      return NextResponse.json(
        { error: `Carriers not in your agency: ${missingCarrierIds.join(', ')}` },
        { status: 403 }
      );
    }

    const uniqueCarrierUserIds = Array.from(new Set(flat.map(f => f.carrier_user_id)));
    const { data: carrierUsersRows, error: cuErr } = await admin
      .from('carrier_users')
      .select('id, carrier_id, email, full_name')
      .in('id', uniqueCarrierUserIds);

    if (cuErr) {
      return NextResponse.json({ error: 'Failed to verify carrier_users: ' + cuErr.message }, { status: 500 });
    }

    const carrierUsersById = new Map<string, { id: string; carrier_id: string; email: string; full_name: string | null }>();
    for (const cu of carrierUsersRows || []) {
      carrierUsersById.set(cu.id, cu as any);
    }

    for (const f of flat) {
      const cu = carrierUsersById.get(f.carrier_user_id);
      if (!cu) {
        return NextResponse.json({ error: `Carrier user ${f.carrier_user_id} not found` }, { status: 404 });
      }
      if (cu.carrier_id !== f.carrier_id) {
        return NextResponse.json(
          { error: `Carrier user ${f.carrier_user_id} does not belong to carrier ${f.carrier_id}` },
          { status: 403 }
        );
      }
    }

    const expiresAt = new Date(Date.now() + INVITE_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const results: SendResultRow[] = [];

    for (const f of flat) {
      const cu = carrierUsersById.get(f.carrier_user_id)!;

      const { data: existingRows, error: existingErr } = await admin
        .from('rfp_carriers')
        .select('id')
        .eq('rfp_id', rfpId)
        .eq('carrier_id', f.carrier_id)
        .eq('assigned_carrier_user_id', f.carrier_user_id)
        .maybeSingle();

      if (existingErr) {
        results.push({
          rfp_carrier_id: '',
          carrier_id: f.carrier_id,
          carrier_user_id: f.carrier_user_id,
          email: cu.email,
          status: 'failed',
          error: 'DB lookup failed: ' + existingErr.message,
        });
        continue;
      }

      const isResend = !!existingRows?.id;
      let rfpCarrierId = existingRows?.id || '';

      if (isResend) {
        const { error: updErr } = await admin
          .from('rfp_carriers')
          .update({
            sent_at: new Date().toISOString(),
            status: 'sent',
            requested_benefits: f.requested_benefits,
            resend_message_id: null,
            first_opened_at: null,
            last_opened_at: null,
            open_count: 0,
            downloaded_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', rfpCarrierId);
        if (updErr) {
          results.push({
            rfp_carrier_id: rfpCarrierId,
            carrier_id: f.carrier_id,
            carrier_user_id: f.carrier_user_id,
            email: cu.email,
            status: 'failed',
            error: 'Update failed: ' + updErr.message,
          });
          continue;
        }
      } else {
        const { data: insRow, error: insErr } = await admin
          .from('rfp_carriers')
          .insert({
            rfp_id: rfpId,
            carrier_id: f.carrier_id,
            assigned_carrier_user_id: f.carrier_user_id,
            requested_benefits: f.requested_benefits,
            status: 'sent',
            sent_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (insErr || !insRow) {
          results.push({
            rfp_carrier_id: '',
            carrier_id: f.carrier_id,
            carrier_user_id: f.carrier_user_id,
            email: cu.email,
            status: 'failed',
            error: 'Insert failed: ' + (insErr?.message || 'no row'),
          });
          continue;
        }
        rfpCarrierId = insRow.id;
      }

      const inviteToken = randomBytes(32).toString('hex');
      const { error: tokErr } = await admin
        .from('carrier_users')
        .update({
          invite_token: inviteToken,
          invite_token_expires_at: expiresAt,
        })
        .eq('id', f.carrier_user_id);

      if (tokErr) {
        results.push({
          rfp_carrier_id: rfpCarrierId,
          carrier_id: f.carrier_id,
          carrier_user_id: f.carrier_user_id,
          email: cu.email,
          status: 'failed',
          error: 'Token mint failed: ' + tokErr.message,
        });
        continue;
      }

      const magicLink = buildCarrierMagicLink(inviteToken);
      const benefitLabels = f.requested_benefits.map(b => BENEFIT_LINE_LABELS[b]).join(', ');
      const recipientName = cu.full_name || cu.email.split('@')[0];

      const subject = `New RFP from ${agencyName}: ${rfpRow.name}`;
      const htmlBody = buildEmailHtml({
        recipientName,
        agencyName,
        rfpName: rfpRow.name,
        clientLabel,
        planYear,
        effectiveDate: rfpRow.effective_date,
        benefitLabels,
        magicLink,
        isResend,
      });
      const textBody = buildEmailText({
        recipientName,
        agencyName,
        rfpName: rfpRow.name,
        clientLabel,
        planYear,
        effectiveDate: rfpRow.effective_date,
        benefitLabels,
        magicLink,
        isResend,
      });

      let resendMessageId: string | null = null;
      try {
        const sendResult = await sendEmail({
          to: cu.email,
          subject,
          html: htmlBody,
          text: textBody,
        });
        resendMessageId = sendResult.id;
      } catch (emailErr: any) {
        results.push({
          rfp_carrier_id: rfpCarrierId,
          carrier_id: f.carrier_id,
          carrier_user_id: f.carrier_user_id,
          email: cu.email,
          status: 'failed',
          error: 'Email send failed: ' + (emailErr.message || 'unknown'),
        });
        continue;
      }

      if (resendMessageId) {
        const { error: msgIdErr } = await admin
          .from('rfp_carriers')
          .update({ resend_message_id: resendMessageId })
          .eq('id', rfpCarrierId);
        if (msgIdErr) {
          console.error('rfp_carriers resend_message_id update failed:', msgIdErr);
        }
      }

      const { error: logErr } = await admin.from('rfp_engagement_log').insert({
        rfp_id: rfpId,
        rfp_carrier_id: rfpCarrierId,
        carrier_user_id: f.carrier_user_id,
        event_type: 'rfp_sent',
        metadata: {
          is_resend: isResend,
          requested_benefits: f.requested_benefits,
          resend_message_id: resendMessageId,
        },
      });
      if (logErr) {
        console.error('rfp_engagement_log insert failed:', logErr);
      }

      results.push({
        rfp_carrier_id: rfpCarrierId,
        carrier_id: f.carrier_id,
        carrier_user_id: f.carrier_user_id,
        email: cu.email,
        status: isResend ? 'resent' : 'sent',
      });
    }

    const anySucceeded = results.some(r => r.status === 'sent' || r.status === 'resent');
    if (anySucceeded && rfpRow.status === 'draft') {
      const { error: statusErr } = await admin
        .from('rfps')
        .update({ status: 'distributed' })
        .eq('id', rfpId);
      if (statusErr) {
        console.error('rfps status update failed:', statusErr);
      }
    }

    return NextResponse.json({
      success: true,
      sent: results.filter(r => r.status === 'sent').length,
      resent: results.filter(r => r.status === 'resent').length,
      failed: results.filter(r => r.status === 'failed').length,
      results,
    });
  } catch (err: any) {
    console.error('Send RFP error:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

type EmailParams = {
  recipientName: string;
  agencyName: string;
  rfpName: string;
  clientLabel: string;
  planYear: number | string | null;
  effectiveDate: string | null;
  benefitLabels: string;
  magicLink: string;
  isResend: boolean;
};

function buildEmailHtml(p: EmailParams): string {
  const effective = p.effectiveDate
    ? new Date(p.effectiveDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';
  const planYearLine = p.planYear ? `<strong>Plan year:</strong> ${p.planYear}<br/>` : '';
  const resendNote = p.isResend
    ? `<p style="color:#7a8a9b;font-size:13px;font-style:italic;">This is an updated invite — your previous link is no longer valid.</p>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#faf7f2;margin:0;padding:32px 16px;color:#1e3a5f;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e8e0d0;">
    <h1 style="font-family:Georgia,serif;font-size:24px;color:#1e3a5f;margin:0 0 8px 0;">New RFP from ${escapeHtml(p.agencyName)}</h1>
    <p style="color:#3a4d68;font-size:15px;line-height:1.55;margin:0 0 24px 0;">
      Hi ${escapeHtml(p.recipientName)},
    </p>
    <p style="color:#3a4d68;font-size:15px;line-height:1.55;margin:0 0 24px 0;">
      ${escapeHtml(p.agencyName)} has invited you to quote on a benefits RFP for <strong>${escapeHtml(p.clientLabel)}</strong>.
    </p>
    <div style="background:#faf7f2;border-radius:8px;padding:16px 20px;margin-bottom:24px;font-size:14px;line-height:1.7;color:#3a4d68;">
      <strong>RFP:</strong> ${escapeHtml(p.rfpName)}<br/>
      ${planYearLine}<strong>Effective date:</strong> ${escapeHtml(effective)}<br/>
      <strong>Lines requested:</strong> ${escapeHtml(p.benefitLabels)}
    </div>
    <div style="text-align:center;margin:32px 0;">
      <a href="${p.magicLink}" style="background:#7a9b76;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;display:inline-block;">
        Review the RFP
      </a>
    </div>
    <p style="color:#7a8a9b;font-size:13px;line-height:1.55;margin:0 0 8px 0;">
      This link expires in 14 days.
    </p>
    ${resendNote}
    <hr style="border:none;border-top:1px solid #e8e0d0;margin:24px 0;"/>
    <p style="color:#a0aec0;font-size:12px;line-height:1.55;margin:0;">
      If you weren't expecting this email, you can safely ignore it. Sent via Clarity Health.
    </p>
  </div>
</body>
</html>
  `.trim();
}

function buildEmailText(p: EmailParams): string {
  const effective = p.effectiveDate
    ? new Date(p.effectiveDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';
  const planYearLine = p.planYear ? `Plan year: ${p.planYear}\n` : '';
  const resendNote = p.isResend ? '\nNote: This is an updated invite — your previous link is no longer valid.\n' : '';

  return `
Hi ${p.recipientName},

${p.agencyName} has invited you to quote on a benefits RFP for ${p.clientLabel}.

RFP: ${p.rfpName}
${planYearLine}Effective date: ${effective}
Lines requested: ${p.benefitLabels}

Review the RFP: ${p.magicLink}

This link expires in 14 days.${resendNote}

If you weren't expecting this email, you can safely ignore it.
Sent via Clarity Health.
  `.trim();
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}