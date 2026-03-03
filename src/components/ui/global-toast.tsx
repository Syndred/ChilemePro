'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { APP_TOAST_EVENT, type AppToastPayload } from '@/lib/ui/toast';

interface ToastItem {
  id: string;
  type: AppToastPayload['type'];
  message: string;
}

const DEFAULT_DURATION_MS = 1800;
const MAX_TOASTS = 3;

export function GlobalToastViewport() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timersRef.current[id];
    if (timer) {
      clearTimeout(timer);
      delete timersRef.current[id];
    }
  }, []);

  useEffect(() => {
    const handleToast = (event: Event) => {
      const customEvent = event as CustomEvent<AppToastPayload>;
      const detail = customEvent.detail;
      if (!detail?.message) {
        return;
      }

      const id = `toast-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const nextToast: ToastItem = {
        id,
        type: detail.type ?? 'info',
        message: detail.message,
      };

      setToasts((current) => [nextToast, ...current].slice(0, MAX_TOASTS));

      const duration = detail.durationMs ?? DEFAULT_DURATION_MS;
      timersRef.current[id] = setTimeout(() => {
        removeToast(id);
      }, duration);
    };

    window.addEventListener(APP_TOAST_EVENT, handleToast as EventListener);
    return () => {
      window.removeEventListener(APP_TOAST_EVENT, handleToast as EventListener);
      Object.values(timersRef.current).forEach((timer) => clearTimeout(timer));
      timersRef.current = {};
    };
  }, [removeToast]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[90] flex justify-center px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const style =
              toast.type === 'success'
                ? 'border-emerald-200/80 bg-emerald-50/95 text-emerald-700'
                : toast.type === 'error'
                  ? 'border-red-200/80 bg-red-50/95 text-red-700'
                  : 'border-orange-200/80 bg-orange-50/95 text-orange-700';

            const Icon =
              toast.type === 'success'
                ? CheckCircle2
                : toast.type === 'error'
                  ? AlertCircle
                  : Info;

            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: -12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.16 }}
                className={`w-fit max-w-full rounded-full border px-4 py-2 shadow-[0_10px_24px_-14px_rgba(15,23,42,0.45)] backdrop-blur ${style}`}
                role="status"
                aria-live="polite"
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="line-clamp-1">{toast.message}</span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

