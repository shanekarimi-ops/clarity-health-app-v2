'use client';

import Image from 'next/image';
import Link from 'next/link';

type SidebarProps = {
  active: 'dashboard' | 'claims-profile' | 'uploaded-files' | 'settings' | 'help';
  firstName: string;
  lastName: string;
  role: string;
  onLogout: () => void;
};

export default function Sidebar({ active, firstName, lastName, role, onLogout }: SidebarProps) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  return (
    <aside className="dash-sidebar">
      <a href="/" className="logo-mark">
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

      <div className="dash-section-label">Main</div>
      <Link href="/profile" style={linkReset}>
        <div className={`dash-nav-item ${active === 'dashboard' ? 'active' : ''}`}>
          <div className="dash-nav-icon">🏠</div> Dashboard
        </div>
      </Link>
      <div className="dash-nav-item">
        <div className="dash-nav-icon">📋</div> My Plans <span className="soon-tag">soon</span>
      </div>
      <div className="dash-nav-item">
        <div className="dash-nav-icon">⚖️</div> Compare Plans <span className="soon-tag">soon</span>
      </div>

      <div className="dash-section-label">My Data</div>
      <Link href="/claims-profile" style={linkReset}>
        <div className={`dash-nav-item ${active === 'claims-profile' ? 'active' : ''}`}>
          <div className="dash-nav-icon">📄</div> Claims & Profile
        </div>
      </Link>
      <Link href="/uploaded-files" style={linkReset}>
        <div className={`dash-nav-item ${active === 'uploaded-files' ? 'active' : ''}`}>
          <div className="dash-nav-icon">📎</div> Uploaded Files
        </div>
      </Link>

      <div className="dash-section-label">Account</div>
      <Link href="/settings" style={linkReset}>
        <div className={`dash-nav-item ${active === 'settings' ? 'active' : ''}`}>
          <div className="dash-nav-icon">⚙️</div> Settings
        </div>
      </Link>
      <div className="dash-nav-item">
        <div className="dash-nav-icon">💳</div> Billing <span className="soon-tag">soon</span>
      </div>
      <Link href="/help" style={linkReset}>
        <div className={`dash-nav-item ${active === 'help' ? 'active' : ''}`}>
          <div className="dash-nav-icon">❓</div> Help
        </div>
      </Link>

      <div className="dash-sidebar-footer">
        <div className="dash-user">
          <div className="dash-avatar">{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="dash-user-name">
              {firstName} {lastName}
            </div>
            <div className="dash-user-role">{role}</div>
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