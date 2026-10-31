import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import DashboardLayout from './shared/components/DashboardLayout';
import { FiHome, FiTag, FiPackage, FiWifi, FiActivity, FiSettings } from 'react-icons/fi';
import apiClient from './api/client';
import ChangePasswordForm from './components/ChangePasswordForm';

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
    
    // Clear the tenant login only; the admin's own login stays, so the
    // admin lands back in the platform panel without logging in again
    localStorage.removeItem('tenantToken');
    localStorage.removeItem('tenantUser');
    localStorage.removeItem('is_impersonating');

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

// Shown instead of the panel while the owner still has a temporary password
const ForcedPasswordChange = () => {
  const { markPasswordChanged, logout } = useAuth();
  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', padding: '20px' }}>
      <div style={{ padding: '40px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '10px', fontSize: '24px' }}>Choose a New Password</h2>
        <p style={{ textAlign: 'center', color: '#6b7280', marginBottom: '20px' }}>You are using a temporary password. Choose your own password to continue.</p>
        <ChangePasswordForm onSuccess={markPasswordChanged} />
        <button onClick={logout} style={{ width: '100%', marginTop: '10px', padding: '10px', backgroundColor: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer' }}>
          Log out
        </button>
      </div>
    </div>
  );
};

const ProtectedRoute = () => {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  const isImpersonating = localStorage.getItem('is_impersonating') === 'true';
  if (user.must_change_password && !isImpersonating) return <ForcedPasswordChange />;
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