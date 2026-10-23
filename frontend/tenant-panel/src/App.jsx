import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import DashboardLayout from './shared/components/DashboardLayout';
import { FiHome, FiTag, FiPackage, FiWifi, FiActivity, FiSettings } from 'react-icons/fi';
import apiClient from './api/client';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import PackagesPage from './pages/PackagesPage';
import VouchersPage from './pages/VouchersPage';
import RoutersPage from './pages/RoutersPage';
import SessionsPage from './pages/SessionsPage';
import ProfilePage from './pages/ProfilePage';

const TenantShell = () => {
  const { user, logout } = useAuth();
  
  // Read the simple flag we set in the platform panel
  const isImpersonating = localStorage.getItem('is_impersonating') === 'true';

  const handleEndImpersonation = async () => {
    try { await apiClient.post('/tenant/auth/end-impersonation'); } catch (e) {}
    
    // Clear everything
    localStorage.removeItem('tenantToken');
    localStorage.removeItem('tenantUser');
    localStorage.removeItem('adminToken');
    localStorage.removeItem('admin');
    localStorage.removeItem('is_impersonating');
    
    // Redirect back to platform login
    window.location.href = import.meta.env.VITE_PLATFORM_LOGIN;
  };

  const menuItems = [
    { path: '/', label: 'Dashboard', icon: FiHome },
    { path: '/vouchers', label: 'Vouchers', icon: FiTag },
    { path: '/packages', label: 'Packages', icon: FiPackage },
    { path: '/routers', label: 'Routers', icon: FiWifi },
    { path: '/sessions', label: 'Active Sessions', icon: FiActivity },
    { path: '/profile', label: 'Settings', icon: FiSettings },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      
      {isImpersonating && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, height: '50px', 
          backgroundColor: '#f59e0b', color: 'white', display: 'flex', 
          justifyContent: 'space-between', alignItems: 'center', 
          padding: '0 20px', fontWeight: '600', zIndex: 9999 
        }}>
          <span>You are impersonating {user?.full_name}</span>
          <button onClick={handleEndImpersonation} style={{ backgroundColor: 'white', color: '#f59e0b', border: 'none', padding: '6px 16px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
            End Impersonation
          </button>
        </div>
      )}

      {/* The paddingTop pushes the app down so the 50px banner doesn't hide anything */}
      <div style={{ paddingTop: isImpersonating ? '50px' : '0' }}>
        <DashboardLayout 
          user={user} 
          onLogout={logout} 
          menuItems={menuItems}
          title="OSWAGOTech WiFi"
          subtitle="Tenant Panel"
        >
          <Outlet />
        </DashboardLayout>
      </div>
    </div>
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
      <BrowserRouter basename="/tenant">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/packages" element={<PackagesPage />} />
            <Route path="/vouchers" element={<VouchersPage />} />
            <Route path="/routers" element={<RoutersPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}