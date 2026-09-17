/**
 * واجهة موحّدة لتسجيل الإشعارات حسب بيئة التشغيل.
 * Web/PWA → VAPID (lib/pwa.ts)
 * Native → FCM (lib/capacitor/nativePush.ts)
 */

import { isNativePlatform } from '@/lib/capacitor/platform';
import {
  ensureNativePushSynced,
  getNativePushPermissionState,
  registerNativePush,
  unregisterNativePush,
  NATIVE_FCM_TOKEN_STORAGE_KEY,
} from '@/lib/capacitor/nativePush';
import { secureGet, secureRemove } from './secureStorage';

export type PushChannel = 'web' | 'native' | 'unsupported';

export async function getPushChannel(): Promise<PushChannel> {
  if (await isNativePlatform()) return 'native';
  if (typeof window !== 'undefined' && 'PushManager' in window && 'serviceWorker' in navigator) {
    return 'web';
  }
  return 'unsupported';
}

/** مزامنة صامتة بعد تسجيل الدخول — لا تطلب إذنًا جديدًا إن لم يُمنح. */
export async function ensurePushSynced(): Promise<void> {
  if (await isNativePlatform()) {
    await ensureNativePushSynced();
    return;
  }
  try {
    const { ensurePushSubscriptionSynced } = await import('@/lib/pwa');
    await ensurePushSubscriptionSynced();
  } catch {
    /* web path optional / missing VAPID */
  }
}

export async function registerPush(): Promise<boolean> {
  if (await isNativePlatform()) {
    const token = await registerNativePush();
    return Boolean(token);
  }
  const { subscribeToPush } = await import('@/lib/pwa');
  return subscribeToPush();
}

export async function unregisterPush(): Promise<void> {
  if (await isNativePlatform()) {
    const token = await secureGet(NATIVE_FCM_TOKEN_STORAGE_KEY);
    if (token) {
      await unregisterNativePush(token);
      await secureRemove(NATIVE_FCM_TOKEN_STORAGE_KEY);
    }
    return;
  }
  const { unsubscribeFromPush } = await import('@/lib/pwa');
  await unsubscribeFromPush();
}

export async function getPushPermissionState(): Promise<
  'granted' | 'denied' | 'prompt' | 'unsupported'
> {
  if (await isNativePlatform()) {
    return getNativePushPermissionState();
  }
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'prompt';
}
