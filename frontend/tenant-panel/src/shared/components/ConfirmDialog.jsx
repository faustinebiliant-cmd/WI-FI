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
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '400px', textAlign: 'center', padding: '32px 24px' }}
      >
        <div style={{ 
          width: '48px', height: '48px', borderRadius: '50%', margin: '0 auto 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: variant === 'danger' ? 'var(--danger-soft)' : 'var(--primary-soft)',
          color: variant === 'danger' ? 'var(--danger)' : 'var(--primary)'
        }}>
          <FiAlertCircle size={24} />
        </div>
        
        <h2 style={{ fontSize: '20px', marginBottom: '8px', color: 'var(--dark)' }}>{title}</h2>
        <p style={{ color: 'var(--gray)', fontSize: '14px', marginBottom: '24px', lineHeight: 1.5 }}>
          {message}
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button 
            className="btn btn-secondary" 
            onClick={onCancel}
            disabled={loading}
            style={{ flex: 1 }}
          >
            {cancelLabel}
          </button>
          <button 
            className={`btn ${variant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={loading}
            style={{ flex: 1 }}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}