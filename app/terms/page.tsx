'use client';

// ⚠️ TODO BEFORE LAUNCH:
// 1. Replace [COMPANY NAME] with your registered business entity name
// 2. Replace [STATE/PROVINCE] with your governing jurisdiction
// 3. Replace [CONTACT EMAIL] with your real legal contact email
// 4. Have this reviewed by a healthcare-focused attorney
// 5. Update "Last Updated" date when changes are made
// 6. Confirm pricing and refund language matches actual business model

import Link from 'next/link';
import Image from 'next/image';

export default function TermsPage() {
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
          Terms of Service
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
          <strong>📋 Beta notice:</strong> Clarity Health is currently in beta. These Terms describe our current practices but may be updated as we add features. We&apos;ll notify users of material changes.
        </div>

        <section style={{ color: '#3a4d68', fontSize: '15px', lineHeight: '1.8' }}>
          <h2 style={termsH2}>1. Agreement to Terms</h2>
          <p>
            Welcome to Clarity Health. These Terms of Service (&quot;Terms&quot;) govern your access to and use of the Clarity Health website, applications, and services (collectively, the &quot;Service&quot;), operated by Clarity Health (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;).
          </p>
          <p>
            By creating an account or using the Service, you agree to be bound by these Terms and our{' '}
            <Link href="/privacy" style={{ color: '#7a9b76' }}>
              Privacy Policy
            </Link>
            . If you do not agree, you may not use the Service.
          </p>

          <h2 style={termsH2}>2. Eligibility</h2>
          <p>
            You must be at least 18 years old and legally able to enter into binding contracts to use the Service. By using the Service, you represent that you meet these requirements.
          </p>
          <p>
            The Service is currently available to users in the United States and Canada. Users outside these regions may experience limited functionality.
          </p>

          <h2 style={termsH2}>3. Account Registration</h2>
          <p>
            To use most features, you must create an account. You agree to provide accurate, current, and complete information and to keep it updated. You are responsible for safeguarding your password and for all activity under your account.
          </p>
          <p>
            Account types include Individual, HR Administrator, and Broker. Each role has different features and obligations described within the Service.
          </p>

          <h2 style={termsH2}>4. The Service: What We Do (and Don&apos;t Do)</h2>
          <p>
            Clarity Health helps users evaluate health insurance plans by analyzing claims data, health profiles, and stated priorities. Our recommendations are generated using algorithms and AI assistance.
          </p>
          <p>
            <strong>Clarity Health is not:</strong>
          </p>
          <ul style={termsUl}>
            <li>A licensed insurance broker, agent, or producer (unless explicitly stated for specific accounts)</li>
            <li>A medical, healthcare, or financial advisor</li>
            <li>A substitute for professional medical, legal, or financial advice</li>
            <li>A guarantor of insurance plan availability, pricing, or coverage</li>
          </ul>
          <p>
            Recommendations are informational. Actual plan enrollment, pricing, and coverage decisions are made by you in consultation with licensed professionals or directly with insurance carriers.
          </p>

          <h2 style={termsH2}>5. Pricing and Payment</h2>
          <p>
            Some features of the Service are free; others require a paid subscription. Pricing is displayed within the Service and may change with notice.
          </p>
          <p>
            <strong>Subscription terms:</strong>
          </p>
          <ul style={termsUl}>
            <li>Paid subscriptions renew automatically until canceled</li>
            <li>You can cancel at any time through your account settings</li>
            <li>Cancellation takes effect at the end of your current billing period</li>
            <li>Fees are non-refundable except where required by law</li>
          </ul>
          <p>
            For Brokers and HR Administrators with annual or custom billing, refund and renewal terms will be specified in your separate agreement.
          </p>

          <h2 style={termsH2}>6. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul style={termsUl}>
            <li>Use the Service for any unlawful purpose or in violation of any applicable laws</li>
            <li>Upload false, misleading, or fraudulent claims information</li>
            <li>Upload information about another person without their authorization</li>
            <li>Reverse engineer, decompile, or attempt to extract our source code or AI models</li>
            <li>Resell, sublicense, or commercially exploit the Service without our written permission</li>
            <li>Use automated tools (bots, scrapers) to access the Service without our consent</li>
            <li>Attempt to disrupt or compromise the security of the Service</li>
            <li>Impersonate any person or misrepresent your affiliation with any entity</li>
          </ul>

          <h2 style={termsH2}>7. Your Content</h2>
          <p>
            You retain ownership of all information, claims files, and other content you upload (&quot;Your Content&quot;). By uploading, you grant Clarity Health a limited, non-exclusive license to store, process, and use Your Content solely to provide the Service to you.
          </p>
          <p>
            You represent that you have the right to upload Your Content and that doing so does not violate any law or third-party rights.
          </p>

          <h2 style={termsH2}>8. AI-Generated Recommendations</h2>
          <p>
            The Service uses artificial intelligence to generate plan recommendations. AI outputs:
          </p>
          <ul style={termsUl}>
            <li>Are based on the information you provide and our plan database</li>
            <li>May contain errors, omissions, or outdated information</li>
            <li>Should not be relied upon as the sole basis for insurance decisions</li>
            <li>Do not constitute professional advice</li>
          </ul>
          <p>
            You are responsible for verifying recommendations with licensed insurance professionals and for confirming plan details directly with insurance carriers before enrollment.
          </p>

          <h2 style={termsH2}>9. Intellectual Property</h2>
          <p>
            The Service, including its design, code, trademarks, and content (excluding Your Content), is owned by Clarity Health and protected by intellectual property laws. We grant you a limited, non-exclusive, non-transferable license to use the Service for its intended purposes.
          </p>

          <h2 style={termsH2}>10. Termination</h2>
          <p>
            You may delete your account at any time through Settings. We may suspend or terminate your access if you violate these Terms, engage in fraud, or for legitimate business reasons (with notice where practical).
          </p>
          <p>
            Upon termination, your right to use the Service ceases immediately. Provisions that should reasonably survive termination (including payment obligations, disclaimers, and limitations of liability) will continue to apply.
          </p>

          <h2 style={termsH2}>11. Disclaimers</h2>
          <p>
            <strong>
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED.
            </strong>{' '}
            To the fullest extent permitted by law, we disclaim all warranties, including warranties of merchantability, fitness for a particular purpose, non-infringement, accuracy, and uninterrupted availability.
          </p>
          <p>
            We do not warrant that the Service will be error-free, that recommendations will result in cost savings, or that any particular insurance plan will be available, suitable, or accepted.
          </p>

          <h2 style={termsH2}>12. Limitation of Liability</h2>
          <p>
            <strong>
              TO THE FULLEST EXTENT PERMITTED BY LAW, CLARITY HEALTH AND ITS AFFILIATES, OFFICERS, EMPLOYEES, AND AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, LOST DATA, OR LOST SAVINGS, ARISING FROM YOUR USE OF THE SERVICE.
            </strong>
          </p>
          <p>
            Our total aggregate liability for any claim arising from these Terms or the Service will not exceed the greater of (a) the amount you paid us in the 12 months preceding the claim, or (b) US$100.
          </p>
          <p>
            Some jurisdictions do not allow these limitations, so they may not apply to you in full.
          </p>

          <h2 style={termsH2}>13. Indemnification</h2>
          <p>
            You agree to indemnify and hold Clarity Health harmless from claims, damages, and expenses (including reasonable attorneys&apos; fees) arising from your violation of these Terms, your misuse of the Service, or your infringement of any third party&apos;s rights.
          </p>

          <h2 style={termsH2}>14. Governing Law and Disputes</h2>
          <p>
            These Terms are governed by the laws of [STATE/PROVINCE — to be updated upon entity formation], without regard to conflict-of-law principles. Any dispute arising from these Terms or the Service will be resolved in the courts of that jurisdiction, unless otherwise required by applicable consumer protection law.
          </p>
          <p>
            For users in Canada: Nothing in these Terms limits any rights you have under applicable Canadian consumer protection law.
          </p>

          <h2 style={termsH2}>15. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. Material changes will be communicated through the Service or via email. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.
          </p>

          <h2 style={termsH2}>16. Miscellaneous</h2>
          <p>
            These Terms (together with our Privacy Policy) constitute the entire agreement between you and Clarity Health regarding the Service. If any provision is found unenforceable, the remaining provisions remain in effect. Our failure to enforce any right is not a waiver of that right. You may not assign these Terms without our written consent.
          </p>

          <h2 style={termsH2}>17. Contact Us</h2>
          <p>Questions about these Terms?</p>
          <p>
            <strong>Email:</strong>{' '}
            <a href="mailto:legal@clarityhealth.app" style={{ color: '#7a9b76' }}>
              legal@clarityhealth.app
            </a>
            <br />
            <strong>Company:</strong> [COMPANY NAME — to be updated upon entity formation]
            <br />
            <strong>Mailing address:</strong> [BUSINESS ADDRESS — to be updated upon entity formation]
          </p>
        </section>

        <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid #eef1f4', fontSize: '13px', color: '#3a4d68', opacity: 0.7 }}>
          <Link href="/privacy" style={{ color: '#7a9b76', marginRight: '16px' }}>
            Privacy Policy
          </Link>
          <Link href="/" style={{ color: '#7a9b76' }}>
            Home
          </Link>
        </div>
      </main>
    </div>
  );
}

const termsH2: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: '24px',
  color: '#1e3a5f',
  marginTop: '36px',
  marginBottom: '12px',
};

const termsUl: React.CSSProperties = {
  paddingLeft: '24px',
  marginBottom: '16px',
};