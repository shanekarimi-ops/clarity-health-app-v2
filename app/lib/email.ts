// Server-only email utilities using Resend.
// Do NOT import this from client components — it uses RESEND_API_KEY which is a secret.
//
// Setup checked at runtime:
// - RESEND_API_KEY (required, secret)
// - RESEND_FROM_EMAIL (required, e.g., 'onboarding@resend.dev' for testing or 'rfps@yourdomain.com' for prod)
// - RESEND_FROM_NAME (required, display name like 'Clarity Health')
// - NEXT_PUBLIC_APP_URL (required, base URL for magic links — e.g., 'https://clarity-health-app-v2.vercel.app')

import { Resend } from 'resend';

// Lazy singleton — instantiated on first use to avoid build-time env var errors
let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (resendClient) return resendClient;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not set in environment variables.');
  }
  resendClient = new Resend(apiKey);
  return resendClient;
}

function getFromAddress(): string {
  const email = process.env.RESEND_FROM_EMAIL;
  const name = process.env.RESEND_FROM_NAME || 'Clarity Health';
  if (!email) {
    throw new Error('RESEND_FROM_EMAIL is not set in environment variables.');
  }
  return `${name} <${email}>`;
}

function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_APP_URL is not set in environment variables.');
  }
  return url.replace(/\/$/, ''); // strip trailing slash
}

// Generic send wrapper — every email function eventually routes through this.
// Returns Resend's id on success or throws on failure.
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}): Promise<{ id: string }> {
  const client = getResendClient();
  const from = getFromAddress();

  const { data, error } = await client.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
    replyTo: params.replyTo,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
  if (!data?.id) {
    throw new Error('Resend returned no email id.');
  }
  return { id: data.id };
}

// Smoke test helper — useful during Push 3 to verify the wiring works
// before adding template/magic-link complexity. Not used in production code.
export async function sendTestEmail(to: string): Promise<{ id: string }> {
  return sendEmail({
    to,
    subject: 'Clarity Health test email',
    html: '<p>If you received this, Resend is wired up correctly.</p>',
    text: 'If you received this, Resend is wired up correctly.',
  });
}

// Builds a magic link URL for a carrier rep to access an RFP.
// The token will be created in Push 3 (carrier_invites or similar table — TBD).
// For Push 1, this is just the URL builder; the actual auth flow lands in S35.
export function buildCarrierMagicLink(token: string): string {
  return `${getAppUrl()}/carrier/login?token=${encodeURIComponent(token)}`;
}

// Re-export the constants for convenience in components that need them.
// (Components that need labels should import from benefit-lines.ts directly.)
export { getAppUrl };