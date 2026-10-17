import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import apiClient from '../api/client';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isImpersonating, setIsImpersonating] = useState(false);

  useEffect(() => {
    // Check if the token contains an impersonation flag
    // Since we stored the user in localStorage, let's check for the flag
    const savedUser = localStorage.getItem('tenantUser');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      // If the Platform Admin changed the name to "IMPERSONATING: ..."
      if (parsed.full_name && parsed.full_name.startsWith('IMPERSONATING:')) {
        setIsImpersonating(true);
      }
    }
  }, []);

  const handleEndImpersonation = async () => {
    try {
      await apiClient.post('/tenant/auth/end-impersonation');
    } catch (error) {
      console.error('Failed to end impersonation', error);
    } finally {
      // Clear local storage and go back to the Platform Panel
      localStorage.removeItem('tenantToken');
      localStorage.removeItem('tenantUser');
      window.location.href = 'http://localhost:3002';
    }
  };

  const menuItems = [
    { path: '/', label: 'Dashboard' },
    { path: '/vouchers', label: 'Vouchers' },
    { path: '/packages', label: 'Packages' },
    { path: '/routers', label: 'Routers' },
    { path: '/sessions', label: 'Active Sessions' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f3f4f6', fontFamily: 'sans-serif' }}>
      
      {/* IMPERSONATION BANNER */}
      {isImpersonating && (
        <div style={{ backgroundColor: '#f59e0b', color: 'white', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold' }}>
          <span>⚠️ You are impersonating {user?.full_name.replace('IMPERSONATING: ', '')}</span>
          <button onClick={handleEndImpersonation} style={{ padding: '5px 15px', backgroundColor: 'white', color: '#f59e0b', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            End Impersonation
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* SIDEBAR */}
        <div style={{ width: '250px', backgroundColor: '#0f172a', color: 'white', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid #334155' }}>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#10b981' }}>OSWAGOTech WiFi</h2>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Tenant Panel</span>
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
                    color: isActive ? 'white' : '#94a3b8',
                    backgroundColor: isActive ? '#1e293b' : 'transparent',
                    fontWeight: isActive ? 'bold' : 'normal'
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div style={{ padding: '20px', borderTop: '1px solid #334155' }}>
            <div style={{ marginBottom: '10px', fontSize: '14px' }}>
              {isImpersonating ? user?.full_name.replace('IMPERSONATING: ', '') : user?.full_name}
            </div>
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
    </div>
  );
}