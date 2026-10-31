import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { FiCheckCircle, FiAlertCircle } from 'react-icons/fi';

// Short messages ("Package created") that fade away by themselves.
// Pages call: const toast = useToast(); toast('Saved'); or toast('Failed', 'error');

const ToastContext = createContext(() => {});
const SHOW_MS = 3000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const show = useCallback((message, type = 'success') => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-2), { id, message, type }]); // at most 3 on screen
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), SHOW_MS);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === 'error' ? <FiAlertCircle size={18} /> : <FiCheckCircle size={18} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
