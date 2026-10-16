import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from '../../lib/cx';

export interface ToastOptions {
  message: string;
  tone?: 'info' | 'error' | 'success';
  /** Кнопка в тосте: «Повторить», «Отменить». */
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

interface ToastItem extends Required<Omit<ToastOptions, 'action'>> {
  id: number;
  action: ToastOptions['action'];
}

interface ToastApi {
  showToast: (options: ToastOptions) => number;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION_MS = 5000;

interface ToastProviderProps {
  children: ReactNode;
}

/** Хранит очередь уведомлений и показывает их внизу экрана с aria-live. */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((options: ToastOptions) => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((current) => [
      ...current.slice(-2),
      {
        id,
        message: options.message,
        tone: options.tone ?? 'info',
        action: options.action,
        durationMs: options.durationMs ?? DEFAULT_DURATION_MS,
      },
    ]);
    return id;
  }, []);

  const api = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {toasts.map((toast) => (
          <ToastView key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Доступ к уведомлениям из любого компонента внутри `ToastProvider`.
 * @returns Функции показа и скрытия тоста.
 * @throws {Error} Если провайдер не подключён.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) {
    throw new Error('useToast нужно вызывать внутри ToastProvider');
  }
  return api;
}

interface ToastViewProps {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}

function ToastView({ toast, onDismiss }: ToastViewProps) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.durationMs);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.durationMs, onDismiss]);

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lg',
        toast.tone === 'error' ? 'bg-rose-700 text-white' : 'bg-slate-900 text-white',
      )}
    >
      <span className="flex-1">{toast.message}</span>
      {toast.action !== undefined && (
        <button
          type="button"
          className="min-h-11 rounded-xl px-3 font-semibold text-emerald-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
