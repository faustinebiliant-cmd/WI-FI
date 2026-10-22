import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import apiClient from '../api/client';
import Loader from '../shared/components/Loader';

export default function TenantDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Impersonation state
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
      
      // Save the impersonation token to localStorage
      localStorage.setItem('adminToken', res.data.token);
      localStorage.setItem('admin', JSON.stringify({ 
        full_name: `IMPERSONATING: ${res.data.tenant_user.full_name}`,
        is_impersonation: true
      }));

      // Redirect to the tenant panel (Localhost URL)
      window.location.href = 'http://69.62.105.119/tenant/';
      
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start impersonation');
      setWorking(false);
    }
  };

  if (loading) return <Loader message="Loading tenant details..." />;
  if (!tenant) return <div>Tenant not found.</div>;

  return (
    <div>
      <Link to="/" style={{ color: 'var(--primary)', textDecoration: 'none', marginBottom: '20px', display: 'inline-block', fontWeight: '600' }}>
        &larr; Back to Tenants
      </Link>
      
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '30px' }}>
        <div>
          <h1 style={{ margin: 0 }}>{tenant.business_name}</h1>
          <p style={{ color: 'var(--gray)', marginTop: '5px' }}>Tenant ID: {tenant.id}</p>
        </div>
        <div style={{ width: '100%', maxWidth: '250px' }}>
          <button 
            onClick={() => setShowImpersonate(true)}
            className="btn btn-primary"
            style={{ width: '100%', backgroundColor: '#f59e0b', boxShadow: 'none' }}
          >
            Impersonate Owner
          </button>
        </div>
      </div>

      {/* Responsive Grid: Stacks on mobile, 2 columns on desktop */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        
        {/* Owner Info Card */}
        <div className="card">
          <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>Owner Details</h3>
          <p style={{ marginBottom: '10px' }}><strong>Name:</strong> {tenant.owner_name}</p>
          <p style={{ marginBottom: '10px' }}><strong>Email:</strong> {tenant.owner_email}</p>
          <p style={{ marginBottom: '10px' }}><strong>Phone:</strong> {tenant.owner_phone}</p>
          <p style={{ marginBottom: '10px' }}><strong>Status:</strong> <span className={`badge ${tenant.subscription_status === 'active' ? 'badge-success' : 'badge-warning'}`}>{tenant.subscription_status}</span></p>
        </div>

        {/* Stats Card */}
        <div className="card">
          <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>System Stats</h3>
          <p style={{ marginBottom: '10px' }}><strong>Routers Registered:</strong> {tenant.router_count}</p>
          <p style={{ marginBottom: '10px' }}><strong>Active Guests Right Now:</strong> {tenant.active_guests || tenant.active_sessions}</p>
        </div>

      </div>

      {/* IMPERSONATION MODAL */}
      {showImpersonate && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginTop: 0 }}>Impersonate Tenant</h2>
            <p style={{ color: 'var(--gray)', fontSize: '14px' }}>
              As <strong>{tenant.owner_name}</strong>
            </p>
            
            {error && <div style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-soft)', padding: '10px', borderRadius: '6px', marginBottom: '15px', fontSize: '13px' }}>{error}</div>}

            <form onSubmit={handleImpersonate} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <textarea 
                required
                placeholder="Reason"
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="form-control"
                style={{ height: '100px', resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowImpersonate(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" disabled={working} className="btn btn-primary" style={{ flex: 2, backgroundColor: '#f59e0b', boxShadow: 'none' }}>
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