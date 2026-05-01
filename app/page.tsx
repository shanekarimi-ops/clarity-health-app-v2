'use client';

import Image from 'next/image';

export default function HomePage() {
  return (
    <main>
      <nav className="hp-nav">
        <a href="#" className="logo-mark">
          <Image src="/logo.png" alt="Clarity Health logo" width={38} height={38} />
          <span className="logo-text">Clarity <em>Health</em></span>
        </a>
        <div className="hp-nav-links">
          <a href="#">How it works</a>
          <a href="#">Features</a>
          <a href="#">Pricing</a>
          <a href="#">For Brokers</a>
        </div>
        <div className="hp-nav-ctas">
          <a href="/login" className="btn-sm btn-ghost-sm">Log In</a>
          <a href="/signup" className="btn-sm btn-accent">Get Started Free</a>
        </div>
      </nav>

      <section className="hp-hero">
        <div>
          <div className="hp-hero-eyebrow">AI-Powered Benefits Matching</div>
          <h1>Smarter insights. <em>Better health plans.</em></h1>
          <p>Upload your claims, connect your employer benefits or the government marketplace — and get a ranked, personalized recommendation in under 2 minutes.</p>
          <div className="hp-hero-ctas">
            <a href="/signup" className="btn-lg btn-accent-lg">Get My Recommendations →</a>
            <button className="btn-lg btn-outline-lg">See how it works</button>
          </div>
          <div className="hp-trust">
            <div className="hp-trust-item">No account required to start</div>
            <div className="hp-trust-item">HIPAA-compliant</div>
            <div className="hp-trust-item">Free for individuals</div>
          </div>
        </div>
        <div className="hp-hero-visual">
          <div className="hp-visual-badge">Your Results</div>
          <div className="hp-visual-label">Ranked by match score</div>
          <div className="hp-visual-plans">
            <div className="hp-visual-plan top">
              <div className="hp-visual-plan-icon">🏥</div>
              <div className="hp-visual-plan-info">
                <div className="hp-visual-plan-name">Blue Shield PPO Gold</div>
                <div className="hp-visual-plan-type">PPO · $420/mo · Best for your conditions</div>
              </div>
              <div className="hp-visual-plan-score high">94%</div>
            </div>
            <div className="hp-visual-plan">
              <div className="hp-visual-plan-icon">💎</div>
              <div className="hp-visual-plan-info">
                <div className="hp-visual-plan-name">Kaiser HMO Silver</div>
                <div className="hp-visual-plan-type">HMO · $290/mo · Integrated care</div>
              </div>
              <div className="hp-visual-plan-score mid">71%</div>
            </div>
            <div className="hp-visual-plan">
              <div className="hp-visual-plan-icon">⚕️</div>
              <div className="hp-visual-plan-info">
                <div className="hp-visual-plan-name">Cigna HDHP + HSA</div>
                <div className="hp-visual-plan-type">HDHP · $195/mo · Low utilizer pick</div>
              </div>
              <div className="hp-visual-plan-score low">48%</div>
            </div>
          </div>
        </div>
      </section>

      <section className="hp-how">
        <div className="section-eyebrow">How it works</div>
        <h2 className="section-title">From claims to clarity in 3 steps</h2>
        <p className="section-sub">No jargon. No confusion. Just a clear answer matched to how you actually use healthcare.</p>
        <div className="how-steps">
          <div className="how-step">
            <div className="how-step-num">01</div>
            <div className="how-step-title">Connect your data</div>
            <div className="how-step-desc">Upload an EOB or claims CSV from your insurer, or enter your totals manually. We only use this to match you — never sell it.</div>
          </div>
          <div className="how-step">
            <div className="how-step-num">02</div>
            <div className="how-step-title">Tell us your priorities</div>
            <div className="how-step-desc">Flag conditions, family size, budget, and network preference. Takes 60 seconds.</div>
          </div>
          <div className="how-step">
            <div className="how-step-num">03</div>
            <div className="how-step-title">Get ranked recommendations</div>
            <div className="how-step-desc">We score every available plan against your profile and rank them by actual fit — with plain-English explanations for each.</div>
          </div>
        </div>
      </section>

      <section className="hp-features">
        <div style={{textAlign:'center', marginBottom:'3rem'}}>
          <div className="section-eyebrow">Features</div>
          <h2 className="section-title">Everything you need to choose with confidence</h2>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <div className="feature-title">Claims-Based Matching</div>
            <div className="feature-desc">We use your actual claims history — not averages — to predict what your costs would be under each plan.</div>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🏛️</div>
            <div className="feature-title">Live Marketplace Data</div>
            <div className="feature-desc">Real-time plan data pulled directly from Healthcare.gov for your zip code and income bracket.</div>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🏢</div>
            <div className="feature-title">Group Benefits Upload</div>
            <div className="feature-desc">Upload your employer's benefits summary (PDF or CSV) and we'll parse every plan detail automatically.</div>
          </div>
          <div className="feature-card">
            <div className="feature-icon">💊</div>
            <div className="feature-title">Drug & Condition Coverage</div>
            <div className="feature-desc">See exactly which plans cover your medications and flag gaps in coverage for chronic conditions.</div>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📋</div>
            <div className="feature-title">Side-by-Side Comparison</div>
            <div className="feature-desc">Compare up to 3 plans at once with a clear breakdown of premiums, deductibles, OOP max, and network.</div>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📤</div>
            <div className="feature-title">Shareable PDF Reports</div>
            <div className="feature-desc">Export your full recommendation report to share with a broker, HR team, or family member.</div>
          </div>
        </div>
      </section>

      <section className="hp-social">
        <div className="section-eyebrow" style={{color:'rgba(255,255,255,0.5)'}}>What people are saying</div>
        <h2 className="section-title">Real people. Real decisions.</h2>
        <p className="section-sub">Used by individuals, HR teams, and insurance brokers.</p>
        <div className="testimonials">
          <div className="testimonial">
            <div className="testimonial-quote">&quot;I had no idea my current plan was so mismatched for my diabetes management. Clarity Health showed me I was leaving $3,400 a year on the table.&quot;</div>
            <div className="testimonial-author">Sarah M.</div>
            <div className="testimonial-role">Individual · California</div>
          </div>
          <div className="testimonial">
            <div className="testimonial-quote">&quot;We use Clarity Health during open enrollment for our 200-person team. It cuts down the HR support tickets by half. Employees actually understand their choices now.&quot;</div>
            <div className="testimonial-author">Derek T.</div>
            <div className="testimonial-role">HR Director · Mid-size Tech Co.</div>
          </div>
          <div className="testimonial">
            <div className="testimonial-quote">&quot;As a broker, the claims-matching logic is a genuine differentiator. My clients trust the recommendations because they&apos;re tied to their actual data.&quot;</div>
            <div className="testimonial-author">Lisa R.</div>
            <div className="testimonial-role">Independent Benefits Broker</div>
          </div>
        </div>
      </section>

      <section className="hp-cta">
        <h2>Start for free. No credit card needed.</h2>
        <p>See your top plan matches in under 2 minutes. Your data stays yours.</p>
        <a href="/signup" className="btn-lg btn-white">Get My Recommendations →</a>
      </section>

      <footer className="hp-footer">
        <div className="hp-footer-logo">Clarity <em>Health</em></div>
        <div className="hp-footer-links">
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Service</a>
          <a href="mailto:support@clarityhealth.app">Contact</a>
        </div>
        <div className="hp-footer-copy">© 2026 Clarity Health, Inc.</div>
      </footer>
    </main>
  );
}