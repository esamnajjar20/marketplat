/**
 * تسجيل الـ Service Worker + إدارة التحديثات + اشتراكات Push.
 *
 * ملاحظة أمنية: لا نخزّن أي Push subscription أو أي token في localStorage —
 * الاشتراك يُرسل مباشرة للباك-إند عبر apiClient (نفس آلية Bearer token +
 * httpOnly cookie المستخدمة في باقي الطلبات، انظر api/client.ts) ولا يُحفظ
 * محليًا إلا الحالة البسيطة (isSubscribed: boolean) للتحكم في واجهة الزر.
 */

import { apiClient } from '@/api/client';
import { getRawVapidPublicKey } from '@/lib/env';

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
  return getRawVapidPublicKey() ?? '';
}

export type SwUpdateListener = (registration: ServiceWorkerRegistration) => void;

/**
 * FIX PWA-READY-HANG: navigator.serviceWorker.ready لا يُحل أبداً إذا لم
 * يُسجَّل SW (dev mode = SW معطّل، أو متصفح قديم). كل دوال Push في هذا
 * الملف كانت تستدعيه مباشرة → الزر يعلق في "loading" للأبد بلا خطأ.
 *
 * getRegistration() يُرجع فوراً (null لو لا SW)، ونُكمل بـ ready فقط
 * عند وجود registration فعلي.
 */
async function getReadySW(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) return existing;
    // لا SW مسجّل → لا تُعلّق، ارجع null فوراً.
    return null;
  } catch {
    return null;
  }
}

let waitingUpdateListeners: SwUpdateListener[] = [];

/** بعد تفعيل تحديث بنجاح: لا تُظهر طلب تحديث جديد فورًا (عالق waiting أو sw.js غير مستقر). */
const JUST_UPDATED_KEY = 'pwa-just-updated-at';
const JUST_UPDATED_SUPPRESS_MS = 5 * 60 * 1000;

/** يمنع أكثر من reload واحد لكل دورة حياة صفحة عند controllerchange. */
let updateReloadInProgress = false;


function markJustUpdated(): void {
  try {
    sessionStorage.setItem(JUST_UPDATED_KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
}

function wasJustUpdated(): boolean {
  try {
    const ts = Number(sessionStorage.getItem(JUST_UPDATED_KEY) || 0);
    return Boolean(ts) && Date.now() - ts < JUST_UPDATED_SUPPRESS_MS;
  } catch {
    return false;
  }
}


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
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      // FIX SW-UPDATE-STALENESS-01: without updateViaCache:'none', the
      // browser is free to satisfy its periodic SW byte-check from the
      // HTTP cache instead of the network. In production the /sw.js
      // response arrives with cf-cache-status: HIT from Cloudflare, so
      // an update pushed hours ago can stay invisible to every client
      // — the app never sees a new sw.js, updatefound never fires, and
      // UpdatePrompt never appears. 'none' tells the browser to bypass
      // HTTP cache specifically for the SW script itself (the regular
      // request path is unaffected), which is the documented way to
      // ensure SW update discovery is not gated on an intermediary
      // cache.
      updateViaCache: 'none',
    });

    // نسخة جديدة تنتظر التفعيل.
    // FIX PWA-UPDATE-LOOP-01: لو المستخدم فعّل تحديثًا للتو وما زال waiting
    // (غالبًا SW ثانٍ ثُبِّت أثناء التفعيل لأن بايتات /sw.js اختلفت بين الطلبات)،
    // لا نُظهر الشريط من جديد — نُكمِل التفعيل بصمت مرة واحدة.
    if (registration.waiting) {
      if (wasJustUpdated()) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        waitingUpdateListeners.forEach((cb) => cb(registration));
      }
    }

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          if (wasJustUpdated()) {
            // نفس حالة العالق بعد التفعيل — فعّل بصمت بدل إزعاج المستخدم
            registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
            return;
          }
          waitingUpdateListeners.forEach((cb) => cb(registration));
        }
      });
    });

    // سياسة التحديث (آمنة — بلا skipWaiting من install):
    // 1) SW جديد يثبت بالخلفية → waiting
    // 2) المستخدم يضغط «تحديث الآن» → SKIP_WAITING
    // 3) controllerchange → reload واحد فقط
    // 4) activate في sw.js يمسح كاشات الإصدار القديم تلقائيًا
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (updateReloadInProgress) return;
      updateReloadInProgress = true;
      window.location.reload();
    });

    // FIX SW-UPDATE-DETECTION-01: تشغيل فحص التحديث الآن فورًا، بلا انتظار
    // نافذة الـ 24 ساعة التي يفرضها المتصفح على register() عند وجود تسجيل
    // قائم. بدون هذا الاستدعاء الفوري، أول فحص يحدث بعد ساعة كاملة (كان
    // UPDATE_CHECK_MS = 60 دقيقة) — طويل جدًا ليكتشف النشر الجديد في
    // جلسة استخدام عادية. هذا هو السبب الفعلي الذي جعل شريط "تحديث متوفر"
    // لا يظهر في الاختبار بعد كل نشر جديد.
    void registration.update().catch(() => undefined);

    // فحص دوري — الآن كل 5 دقائق بدل ساعة. trade-off: طلب واحد صغير من
    // المتصفح لـ /sw.js (الرد 304 عادةً) كل 5 دقائق لكل مستخدم نشط. على
    // شبكة غزة الضعيفة هذا مقبول (few hundred bytes for If-None-Match +
    // 304 Not Modified response) مقابل ضمان وصول التحديثات خلال دقائق
    // لا ساعات.
    const UPDATE_CHECK_MS = 5 * 60 * 1000;
    const checkUpdate = () => {
      // لا تفحص أثناء نافذة ما بعد التفعيل — يقلل حلقة waiting من sw.js غير المستقر
      if (wasJustUpdated()) return;
      // FIX SW-UPDATE-DETECTION-01 (تابع): بدون هذا الشرط، طلب الفحص
      // أثناء offline يُلقي خطأ صامتًا، ويفوت على المستخدم فرصة اكتشاف
      // تحديث نُشِر ثم عاد الاتصال. الآن نفحص فوراً عند 'online' بدل
      // انتظار 5 دقائق.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      void registration.update().catch(() => undefined);
    };
    window.setInterval(checkUpdate, UPDATE_CHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkUpdate();
    };
    document.addEventListener('visibilitychange', onVisible);
    // FIX SW-UPDATE-DETECTION-01: حدث 'online' — أهم trigger في سيناريو
    // شبكة غزة (المستخدم يفقد الاتصال ويرجع كثيرًا). كان UPDATE_CHECK ينتظر
    // 5 دقائق كاملة رغم أن الفرصة الآن مثالية. نفس نمط useOnlineStatus
    // بباقي التطبيق.
    window.addEventListener('online', checkUpdate);

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
    markJustUpdated();
    onStage?.('reloading');
    window.location.reload();
    return;
  }
  onStage?.('activating');
  markJustUpdated();
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


