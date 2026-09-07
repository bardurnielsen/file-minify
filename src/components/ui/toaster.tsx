import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

type ToastAction =
  | { type: 'ADD_TOAST'; toast: Toast }
  | { type: 'REMOVE_TOAST'; id: string };

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

function toastReducer(state: Toast[], action: ToastAction): Toast[] {
  switch (action.type) {
    case 'ADD_TOAST':
      return [...state, action.toast];
    case 'REMOVE_TOAST':
      return state.filter((toast) => toast.id !== action.id);
    default:
      return state;
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, dispatch] = useReducer(toastReducer, []);

  const addToast = (toast: Omit<Toast, 'id'>) => {
    const id = Date.now().toString();
    const duration = toast.duration || 5000; // Default 5 seconds
    
    dispatch({ type: 'ADD_TOAST', toast: { ...toast, id, duration } });
    
    // Auto-remove after duration
    setTimeout(() => {
      removeToast(id);
    }, duration);
  };

  const removeToast = (id: string) => {
    dispatch({ type: 'REMOVE_TOAST', id });
  };

  const value = {
    toasts,
    addToast,
    removeToast,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function Toaster() {
  const { toasts, removeToast } = useToast();

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-emerald-500" />,
    error: <XCircle className="w-5 h-5 text-rose-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    info: <Info className="w-5 h-5 text-zinc-500" />,
  };

  const backgrounds = {
    success: 'border-emerald-200 dark:border-emerald-900',
    error: 'border-rose-200 dark:border-rose-900',
    warning: 'border-amber-200 dark:border-amber-900',
    info: 'border-zinc-200 dark:border-zinc-700',
  };

  return (
    <div className="fixed bottom-0 right-0 z-50 w-full space-y-3 p-4 sm:w-96">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 50, opacity: 0 }}
            className={`relative rounded-xl border bg-white p-4 shadow-lg dark:bg-zinc-900 ${backgrounds[toast.type]}`}
          >
            <div className="flex items-start">
              <div className="flex-shrink-0">{icons[toast.type]}</div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {toast.title}
                </p>
                {toast.description && (
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {toast.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="flex-shrink-0 ml-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}