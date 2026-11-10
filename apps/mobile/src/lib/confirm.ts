import { Alert } from 'react-native';

export type ConfirmButtonStyle = 'default' | 'cancel' | 'destructive';
export type ConfirmButton = { text: string; style?: ConfirmButtonStyle; onPress?: () => void };
export type ConfirmRequest = { id: number; title: string; message?: string; buttons: ConfirmButton[] };

type ConfirmListener = (request: ConfirmRequest) => void;
const listeners = new Set<ConfirmListener>();
let sequence = 0;

/**
 * نمط التأكيد الموحّد في التطبيق. نفس توقيع Alert.alert لكن يُعرض عبر ConfirmHost
 * (متوافق مع الثيم وRTL وإمكانية الوصول). إن لم يكن ConfirmHost مركّباً بعد يُستخدم Alert الأصلي
 * حتى لا يضيع أي تأكيد.
 */
export function confirmAlert(title: string, message?: string, buttons?: ConfirmButton[]): void {
  const safeButtons: ConfirmButton[] = buttons && buttons.length > 0 ? buttons : [{ text: 'حسناً' }];
  if (listeners.size === 0) {
    Alert.alert(title, message, safeButtons);
    return;
  }
  const request: ConfirmRequest = { id: ++sequence, title, message, buttons: safeButtons };
  for (const listener of listeners) listener(request);
}

export function subscribeToConfirmations(listener: ConfirmListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