/** حالة إذن Notification API في المتصفح (منفصل عن وجود اشتراك Push). */
export function getBrowserNotificationPermission():
  | 'granted'
  | 'denied'
  | 'default'
  | 'unsupported' {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission as 'granted' | 'denied' | 'default';
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
  );
}

export async function getPushSubscriptionState(): Promise<'subscribed' | 'unsubscribed' | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported';
  const registration = await getReadySW();
  if (!registration) return 'unsupported';
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? 'subscribed' : 'unsubscribed';
}

/**
 * يطلب إذن الإشعارات، ينشئ اشتراك Push، ويرسله للباك-إند لحفظه
 * عبر `POST /notifications/push-subscriptions`.
 * يتطلب NEXT_PUBLIC_VAPID_PUBLIC_KEY مطابقًا لـ VAPID_PUBLIC_KEY في الباك-إند.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const vapidPublicKey = getVapidPublicKey();
  if (!vapidPublicKey) {
    console.warn('NEXT_PUBLIC_VAPID_PUBLIC_KEY غير مضبوط — لا يمكن تفعيل الإشعارات.');
    return false;
  }

  // FIX PWA-NOTIF-PERMISSION: requestPermission قد يرمي على بعض
  // المتصفحات/السياقات → نلتقط.
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch (err) {
    console.warn('[push] requestPermission failed:', err);
    return false;
  }
  if (permission !== 'granted') return false;

  const registration = await getReadySW();
  if (!registration) return false;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  try {
    await apiClient.post('/notifications/push-subscriptions', subscription.toJSON());
    return true;
  } catch (err) {
    // لو فشل حفظ الاشتراك في الباك-إند يبقى المتصفح مشتركًا دون أن يعرف الخادم —
    // نتراجع محليًا فورًا لإبقاء الحالتين متطابقتين.
    await subscription.unsubscribe().catch(() => undefined);
    throw err;
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await getReadySW();
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await apiClient
    .delete('/notifications/push-subscriptions', { data: { endpoint } })
    .catch(() => undefined); // فشل حذف السجل من الخادم لا يجب أن يمنع الإلغاء المحلي
}

/**
 * مزامنة صامتة للاشتراك بعد تسجيل الدخول:
 * - لا يطلب إذنًا جديدًا إن كان مرفوضًا أو لم يُمنح بعد (default).
 * - إن كان الإذن granted والاشتراك موجودًا → يعيد إرسال الـendpoint للخادم
 *   (يعالج حذف صف من DB أو تبديل حساب على نفس الجهاز).
 * - إن كان الإذن granted ولا يوجد اشتراك محلي → ينشئ اشتراكًا ويحفظه.
 * لا يرمي أخطاء للمستخدم؛ فشل الشبكة يُتجاهل بهدوء.
 */
export async function ensurePushSubscriptionSynced(): Promise<'synced' | 'subscribed' | 'skipped'> {
  if (!isPushSupported()) return 'skipped';
  const vapidPublicKey = getVapidPublicKey();
  if (!vapidPublicKey) return 'skipped';
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return 'skipped';
  }

  try {
    const registration = await getReadySW();
    if (!registration) return 'skipped';
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      try {
        await apiClient.post('/notifications/push-subscriptions', subscription.toJSON());
        return 'subscribed';
      } catch {
        await subscription.unsubscribe().catch(() => undefined);
        return 'skipped';
      }
    }

    try {
      await apiClient.post('/notifications/push-subscriptions', subscription.toJSON());
      return 'synced';
    } catch {
      return 'skipped';
    }
  } catch {
    return 'skipped';
  }
}

