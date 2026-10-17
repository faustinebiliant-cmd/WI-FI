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
  const [submitSuccess, setSubmitSuccess] = useState('');

  useEffect(() => { fetchTenants(); }, []);

  const fetchTenants = async () => {
    try {
      const res = await apiClient.get('/platform/tenants');
      setTenants(res.data.data);
    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitError(''); setSubmitSuccess('');
    try {
      const res = await apiClient.post('/platform/tenants', formData);
      setSubmitSuccess(`Created! Password: ${res.data.data.temp_password}`);
      fetchTenants();
      setFormData({ business_name: '', owner_name: '', owner_email: '', owner_phone: '', monthly_fee: 50000 });
    } catch (error) {
      setSubmitError(error.response?.data?.error || 'Failed');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Tenants</h1>
          <p>Manage your hotel and guest house customers.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn btn-primary">
          + Add Tenant
        </button>
      </div>

      <div className="table-container">
        {loading ? (
          <Loader message="Loading tenants..." />
        ) : tenants.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>No tenants found.</div>
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
                  <td style={{ fontWeight: '600' }}>
                    <Link to={`/tenants/${t.id}`} style={{ color: 'var(--primary)' }}>
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
            <h2 style={{ marginTop: 0 }}>Add New Tenant</h2>
            {submitError && <div style={{ color: 'red', marginBottom: '15px' }}>{submitError}</div>}
            {submitSuccess && <div style={{ color: 'green', marginBottom: '15px' }}>{submitSuccess}</div>}
            <form onSubmit={handleCreate}>
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
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Create Tenant</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}