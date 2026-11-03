import React, { useState } from 'react';
import { FiCopy, FiCheck } from 'react-icons/fi';
import { useToast } from './Toast';

// Copies text to the clipboard. Without a label it is a small icon button (for table cells).
export default function CopyButton({ text, label, toastMessage = 'Copied', className = '' }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast(toastMessage);
    } catch (e) {
      toast('Copy failed. Select the text and copy it by hand.', 'error');
    }
  };

  const Icon = copied ? FiCheck : FiCopy;
  return label ? (
    <button type="button" onClick={copy} className={`btn btn-secondary ${className}`}>
      <Icon size={16} /> {label}
    </button>
  ) : (
    <button type="button" onClick={copy} className={`icon-btn ${className}`} title="Copy" aria-label="Copy">
      <Icon size={15} />
    </button>
  );
}
