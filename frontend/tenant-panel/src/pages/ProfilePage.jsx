import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import Loader from '../shared/components/Loader';
import ChangePasswordForm from '../components/ChangePasswordForm';
import ConfirmDialog from '../shared/components/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { onlyDigits } from '../shared/inputRules';

export default function ProfilePage() {
  const [profile, setProfile] = useState({ business_name: '', lipa_namba: '', payout_provider: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { ok, text }
  const { logout } = useAuth();
  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  // Every device (this one too) has to log in again
  const logoutAllDevices = async () => {
    setLoggingOut(true);
    setLogoutError('');
    try {
      await apiClient.post('/tenant/auth/logout-all');
      try { sessionStorage.setItem('loginNotice', 'You logged out of all devices. Log in again on the devices you use.'); } catch (e) { /* storage blocked */ }
      logout();
    } catch (err) {
      setLogoutError(err.response?.data?.error || 'Failed to log out of all devices.');
      setLoggingOut(false);
    }
  };

  useEffect(() => {
    apiClient.get('/tenant/profile')
      .then(res => setProfile(res.data.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiClient.put('/tenant/profile', {
        lipa_namba: profile.lipa_namba,
        payout_provider: profile.payout_provider
      });
      setMessage({ ok: true, text: 'Payment details saved.' });
    } catch (error) {
      setMessage({ ok: false, text: error.response?.data?.error || 'Failed to save details.' });
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
        {message && <div className={`alert ${message.ok ? 'alert-success' : 'alert-danger'}`}>{message.text}</div>}

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
            <input className="form-control" type="text" placeholder="e.g. 123456" inputMode="numeric" maxLength={15} value={profile.lipa_namba || ''} onChange={e => setProfile({...profile, lipa_namba: onlyDigits(e.target.value)})} required />
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

      <div className="card">
        <h2 className="section-title">Log out of all devices</h2>
        <p className="form-hint" style={{ marginTop: 0 }}>
          Use this if you logged in on a computer that is not yours, lost a phone, or think someone else may be using your login.
          Every device, this one too, has to log in again.
        </p>
        {logoutError && <div className="alert alert-danger">{logoutError}</div>}
        <button type="button" className="btn btn-danger btn-block" onClick={() => setConfirmLogoutAll(true)} disabled={loggingOut}>
          Log out of all devices
        </button>
      </div>

      <ConfirmDialog
        open={confirmLogoutAll}
        title="Log out of all devices?"
        message="Every phone and computer logged in to this account, this one too, is logged out at once."
        confirmLabel="Log out everywhere"
        variant="danger"
        loading={loggingOut}
        onConfirm={logoutAllDevices}
        onCancel={() => setConfirmLogoutAll(false)}
      />
    </div>
  );
}