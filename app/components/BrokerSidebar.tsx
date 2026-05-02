'use client';
import Image from 'next/image';
import Link from 'next/link';

type BrokerSidebarProps = {
  active:
    | 'dashboard'
    | 'clients'
    | 'groups'
    | 'plan-design'
    | 'reports'
    | 'team'
    | 'settings'
    | 'billing';
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

      <div className="dash-section-label">Broker</div>

      <Link href="/broker/dashboard" style={linkReset}>
        <div className={`dash-nav-item ${active === 'dashboard' ? 'active' : ''}`}>
          <div className="dash-nav-icon">🏠</div> Dashboard
        </div>
      </Link>

      <Link href="/broker/clients" style={linkReset}>
        <div className={`dash-nav-item ${active === 'clients' ? 'active' : ''}`}>
          <div className="dash-nav-icon">👥</div> Clients
        </div>
      </Link>

      <Link href="/broker/groups" style={linkReset}>
        <div className={`dash-nav-item ${active === 'groups' ? 'active' : ''}`}>
          <div className="dash-nav-icon">🏢</div> Groups
        </div>
      </Link>

      <Link href="/broker/plan-design" style={linkReset}>
        <div className={`dash-nav-item ${active === 'plan-design' ? 'active' : ''}`}>
          <div className="dash-nav-icon">📐</div> Plan Design
        </div>
      </Link>

      <Link href="/broker/reports" style={linkReset}>
        <div className={`dash-nav-item ${active === 'reports' ? 'active' : ''}`}>
          <div className="dash-nav-icon">📊</div> Reports
        </div>
      </Link>

      <div className="dash-section-label">Agency</div>

      <Link href="/broker/team" style={linkReset}>
        <div className={`dash-nav-item ${active === 'team' ? 'active' : ''}`}>
          <div className="dash-nav-icon">👨‍💼</div> Team
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