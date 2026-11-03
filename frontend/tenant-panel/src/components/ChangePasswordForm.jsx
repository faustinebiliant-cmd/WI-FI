import React, { useState } from 'react';
import apiClient from '../api/client';
import PasswordInput from '../shared/components/PasswordInput';
import { MAX_PASSWORD_LENGTH } from '../shared/inputRules';

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

    if (newPassword.length < 8 || newPassword.length > MAX_PASSWORD_LENGTH) {
      setError(`The new password must be 8 to ${MAX_PASSWORD_LENGTH} characters long.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The two new passwords are not the same.');
      return;
    }

    setSaving(true);
    try {
      const res = await apiClient.post('/tenant/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      // The old login stops working: this device continues with the new one
      if (res.data.token) localStorage.setItem('tenantToken', res.data.token);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Password changed. Any other device logged in to this account has been logged out.');
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
        <PasswordInput autoComplete="current-password" maxLength={MAX_PASSWORD_LENGTH} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required disabled={saving} />
      </div>

      <div className="form-group">
        <label>New Password (8 to 50 characters)</label>
        <PasswordInput autoComplete="new-password" maxLength={MAX_PASSWORD_LENGTH} value={newPassword} onChange={e => setNewPassword(e.target.value)} required disabled={saving} />
      </div>

      <div className="form-group">
        <label>Repeat New Password</label>
        <PasswordInput autoComplete="new-password" maxLength={MAX_PASSWORD_LENGTH} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required disabled={saving} />
      </div>

      <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
        {saving ? 'Saving...' : 'Change Password'}
      </button>
    </form>
  );
}
