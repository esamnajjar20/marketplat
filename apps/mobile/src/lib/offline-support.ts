import NetInfo from '@react-native-community/netinfo';

/**
 * Single declaration of what works without internet in the mobile app.
 *
 *  - 'offline'     : saved locally on the device and sent automatically later (Outbox).
 *  - 'online-only' : needs a live connection; the UI must say so BEFORE the user invests effort.
 *
 * Edits and deletes of products/services are intentionally online-only: replaying a stale price,
 * stock, status or image edit hours later could silently overwrite newer data written from another
 * device, and the app has no general field-level merge (see frontend/docs/OFFLINE_CACHE_ARCHITECTURE.md).
 * Bookings are online-only because the server must confirm availability.
 */
export type OfflineSupport = 'offline' | 'online-only';

export const OFFLINE_SUPPORT_MATRIX = {
  'create-ad': 'offline',
  'create-product': 'offline',
  'create-service': 'offline',
  'create-sale': 'offline',
  'create-request': 'offline',
  'create-request-offer': 'offline',
  'create-order': 'offline',
  'send-chat-message': 'offline',
  'send-chat-attachment': 'offline',
  'toggle-favorite': 'offline',
  'edit-product': 'online-only',
  'delete-product': 'online-only',
  'edit-service': 'online-only',
  'delete-service': 'online-only',
  'create-appointment': 'online-only',
} as const satisfies Record<string, OfflineSupport>;

export type OfflineOperationKey = keyof typeof OFFLINE_SUPPORT_MATRIX;

export const ONLINE_ONLY_TITLE = 'يتطلب اتصالاً بالإنترنت';

const ONLINE_ONLY_MESSAGES: Record<OfflineOperationKey, string> = {
  'create-ad': '', 'create-product': '', 'create-service': '', 'create-sale': '', 'create-request': '',
  'create-request-offer': '', 'create-order': '', 'send-chat-message': '', 'send-chat-attachment': '', 'toggle-favorite': '',
  'edit-product': 'تعديل المنتج يحتاج اتصالاً حتى لا تُكتب أسعار أو مخزون قديمة فوق بيانات أحدث. اتصل بالإنترنت ثم احفظ التعديل.',
  'delete-product': 'حذف المنتج يحتاج اتصالاً لتأكيده من الخادم. اتصل بالإنترنت ثم أعد المحاولة.',
  'edit-service': 'تعديل الخدمة يحتاج اتصالاً حتى لا تُكتب بيانات قديمة فوق بيانات أحدث. اتصل بالإنترنت ثم احفظ التعديل.',
  'delete-service': 'حذف الخدمة يحتاج اتصالاً لتأكيده من الخادم. اتصل بالإنترنت ثم أعد المحاولة.',
  'create-appointment': 'الحجز يحتاج تأكيد توفر الموعد من الخادم، لذلك لا يمكن حفظه دون اتصال.',
};

export function getOfflineSupport(operation: OfflineOperationKey): OfflineSupport {
  return OFFLINE_SUPPORT_MATRIX[operation];
}

export function onlineOnlyMessage(operation: OfflineOperationKey): string {
  return ONLINE_ONLY_MESSAGES[operation] || ONLINE_ONLY_MESSAGES['edit-product'];
}

/** Same connectivity semantics as ConnectivityProvider: only a definite "no connection" blocks. */
export async function isDeviceOffline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected === false || state.isInternetReachable === false;
  } catch {
    return false;
  }
}

/** Returns a user-facing explanation when an online-only operation is attempted offline, else null. */
export async function onlineOnlyBlockReason(operation: OfflineOperationKey): Promise<{ title: string; message: string } | null> {
  if (getOfflineSupport(operation) !== 'online-only') return null;
  return (await isDeviceOffline()) ? { title: ONLINE_ONLY_TITLE, message: onlineOnlyMessage(operation) } : null;
}
