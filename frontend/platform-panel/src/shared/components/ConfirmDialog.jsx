import React from 'react';
import { FiAlertCircle } from 'react-icons/fi';

export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger', // 'danger' | 'primary'
  loading = false,
  onConfirm,
  onCancel
}) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={loading ? undefined : onCancel}>
      <div
        className="modal-content modal-narrow modal-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`dialog-icon ${variant === 'danger' ? '' : 'primary'}`}>
          <FiAlertCircle size={24} />
        </div>

        <h2 className="modal-title">{title}</h2>
        <p className="modal-sub">{message}</p>

        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            className={`btn ${variant === 'danger' ? 'btn-solid-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}