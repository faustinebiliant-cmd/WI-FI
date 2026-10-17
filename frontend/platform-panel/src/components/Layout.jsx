import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useLocation } from 'react-router-dom';

export default function Layout({ children }) {
  const { admin, logout } = useAuth();
  const location = useLocation();

  const menuItems = [
    { path: '/', label: 'Tenants' },
    { path: '/routers', label: 'All Routers' },
    { path: '/sessions', label: 'Active Sessions' },
    { path: '/audit', label: 'Audit Logs' },
  ];

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#f3f4f6', fontFamily: 'sans-serif' }}>
      
      {/* SIDEBAR */}
      <div style={{ width: '250px', backgroundColor: '#0a1730', color: 'white', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #1f2937' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#f59e0b' }}>OSWAGOTech</h2>
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>Platform Admin</span>
        </div>

        <nav style={{ flex: 1, padding: '20px 10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link 
                key={item.path} 
                to={item.path}
                style={{
                  padding: '10px 15px',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  color: isActive ? 'white' : '#9ca3af',
                  backgroundColor: isActive ? '#1f2937' : 'transparent',
                  fontWeight: isActive ? 'bold' : 'normal'
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: '20px', borderTop: '1px solid #1f2937' }}>
          <div style={{ marginBottom: '10px', fontSize: '14px' }}>{admin?.full_name}</div>
          <button onClick={logout} style={{ width: '100%', padding: '8px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Logout
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '40px' }}>
        {children}
      </div>
    </div>
  );
}