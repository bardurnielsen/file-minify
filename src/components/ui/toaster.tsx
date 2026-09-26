import React, { createContext, useCallback, useContext, useMemo, useReducer, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XCircle, AlertTriangle, Info, X, CheckCircle2 } from 'lucide-react';

type ToastType = 'error' | 'warning' | 'info' | 'success';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
  /** A button beside the text; clicking it also closes the toast. */
  action?: { label: string; onClick: () => void };
  /** A new toast with the same key replaces the old one rather than stacking. */
  key?: string;
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
    case 'ADD_TOAST': {
      const { key } = action.toast;
      return [...state.filter((toast) => !key || toast.key !== key), action.toast];
    }
    case 'REMOVE_TOAST':
      return state.filter((toast) => toast.id !== action.id);
    default:
      return state;
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, dispatch] = useReducer(toastReducer, []);
  // Ids from a counter, not the clock: two toasts in the same millisecond got
  // the same id, and reading the clock here isn't pure.
  const nextId = useRef(0);

  // Stable, so an effect can subscribe with them without resubscribing on
  // every toast.
  const removeToast = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_TOAST', id });
  }, []);

  const addToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = String(++nextId.current);
      const duration = toast.duration || 5000; // Default 5 seconds

      dispatch({ type: 'ADD_TOAST', toast: { ...toast, id, duration } });

      // Auto-remove after duration
      setTimeout(() => {
        removeToast(id);
      }, duration);
    },
    [removeToast]
  );

  const value = useMemo(() => ({ toasts, addToast, removeToast }), [toasts, addToast, removeToast]);

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

function Toaster() {
  const { toasts, removeToast } = useToast();

  const icons = {
    error: <XCircle className="w-5 h-5 text-rose-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    info: <Info className="w-5 h-5 text-zinc-500" />,
    success: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
  };

  const backgrounds = {
    error: 'border-rose-200 dark:border-rose-900',
    warning: 'border-amber-200 dark:border-amber-900',
    info: 'border-zinc-200 dark:border-zinc-700',
    success: 'border-emerald-200 dark:border-emerald-900',
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
                {toast.action && (
                  <button
                    type="button"
                    onClick={() => {
                      toast.action?.onClick();
                      removeToast(toast.id);
                    }}
                    className="mt-2 rounded text-sm font-medium text-emerald-700 underline decoration-current/40 underline-offset-2 transition-colors hover:decoration-current focus-ring dark:text-emerald-400"
                  >
                    {toast.action.label}
                  </button>
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