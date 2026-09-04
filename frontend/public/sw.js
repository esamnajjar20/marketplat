/**
 * Service Worker — سوق غزة PWA
 *
 * استراتيجيات التخزين المؤقت:
 *  - App Shell (HTML/CSS/JS الأساسية): Stale-While-Revalidate
 *  - الصور (Cloudinary + الأيقونات المحلية): Cache First مع حد أقصى للعمر
 *  - طلبات API (GET): Network First مع fallback على الكاش عند انقطاع الشبكة
 *  - طلبات API (POST/PUT/PATCH/DELETE) الفاشلة بسبب انقطاع الشبكة: تُحفظ في
 *    IndexedDB Queue وتُعاد تلقائيًا عند عودة الاتصال (Background Sync)
 *  - لا كاش إطلاقًا لطلبات auth (/auth/*) لتفادي تسريب أو تقديم بيانات جلسة قديمة
 *
 * الإصدار أدناه (CACHE_VERSION) يجب رفعه يدويًا مع كل تغيير في استراتيجية
 * الكاش أو أصول الـ App Shell — هذا ما يضمن تحديث المستخدمين تلقائيًا وعدم
 * بقائهم على نسخة قديمة من التطبيق (bug شائع في PWAs المبنية بسرعة).
 *
 * ملاحظة استعادة: هذا الملف كان مبتورًا (فقط الترويسة + ثوابت أسماء الكاش)
 * — أعيد بناؤه بالكامل بالاعتماد على العقود الموثّقة صراحة في lib/pwa.ts،
 * lib/offlineQueue.ts، lib/offlineCoreBundle.ts، lib/offlineRouteShells.ts،
 * backend/.../pushService.ts، و__tests__/unit/lib/sw.test.ts (المصدر الوحيد
 * القابل للتحقق آليًا من بين كل هذه المراجع). isProtectedPage/isNeverCache/
 * isApiRequest ومستمع CLEAR_API_CACHE مطابقة لذلك الاختبار حرفيًا. باقي
 * المنطق (fetch strategies, IndexedDB queue, background sync, push) غير
 * مُغطى باختبارات — مبني على التعليقات المرجعية بأمانة قدر الإمكان لكنه لم
 * يُشغَّل فعليًا بمتصفح حقيقي في هذه الجلسة (لا شبكة/build متاح هنا).
 */

const CACHE_VERSION = 'v4';
const STATIC_CACHE = `market-static-${CACHE_VERSION}`;
const IMAGE_CACHE = `market-images-${CACHE_VERSION}`;
const API_CACHE = `market-api-${CACHE_VERSION}`;
// PHASE-1 (Offline Core Bundle): كاش منفصل عن API_CACHE عمدًا. API_CACHE
// محدود بـ MAX_API_ENTRIES=60 ويُقلَّم بترتيب FIFO تقريبي (انظر trimCache) —
// أي تصفح عادي بعد warm-up كافٍ لإخراج طلبات الحزمة الأساسية (تصنيفات/
// منتجات مميزة/متاجر) من الكاش قبل ما يحتاجها المستخدم فعليًا بدون نت.
// CORE_CACHE لا يُقلَّم أبدًا تلقائيًا — يُحدَّث فقط عبر warmCoreBundle()
// (lib/offlineCoreBundle.ts) صراحة، فيبقى ثابت المحتوى بين مرات التصفح.
const CORE_CACHE = `market-core-${CACHE_VERSION}`; // يجب مطابقة lib/offlineCoreBundle.ts's CORE_CACHE حرفيًا

const MAX_API_ENTRIES = 60;
const OFFLINE_URL = '/offline';

// يجب مطابقة lib/offlineQueue.ts حرفيًا — الصفحة تقرأ من نفس القاعدة/المخزن.
const QUEUE_DB_NAME = 'market-offline-queue';
const QUEUE_DB_VERSION = 1;
const QUEUE_STORE_NAME = 'requests';

const SYNC_TAG = 'replay-offline-queue';

// ── تصنيف الطلبات ───────────────────────────────────────────────

/**
 * صفحات محمية/شخصية — لا تُقرأ ولا تُكتب أبدًا في STATIC_CACHE (audit #7):
 * محتواها خاص بالمستخدم، وتخزينه يخاطر بعرضه لمستخدم آخر على نفس الجهاز.
 */
