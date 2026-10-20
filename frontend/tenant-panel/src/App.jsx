import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import DashboardLayout from './shared/components/DashboardLayout';
import { FiHome, FiTag, FiPackage, FiWifi, FiActivity } from 'react-icons/fi';
import apiClient from './api/client';

// Import Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import PackagesPage from './pages/PackagesPage';
import VouchersPage from './pages/VouchersPage';
import RoutersPage from './pages/RoutersPage';
import SessionsPage from './pages/SessionsPage';

const TenantShell = () => {
  const { user, logout } = useAuth();
  const [isImpersonating, setIsImpersonating] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('tenantUser');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      if (parsed.full_name && parsed.full_name.startsWith('IMPERSONATING:')) {
        setIsImpersonating(true);
      }
    }
  }, []);

  const handleEndImpersonation = async () => {
    try { await apiClient.post('/tenant/auth/end-impersonation'); } catch (e) {}
    localStorage.removeItem('tenantToken');
    localStorage.removeItem('tenantUser');
    window.location.href = 'http://69.62.105.119:3002';
  };

  const menuItems = [
    { path: '/', label: 'Dashboard', icon: FiHome },
    { path: '/vouchers', label: 'Vouchers', icon: FiTag },
    { path: '/packages', label: 'Packages', icon: FiPackage },
    { path: '/routers', label: 'Routers', icon: FiWifi },
    { path: '/sessions', label: 'Active Sessions', icon: FiActivity },
  ];

  const banner = isImpersonating ? (
    <div style={{ backgroundColor: '#f59e0b', color: 'white', padding: '12px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: '600' }}>
      <span>⚠️ You are impersonating {user?.full_name.replace('IMPERSONATING: ', '')}</span>
      <button onClick={handleEndImpersonation} className="btn btn-secondary" style={{ padding: '6px 16px', fontSize: '13px' }}>
        End Impersonation
      </button>
    </div>
  ) : null;

  return (
    <DashboardLayout 
      user={user} 
      onLogout={logout} 
      menuItems={menuItems}
      title="OSWAGOTech WiFi"
      subtitle="Tenant Panel"
      banner={banner}
    >
      <Outlet />
    </DashboardLayout>
  );
};

const ProtectedRoute = () => {
  const { user, loading } = useAuth();
  
  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  
  return <TenantShell />;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/packages" element={<PackagesPage />} />
            <Route path="/vouchers" element={<VouchersPage />} />
            <Route path="/routers" element={<RoutersPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}