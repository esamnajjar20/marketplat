/**
 * بصمة هذا الجهاز كما يحسبها الخادم (backend/src/shared/utils/deviceLabel.ts):
 * sha256(endpoint | fcmToken) → أول 16 خانة hex. تُستخدم فقط لتمييز «هذا الجهاز»
 * في قائمة الأجهزة؛ لا يُرسَل أي endpoint/token من الخادم إلى الواجهة.
 */

import { isNativePlatform } from '@/lib/capacitor/platform';
import { NATIVE_FCM_TOKEN_STORAGE_KEY } from '@/lib/capacitor/nativePush';
import { secureGet } from '@/lib/runtime/secureStorage';

export async function fingerprintOf(secret: string): Promise<string | null> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return null;
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(secret));
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16);
  } catch {
    return null;
  }
}

/** null = لا اشتراك محلي (أو بيئة لا تدعم ذلك) — لن يُعلَّم أي صف كـ«هذا الجهاز». */
export async function getThisDeviceFingerprint(): Promise<string | null> {
  try {
    if (await isNativePlatform()) {
      const token = await secureGet(NATIVE_FCM_TOKEN_STORAGE_KEY);
      return token ? await fingerprintOf(token) : null;
    }
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    return subscription ? await fingerprintOf(subscription.endpoint) : null;
  } catch {
    return null;
  }
}
