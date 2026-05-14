'use client';
import Image from 'next/image';
import Link from 'next/link';

type BrokerSidebarProps = {
  active:
    // Workflow
    | 'dashboard'
    | 'rfps'
    | 'quotes'
    | 'presentations'
    | 'packages'
    // Directory
    | 'clients'
    | 'carriers'
    // Insights
    | 'activity'
    | 'reports'
    // Agency
    | 'team'
    | 'branding'
    | 'settings'
    | 'billing'
    // Legacy (still rendered by existing pages but hidden from sidebar)
    | 'groups'
    | 'plan-design';
  firstName: string;
  lastName: string;
  agencyName: string;
  onLogout: () => void;
};

export default function BrokerSidebar({
  active,
  firstName,
  lastName,
  agencyName,
  onLogout,
}: BrokerSidebarProps) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  return (
    <aside className="dash-sidebar">
      <a href="/broker/dashboard" className="logo-mark">
        <Image
          src="/logo.png"
          alt="Clarity Health logo"
          width={32}
          height={32}
          style={{ filter: 'brightness(1.4)' }}
        />
        <span className="logo-text">
          Clarity <em>Health</em>
        </span>
      </a>

      {/* === WORKFLOW === */}
      <div className="dash-section-label">Workflow</div>

      <Link href="/broker/dashboard" style={linkReset}>
        <div className={`dash-nav-item ${active === 'dashboard' ? 'active' : ''}`}>
          <div className="dash-nav-icon">📊</div> Dashboard
        </div>
      </Link>

      <Link href="/broker/rfps" style={linkReset}>
        <div className={`dash-nav-item ${active === 'rfps' ? 'active' : ''}`}>
          <div className="dash-nav-icon">📄</div> RFPs
        </div>
      </Link>

      <Link href="/broker/quotes" style={linkReset}>
        <div className={`dash-nav-item ${active === 'quotes' ? 'active' : ''}`}>
          <div className="dash-nav-icon">💬</div> Quotes
        </div>
      </Link>

      <Link href="/broker/presentations" style={linkReset}>
        <div className={`dash-nav-item ${active === 'presentations' ? 'active' : ''}`}>
          <div className="dash-nav-icon">📑</div> Presentations
        </div>
      </Link>

      <Link href="/broker/packages" style={linkReset}>
        <div className={`dash-nav-item ${active === 'packages' ? 'active' : ''}`}>
          <div className="dash-nav-icon">📦</div> Packages
        </div>
      </Link>

      {/* === DIRECTORY === */}
      <div className="dash-section-label">Directory</div>

      <Link href="/broker/clients" style={linkReset}>
        <div className={`dash-nav-item ${active === 'clients' ? 'active' : ''}`}>
          <div className="dash-nav-icon">👥</div> Clients
        </div>
      </Link>

      <Link href="/broker/carriers" style={linkReset}>
        <div className={`dash-nav-item ${active === 'carriers' ? 'active' : ''}`}>
          <div className="dash-nav-icon">🏢</div> Carriers
        </div>
      </Link>

      {/* === INSIGHTS === */}
      <div className="dash-section-label">Insights</div>

      <Link href="/broker/activity" style={linkReset}>
        <div className={`dash-nav-item ${active === 'activity' ? 'active' : ''}`}>
          <div className="dash-nav-icon">🕓</div> Activity
        </div>
      </Link>

      <Link href="/broker/reports" style={linkReset}>
        <div className={`dash-nav-item ${active === 'reports' ? 'active' : ''}`}>
          <div className="dash-nav-icon">📈</div> Reports
        </div>
      </Link>

      {/* === AGENCY === */}
      <div className="dash-section-label">Agency</div>

      <Link href="/broker/team" style={linkReset}>
        <div className={`dash-nav-item ${active === 'team' ? 'active' : ''}`}>
          <div className="dash-nav-icon">👨‍💼</div> Team
        </div>
      </Link>

      <Link href="/broker/branding" style={linkReset}>
        <div className={`dash-nav-item ${active === 'branding' ? 'active' : ''}`}>
          <div className="dash-nav-icon">🎨</div> Branding
        </div>
      </Link>

      <Link href="/broker/settings" style={linkReset}>
        <div className={`dash-nav-item ${active === 'settings' ? 'active' : ''}`}>
          <div className="dash-nav-icon">⚙️</div> Settings
        </div>
      </Link>

      <Link href="/broker/billing" style={linkReset}>
        <div className={`dash-nav-item ${active === 'billing' ? 'active' : ''}`}>
          <div className="dash-nav-icon">💳</div> Billing
        </div>
      </Link>

      <div className="dash-sidebar-footer">
        <div className="dash-user">
          <div className="dash-avatar">{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="dash-user-name">
              {firstName} {lastName}
            </div>
            <div className="dash-user-role" title={agencyName}>{agencyName}</div>
          </div>
        </div>
        <button onClick={onLogout} className="dash-logout-btn">
          Log Out
        </button>
      </div>
    </aside>
  );
}

const linkReset: React.CSSProperties = {
  textDecoration: 'none',
  color: 'inherit',
};