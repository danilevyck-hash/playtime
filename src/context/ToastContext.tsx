'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface Toast { id: number; message: string; }
interface ToastContextType { showToast: (message: string) => void; }

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-24 left-0 right-0 flex flex-col items-center gap-2 z-50 pointer-events-none px-4">
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
