import React, { useState } from 'react';
import apiClient from '../api/client';

// Used on the forced "choose a new password" screen and on the Settings page
export default function ChangePasswordForm({ onSuccess }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (newPassword.length < 8) {
      setError('The new password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The two new passwords are not the same.');
      return;
    }

    setSaving(true);
    try {
      await apiClient.post('/tenant/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Password changed successfully.');
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <div className="form-group">
        <label>Current Password</label>
        <input className="form-control" type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required disabled={saving} />
      </div>

      <div className="form-group">
        <label>New Password (at least 8 characters)</label>
        <input className="form-control" type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required disabled={saving} />
      </div>

      <div className="form-group">
        <label>Repeat New Password</label>
        <input className="form-control" type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required disabled={saving} />
      </div>

      <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
        {saving ? 'Saving...' : 'Change Password'}
      </button>
    </form>
  );
}
