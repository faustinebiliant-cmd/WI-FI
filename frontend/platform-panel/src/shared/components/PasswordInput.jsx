import React, { useState } from 'react';
import { FiEye, FiEyeOff } from 'react-icons/fi';

// A password box with an eye button: tap to see what you typed, tap again to hide it.
// Every other setting (value, onChange, autoComplete, required, disabled) goes to the box.
export default function PasswordInput({ className = '', disabled, ...inputProps }) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? FiEyeOff : FiEye;
  return (
    <div className="password-field">
      <input {...inputProps} disabled={disabled} type={visible ? 'text' : 'password'} className={`form-control ${className}`} />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        title={visible ? 'Hide password' : 'Show password'}
      >
        <Icon size={18} />
      </button>
    </div>
  );
}
