/**
 * فحوصات دعم/قدرات مبنية فوق appMode.ts، منفصلة عن تحديد البيئة نفسه.
 */

import { isNativePlatform } from '@/lib/capacitor/platform';
import { isPushSupported } from '@/lib/pwa';
import { isStandaloneMode } from './appMode';

export function supportsServiceWorker(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/**
 * Web Push (VAPID) — يعمل من Browser أو PWA، منفصل تمامًا عن Native FCM
 * (lib/capacitor/nativePush.ts). لا يفحص standalone لأن الميزة تعمل اليوم
 * من تبويب متصفح عادي غير مثبّت أيضًا (انظر القرار المفتوح رقم 1 في الخطة
 * قبل تضييق هذا لاحقًا إلى pwa فقط).
 */
export async function supportsWebPush(): Promise<boolean> {
  if (await isNativePlatform()) return false;
  return isPushSupported();
}

export async function supportsNativePush(): Promise<boolean> {
  return isNativePlatform();
}

/**
 * Badging API (navigator.setAppBadge/clearAppBadge). ملاحظة تصحيحية عن
 * مسودة الخطة: هذه ليست ميزة غير مبنية — lib/appBadge.ts موجود ومربوط
 * فعليًا بعدد الإشعارات غير المقروءة عبر useNotifications.ts، ويُستدعى
 * بلا أي شرط بيئة (فحص داخلي بالـ feature-detection فقط، بدون تفريق
 * Native/PWA بعد — انظر الملاحظة المرفوعة للمستخدم عن هذه الفجوة).
 */
export function supportsAppBadge(): boolean {
  return typeof navigator !== 'undefined' && 'setAppBadge' in navigator;
}

/**
 * شريط "ثبّت التطبيق" (InstallPrompt) — Browser فقط، يستثني Native (مثبّت
 * أصلًا من المتجر) وPWA (مثبّت أصلًا كـ standalone) صراحة.
 */
export async function supportsInstallPrompt(): Promise<boolean> {
  if (await isNativePlatform()) return false;
  return !isStandaloneMode();
}
