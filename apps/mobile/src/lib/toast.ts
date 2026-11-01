export type ToastTone = 'success' | 'error' | 'warning' | 'info';
export type ToastAction = { label: string; onPress: () => void };
export type ToastMessage = {
  id: number;
  title: string;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
};

type ToastListener = (toast: ToastMessage) => void;
const listeners = new Set<ToastListener>();
let sequence = 0;

/** Lightweight app-wide transient feedback. Use native Alert only for decisions/confirmations. */
export function showToast(title: string, message: string, tone: ToastTone = 'info', action?: ToastAction): void {
  const toast: ToastMessage = {
    id: ++sequence,
    title: title.trim() || 'MarketPlat',
    message: message.trim(),
    tone,
    ...(action ? { action } : {}),
  };
  for (const listener of listeners) listener(toast);
}

export function subscribeToToasts(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
