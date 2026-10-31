import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import DashboardLayout from './shared/components/DashboardLayout';
import { FiHome, FiTag, FiPackage, FiWifi, FiActivity, FiSettings } from 'react-icons/fi';
import apiClient from './api/client';
import ChangePasswordForm from './components/ChangePasswordForm';
import Loader from './shared/components/Loader';

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
    <div>
      {isImpersonating && (
        <div className="impersonation-banner">
          <span>Viewing as {user?.full_name}</span>
          <button onClick={handleEndImpersonation} className="btn btn-sm">
            End Impersonation
          </button>
        </div>
      )}

      {/* has-banner moves the page, the menu and the phone top bar below the 50px banner */}
      <div className={isImpersonating ? 'has-banner' : undefined}>
        <DashboardLayout
          user={user}
          onLogout={logout}
          menuItems={menuItems}
          title="OSWAGOTech WiFi"
          subtitle="Business Panel"
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
    <div className="auth-page">
      <div className="auth-card">
        <p className="auth-brand">OSWAGOTech WiFi</p>
        <h1 className="auth-title">Choose a New Password</h1>
        <p className="auth-sub">You are using a temporary password. Choose your own password to continue.</p>
        <ChangePasswordForm onSuccess={markPasswordChanged} />
        <button onClick={logout} className="btn btn-link btn-block" style={{ marginTop: '8px' }}>
          Log out
        </button>
      </div>
    </div>
  );
};

const ProtectedRoute = () => {
  const { user, loading } = useAuth();
  if (loading) return <Loader message="Loading..." />;
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