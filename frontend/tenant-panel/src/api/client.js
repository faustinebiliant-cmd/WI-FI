import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('tenantToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // A suspended account, or an old login that still needs a new password:
    // back to the login page, which shows the reason or asks for the new password
    const code = error.response?.data?.code;
    const mustLogInAgain = code === 'TENANT_SUSPENDED' || code === 'PASSWORD_CHANGE_REQUIRED';
    if (error.response?.status === 401 || mustLogInAgain) {
      localStorage.removeItem('tenantToken');
      localStorage.removeItem('tenantUser');
      window.location.href = import.meta.env.VITE_TENANT_BASE + '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;