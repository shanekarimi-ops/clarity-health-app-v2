import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from '@react-pdf/renderer';

// =====================================================
// CLARITY HEALTH BRANDED PDF TEMPLATE
// Reusable wrapper for all broker reports.
// =====================================================

// Design tokens (match the app)
export const PDF_COLORS = {
  cream: '#faf7f2',
  warm: '#eef1f4',
  ink: '#1e3a5f',
  ink2: '#3a4d68',
  accent2: '#7a9b76', // sage
  accent3: '#5b7a99', // steel blue
  textMuted: '#6b7a8d',
  border: '#d8dde5',
  white: '#ffffff',
};

// Note: We use system fonts in PDFs to avoid Vercel bundling issues.
// Helvetica is built into @react-pdf/renderer.

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
    borderBottomColor: PDF_COLORS.ink,
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
    color: PDF_COLORS.accent2,
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
});

interface BrandedPDFProps {
  agencyName: string;
  reportTitle: string;
  reportSubtitle?: string;
  generatedDate?: string;
  children?: React.ReactNode;
}

/**
 * BrandedPDF — base layout for all Clarity Health reports.
 * Includes header (Clarity Health + agency), footer (page #, date),
 * and a content area where each report renders its body.
 */
export function BrandedPDF({
  agencyName,
  reportTitle,
  reportSubtitle,
  generatedDate,
  children,
}: BrandedPDFProps) {
  const dateStr =
    generatedDate ||
    new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  return (
    <Document>
      <Page size="LETTER" style={styles.page} wrap>
        {/* Header */}
        <View style={styles.header} fixed>
          <View style={styles.brandRow}>
            <View style={styles.logoBox}>
              <Text style={styles.logoLetter}>C</Text>
            </View>
            <View style={styles.brandName}>
              <Text style={styles.brandClarity}>Clarity</Text>
              <Text style={styles.brandHealth}>Health</Text>
            </View>
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

        {/* Body — provided by each report */}
        {children}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>Clarity Health · clarity-health-app-v2.vercel.app</Text>
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

// Helper styles each report can reuse
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