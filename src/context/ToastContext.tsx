'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface Toast { id: number; message: string; }
type ToastType = 'success' | 'error';
interface ToastContextType { showToast: (message: string, type?: ToastType) => void; }

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message }]);
    // Errors linger (8s) so they can be read; success is a quick confirmation (2.5s).
    const duration = type === 'error' ? 8000 : 2500;
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div role="status" aria-live="polite" aria-atomic="true" className="fixed bottom-4 sm:bottom-24 left-4 right-4 flex flex-col items-center gap-2 z-50 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className="bg-gray-900 text-white font-heading font-semibold text-sm px-5 py-3 rounded-2xl shadow-xl animate-slide-up">
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() { return useContext(ToastContext); }
