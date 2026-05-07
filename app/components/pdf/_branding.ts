import { SupabaseClient } from '@supabase/supabase-js';

// =====================================================
// PDF BRANDING HELPERS
// Loads agency branding data + downloads the logo as bytes
// for embedding in @react-pdf/renderer documents.
// =====================================================

// Clarity Health defaults — must match the values in BrandedPDF.tsx (PDF_COLORS)
export const DEFAULT_PRIMARY = '#1e3a5f'; // navy
export const DEFAULT_ACCENT = '#7a9b76';  // sage

export type LogoFormat = 'png' | 'jpg' | 'svg';

export type Branding = {
  agencyName: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  logoBytes: Buffer | null;
  logoFormat: LogoFormat | null;
};

// Hex format guard — colors stored in DB should already be normalized,
// but be defensive in case anything weird sneaks through.
const HEX_RE = /^#([0-9A-Fa-f]{6})$/;

function safeColor(value: any, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return HEX_RE.test(trimmed) ? trimmed : fallback;
}

function detectFormatFromUrl(url: string): LogoFormat | null {
  // Strip query params like ?v=12345
  const path = url.split('?')[0].toLowerCase();
  if (path.endsWith('.png')) return 'png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'jpg';
  if (path.endsWith('.svg')) return 'svg';
  return null;
}

// Fetches the logo from a public URL and returns its bytes as a Buffer.
// Returns null if the fetch fails — calling code falls back to default header.
async function fetchLogoBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      console.warn('Logo fetch returned non-OK status:', res.status, url);
      return null;
    }
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch (err) {
    console.warn('Logo fetch threw (using default header instead):', err);
    return null;
  }
}

// Main entry point. Used by every PDF route.
// Reads the agencies row, normalizes colors, optionally fetches the logo bytes.
// Always returns a Branding object — never throws on transient failures.
export async function loadBrandingForAgency(
  admin: SupabaseClient,
  agencyId: string
): Promise<Branding> {
  const fallback: Branding = {
    agencyName: 'Your Agency',
    primaryColor: DEFAULT_PRIMARY,
    accentColor: DEFAULT_ACCENT,
    logoUrl: null,
    logoBytes: null,
    logoFormat: null,
  };

  try {
    const { data, error } = await admin
      .from('agencies')
      .select('name, logo_url, primary_color, accent_color')
      .eq('id', agencyId)
      .maybeSingle();

    if (error || !data) {
      console.warn('loadBrandingForAgency: agency lookup failed', error);
      return fallback;
    }

    const agencyName = (data.name as string) || fallback.agencyName;
    const primaryColor = safeColor(data.primary_color, DEFAULT_PRIMARY);
    const accentColor = safeColor(data.accent_color, DEFAULT_ACCENT);
    const logoUrl = (data.logo_url as string) || null;

    let logoBytes: Buffer | null = null;
    let logoFormat: LogoFormat | null = null;

    if (logoUrl) {
      logoFormat = detectFormatFromUrl(logoUrl);
      // SVG is unreliable in @react-pdf/renderer — skip embedding to avoid render errors.
      // PDFs will fall back to the agency name in the header strip.
      if (logoFormat === 'png' || logoFormat === 'jpg') {
        logoBytes = await fetchLogoBytes(logoUrl);
        if (!logoBytes) {
          // Fetch failed — clear format so the PDF renders the fallback header
          logoFormat = null;
        }
      } else if (logoFormat === 'svg') {
        // Mark as null so we skip the Image element
        logoFormat = null;
      }
    }

    return {
      agencyName,
      primaryColor,
      accentColor,
      logoUrl,
      logoBytes,
      logoFormat,
    };
  } catch (err) {
    console.warn('loadBrandingForAgency: unexpected error', err);
    return fallback;
  }
}