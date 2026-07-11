// App-wide toast notifications (success / error / info), using the design-system
// status colors. Provides useToast() -> { success, error, showToast }. Toasts
// auto-dismiss and can be dismissed by clicking.
import { createContext, useContext, useCallback, useState } from 'react';
import styles from './Toast.module.css';

const ToastContext = createContext(null);
let counter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type = 'info', message, duration = 4000 }) => {
      const id = ++counter;
      setToasts((list) => [...list, { id, type, message }]);
      window.setTimeout(() => remove(id), duration);
    },
    [remove]
  );

  const success = useCallback((message) => showToast({ type: 'success', message }), [showToast]);
  const error = useCallback((message) => showToast({ type: 'error', message }), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error }}>
      {children}
      <div className={styles.container} aria-live="assertive">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`${styles.toast} ${styles[t.type] || ''}`}
            role="alert"
            onClick={() => remove(t.id)}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
