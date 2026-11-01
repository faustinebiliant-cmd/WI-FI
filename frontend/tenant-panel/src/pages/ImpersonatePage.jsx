import React, { useEffect, useRef, useState } from 'react';
import apiClient from '../api/client';
import Loader from '../shared/components/Loader';

// Opened by the admin panel's "Impersonate Owner": /tenant/impersonate#code=...
// Swaps the one-time code for the business login, then opens the panel.
export default function ImpersonatePage() {
  const [error, setError] = useState('');
  const started = useRef(false); // React may run the effect twice in development; a code works once

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const code = new URLSearchParams(window.location.hash.slice(1)).get('code');
    // Remove the code from the address bar and browser history straight away
    window.history.replaceState(null, '', window.location.pathname);

    if (!code) {
      setError('This impersonation link is incomplete. Start it again from the admin panel.');
      return;
    }

    apiClient.post('/tenant/auth/impersonation/exchange', { code })
      .then((res) => {
        localStorage.setItem('tenantToken', res.data.token);
        localStorage.setItem('tenantUser', JSON.stringify(res.data.user));
        localStorage.setItem('is_impersonating', 'true');
        // A full page load, so the panel starts with the new login
        window.location.replace(import.meta.env.VITE_TENANT_BASE + '/');
      })
      .catch((err) => {
        setError(err.response?.data?.error || 'Could not start impersonation. Start it again from the admin panel.');
      });
  }, []);

  if (!error) return <Loader message="Opening the Business Panel..." />;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="auth-brand">Oswagolink</p>
        <h1 className="auth-title">Impersonation</h1>
        <div className="alert alert-danger">{error}</div>
      </div>
    </div>
  );
}
