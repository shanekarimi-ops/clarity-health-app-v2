'use client';
import Image from 'next/image';
import Link from 'next/link';
type SidebarProps = {
  active: 'dashboard' | 'find-plans' | 'claims-profile' | 'uploaded-files' | 'settings' | 'help' | 'billing' | 'my-plans' | 'compare-plans';
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
      <Link href="/find-plans" style={linkReset}>
        <div className={`dash-nav-item ${active === 'find-plans' ? 'active' : ''}`}>
          <div className="dash-nav-icon">🔍</div> Find Plans
        </div>
      </Link>
      <Link href="/my-plans" style={linkReset}>
        <div className={`dash-nav-item ${active === 'my-plans' ? 'active' : ''}`}>
          <div className="dash-nav-icon">📋</div> My Plans
        </div>
      </Link>
      <Link href="/compare-plans" style={linkReset}>
        <div className={`dash-nav-item ${active === 'compare-plans' ? 'active' : ''}`}>
          <div className="dash-nav-icon">⚖️</div> Compare Plans
        </div>
      </Link>
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
      <Link href="/billing" style={linkReset}>
        <div className={`dash-nav-item ${active === 'billing' ? 'active' : ''}`}>
          <div className="dash-nav-icon">💳</div> Billing
        </div>
      </Link>
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