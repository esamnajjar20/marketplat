/**
 * تسجيل الـ Service Worker + إدارة التحديثات + اشتراكات Push.
 *
 * ملاحظة أمنية: لا نخزّن أي Push subscription أو أي token في localStorage —
 * الاشتراك يُرسل مباشرة للباك-إند عبر apiClient (نفس آلية Bearer token +
 * httpOnly cookie المستخدمة في باقي الطلبات، انظر api/client.ts) ولا يُحفظ
 * محليًا إلا الحالة البسيطة (isSubscribed: boolean) للتحكم في واجهة الزر.
 */

import { apiClient } from '@/api/client';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export type SwUpdateListener = (registration: ServiceWorkerRegistration) => void;

let waitingUpdateListeners: SwUpdateListener[] = [];

/** يُسجَّل من AppProviders مرة واحدة عند إقلاع التطبيق. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined') return null;
  if (!('serviceWorker' in navigator)) return null;
  // لا تسجيل في وضع التطوير لتفادي تعارضات HMR مع الكاش — القيمة
  // NEXT_PUBLIC_ENABLE_SW_DEV تسمح باختبار الـ SW يدويًا عند الحاجة.
  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ENABLE_SW_DEV !== 'true') {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

    // نسخة جديدة تنتظر التفعيل (مستخدم فتح التطبيق أثناء وجود تحديث).
    if (registration.waiting) {
      waitingUpdateListeners.forEach((cb) => cb(registration));
    }

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          waitingUpdateListeners.forEach((cb) => cb(registration));
        }
      });
    });

    // عندما يتولى الـ SW الجديد السيطرة (بعد skipWaiting)، أعِد تحميل الصفحة
    // مرة واحدة فقط حتى لا يعمل المستخدم بخليط من كود قديم/جديد.
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    return registration;
  } catch (err) {
    // فشل التسجيل لا يجب أن يكسر التطبيق — PWA هي تحسين إضافي (progressive enhancement).
    console.warn('تعذّر تسجيل Service Worker:', err);
    return null;
  }
}

/** يُستدعى من مكوّن UpdatePrompt ليُبلَّغ عند توفر نسخة جديدة. */
export function onServiceWorkerUpdate(listener: SwUpdateListener): () => void {
  waitingUpdateListeners.push(listener);
  return () => {
    waitingUpdateListeners = waitingUpdateListeners.filter((l) => l !== listener);
  };
}

/** يطلب من الـ SW الجديد (الموجود في حالة "waiting") تولي السيطرة فورًا. */
export function activateWaitingServiceWorker(registration: ServiceWorkerRegistration): void {
  registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
}

// ── Push Notifications ──────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  // FIX TS-PWA-01: newer TypeScript DOM lib versions type Uint8Array as
  // generic (Uint8Array<ArrayBufferLike>), which no longer structurally
  // satisfies PushManager.subscribe()'s stricter BufferSource parameter
  // in every TS/lib.dom combination. The runtime value is a completely
  // normal Uint8Array backed by a real ArrayBuffer — only the compile-time
  // type is overly narrow — so a direct return-type widening here is a
  // safe, targeted fix rather than a functional change.
  return outputArray as BufferSource;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
  );
}

export async function getPushSubscriptionState(): Promise<'subscribed' | 'unsubscribed' | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported';
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? 'subscribed' : 'unsubscribed';
}

/**
 * يطلب إذن الإشعارات، ينشئ اشتراك Push، ويرسله للباك-إند لحفظه.
 *
 * ⚠️ يتطلب من الباك-إند إضافة نقطة `POST /notifications/push-subscriptions`
 * (غير موجودة حاليًا في src/modules — راجع قسم "المشاكل/المتطلبات
 * المتبقية" في التسليم) تستقبل { endpoint, keys: { p256dh, auth } }
 * وتربطها بالمستخدم الحالي عبر الـ Bearer token، بالإضافة لمتغير بيئة
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY يجب توليده وضبطه في كلا الطرفين.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  if (!VAPID_PUBLIC_KEY) {
    console.warn('NEXT_PUBLIC_VAPID_PUBLIC_KEY غير مضبوط — لا يمكن تفعيل الإشعارات.');
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  try {
    await apiClient.post('/notifications/push-subscriptions', subscription.toJSON());
    return true;
  } catch (err) {
    // FIX PWA-CRITICAL-04: لو فشل حفظ الاشتراك في الباك-إند (مثلًا نقطة
    // /notifications/push-subscriptions غير منشورة بعد، أو خطأ شبكة)،
    // يبقى المتصفح مشتركًا فعليًا عبر pushManager دون أن يعرف الخادم
    // بذلك — تناقض حالة يجعل واجهة المستخدم تظهر "غير مفعّل" بينما
    // المتصفح يحمل اشتراكًا حيًا لن يُستخدم أبدًا ولن يمكن استبداله
    // بسهولة لاحقًا. نتراجع عن الاشتراك محليًا فورًا لإبقاء الحالتين متطابقتين.
    await subscription.unsubscribe().catch(() => undefined);
    throw err;
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await apiClient
    .delete('/notifications/push-subscriptions', { data: { endpoint } })
    .catch(() => undefined); // فشل حذف السجل من الخادم لا يجب أن يمنع الإلغاء المحلي
}
