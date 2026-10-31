import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import { Link } from 'react-router-dom';
import Loader from '../shared/components/Loader';

export default function DashboardPage() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ business_name: '', owner_name: '', owner_email: '', owner_phone: '', monthly_fee: 50000 });
  const [submitError, setSubmitError] = useState('');
  const [created, setCreated] = useState(null); // { business_name, temp_password }, shown once
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => { fetchTenants(); }, []);

  const fetchTenants = async () => {
    try {
      const res = await apiClient.get('/platform/tenants');
      setTenants(res.data.data);
    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setIsCreating(true);
    try {
      const res = await apiClient.post('/platform/tenants', formData);
      setCreated({ business_name: formData.business_name, temp_password: res.data.data.temp_password });
      fetchTenants();
      setFormData({ business_name: '', owner_name: '', owner_email: '', owner_phone: '', monthly_fee: 50000 });
    } catch (error) {
      setSubmitError(error.response?.data?.error || 'Failed to add the business.');
    } finally {
      setIsCreating(false);
    }
  };

  const openModal = () => { setSubmitError(''); setCreated(null); setShowModal(true); };
  // The temporary password is forgotten when the window closes
  const closeModal = () => { setShowModal(false); setCreated(null); setSubmitError(''); };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Businesses</h1>
          <p>Manage the businesses that use your WiFi billing system.</p>
        </div>
        <button onClick={openModal} className="btn btn-primary">
          + Add Business
        </button>
      </div>

      <div className="table-container">
        {loading ? (
          <Loader message="Loading tenants..." />
        ) : tenants.length === 0 ? (
          <div className="table-empty">No businesses yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Business Name</th>
                <th>Owner</th>
                <th>Phone</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td className="cell-strong">
                    <Link to={`/tenants/${t.id}`}>
                      {t.business_name}
                    </Link>
                  </td>
                  <td>{t.owner_name}</td>
                  <td>{t.owner_phone}</td>
                  <td>
                    <span className={`badge ${t.subscription_status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                      {t.subscription_status}
                    </span>
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
            <h2 className="modal-title">Add New Business</h2>
            {created ? (
              <div>
                <p className="modal-sub"><strong>{created.business_name}</strong> was added.</p>
                <div className="alert alert-success">
                  Temporary password for the owner. It is shown <strong>only once</strong>: give it to the owner now.
                  The owner chooses a new password at the first login.
                  <code className="secret">{created.temp_password}</code>
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={closeModal} className="btn btn-primary">Done</button>
                </div>
              </div>
            ) : (
            <form onSubmit={handleCreate}>
              <p className="modal-sub">The owner gets a temporary password to log in to the Business Panel.</p>
              {submitError && <div className="alert alert-danger">{submitError}</div>}
              <div className="form-group">
                <label>Business Name</label>
                <input className="form-control" required type="text" name="business_name" value={formData.business_name} onChange={e => setFormData({...formData, business_name: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Owner Name</label>
                <input className="form-control" required type="text" name="owner_name" value={formData.owner_name} onChange={e => setFormData({...formData, owner_name: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Owner Email</label>
                <input className="form-control" required type="email" name="owner_email" value={formData.owner_email} onChange={e => setFormData({...formData, owner_email: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Owner Phone</label>
                <input className="form-control" required type="text" name="owner_phone" value={formData.owner_phone} onChange={e => setFormData({...formData, owner_phone: e.target.value})} />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={closeModal} className="btn btn-secondary" disabled={isCreating}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isCreating}>
                  {isCreating ? 'Adding...' : 'Add Business'}
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}