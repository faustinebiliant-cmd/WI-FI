import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach token to every request if it exists
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A 401 means the login expired: clear it and go back to the login page.
// Not for the login itself: "Invalid credentials" must stay on screen, and
// reloading the page would wipe that message straight away.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginAttempt = (error.config?.url || '').endsWith('/auth/platform/login');
    if (!isLoginAttempt && error.response?.status === 401) {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('admin');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;