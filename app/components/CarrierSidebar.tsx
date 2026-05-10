'use client';

import Image from 'next/image';
import Link from 'next/link';

type CarrierSidebarProps = {
  active: 'rfps' | 'quotes' | 'settings';
  firstName: string;
  lastName: string;
  carrierName: string;
  carrierBrandColor: string | null;
  onLogout: () => void;
};

const CLARITY_NAVY = '#1e3a5f';

export default function CarrierSidebar({
  active,
  firstName,
  lastName,
  carrierName,
  carrierBrandColor,
  onLogout,
}: CarrierSidebarProps) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  const brandColor = carrierBrandColor || CLARITY_NAVY;

  return (
    <aside className="dash-sidebar">
      <a href="/carrier/rfps" className="logo-mark">
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

      {/* Carrier brand color accent stripe */}
      <div
        style={{
          height: '3px',
          backgroundColor: brandColor,
          margin: '8px 0 16px 0',
          borderRadius: '2px',
        }}
      />

      {/* === WORKFLOW === */}
      <div className="dash-section-label">Workflow</div>

      <Link href="/carrier/rfps" style={linkReset}>
        <div
          className={`dash-nav-item ${active === 'rfps' ? 'active' : ''}`}
          style={active === 'rfps' ? { borderLeft: `3px solid ${brandColor}`, paddingLeft: '13px' } : undefined}
        >
          <div className="dash-nav-icon">📥</div> RFPs
        </div>
      </Link>

      <Link href="/carrier/quotes" style={linkReset}>
        <div
          className={`dash-nav-item ${active === 'quotes' ? 'active' : ''}`}
          style={active === 'quotes' ? { borderLeft: `3px solid ${brandColor}`, paddingLeft: '13px' } : undefined}
        >
          <div className="dash-nav-icon">💬</div> Quotes
        </div>
      </Link>

      {/* === ACCOUNT === */}
      <div className="dash-section-label">Account</div>

      <Link href="/carrier/settings" style={linkReset}>
        <div
          className={`dash-nav-item ${active === 'settings' ? 'active' : ''}`}
          style={active === 'settings' ? { borderLeft: `3px solid ${brandColor}`, paddingLeft: '13px' } : undefined}
        >
          <div className="dash-nav-icon">⚙️</div> Settings
        </div>
      </Link>

      <div className="dash-sidebar-footer">
        <div className="dash-user">
          <div
            className="dash-avatar"
            style={{
              backgroundColor: brandColor,
              color: '#ffffff',
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="dash-user-name">
              {firstName} {lastName}
            </div>
            <div className="dash-user-role" title={carrierName}>{carrierName}</div>
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