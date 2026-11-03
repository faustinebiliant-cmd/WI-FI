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
    // An expired login, a suspended account, or an old login that still needs a new
    // password: back to the login page. Logging in again then shows the reason.
    // Not for the login itself: a wrong password (401) or a suspended account must stay
    // on screen, and reloading the page would wipe that message straight away.
    const url = error.config?.url || '';
    const isLoginAttempt = url.endsWith('/tenant/auth/login') || url.endsWith('/tenant/auth/impersonation/exchange');
    const code = error.response?.data?.code;
    const mustLogInAgain = code === 'TENANT_SUSPENDED' || code === 'PASSWORD_CHANGE_REQUIRED';
    if (!isLoginAttempt && (error.response?.status === 401 || mustLogInAgain)) {
      localStorage.removeItem('tenantToken');
      localStorage.removeItem('tenantUser');
      // The password was changed, or "Log out of all devices" was used: the login page says why
      if (code === 'PASSWORD_CHANGED' || code === 'LOGGED_OUT') {
        try { sessionStorage.setItem('loginNotice', error.response.data.error); } catch (e) { /* storage blocked */ }
      }
      window.location.href = import.meta.env.VITE_TENANT_BASE + '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;