import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import Loader from '../shared/components/Loader';
import ConfirmDialog from '../shared/components/ConfirmDialog';

// Speeds the router setup prepares (1 to 20 Mbps, whole numbers only)
const MIN_SPEED_MBPS = 1;
const MAX_SPEED_MBPS = 20;

export default function PackagesPage() {
  const [packages, setPackages] = useState([]);
  const [routers, setRouters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    price_tzs: '',
    duration_value: 1,
    duration_unit: 'hours',
    speed_mbps: 5,
    router_id: ''
  });

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => { fetchPackages(); fetchRouters(); }, []);

  const fetchRouters = async () => {
    try {
      const res = await apiClient.get('/tenant/routers');
      const list = res.data.data || [];
      setRouters(list);
      // With one router (the usual case) it is chosen already
      if (list.length > 0) setFormData(prev => ({ ...prev, router_id: prev.router_id || list[0].id }));
    } catch (error) {
      console.error(error);
    }
  };

  const fetchPackages = async () => {
    try {
      const res = await apiClient.get('/tenant/packages');
      setPackages(res.data.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const speed_mbps = Number(formData.speed_mbps);
    if (!Number.isInteger(speed_mbps) || speed_mbps < MIN_SPEED_MBPS || speed_mbps > MAX_SPEED_MBPS) {
      setErrorMsg(`Speed must be a whole number from ${MIN_SPEED_MBPS} to ${MAX_SPEED_MBPS} Mbps.`);
      return;
    }
    if (!formData.router_id) {
      setErrorMsg('Choose the router this package is sold on.');
      return;
    }
    setIsSubmitting(true);

    let duration_minutes = parseInt(formData.duration_value, 10);
    if (formData.duration_unit === 'hours') duration_minutes *= 60;
    if (formData.duration_unit === 'days') duration_minutes *= 1440;
    if (formData.duration_unit === 'weeks') duration_minutes *= 10080;

    const speed_kbps = speed_mbps * 1024;

    try {
      await apiClient.post('/tenant/packages', {
        name: formData.name,
        price_tzs: parseFloat(formData.price_tzs),
        duration_minutes: duration_minutes,
        speed_down_kbps: speed_kbps,
        speed_up_kbps: speed_kbps,
        router_id: formData.router_id
      });
      setShowModal(false);
      setFormData({ name: '', price_tzs: '', duration_value: 1, duration_unit: 'hours', speed_mbps: 5, router_id: routers[0]?.id || '' });
      fetchPackages();
    } catch (error) {
      setErrorMsg(error.response?.data?.error || 'Failed to create package');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await apiClient.delete(`/tenant/packages/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchPackages();
    } catch (error) {
      setDeleteError(error.response?.data?.error || 'Failed to delete package.');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDuration = (mins) => {
    if (mins >= 1440 && mins % 1440 === 0) return `${mins / 1440} Days`;
    if (mins >= 60 && mins % 60 === 0) return `${mins / 60} Hours`;
    return `${mins} Mins`;
  };

  return (
    <div className="page-wrapper">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '30px' }}>
        <div>
          <h1 style={{ margin: 0 }}>WiFi Packages</h1>
          <p style={{ margin: '5px 0 0 0', color: '#6b7280' }}>Set your own prices, speeds, and durations.</p>
        </div>
        <button onClick={() => { setShowModal(true); setErrorMsg(''); }} style={{ padding: '8px 16px', cursor: 'pointer', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', width: '100%', maxWidth: '200px' }}>
          + Create Package
        </button>
      </div>

      <div className="table-container">
        {loading ? (
          <Loader message="Loading packages..." />
        ) : packages.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>No packages yet.</div>
        ) : (
          <table>
            <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Name</th>
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Router</th>
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Price</th>
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Duration</th>
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Speed</th>
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((pkg) => (
                <tr key={pkg.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '16px 20px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{pkg.name}</td>
                  <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>{pkg.router_name || '-'}</td>
                  <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>TZS {pkg.price_tzs.toLocaleString()}</td>
                  <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>{formatDuration(pkg.duration_minutes)}</td>
                  <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>{pkg.speed_down_kbps / 1024} Mbps</td>
                  <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setDeleteTarget(pkg)} style={{ padding: '6px 12px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '100%', maxWidth: '500px' }}>
            <h2 style={{ marginTop: 0 }}>Create Package</h2>

            {errorMsg && (
              <div style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-soft)', padding: '10px', borderRadius: '6px', marginBottom: '15px', fontSize: '13px' }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <input required type="text" placeholder="Package Name (e.g. Daily 5Mbps)" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }} disabled={isSubmitting} />
              <input required type="number" min="0" placeholder="Price (TZS)" value={formData.price_tzs} onChange={e => setFormData({ ...formData, price_tzs: e.target.value })} style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }} disabled={isSubmitting} />

              <div style={{ display: 'flex', gap: '10px' }}>
                <input required type="number" min="1" placeholder="Duration" value={formData.duration_value} onChange={e => setFormData({ ...formData, duration_value: e.target.value })} style={{ padding: '10px', flex: 1, border: '1px solid #ccc', borderRadius: '4px' }} disabled={isSubmitting} />
                <select value={formData.duration_unit} onChange={e => setFormData({ ...formData, duration_unit: e.target.value })} style={{ padding: '10px', flex: 1, border: '1px solid #ccc', borderRadius: '4px' }} disabled={isSubmitting}>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Speed (Mbps, {MIN_SPEED_MBPS} to {MAX_SPEED_MBPS})</label>
                <input
                  required
                  type="number"
                  min={MIN_SPEED_MBPS}
                  max={MAX_SPEED_MBPS}
                  step="1"
                  inputMode="numeric"
                  placeholder={`${MIN_SPEED_MBPS} - ${MAX_SPEED_MBPS}`}
                  value={formData.speed_mbps}
                  onChange={e => setFormData({ ...formData, speed_mbps: e.target.value.replace(/[^0-9]/g, '') })}
                  style={{ padding: '10px', width: '100%', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Router</label>
                <select
                  required
                  value={formData.router_id}
                  onChange={e => setFormData({ ...formData, router_id: e.target.value })}
                  style={{ padding: '10px', width: '100%', border: '1px solid #ccc', borderRadius: '4px' }}
                  disabled={isSubmitting}
                >
                  {routers.length === 0 && <option value="">Add a router first (Routers page)</option>}
                  {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0 0' }}>Customers see this package only on this router's WiFi.</p>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowModal(false)} disabled={isSubmitting} style={{ padding: '10px 20px', cursor: isSubmitting ? 'not-allowed' : 'pointer', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '4px' }}>Cancel</button>
                <button type="submit" disabled={isSubmitting} style={{ padding: '10px 20px', cursor: isSubmitting ? 'not-allowed' : 'pointer', backgroundColor: isSubmitting ? '#93c5fd' : '#2563eb', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>
                  {isSubmitting ? 'Saving...' : 'Save Package'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Package"
        message={deleteError || `Are you sure you want to delete "${deleteTarget?.name}"? This is only possible when it has no unused or active vouchers. Its old (used, expired or revoked) vouchers are deleted with it.`}
        confirmLabel={deleteError ? 'Try Again' : 'Delete'}
        cancelLabel={deleteError ? 'Close' : 'Cancel'}
        variant="danger"
        loading={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => { setDeleteTarget(null); setDeleteError(''); }}
      />
    </div>
  );
}