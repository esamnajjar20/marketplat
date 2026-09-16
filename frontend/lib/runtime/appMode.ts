/**
 * طبقة موحّدة لتحديد بيئة التشغيل: Native (Capacitor) / Browser / PWA.
 *
 * لا تُعيد هذه الطبقة تنفيذ isNativePlatform() — تبني فوقها. الفحص الوحيد
 * الجديد هنا هو isStandaloneMode() (كان موجودًا سابقًا محليًا فقط داخل
 * InstallPrompt.tsx تحت اسم isStandalone()، بلا فحص isNativePlatform()
 * بجانبه — وهذا بالضبط ما أنتج باگ ظهور شريط التثبيت داخل التطبيق الأصلي؛
 * انظر الإصلاح في InstallPrompt.tsx).
 *
 * القاعدة الثابتة: PWA = طريقة تشغيل، Native = بيئة تنفيذ مختلفة تمامًا
 * (WebView + plugins)، وليس أي منهما مرادفًا لـ Offline. نظام الـ Offline
 * (Service Worker، IndexedDB، الطابور) يعمل في البيئات الثلاث بلا تمييز
 * ولا علاقة له بهذه الطبقة.
 *
 * فحوصات الدعم/القدرات (Web Push، Native Push، App Badge، Install Prompt)
 * موجودة في capabilities.ts بجانب هذا الملف.
 */

import { isNativePlatform } from '@/lib/capacitor/platform';

export type AppMode = 'native' | 'browser' | 'pwa';

/**
 * true لو التطبيق يعمل حاليًا بوضع standalone (مثبّت كـ PWA على الشاشة
 * الرئيسية) — بصرف النظر عن كونه Native أم لا. استُخرجت من InstallPrompt.tsx
 * دون أي تغيير في المنطق.
 */
export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari القديم لا يدعم matchMedia لهذا — يوفر خاصية مباشرة بدلًا من ذلك
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * يحدد بيئة التشغيل الحالية. Native له الأولوية دائمًا: تطبيق أصلي مثبّت
 * من المتجر قد يُظهر أيضًا display-mode: standalone في بعض تهيئات
 * Capacitor WebView، فلازم يُفحص isNativePlatform() أولًا لتجنّب تصنيفه
 * خطأً كـ pwa.
 */
export async function getAppMode(): Promise<AppMode> {
  if (await isNativePlatform()) return 'native';
  return isStandaloneMode() ? 'pwa' : 'browser';
}
