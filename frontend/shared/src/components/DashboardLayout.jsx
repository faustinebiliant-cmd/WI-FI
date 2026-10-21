import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FiMenu, FiX } from 'react-icons/fi';
import ConfirmDialog from './ConfirmDialog';
import '../styles/variables.css';
import '../styles/base.css';
import '../styles/components.css';

export default function DashboardLayout({ 
  user, 
  onLogout, 
  menuItems, 
  title = "OSWAGOTech WiFi", 
  subtitle = "Dashboard",
  banner = null,
  children 
}) {
  const location = useLocation();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogoutClick = () => setShowLogoutConfirm(true);
  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    onLogout();
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--light)' }}>
      
      {/* MOBILE TOP BAR WITH HAMBURGER */}
      <div className="mobile-topbar">
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--success)' }}>
          {title}
        </h2>
        <button 
          onClick={() => setIsMobileMenuOpen(true)} 
          className="hamburger-btn"
        >
          <FiMenu size={28} />
        </button>
      </div>

      {/* SIDEBAR */}
      <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--success)', letterSpacing: '-0.5px' }}>
              {title}
            </h2>
            <span style={{ fontSize: '12px', color: 'var(--gray-light)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {subtitle}
            </span>
          </div>
          {/* Close button inside the sidebar for mobile */}
          <button className="mobile-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
            <FiX size={24} color="white" />
          </button>
        </div>

        <nav style={{ flex: 1, padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}>
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link 
                key={item.path} 
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  color: isActive ? 'white' : 'var(--gray-light)',
                  backgroundColor: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                  fontWeight: isActive ? '600' : '500',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  transition: 'all 150ms'
                }}
              >
                {item.icon && <item.icon size={18} />}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
              {user?.full_name?.charAt(0) || 'U'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '13.5px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.full_name}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--gray-light)' }}>Signed in</div>
            </div>
          </div>
          <button onClick={handleLogoutClick} className="btn btn-danger" style={{ width: '100%' }}>
            Logout
          </button>
        </div>
      </aside>

      {/* MOBILE OVERLAY (DARKENS THE SCREEN BEHIND THE MENU) */}
      {isMobileMenuOpen && (
        <div className="mobile-overlay" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* MAIN CONTENT AREA */}
      <div className="main-content">
        {banner}
        <main className="page-content">
          {children}
        </main>
      </div>

      <ConfirmDialog
        open={showLogoutConfirm}
        title="Log Out"
        message="Are you sure you want to log out of your account?"
        confirmLabel="Log Out"
        cancelLabel="Cancel"
        variant="danger"
        loading={false}
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </div>
  );
}