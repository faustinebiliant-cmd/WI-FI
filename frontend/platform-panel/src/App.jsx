import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import DashboardLayout from './shared/components/DashboardLayout';
import { FiUsers, FiWifi, FiActivity, FiFileText } from 'react-icons/fi';

// Import Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TenantDetailPage from './pages/TenantDetailPage';
import RoutersPage from './pages/RoutersPage';
import SessionsPage from './pages/SessionsPage';
import AuditLogPage from './pages/AuditLogPage';

const PlatformShell = () => {
  const { admin, logout } = useAuth();
  
  const menuItems = [
    { path: '/', label: 'Tenants', icon: FiUsers },
    { path: '/routers', label: 'All Routers', icon: FiWifi },
    { path: '/sessions', label: 'Active Sessions', icon: FiActivity },
    { path: '/audit', label: 'Audit Logs', icon: FiFileText },
  ];

  return (
    <DashboardLayout 
      user={admin} 
      onLogout={logout} 
      menuItems={menuItems}
      title="OSWAGOTech"
      subtitle="Platform Admin"
    >
      <Outlet />
    </DashboardLayout>
  );
};

const ProtectedRoute = () => {
  const { admin, loading } = useAuth();
  
  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
  if (!admin) return <Navigate to="/login" replace />;
  
  return <PlatformShell />;
};

export default function App() {
  return (
    <AuthProvider>
      {/* Added basename="/platform" so React Router knows the app lives in a subfolder */}
      <BrowserRouter basename="/platform">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tenants/:id" element={<TenantDetailPage />} />
            <Route path="/routers" element={<RoutersPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/audit" element={<AuditLogPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}