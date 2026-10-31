import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import Loader from '../shared/components/Loader';
import ChangePasswordForm from '../components/ChangePasswordForm';

export default function ProfilePage() {
  const [profile, setProfile] = useState({ business_name: '', lipa_namba: '', payout_provider: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiClient.get('/tenant/profile')
      .then(res => setProfile(res.data.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await apiClient.put('/tenant/profile', {
        lipa_namba: profile.lipa_namba,
        payout_provider: profile.payout_provider
      });
      setMessage('Payment details saved successfully!');
    } catch (error) {
      setMessage('Failed to save details.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader message="Loading profile..." />;

  return (
    <div className="narrow-page">
      <div className="page-header">
        <div>
          <h1>Business Settings</h1>
          <p>Manage your payout details for customer payments.</p>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title">Payment Details</h2>
        {message && <div className={`alert ${message.includes('success') ? 'alert-success' : 'alert-danger'}`}>{message}</div>}

        <form onSubmit={handleSave}>
          <div className="form-group">
            <label>Business Name</label>
            <input className="form-control" type="text" value={profile.business_name} disabled />
          </div>

          <div className="form-group">
            <label>Mobile Money Provider</label>
            <select className="form-control" value={profile.payout_provider || ''} onChange={e => setProfile({...profile, payout_provider: e.target.value})} required>
              <option value="">Select Provider</option>
              <option value="Tigo">Mixx by Yas (Tigo)</option>
              <option value="Airtel">Airtel Money</option>
              <option value="Mpesa">M-Pesa</option>
              <option value="Halopesa">Halopesa</option>
              <option value="Azampesa">Azampesa</option>
            </select>
          </div>

          <div className="form-group">
            <label>Lipa Namba (Payment Number)</label>
            <input className="form-control" type="text" placeholder="e.g. 123456" value={profile.lipa_namba || ''} onChange={e => setProfile({...profile, lipa_namba: e.target.value})} required />
            <p className="form-hint">This is where the money will be sent when customers buy WiFi.</p>
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Saving...' : 'Save Payment Details'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 className="section-title">Change Password</h2>
        <ChangePasswordForm />
      </div>
    </div>
  );
}