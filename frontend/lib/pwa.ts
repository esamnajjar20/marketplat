/**
 * تسجيل الـ Service Worker + إدارة التحديثات + اشتراكات Push.
 *
 * ملاحظة أمنية: لا نخزّن أي Push subscription أو أي token في localStorage —
 * الاشتراك يُرسل مباشرة للباك-إند عبر apiClient (نفس آلية Bearer token +
 * httpOnly cookie المستخدمة في باقي الطلبات، انظر api/client.ts) ولا يُحفظ
 * محليًا إلا الحالة البسيطة (isSubscribed: boolean) للتحكم في واجهة الزر.
 */

import { apiClient } from '@/api/client';

// FIX PWA-05: previously read once as a module-level constant
// (`const VAPID_PUBLIC_KEY = process.env...`), which freezes the value at
// import time. In Next.js NEXT_PUBLIC_* vars are inlined at build time so
// this is harmless in production, but it silently breaks anything that
// needs the current value read at call time (tests that set the env var
// per-case, or any future runtime-config override) — subscribeToPush()
// would keep using whatever was present the moment the module first
// loaded. Reading it inside a function each call fixes both without any
// behavior change in production.
function getVapidPublicKey(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
}

export type SwUpdateListener = (registration: ServiceWorkerRegistration) => void;

let waitingUpdateListeners: SwUpdateListener[] = [];

/** يُسجَّل من AppProviders مرة واحدة عند إقلاع التطبيق. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined') return null;
  if (!('serviceWorker' in navigator)) return null;
  // لا تسجيل في وضع التطوير لتفادي تعارضات HMR مع الكاش — القيمة
  // NEXT_PUBLIC_ENABLE_SW_DEV تسمح باختبار الـ SW يدويًا عند الحاجة.
  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ENABLE_SW_DEV !== 'true') {
    // FIX PWA-DEV-01: this guard is correct (avoids HMR/SW cache conflicts)
    // but was previously silent — testing offline/PWA behavior under
    // `next dev` looked broken with zero explanation. Log once so it's
    // discoverable without reading source.
    console.info(
      '[PWA] Service Worker skipped in development. Set NEXT_PUBLIC_ENABLE_SW_DEV=true in .env.local to test offline/PWA behavior locally.',
    );
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

    // فحص دوري لوجود تحديث (كل ساعة) — يضمن ظهور زر التحديث حتى لو
    // فُتح التطبيق قبل نشر النسخة الجديدة.
    const UPDATE_CHECK_MS = 60 * 60 * 1000;
    const checkUpdate = () => {
      void registration.update().catch(() => undefined);
    };
    window.setInterval(checkUpdate, UPDATE_CHECK_MS);
    // فحص إضافي عند عودة التبويب
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkUpdate();
    };
    document.addEventListener('visibilitychange', onVisible);
    // تنظيف عند إلغاء التسجيل نادرًا ما يحدث؛ نتركه بسيطًا.

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

/**
 * يطلب من الـ SW الجديد (الموجود في حالة "waiting") تولي السيطرة فورًا.
 *
 * FIX PWA-UPDATE-01: كانت `registration.waiting?.postMessage(...)` — لو
 * كان `waiting` قد أصبح null بحلول لحظة الضغط (مثلًا: نافذة/تبويب آخر لنفس
 * التطبيق فعّل نفس التحديث أولًا، فتحوّل الـ SW من waiting إلى active قبل
 * أن يضغط المستخدم هنا)، فإن الـ postMessage يُطوى بصمت بفضل `?.` — لا
 * خطأ، لا رد فعل، لا تحديث. هذا يطابق تمامًا الأعراض المُبلَّغ عنها: ضغطة
 * الزر تُسجَّل بصريًا لكن لا شيء يتحمّل بعدها فعليًا.
 * أيضًا: حتى مع وجود waiting فعليًا، لو تأخّر حدث controllerchange لأي سبب
 * (بما فيها قيود دورة حياة SW المعروفة على iOS Safari للتطبيقات المثبتة
 * على الشاشة الرئيسية)، كان المستخدم يبقى عالقًا على الشاشة القديمة دون
 * أي مسار احتياطي.
 * الإصلاح: لو لا يوجد waiting، أعد التحميل مباشرة (التحديث غالبًا مُفعَّل
 * فعليًا). ولو يوجد، أرسل الرسالة كالمعتاد مع مؤقت احتياطي (3 ثوانٍ) يفرض
 * إعادة التحميل يدويًا إن لم ينطلق controllerchange بحلول ذلك الوقت.
 */
export type UpdateStage = 'activating' | 'reloading';

/**
 * onStage اختياري: يُستخدم من صفحة /update لعرض تقدّم التحديث للمستخدم
 * (انظر app/update/page.tsx). لا يغيّر أي سلوك فعلي — مجرد نداءات إضافية
 * عند كل مرحلة حقيقية من العملية الموجودة أصلًا.
 */
export function activateWaitingServiceWorker(
  registration: ServiceWorkerRegistration,
  onStage?: (stage: UpdateStage) => void,
): void {
  if (!registration.waiting) {
    onStage?.('reloading');
    window.location.reload();
    return;
  }
  onStage?.('activating');
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  // إعادة التحميل الفعلية تحدث إما فورًا عبر controllerchange (مسجَّل في
  // registerServiceWorker أعلاه) أو عبر المهلة الاحتياطية بعد 3 ثوانٍ إن
  // لم ينطلق ذلك الحدث. نُبلّغ بمرحلة "إعادة التحميل" بعد فاصل قصير حتى لا
  // تُعرض للمستخدم كخطوتين متزامنتين.
  window.setTimeout(() => onStage?.('reloading'), 300);
  window.setTimeout(() => {
    window.location.reload();
  }, 3000);
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
  const vapidPublicKey = getVapidPublicKey();
  if (!vapidPublicKey) {
    console.warn('NEXT_PUBLIC_VAPID_PUBLIC_KEY غير مضبوط — لا يمكن تفعيل الإشعارات.');
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
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

