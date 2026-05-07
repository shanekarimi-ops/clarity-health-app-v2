import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer';

// =====================================================
// CLARITY HEALTH BRANDED PDF TEMPLATE
// Reusable wrapper for all broker reports.
// Supports per-agency branding (logo + primary/accent colors).
// =====================================================

// Design tokens (match the app). Fallback values when branding is absent.
export const PDF_COLORS = {
  cream: '#faf7f2',
  warm: '#eef1f4',
  ink: '#1e3a5f',
  ink2: '#3a4d68',
  accent2: '#7a9b76', // sage (default accent)
  accent3: '#5b7a99', // steel blue
  textMuted: '#6b7a8d',
  border: '#d8dde5',
  white: '#ffffff',
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: PDF_COLORS.cream,
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: PDF_COLORS.ink2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    marginBottom: 24,
    borderBottomWidth: 2,
    // borderBottomColor is set inline so it can use the agency primary color
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBox: {
    width: 32,
    height: 32,
    backgroundColor: PDF_COLORS.ink,
    borderRadius: 6,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoLetter: {
    color: PDF_COLORS.cream,
    fontFamily: 'Helvetica-Bold',
    fontSize: 18,
  },
  customLogo: {
    maxWidth: 140,
    maxHeight: 40,
    objectFit: 'contain',
    marginRight: 0,
  },
  brandName: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  brandClarity: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 14,
    color: PDF_COLORS.ink,
  },
  brandHealth: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 14,
    // color is set inline so it can use agency accent color
    marginLeft: 4,
  },
  agencyBlock: {
    alignItems: 'flex-end',
  },
  agencyName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    color: PDF_COLORS.ink,
  },
  reportMeta: {
    fontSize: 8,
    color: PDF_COLORS.textMuted,
    marginTop: 2,
  },
  reportTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 22,
    color: PDF_COLORS.ink,
    marginBottom: 4,
  },
  reportSubtitle: {
    fontSize: 11,
    color: PDF_COLORS.textMuted,
    marginBottom: 24,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.border,
    fontSize: 8,
    color: PDF_COLORS.textMuted,
  },
  // Sample watermark
  watermarkContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: -1,
  },
  watermarkText: {
    fontSize: 90,
    fontFamily: 'Helvetica-Bold',
    // color set inline (uses primary)
    opacity: 0.07,
    transform: 'rotate(-30deg)',
    letterSpacing: 8,
  },
  sampleBanner: {
    backgroundColor: '#fff8e8',
    borderColor: '#e0c46a',
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sampleBannerText: {
    fontSize: 9,
    color: '#7a6500',
    fontFamily: 'Helvetica-Bold',
  },
  sampleBannerSub: {
    fontSize: 8,
    color: '#7a6500',
    marginLeft: 6,
  },
});

interface BrandedPDFProps {
  agencyName: string;
  reportTitle: string;
  reportSubtitle?: string;
  generatedDate?: string;
  isSample?: boolean;
  children?: React.ReactNode;
  // ----- New: per-agency branding -----
  // When logoBytes is provided, the agency's logo replaces the Clarity "C" tile
  // and the "Clarity Health" wordmark is hidden (avoids dual-logo clutter).
  logoBytes?: Buffer | null;
  logoFormat?: 'png' | 'jpg' | null;
  primaryColor?: string;
  accentColor?: string;
}

export function BrandedPDF({
  agencyName,
  reportTitle,
  reportSubtitle,
  generatedDate,
  isSample = false,
  children,
  logoBytes,
  logoFormat,
  primaryColor,
  accentColor,
}: BrandedPDFProps) {
  const dateStr =
    generatedDate ||
    new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  // Resolve effective brand colors with fallbacks
  const primary = primaryColor || PDF_COLORS.ink;
  const accent = accentColor || PDF_COLORS.accent2;
  const hasCustomLogo = !!(logoBytes && logoFormat);

  return (
    <Document>
      <Page size="LETTER" style={styles.page} wrap>
        {/* Diagonal SAMPLE REPORT watermark — uses primary color */}
        {isSample && (
          <View style={styles.watermarkContainer} fixed>
            <Text style={[styles.watermarkText, { color: primary }]}>SAMPLE REPORT</Text>
          </View>
        )}

        {/* Header — bottom border uses primary color */}
        <View style={[styles.header, { borderBottomColor: primary }]} fixed>
          <View style={styles.brandRow}>
            {hasCustomLogo ? (
              // Agency-uploaded logo replaces Clarity branding strip
              <Image
                src={{
                  data: logoBytes!,
                  format: logoFormat as 'png' | 'jpg',
                }}
                style={styles.customLogo}
              />
            ) : (
              <>
                <View style={styles.logoBox}>
                  <Text style={styles.logoLetter}>C</Text>
                </View>
                <View style={styles.brandName}>
                  <Text style={styles.brandClarity}>Clarity</Text>
                  <Text style={[styles.brandHealth, { color: accent }]}>Health</Text>
                </View>
              </>
            )}
          </View>
          <View style={styles.agencyBlock}>
            <Text style={styles.agencyName}>{agencyName}</Text>
            <Text style={styles.reportMeta}>Generated {dateStr}</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.reportTitle}>{reportTitle}</Text>
        {reportSubtitle ? (
          <Text style={styles.reportSubtitle}>{reportSubtitle}</Text>
        ) : null}

        {/* Sample banner */}
        {isSample && (
          <View style={styles.sampleBanner}>
            <Text style={styles.sampleBannerText}>⚠ SAMPLE REPORT</Text>
            <Text style={styles.sampleBannerSub}>
              This report uses illustrative data. Real data sources will be wired in a future release.
            </Text>
          </View>
        )}

        {/* Body */}
        {children}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>
            {hasCustomLogo
              ? `${agencyName} · Powered by Clarity Health`
              : 'Clarity Health · clarity-health-app-v2.vercel.app'}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

export const reportStyles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 13,
    color: PDF_COLORS.ink,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.border,
  },
  paragraph: {
    fontSize: 10,
    color: PDF_COLORS.ink2,
    marginBottom: 6,
    lineHeight: 1.4,
  },
  label: {
    fontSize: 9,
    color: PDF_COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  value: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    color: PDF_COLORS.ink,
  },
  card: {
    backgroundColor: PDF_COLORS.white,
    padding: 12,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: PDF_COLORS.accent2,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.border,
  },
  rowLabel: {
    fontSize: 10,
    color: PDF_COLORS.ink2,
  },
  rowValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: PDF_COLORS.ink,
  },
  badge: {
    backgroundColor: PDF_COLORS.accent2,
    color: PDF_COLORS.white,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
});