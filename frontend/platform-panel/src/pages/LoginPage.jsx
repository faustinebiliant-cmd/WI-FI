import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Navigate } from 'react-router-dom';
import PasswordInput from '../shared/components/PasswordInput';
import { MAX_EMAIL_LENGTH, MAX_PASSWORD_LENGTH } from '../shared/inputRules';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { admin, login } = useAuth();
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

  // Already logged in (for example, coming back from impersonation)
  if (admin) return <Navigate to="/" replace />;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="auth-brand">Oswagolink</p>
        <h1 className="auth-title">Platform Admin</h1>
        <p className="auth-sub">For Oswagolink staff only.</p>

        {error && <div className="alert alert-danger">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              className="form-control"
              type="email"
              autoComplete="email"
              maxLength={MAX_EMAIL_LENGTH}
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
              maxLength={MAX_PASSWORD_LENGTH}
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