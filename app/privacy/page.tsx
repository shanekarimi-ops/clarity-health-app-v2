'use client';

// ⚠️ TODO BEFORE LAUNCH:
// 1. Replace [COMPANY NAME] with your registered business entity name
// 2. Replace [CONTACT EMAIL] with your real legal contact email
// 3. Replace [BUSINESS ADDRESS] with a real mailing address
// 4. Have this reviewed by a healthcare-focused attorney (HIPAA implications)
// 5. Update "Last Updated" date when changes are made
// 6. If using Supabase free tier, this is NOT HIPAA-compliant — flag for user

import Link from 'next/link';
import Image from 'next/image';

export default function PrivacyPage() {
  return (
    <div style={{ background: '#faf7f2', minHeight: '100vh' }}>
      {/* Simple top nav */}
      <nav
        style={{
          background: '#1e3a5f',
          padding: '16px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: 'white' }}>
          <Image src="/logo.png" alt="Clarity Health" width={28} height={28} style={{ filter: 'brightness(1.4)' }} />
          <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '20px' }}>
            Clarity <em style={{ color: '#7a9b76' }}>Health</em>
          </span>
        </Link>
        <Link href="/" style={{ color: 'white', textDecoration: 'none', fontSize: '14px', opacity: 0.8 }}>
          ← Back to home
        </Link>
      </nav>

      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '60px 32px' }}>
        <h1
          style={{
            fontFamily: 'Playfair Display, serif',
            fontSize: '40px',
            color: '#1e3a5f',
            margin: '0 0 12px 0',
          }}
        >
          Privacy Policy
        </h1>
        <p style={{ color: '#3a4d68', fontSize: '14px', marginBottom: '32px' }}>
          <strong>Last Updated:</strong> April 30, 2026
        </p>

        {/* MVP disclaimer banner */}
        <div
          style={{
            background: '#eef1f4',
            border: '1px solid #5b7a99',
            borderRadius: '8px',
            padding: '16px 20px',
            marginBottom: '32px',
            color: '#1e3a5f',
            fontSize: '14px',
            lineHeight: '1.6',
          }}
        >
          <strong>📋 Beta notice:</strong> Clarity Health is currently in beta. This Privacy Policy describes our current practices but may be updated as we add features and finalize our legal structure. We&apos;ll notify users of material changes.
        </div>

        <section style={{ color: '#3a4d68', fontSize: '15px', lineHeight: '1.8' }}>
          <h2 style={privacyH2}>1. Introduction</h2>
          <p>
            Clarity Health (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) provides a benefits recommendation platform that helps individuals, HR teams, and insurance brokers evaluate health insurance plans. This Privacy Policy explains how we collect, use, store, and share information when you use our service at clarityhealth.app and related applications (the &quot;Service&quot;).
          </p>
          <p>
            By using the Service, you agree to the practices described in this policy. If you do not agree, please do not use the Service.
          </p>

          <h2 style={privacyH2}>2. Information We Collect</h2>
          <p>We collect the following categories of information:</p>

          <h3 style={privacyH3}>Account information</h3>
          <p>
            When you sign up, we collect your name, email address, password (stored encrypted), and account role (Individual, HR, or Broker).
          </p>

          <h3 style={privacyH3}>Health and benefits information</h3>
          <p>
            To provide plan recommendations, we collect information you choose to share, including: age, household size, ZIP code, current and historical insurance claims (uploaded files), prescribed medications, preferred healthcare providers, declared health conditions, monthly budget, and your stated coverage priorities.
          </p>

          <h3 style={privacyH3}>Usage information</h3>
          <p>
            We collect basic information about how you use the Service, including pages visited, features used, and timestamps of activity. We do not currently use third-party analytics or advertising trackers.
          </p>

          <h3 style={privacyH3}>Information from third parties</h3>
          <p>
            We may receive information from your insurance carrier or broker if you authorize us to import claims data on your behalf. We do not currently integrate with such services but may in the future.
          </p>

          <h2 style={privacyH2}>3. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul style={privacyUl}>
            <li>Operate and maintain the Service, including authenticating your account</li>
            <li>Generate personalized insurance plan recommendations</li>
            <li>Allow brokers and HR teams to assist clients (where applicable)</li>
            <li>Communicate with you about service updates, security, and support</li>
            <li>Improve our Service through aggregated, de-identified analysis</li>
            <li>Comply with legal obligations</li>
          </ul>
          <p>
            We do not sell your personal information. We do not use your health information for advertising.
          </p>

          <h2 style={privacyH2}>4. How We Share Your Information</h2>
          <p>We share information only in these limited circumstances:</p>
          <ul style={privacyUl}>
            <li>
              <strong>With your authorized brokers or HR administrators:</strong> If you are an Individual whose account is linked to a Broker or HR account, that party may view information you choose to share to assist with plan selection.
            </li>
            <li>
              <strong>With service providers:</strong> We use trusted vendors for hosting, authentication, and storage (currently including Supabase for backend infrastructure). These providers process data on our behalf under confidentiality obligations.
            </li>
            <li>
              <strong>With AI processing partners:</strong> When generating recommendations, your health profile and claims summary may be processed by Anthropic&apos;s Claude AI service. We do not share account-identifying information unnecessarily.
            </li>
            <li>
              <strong>For legal reasons:</strong> If required by law, court order, or to protect rights, safety, or property.
            </li>
            <li>
              <strong>In a business transfer:</strong> If Clarity Health is acquired or merged, your information may be transferred as part of that transaction. We will notify you in advance.
            </li>
          </ul>

          <h2 style={privacyH2}>5. Health Information & HIPAA</h2>
          <p>
            Some information you provide may constitute Protected Health Information (PHI) under the U.S. Health Insurance Portability and Accountability Act (HIPAA). During our beta phase, Clarity Health is not currently a HIPAA-covered entity, and we recommend that users do not upload sensitive PHI until we complete our compliance review.
          </p>
          <p>
            If you are a Broker or HR Administrator subject to HIPAA obligations, you are responsible for ensuring your use of the Service complies with your obligations. Contact us if you require a Business Associate Agreement (BAA).
          </p>

          <h2 style={privacyH2}>6. Data Storage & Security</h2>
          <p>
            We store data using industry-standard encryption in transit (TLS) and at rest. Uploaded claims files are stored in private cloud storage with row-level access controls — only you (and authorized parties you&apos;ve linked) can access your files.
          </p>
          <p>
            However, no method of transmission or storage is 100% secure. We cannot guarantee absolute security and you use the Service at your own risk.
          </p>

          <h2 style={privacyH2}>7. Your Rights</h2>

          <h3 style={privacyH3}>For all users</h3>
          <p>You have the right to:</p>
          <ul style={privacyUl}>
            <li>Access the personal information we hold about you</li>
            <li>Correct inaccurate information through your account settings</li>
            <li>Delete your account and associated data through the Settings page</li>
            <li>Export your data (contact us for assistance)</li>
            <li>Object to certain processing of your information</li>
          </ul>

          <h3 style={privacyH3}>For California residents (CCPA/CPRA)</h3>
          <p>
            California residents have additional rights, including the right to know what personal information is collected, the right to delete personal information, the right to opt out of sales (we do not sell data), and the right to non-discrimination for exercising these rights. Submit requests to our contact email below.
          </p>

          <h3 style={privacyH3}>For Canadian residents (PIPEDA)</h3>
          <p>
            Canadian users have rights under the Personal Information Protection and Electronic Documents Act (PIPEDA), including the right to access and correct personal information and to withdraw consent. Provincial laws (such as Quebec&apos;s Law 25 or BC&apos;s PIPA) may provide additional rights. Submit requests to our contact email below.
          </p>

          <h2 style={privacyH2}>8. Data Retention</h2>
          <p>
            We retain your information as long as your account is active or as needed to provide the Service. If you delete your account, we will delete or anonymize your information within 30 days, except where retention is required by law or for legitimate business purposes (such as fraud prevention).
          </p>

          <h2 style={privacyH2}>9. International Data Transfers</h2>
          <p>
            Our service providers may process your information in the United States or other countries. Where required, we implement appropriate safeguards (such as standard contractual clauses) for international transfers.
          </p>

          <h2 style={privacyH2}>10. Children&apos;s Privacy</h2>
          <p>
            The Service is not directed to children under 18. We do not knowingly collect information from children under 18. If you believe a child has provided us information, please contact us and we will delete it.
          </p>

          <h2 style={privacyH2}>11. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Material changes will be communicated through the Service or via email. The &quot;Last Updated&quot; date at the top reflects the most recent version.
          </p>

          <h2 style={privacyH2}>12. Contact Us</h2>
          <p>If you have questions about this Privacy Policy or your information:</p>
          <p>
            <strong>Email:</strong>{' '}
            <a href="mailto:privacy@clarityhealth.app" style={{ color: '#7a9b76' }}>
              privacy@clarityhealth.app
            </a>
            <br />
            <strong>Company:</strong> [COMPANY NAME — to be updated upon entity formation]
            <br />
            <strong>Mailing address:</strong> [BUSINESS ADDRESS — to be updated upon entity formation]
          </p>
        </section>

        <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid #eef1f4', fontSize: '13px', color: '#3a4d68', opacity: 0.7 }}>
          <Link href="/terms" style={{ color: '#7a9b76', marginRight: '16px' }}>
            Terms of Service
          </Link>
          <Link href="/" style={{ color: '#7a9b76' }}>
            Home
          </Link>
        </div>
      </main>
    </div>
  );
}

const privacyH2: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: '24px',
  color: '#1e3a5f',
  marginTop: '36px',
  marginBottom: '12px',
};

const privacyH3: React.CSSProperties = {
  fontSize: '17px',
  color: '#1e3a5f',
  marginTop: '20px',
  marginBottom: '8px',
  fontWeight: 600,
};

const privacyUl: React.CSSProperties = {
  paddingLeft: '24px',
  marginBottom: '16px',
};