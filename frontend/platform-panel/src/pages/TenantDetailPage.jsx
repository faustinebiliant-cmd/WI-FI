import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import apiClient from '../api/client';
import Loader from '../shared/components/Loader';

export default function TenantDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [showImpersonate, setShowImpersonate] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    apiClient.get(`/platform/tenants/${id}`)
      .then(res => setTenant(res.data.data))
      .catch(() => navigate('/'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleImpersonate = async (e) => {
    e.preventDefault();
    if (reason.trim().length < 10) {
      setError('Reason must be at least 10 characters.');
      return;
    }

    setWorking(true);
    setError('');

    try {
      const res = await apiClient.post(`/platform/tenants/${id}/impersonate`, { reason });
      
      // The impersonation token is for the tenant panel only.
      // The admin's own login (adminToken) is left untouched.
      localStorage.setItem('tenantToken', res.data.token);
      localStorage.setItem('tenantUser', JSON.stringify({
        full_name: res.data.tenant_user.full_name,
        email: res.data.tenant_user.email
      }));
      
      // THIS IS THE FLAG THE TENANT PANEL WILL READ
      localStorage.setItem('is_impersonating', 'true');

      // Redirect to the tenant panel
      window.location.href = import.meta.env.VITE_TENANT_BASE + '/';
      
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start impersonation');
      setWorking(false);
    }
  };

  if (loading) return <Loader message="Loading business details..." />;
  if (!tenant) return <div className="alert alert-danger">Business not found.</div>;

  return (
    <div>
      <Link to="/" className="back-link">
        &larr; Back to Businesses
      </Link>

      <div className="page-header">
        <div>
          <h1>{tenant.business_name}</h1>
          <p>Business ID: {tenant.id}</p>
        </div>
        <button onClick={() => setShowImpersonate(true)} className="btn btn-warning">
          Impersonate Owner
        </button>
      </div>

      <div className="detail-grid">
        <div className="card">
          <h2 className="section-title">Owner Details</h2>
          <dl className="detail-list">
            <dt>Name</dt><dd>{tenant.owner_name}</dd>
            <dt>Email</dt><dd>{tenant.owner_email}</dd>
            <dt>Phone</dt><dd>{tenant.owner_phone}</dd>
            <dt>Status</dt>
            <dd><span className={`badge ${tenant.subscription_status === 'active' ? 'badge-success' : 'badge-warning'}`}>{tenant.subscription_status}</span></dd>
          </dl>
        </div>

        <div className="card">
          <h2 className="section-title">System Stats</h2>
          <dl className="detail-list">
            <dt>Routers registered</dt><dd>{tenant.router_count}</dd>
            <dt>Customers online now</dt><dd>{tenant.active_sessions}</dd>
          </dl>
        </div>
      </div>

      {showImpersonate && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">Impersonate Owner</h2>
            <p className="modal-sub">You will see the Business Panel as <strong>{tenant.owner_name}</strong>. The reason is saved in the Audit Logs.</p>

            {error && <div className="alert alert-danger">{error}</div>}

            <form onSubmit={handleImpersonate}>
              <div className="form-group">
                <label>Reason (at least 10 characters)</label>
                <textarea
                  required
                  placeholder="e.g. Owner asked for help creating packages"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="form-control"
                  rows={4}
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowImpersonate(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" disabled={working} className="btn btn-warning">
                  {working ? 'Starting...' : 'Start Impersonation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}