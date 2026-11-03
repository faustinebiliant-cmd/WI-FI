import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import Loader from '../shared/components/Loader';
import { useToast } from '../shared/components/Toast';
import { onlyNameChars, onlyDigits } from '../shared/inputRules';

// Speeds the router setup prepares (1 to 20 Mbps, whole numbers only)
const MIN_SPEED_MBPS = 1;
const MAX_SPEED_MBPS = 20;

export default function PackagesPage() {
  const toast = useToast();
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
  const [deleteInput, setDeleteInput] = useState('');
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

    // Minutes stay as they are; the other units are turned into minutes
    let duration_minutes = parseInt(formData.duration_value, 10);
    if (formData.duration_unit === 'hours') duration_minutes *= 60;
    if (formData.duration_unit === 'days') duration_minutes *= 1440;
    if (formData.duration_unit === 'weeks') duration_minutes *= 10080;

    const speed_kbps = speed_mbps * 1024;

    try {
      await apiClient.post('/tenant/packages', {
        name: formData.name,
        price_tzs: Number(formData.price_tzs),
        duration_minutes: duration_minutes,
        speed_down_kbps: speed_kbps,
        speed_up_kbps: speed_kbps,
        router_id: formData.router_id
      });
      setShowModal(false);
      toast(`Package "${formData.name}" created`);
      setFormData({ name: '', price_tzs: '', duration_value: 1, duration_unit: 'hours', speed_mbps: 5, router_id: routers[0]?.id || '' });
      fetchPackages();
    } catch (error) {
      setErrorMsg(error.response?.data?.error || 'Failed to create package');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDelete = (pkg) => { setDeleteTarget(pkg); setDeleteInput(''); setDeleteError(''); };
  const closeDelete = () => { setDeleteTarget(null); setDeleteInput(''); setDeleteError(''); };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteInput !== 'DELETE') return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      const res = await apiClient.delete(`/tenant/packages/${deleteTarget.id}`);
      toast(res.data.message || 'Package deleted');
      closeDelete();
      fetchPackages();
    } catch (error) {
      setDeleteError(error.response?.data?.error || 'Failed to delete package.');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDuration = (mins) => {
    if (mins >= 1440 && mins % 1440 === 0) return `${mins / 1440} Day${mins / 1440 > 1 ? 's' : ''}`;
    if (mins >= 60 && mins % 60 === 0) return `${mins / 60} Hour${mins / 60 > 1 ? 's' : ''}`;
    return `${mins} Min${mins > 1 ? 's' : ''}`;
  };

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1>WiFi Packages</h1>
          <p>Set your own prices, speeds, and durations.</p>
        </div>
        <button onClick={() => { setShowModal(true); setErrorMsg(''); }} className="btn btn-primary">
          + Create Package
        </button>
      </div>

      <div className="table-container">
        {loading ? (
          <Loader message="Loading packages..." />
        ) : packages.length === 0 ? (
          <div className="table-empty">No packages yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Router</th>
                <th>Price</th>
                <th>Duration</th>
                <th>Speed</th>
                <th className="col-actions">Action</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((pkg) => (
                <tr key={pkg.id}>
                  <td className="cell-strong">{pkg.name}</td>
                  <td>{pkg.router_name || '-'}</td>
                  <td>TZS {pkg.price_tzs.toLocaleString()}</td>
                  <td>{formatDuration(pkg.duration_minutes)}</td>
                  <td>{pkg.speed_down_kbps / 1024} Mbps</td>
                  <td className="col-actions">
                    <button onClick={() => openDelete(pkg)} className="btn btn-sm btn-danger">
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
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">Create Package</h2>
            <p className="modal-sub">What customers buy: a price, a time and a speed.</p>

            {errorMsg && (
              <div className="alert alert-danger">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreate} className="form-stack">
              <div className="form-group">
                <label>Package Name</label>
                <input className="form-control" required type="text" placeholder="e.g. Daily 5 Mbps" maxLength={40} value={formData.name} onChange={e => setFormData({ ...formData, name: onlyNameChars(e.target.value) })} disabled={isSubmitting} />
              </div>

              <div className="form-group">
                <label>Price (TZS)</label>
                <input className="form-control" required type="text" inputMode="numeric" maxLength={7} placeholder="e.g. 1000" value={formData.price_tzs} onChange={e => setFormData({ ...formData, price_tzs: onlyDigits(e.target.value) })} disabled={isSubmitting} />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Duration</label>
                  <input className="form-control" required type="number" min="1" inputMode="numeric" value={formData.duration_value} onChange={e => setFormData({ ...formData, duration_value: e.target.value })} disabled={isSubmitting} />
                </div>
                <div className="form-group">
                  <label>Unit</label>
                  <select className="form-control" value={formData.duration_unit} onChange={e => setFormData({ ...formData, duration_unit: e.target.value })} disabled={isSubmitting}>
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Speed (Mbps, {MIN_SPEED_MBPS} to {MAX_SPEED_MBPS})</label>
                <input
                  className="form-control"
                  required
                  type="number"
                  min={MIN_SPEED_MBPS}
                  max={MAX_SPEED_MBPS}
                  step="1"
                  inputMode="numeric"
                  placeholder={`${MIN_SPEED_MBPS} - ${MAX_SPEED_MBPS}`}
                  value={formData.speed_mbps}
                  onChange={e => setFormData({ ...formData, speed_mbps: e.target.value.replace(/[^0-9]/g, '') })}
                  disabled={isSubmitting}
                />
              </div>

              <div className="form-group">
                <label>Router</label>
                <select
                  className="form-control"
                  required
                  value={formData.router_id}
                  onChange={e => setFormData({ ...formData, router_id: e.target.value })}
                  disabled={isSubmitting}
                >
                  {routers.length === 0 && <option value="">Add a router first (Routers page)</option>}
                  {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <p className="form-hint">Customers see this package only on this router's WiFi.</p>
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setShowModal(false)} disabled={isSubmitting} className="btn btn-secondary">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="btn btn-primary">
                  {isSubmitting ? 'Saving...' : 'Save Package'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-overlay">
          <div className="modal-content modal-narrow">
            <h2 className="modal-title danger">Delete Package</h2>
            <p className="modal-sub">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? ALL its vouchers are deleted with it.
            </p>
            {(deleteTarget.unused_vouchers > 0 || deleteTarget.active_vouchers > 0) && (
              <ul className="modal-sub">
                {deleteTarget.unused_vouchers > 0 && (
                  <li><strong>{deleteTarget.unused_vouchers}</strong> unused voucher(s) will stop working, even ones already sold.</li>
                )}
                {deleteTarget.active_vouchers > 0 && (
                  <li><strong>{deleteTarget.active_vouchers}</strong> voucher(s) in use now: those customers are disconnected.</li>
                )}
              </ul>
            )}
            <p className="modal-sub">This cannot be undone.</p>
            {deleteError && <div className="alert alert-danger">{deleteError}</div>}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Type DELETE to confirm</label>
              <input className="form-control" type="text" placeholder="DELETE" value={deleteInput} onChange={e => setDeleteInput(e.target.value)} disabled={isDeleting} />
            </div>
            <div className="modal-actions">
              <button onClick={closeDelete} disabled={isDeleting} className="btn btn-secondary">Cancel</button>
              <button onClick={confirmDelete} disabled={deleteInput !== 'DELETE' || isDeleting} className="btn btn-solid-danger">
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}