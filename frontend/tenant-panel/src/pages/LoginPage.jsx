import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Navigate } from 'react-router-dom';
import PasswordInput from '../shared/components/PasswordInput';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Why the panel sent this device here (the password was changed on another device), shown once
  const [error, setError] = useState(() => {
    try {
      const notice = sessionStorage.getItem('loginNotice') || '';
      sessionStorage.removeItem('loginNotice');
      return notice;
    } catch (e) {
      return '';
    }
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { user, login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const res = await login(email, password);

    if (res.success) {
      navigate('/');
    } else {
      setError(res.error);
      setIsSubmitting(false); // Unlock on failure
    }
  };

  // Already logged in: straight to the dashboard
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="auth-brand">Oswagolink</p>
        <h1 className="auth-title">Login</h1>
        <p className="auth-sub">Log in to manage your WiFi hotspot.</p>

        {error && <div className="alert alert-danger">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              className="form-control"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={isSubmitting}
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <PasswordInput
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              disabled={isSubmitting}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
            {isSubmitting ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
