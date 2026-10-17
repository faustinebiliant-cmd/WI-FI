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

      // Redirect to the tenant panel (Port 3001)
      window.location.href = 'http://localhost:3001';
      
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start impersonation');
      setWorking(false);
    }
  };

  if (loading) return <Loader message="Loading tenant details..." />;
  if (!tenant) return <div>Tenant not found.</div>;

  return (
    <div>
      <Link to="/" style={{ color: '#2563eb', textDecoration: 'none', marginBottom: '20px', display: 'inline-block' }}>
        &larr; Back to Tenants
      </Link>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '30px' }}>
        <div>
          <h1 style={{ margin: 0 }}>{tenant.business_name}</h1>
          <p style={{ color: '#6b7280', marginTop: '5px' }}>Tenant ID: {tenant.id}</p>
        </div>
        <div>
          <button 
            onClick={() => setShowImpersonate(true)}
            style={{ padding: '10px 20px', backgroundColor: '#f59e0b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Impersonate Owner
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        
        {/* Owner Info Card */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid #e5e7eb', paddingBottom: '10px' }}>Owner Details</h3>
          <p><strong>Name:</strong> {tenant.owner_name}</p>
          <p><strong>Email:</strong> {tenant.owner_email}</p>
          <p><strong>Phone:</strong> {tenant.owner_phone}</p>
          <p><strong>Status:</strong> {tenant.subscription_status}</p>
        </div>

        {/* Stats Card */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid #e5e7eb', paddingBottom: '10px' }}>System Stats</h3>
          <p><strong>Routers Registered:</strong> {tenant.router_count}</p>
          <p><strong>Active Guests Right Now:</strong> {tenant.active_sessions}</p>
        </div>

      </div>

      {/* IMPERSONATION MODAL */}
      {showImpersonate && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '100%', maxWidth: '500px' }}>
            <h2 style={{ marginTop: 0 }}>Impersonate Tenant</h2>
            <p style={{ color: '#6b7280', fontSize: '14px' }}>
              You will be logged into the Tenant Panel as <strong>{tenant.owner_name}</strong>. This action is logged in the audit trail.
            </p>
            
            {error && <div style={{ color: 'red', marginBottom: '15px' }}>{error}</div>}

            <form onSubmit={handleImpersonate} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <textarea 
                required
                placeholder="Why are you impersonating? (e.g. Client reported an issue with voucher codes) - min 10 chars"
                value={reason}
                onChange={e => setReason(e.target.value)}
                style={{ padding: '10px', height: '100px', resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowImpersonate(false)} style={{ padding: '10px 20px', cursor: 'pointer', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '4px' }}>
                  Cancel
                </button>
                <button type="submit" disabled={working} style={{ padding: '10px 20px', cursor: 'pointer', backgroundColor: '#f59e0b', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>
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