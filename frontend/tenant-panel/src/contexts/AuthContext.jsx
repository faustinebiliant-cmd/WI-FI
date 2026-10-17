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
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      const res = await apiClient.post('/tenant/auth/login', { email, password });
      if (res.data.success) {
        localStorage.setItem('tenantToken', res.data.token);
        localStorage.setItem('tenantUser', JSON.stringify(res.data.user));
        setUser(res.data.user);
        setTenantStatus(res.data.tenant_status);
        return { success: true };
      }
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Login failed' };
    }
  };

  const logout = () => {
    localStorage.removeItem('tenantToken');
    localStorage.removeItem('tenantUser');
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, tenantStatus, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);