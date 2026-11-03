import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import apiClient from '../api/client';
import Loader from '../shared/components/Loader';
import { useToast } from '../shared/components/Toast';

export default function TenantDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  const [showImpersonate, setShowImpersonate] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  // Suspend / unsuspend / activate (with a reason, saved in the Audit Logs)
  const [statusAction, setStatusAction] = useState(null); // 'suspend' | 'unsuspend' | 'activate'
  const [statusReason, setStatusReason] = useState('');
  const [statusError, setStatusError] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  // Delete the business (type DELETE to confirm)
  const [showDelete, setShowDelete] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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

      // The Business Panel is another site, so it cannot read this panel's storage.
      // It gets a one-time code (60 seconds) and swaps it for the login itself.
      // The code goes after "#", so it is never sent to or logged by the web server.
      window.location.href = `${import.meta.env.VITE_TENANT_BASE}/impersonate#code=${encodeURIComponent(res.data.code)}`;

    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start impersonation');
      setWorking(false);
    }
  };

  const status = tenant?.subscription_status;
  // Last trial day as YYYY-MM-DD (the business is blocked from the next day)
  const trialEnds = status === 'trial' && tenant?.trial_ends_at ? String(tenant.trial_ends_at).slice(0, 10) : null;

  const STATUS_TEXT = {
    suspend: { title: 'Suspend', button: 'Suspend', style: 'btn-solid-danger', placeholder: 'e.g. Monthly fee not paid',
      note: 'The owner cannot log in and the WiFi portal tells customers the service is not available. Customers already online keep their time.' },
    unsuspend: { title: 'Unsuspend', button: 'Unsuspend', style: 'btn-primary', placeholder: 'e.g. Payment received for November',
      note: 'The owner can log in again and customers can buy and use vouchers again.' },
    activate: { title: 'Activate', button: 'Activate', style: 'btn-primary', placeholder: 'e.g. First monthly fee paid',
      note: 'The trial ends: the business becomes a paying customer and is no longer blocked when the trial date passes.' }
  };

  const openStatus = (action) => { setStatusReason(''); setStatusError(''); setStatusAction(action); };

  const handleStatus = async (e) => {
    e.preventDefault();
    if (statusReason.trim().length < 5) {
      setStatusError('Write a reason (at least 5 characters).');
      return;
    }
    setStatusSaving(true);
    setStatusError('');
    try {
      const res = await apiClient.patch(`/platform/tenants/${id}/status`, {
        action: statusAction,
        reason: statusReason.trim()
      });
      setTenant((current) => ({ ...current, subscription_status: res.data.data.subscription_status }));
      setStatusAction(null);
    } catch (err) {
      setStatusError(err.response?.data?.error || 'Failed to change the status.');
    } finally {
      setStatusSaving(false);
    }
  };

  const openDelete = () => { setDeleteInput(''); setDeleteError(''); setShowDelete(true); };

  const handleDelete = async () => {
    if (deleteInput !== 'DELETE') return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await apiClient.delete(`/platform/tenants/${id}`);
      toast(res.data.message || 'Business deleted');
      navigate('/');
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Failed to delete the business.');
      setDeleting(false);
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
        <div className="header-actions">
          <button onClick={() => setShowImpersonate(true)} className="btn btn-warning">
            Impersonate Owner
          </button>
          {status === 'suspended' ? (
            <button onClick={() => openStatus('unsuspend')} className="btn btn-primary">Unsuspend Business</button>
          ) : (
            <>
              {status === 'trial' && (
                <button onClick={() => openStatus('activate')} className="btn btn-primary">Activate Business</button>
              )}
              <button onClick={() => openStatus('suspend')} className="btn btn-solid-danger">Suspend Business</button>
            </>
          )}
        </div>
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
            {trialEnds && (<><dt>Trial ends</dt><dd>{trialEnds} (last day)</dd></>)}
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

      <div className="card">
        <h2 className="section-title">Danger zone</h2>
        <p className="modal-sub">
          Deleting a business removes it completely: its owner login, routers (and their VPN tunnels),
          packages, vouchers, sessions and payment records. This cannot be undone.
        </p>
        <button onClick={openDelete} className="btn btn-solid-danger">Delete Business</button>
      </div>

      {showDelete && (
        <div className="modal-overlay">
          <div className="modal-content modal-narrow">
            <h2 className="modal-title danger">Delete Business</h2>
            <p className="modal-sub">
              Are you sure you want to delete <strong>{tenant.business_name}</strong>? This deletes its owner login,
              its {tenant.router_count} router(s) and their VPN tunnels, and all its packages, vouchers, sessions and
              payment records. The owner can no longer log in. This cannot be undone.
            </p>
            {deleteError && <div className="alert alert-danger">{deleteError}</div>}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Type DELETE to confirm</label>
              <input className="form-control" type="text" placeholder="DELETE" value={deleteInput} onChange={e => setDeleteInput(e.target.value)} disabled={deleting} />
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowDelete(false)} disabled={deleting} className="btn btn-secondary">Cancel</button>
              <button onClick={handleDelete} disabled={deleteInput !== 'DELETE' || deleting} className="btn btn-solid-danger">
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {statusAction && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">{STATUS_TEXT[statusAction].title} {tenant.business_name}</h2>
            <p className="modal-sub">
              {STATUS_TEXT[statusAction].note}
              {' '}The reason is saved in the Audit Logs.
            </p>

            {statusError && <div className="alert alert-danger">{statusError}</div>}

            <form onSubmit={handleStatus}>
              <div className="form-group">
                <label>Reason</label>
                <textarea
                  required
                  placeholder={STATUS_TEXT[statusAction].placeholder}
                  value={statusReason}
                  onChange={e => setStatusReason(e.target.value)}
                  className="form-control"
                  rows={3}
                  maxLength={500}
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setStatusAction(null)} className="btn btn-secondary" disabled={statusSaving}>Cancel</button>
                <button type="submit" disabled={statusSaving} className={`btn ${STATUS_TEXT[statusAction].style}`}>
                  {statusSaving ? 'Saving...' : STATUS_TEXT[statusAction].button}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                  maxLength={300}
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