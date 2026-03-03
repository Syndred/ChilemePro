export type AppToastType = 'success' | 'error' | 'info';

export interface AppToastPayload {
  type: AppToastType;
  message: string;
  durationMs?: number;
}

export const APP_TOAST_EVENT = 'app:toast';

function emitToast(payload: AppToastPayload) {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent<AppToastPayload>(APP_TOAST_EVENT, { detail: payload }));
}

export const toast = {
  show(payload: AppToastPayload) {
    emitToast(payload);
  },
  success(message: string, durationMs?: number) {
    emitToast({ type: 'success', message, durationMs });
  },
  error(message: string, durationMs?: number) {
    emitToast({ type: 'error', message, durationMs });
  },
  info(message: string, durationMs?: number) {
    emitToast({ type: 'info', message, durationMs });
  },
};