function isProtectedPage(url) {
  const protectedPrefixes = [
    '/dashboard',
    '/settings',
    '/my-ads',
    '/my-services',
    '/favorites',
    '/messages',
    '/ads/create',
    '/admin',
  ];
  return protectedPrefixes.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
  );
}

/** لا كاش إطلاقًا — مصادقة/CSRF. تسريب استجابة قديمة هنا أخطر من أي فائدة أوفلاين. */
function isNeverCache(url) {
  return url.pathname.includes('/auth/') || url.pathname.includes('/csrf');
}

function isApiRequest(url) {
  return url.pathname.includes('/api/');
}

/** الصور: destination='image' يغطي عناصر <img>، وفحص المضيف يغطي الجلب
 * البرمجي المباشر (fetch(url) من warmCoreBundle للصور المصغّرة) اللي لا
 * يحمل destination='image' لأنه ليس طلب موارد فرعي حقيقي من HTML. */
function isImageRequest(request, url) {
  if (request.destination === 'image') return true;
  return url.hostname.includes('cloudinary.com');
}

/** طلب RSC (تنقّل SPA ناعم) — Next.js App Router يرسله برأس RSC:'1' بدل
 * navigate كامل. انظر PHASE-3-B في lib/offlineRouteShells.ts للتفصيل. */
function isRscShellRequest(request) {
  return request.headers.get('RSC') === '1';
}

/** يجب مطابقة lib/offlineRouteShells.ts's rscShellKey() حرفيًا. */
function rscShellKey(pathname) {
  return `${pathname}?__offline_rsc_shell`;
}

// ── استراتيجيات التخزين ─────────────────────────────────────────

/** يحذف رأس Vary قبل التخزين — نفس منطق offlineRouteShells.ts's
 * stripVaryAndClone، لأن Cache API يرفض المطابقة لاحقًا لو بقي Vary حاضرًا
 * حتى مع تطابق مفتاح البحث تمامًا. */
async function stripVaryAndClone(response) {
  const headers = new Headers(response.headers);
  headers.delete('Vary');
  const body = await response.blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Stale-While-Revalidate عام — يُستخدم لصفحات App Shell العامة (navigate +
 * RSC shells) ولأصول JS/CSS الثابتة. يرجع النسخة المخزَّنة فورًا إن وُجدت
 * (سرعة + عمل أوفلاين)، ويحدّث الكاش بالخلفية دائمًا عبر event.waitUntil. */
async function staleWhileRevalidate(event, request, cacheKey) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(cacheKey);

  const networkFetch = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        const toStore = isRscShellRequest(request)
          ? await stripVaryAndClone(response.clone())
          : response.clone();
        await cache.put(cacheKey, toStore);
      }
      return response;
    })
    .catch(() => undefined);

  event.waitUntil(networkFetch);

  if (cachedResponse) return cachedResponse;

  const networkResponse = await networkFetch;
  if (networkResponse) return networkResponse;

  const offlineFallback = await cache.match(OFFLINE_URL);
  return offlineFallback || Response.error();
}

/** تنقّل/RSC لصفحة محمية: شبكة فقط، بدون أي قراءة أو كتابة على STATIC_CACHE
 * (audit #7). عند فشل الشبكة، أقصى ما نقدّمه صفحة /offline العامة نفسها —
 * وليس أي نسخة مخزَّنة من الصفحة المحمية (لا توجد أصلًا). */
async function handleProtectedPage(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(STATIC_CACHE);
    const offlineFallback = await cache.match(OFFLINE_URL);
    return offlineFallback || Response.error();
  }
}

async function handlePageRequest(event, request, url) {
  if (isProtectedPage(url)) {
    return handleProtectedPage(request);
  }
  const cacheKey = isRscShellRequest(request) ? rscShellKey(url.pathname) : request;
  return staleWhileRevalidate(event, request, cacheKey);
}

/** Cache First للصور — تُخزَّن لأجل غير مسمى (لا تنتهي صلاحيتها تلقائيًا هنا؛
 * حجم كاش الصور محدود عمليًا بعدد الصور المعروضة فعليًا للمستخدم). */
async function cacheFirstImage(event, request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      event.waitUntil(cache.put(request, response.clone()));
    }
    return response;
  } catch {
    return Response.error();
  }
}

