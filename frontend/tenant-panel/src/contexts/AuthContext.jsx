import React, { createContext, useState, useEffect, useContext } from 'react';
import apiClient from '../api/client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [tenantStatus, setTenantStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tenantToken');
    const savedUser = localStorage.getItem('tenantUser');
    
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
    } else if (token && localStorage.getItem('is_impersonating') === 'true') {
      // Fallback: If we have a token and we are impersonating, let them in even if user data is missing
      setUser({ full_name: 'Impersonated User' });
    }
    
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      const res = await apiClient.post('/tenant/auth/login', { email, password });
      if (res.data.success) {
        const loggedInUser = { ...res.data.user, must_change_password: res.data.must_change_password === true };
        localStorage.setItem('tenantToken', res.data.token);
        localStorage.setItem('tenantUser', JSON.stringify(loggedInUser));
        // Clear any leftover impersonation flags from a normal login
        localStorage.removeItem('is_impersonating');

        setUser(loggedInUser);
        setTenantStatus(res.data.tenant_status);
        return { success: true };
      }
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Login failed' };
    }
  };

  // Called after the temporary password was replaced
  const markPasswordChanged = () => {
    setUser((current) => {
      const updated = { ...current, must_change_password: false };
      localStorage.setItem('tenantUser', JSON.stringify(updated));
      return updated;
    });
  };

  const logout = () => {
    localStorage.removeItem('tenantToken');
    localStorage.removeItem('tenantUser');
    localStorage.removeItem('is_impersonating');
    setUser(null);
    window.location.href = import.meta.env.VITE_TENANT_BASE + '/login';
  };

  return (
    <AuthContext.Provider value={{ user, tenantStatus, login, logout, markPasswordChanged, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);