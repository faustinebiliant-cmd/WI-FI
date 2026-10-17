import React from 'react';
import { Link, useLocation } from 'react-router-dom';
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

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to log out?')) {
      onLogout();
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--light)' }}>
      
      {/* SIDEBAR */}
      <aside style={{ 
        width: 'var(--sidebar-w)', 
        background: 'var(--dark)', 
        color: 'white', 
        position: 'fixed', 
        inset: '0 auto 0 0', 
        display: 'flex', 
        flexDirection: 'column',
        boxShadow: '4px 0 24px rgba(0,0,0,0.1)',
        zIndex: 10
      }}>
        <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#10b981', letterSpacing: '-0.5px' }}>
            {title}
          </h2>
          <span style={{ fontSize: '12px', color: 'var(--gray-light)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            {subtitle}
          </span>
        </div>

        <nav style={{ flex: 1, padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}>
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link 
                key={item.path} 
                to={item.path}
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
          <button onClick={handleLogout} className="btn btn-danger" style={{ width: '100%' }}>
            Logout
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div style={{ flex: 1, marginLeft: 'var(--sidebar-w)', display: 'flex', flexDirection: 'column' }}>
        
        <header style={{ height: 'var(--header-h)', background: 'white', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 32px', position: 'sticky', top: 0, zIndex: 5 }}>
           <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--gray)' }}>
              System Status: <span style={{ color: 'var(--success)' }}>● Online</span>
           </div>
        </header>

        {banner}

        <main style={{ padding: '32px', flex: 1 }}>
          {children}
        </main>
      </div>
    </div>
  );
}