/** يُبقي API_CACHE ضمن MAX_API_ENTRIES بترتيب FIFO تقريبي — cache.keys()
 * يرجع بترتيب الإدخال تقريبًا في المتصفحات الحالية، وهذا كافٍ هنا (ليس
 * ترتيبًا مضمونًا بالمواصفة لكنه سلوك عملي مقبول لتقليم غير حرج). */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const excess = keys.length - maxEntries;
  for (let i = 0; i < excess; i += 1) {
    await cache.delete(keys[i]);
  }
}

/** Network First لطلبات API (GET) — عند فشل الشبكة: API_CACHE أولًا (آخر
 * استجابة فعلية زارها المستخدم)، ثم CORE_CACHE (الحزمة الأساسية المحمَّلة
 * استباقيًا عبر warmCoreBundle لمسارات لم تُزَر من قبل). */
async function networkFirstApi(event, request, url) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      event.waitUntil(
        cache.put(request, response.clone()).then(() => trimCache(API_CACHE, MAX_API_ENTRIES)),
      );
    }
    return response;
  } catch {
    const cachedApi = await cache.match(request);
    if (cachedApi) return cachedApi;

    const coreCache = await caches.open(CORE_CACHE);
    const cachedCore = await coreCache.match(request.url);
    if (cachedCore) return cachedCore;

    return Response.error();
  }
}

// ── طابور الطلبات غير المتصلة (IndexedDB) ───────────────────────
// يجب أن يبقى DB_NAME/DB_VERSION/STORE_NAME مطابقًا تمامًا لـ lib/offlineQueue.ts.

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB_NAME, QUEUE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE_NAME)) {
        db.createObjectStore(QUEUE_STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueRequestEntry(entry) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE_NAME, 'readwrite');
    tx.objectStore(QUEUE_STORE_NAME).add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllQueuedEntries() {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE_NAME, 'readonly');
    const req = tx.objectStore(QUEUE_STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteQueuedEntry(id) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE_NAME, 'readwrite');
    tx.objectStore(QUEUE_STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** تُستدعى من حدث 'sync' (Background Sync) ومن رسالة REPLAY_QUEUE_NOW
 * (fallback يدوي للمتصفحات بلا Background Sync، خاصة iOS Safari — انظر
 * lib/offlineQueue.ts's requestQueueReplay). تُعيد المحاولة بترتيب الإدخال
 * وتتوقف عند أول فشل شبكي (لا يزال أوفلاين) لتحافظ على الترتيب وتتجنب
 * محاولات فاشلة متكررة بلا فائدة؛ خطأ خادم (4xx/5xx) يُسقط الطلب من الطابور
 * لأن إعادته لاحقًا لن تُغيّر النتيجة. */
async function replayQueue() {
  let entries;
  try {
    entries = await getAllQueuedEntries();
  } catch {
    return;
  }

  for (const entry of entries) {
    try {
      const response = await fetch(entry.url, {
        method: entry.method,
        headers: entry.headers,
        body: entry.body ?? undefined,
        credentials: 'same-origin',
      });
      if (response.ok || response.status < 500) {
        await deleteQueuedEntry(entry.id);
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  const clientsList = await self.clients.matchAll();
  clientsList.forEach((client) => client.postMessage({ type: 'QUEUE_REPLAYED' }));
}

/** طلبات API غير GET (POST/PUT/PATCH/DELETE) — عند فشل الشبكة تُحفظ بالطابور
 * وتُرجَع استجابة 202 {queued:true} يتعرّف عليها api/client.ts's response
 * interceptor فيمنع أي onSuccess/toast نجاح كاذب لعملية لم تصل فعليًا. */
async function handleMutation(request) {
  const requestForQueue = request.clone();
  try {
    return await fetch(request);
  } catch {
    let body = null;
    try {
      body = await requestForQueue.text();
    } catch {
      body = null;
    }
    const headers = {};
    requestForQueue.headers.forEach((value, key) => {
      headers[key] = value;
    });

    try {
      await queueRequestEntry({
        url: requestForQueue.url,
        method: requestForQueue.method,
        headers,
        body,
        queuedAt: Date.now(),
      });
    } catch {
      return Response.error();
    }

    if (self.registration && self.registration.sync) {
      try {
        await self.registration.sync.register(SYNC_TAG);
      } catch {
        // Background Sync غير مدعوم (iOS Safari مثلًا) — لا مشكلة، fallback
        // اليدوي عبر REPLAY_QUEUE_NOW (lib/offlineQueue.ts) يغطي هذه الحالة.
      }
    }

    return new Response(
      JSON.stringify({
        queued: true,
        message: 'لا يوجد اتصال — سيُعاد إرسال العملية تلقائيًا عند عودة الاتصال.',
      }),
      { status: 202, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

// ── دورة حياة الـ Service Worker ────────────────────────────────

self.addEventListener('install', (event) => {
  // FIX OFFLINE-PRECACHE: بدون هذا، cache.match(OFFLINE_URL) بـ
  // staleWhileRevalidate/handleProtectedPage يفشل دائمًا حتى يزور المستخدم
  // /offline بنفسه وهو أونلاين ولو مرة — يعني أول انقطاع اتصال فعلي
  // (بالضبط اللحظة اللي الصفحة مصمَّمة لأجلها) يُظهر خطأ شبكة خام بدل
  // الصفحة المصمَّمة. لا self.skipWaiting() هنا رغم ذلك — التفعيل يبقى
  // بإذن المستخدم فقط، انظر التعليق أسفل.
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(STATIC_CACHE);
        await cache.add(OFFLINE_URL);
      } catch {
        // فشل التخزين المسبق (مثلًا لا اتصال أصلًا وقت التثبيت، حالة نادرة)
        // لا يجب أن يوقف تثبيت الـ SW — ستُخزَّن لاحقًا بأول زيارة عادية
        // لها إن حدثت.
      }
    })(),
  );
  // عمدًا: لا self.skipWaiting() هنا. التفعيل يتم فقط بإذن المستخدم عبر
  // رسالة SKIP_WAITING (زر "تحديث الآن" بـ UpdatePrompt.tsx) — لا نريد
  // تحديثًا قسريًا وإعادة تحميل مفاجئة أثناء تعبئة نموذج. انظر lib/pwa.ts
  // وتعليق UpdatePrompt.tsx للتفصيل الكامل.
});

self.addEventListener('activate', (event) => {
  const currentCaches = [STATIC_CACHE, IMAGE_CACHE, API_CACHE, CORE_CACHE];
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('market-') && !currentCaches.includes(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;

  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (type === 'CLEAR_API_CACHE') {
    // SECURITY FIX (audit #2): تُستدعى عند تسجيل الخروج (useAuthMutations.ts's
    // clearServiceWorkerApiCache) — تمنع تسريب استجابات API مخزَّنة لمستخدم
    // سابق على جهاز مشترك للمستخدم التالي الذي يسجّل دخوله.
    event.waitUntil(caches.delete(API_CACHE));
    return;
  }

  if (type === 'REPLAY_QUEUE_NOW') {
    event.waitUntil(replayQueue());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(replayQueue());
  }
});

// ── Push Notifications ──────────────────────────────────────────
// الحمولة المتوقَّعة من backend/.../pushService.ts: { title, body, url?, tag? }

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || 'سوق غزة';
  const options = {
    body: data.body || '',
    tag: data.tag,
    renotify: Boolean(data.tag),
    data: { url: data.url || '/' },
    icon: '/icon-192',
    badge: '/icon-192',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    }),
  );
});

// ── Fetch ────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    if (isApiRequest(url) && !isNeverCache(url)) {
      event.respondWith(handleMutation(request));
    }
    return;
  }

  if (isNeverCache(url)) {
    return; // شبكة فقط — لا اعتراض، السلوك الافتراضي للمتصفح.
  }

  if (isImageRequest(request, url)) {
    event.respondWith(cacheFirstImage(event, request));
    return;
  }

  if (isApiRequest(url)) {
    event.respondWith(networkFirstApi(event, request, url));
    return;
  }

  if (request.mode === 'navigate' || isRscShellRequest(request)) {
    event.respondWith(handlePageRequest(event, request, url));
    return;
  }

  // أصول ثابتة أخرى (JS/CSS chunks إلخ) — نفس App Shell strategy.
  event.respondWith(staleWhileRevalidate(event, request, request));
});
