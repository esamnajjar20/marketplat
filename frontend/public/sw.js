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
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `market-static-${CACHE_VERSION}`;
const IMAGE_CACHE = `market-images-${CACHE_VERSION}`;
const API_CACHE = `market-api-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline';

// كل الكاشات الحالية — أي كاش قديم غير موجود هنا يُحذف عند التفعيل.
const CURRENT_CACHES = [STATIC_CACHE, IMAGE_CACHE, API_CACHE];

// أصول App Shell الأساسية — تُخزّن مسبقًا عند التثبيت.
// لا نضيف مسارات صفحات ديناميكية هنا (Next.js يولّد أسماء ملفات مع hash
// تتغير مع كل بناء)؛ الصفحات نفسها تُخزَّن تدريجيًا بمجرد زيارتها.
const PRECACHE_URLS = [OFFLINE_URL, '/manifest.webmanifest'];

// نقاط API التي لا يجب تخزينها مؤقتًا أبدًا (بيانات جلسة/مصادقة حساسة).
const NEVER_CACHE_PATTERNS = [/\/auth\//, /\/csrf/];

// امتداد الصور — كل ما يمر عبر Cloudinary أو next/image الداخلي.
const IMAGE_PATTERN = /\.(png|jpg|jpeg|webp|avif|svg|gif|ico)$/i;
const IS_CLOUDINARY = /res\.cloudinary\.com/;
const IS_NEXT_IMAGE = /\/_next\/image/;

// AUDIT-FIX (دفاع إضافي): مسارات صفحات محمية/إدارية — لا تُخزَّن أبدًا في
// STATIC_CACHE عبر معالج navigate أدناه. التصيير الحالي لهذه المسارات
// عميل بالكامل (CSR عبر Zustand، انظر (protected)/layout.tsx) لذا لا
// يوجد HTML خاص بالمستخدم يُصيَّر على الخادم حاليًا فعليًا — لكن هذا
// إجراء احترازي صريح بدل الاعتماد ضمنيًا على ذلك، يمنع أي تسريب لاحق
// إن تحوّل جزء من هذه الصفحات إلى SSR مستقبلًا، ونفس منطق "لا كاش
// لبيانات خاصة بالجلسة" المطبَّق أصلًا على /auth/ في NEVER_CACHE_PATTERNS.
const PROTECTED_PAGE_PREFIXES = [
  '/dashboard',
  '/settings',
  '/my-ads',
  '/my-services',
  '/favorites',
  '/messages',
  '/ads/create',
  '/admin',
];

function isProtectedPage(url) {
  return PROTECTED_PAGE_PREFIXES.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
  );
}

const MAX_IMAGE_ENTRIES = 120;
const MAX_API_ENTRIES = 60;

// ── دورة حياة الـ SW ────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // FIX SW-CRITICAL-01: cache.addAll() يفشل بالكامل (يرفض الـ Promise
      // ويُفشل حدث install كله) إذا فشل جلب أي عنصر واحد من القائمة —
      // ولو حدث هذا (شبكة بطيئة/متقطعة أثناء أول زيارة، بالضبط الجمهور
      // المستهدف هنا)، فإن الـ Service Worker لن يُثبَّت إطلاقًا ولن
      // تعمل أي استراتيجية كاش لاحقًا. نستبدلها بحلقة تخزين متسامحة:
      // فشل عنصر واحد لا يمنع تثبيت البقية أو تثبيت الـ SW نفسه.
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url);
            if (response && response.ok) {
              await cache.put(url, response);
            }
          } catch (err) {
            // سيُعاد جلبه لاحقًا عبر staleWhileRevalidate/networkFirst
            // بمجرد أول طلب فعلي للمسار — ليس مفقودًا نهائيًا.
          }
        }),
      );
      // FIX PWA-01: التخطي الفوري لمرحلة "waiting" يسمح بتفعيل النسخة
      // الجديدة فور تثبيتها بدلاً من انتظار إغلاق كل التبويبات المفتوحة —
      // نستخدمه بالتزامن مع رسالة SKIP_WAITING القادمة من الواجهة (انظر
      // أسفل) بدلاً من التفعيل التلقائي، لإعطاء المستخدم فرصة لحفظ عمله.
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

// يسمح للواجهة بإجبار الـ SW الجديد على التفعيل فورًا (زر "تحديث الآن").
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── أدوات مساعدة للكاش ──────────────────────────────────────────

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    // حذف الأقدم أولًا (ترتيب الإدراج في Cache API يحافظ على ترتيب FIFO تقريبي)
    await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
  }
}

function isNeverCache(url) {
  return NEVER_CACHE_PATTERNS.some((pattern) => pattern.test(url.pathname));
}

function isImageRequest(request, url) {
  return (
    request.destination === 'image' ||
    IMAGE_PATTERN.test(url.pathname) ||
    IS_CLOUDINARY.test(url.hostname) ||
    IS_NEXT_IMAGE.test(url.pathname)
  );
}

function isApiRequest(url) {
  // يطابق نمط API_BASE_URL في lib/constants.ts (باك-إند على origin مختلف
  // عادة، لذا لا نتحقق من نفس الـ origin فقط بل من مسار /api/).
  return url.pathname.includes('/api/');
}

// ── استراتيجية: Stale-While-Revalidate (App Shell) ──────────────

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  return cached || (await networkFetch) || Response.error();
}

// ── استراتيجية: Cache First (الصور) ─────────────────────────────

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
      trimCache(cacheName, maxEntries);
    }
    return response;
  } catch (err) {
    // لا صورة مخزّنة ولا اتصال — نترك المتصفح/المكوّن يتعامل مع الفشل
    // (المكونات تعرض placeholder عند فشل تحميل الصورة).
    throw err;
  }
}

// ── استراتيجية: Network First (بيانات API متغيرة) ───────────────

async function networkFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    // نخزّن فقط استجابات GET الناجحة — لا نخزّن أبدًا الأخطاء أو
    // نتائج الطلبات المتحولة (Mutations لا تصل هنا أصلًا، انظر fetch handler).
    if (response && response.ok && request.method === 'GET') {
      await cache.put(request, response.clone());
      trimCache(cacheName, maxEntries);
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    throw err;
  }
}

// ── طابور الطلبات الفاشلة (Background Sync) ─────────────────────
// IndexedDB بدلاً من Cache API لأننا نحتاج تخزين بيانات منظّمة (method, body,
// headers) وليس مجرد استجابة HTTP.

const DB_NAME = 'market-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'requests';

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueFailedRequest(request) {
  const db = await openQueueDb();
  const body = ['GET', 'HEAD'].includes(request.method) ? null : await request.clone().text();

  // FIX SW-CRITICAL-03: تخزين كل الرؤوس كما هي وإعادة إرسالها لاحقًا حرفيًا
  // قد يفشل — بعض الرؤوس (Content-Length, Host, Connection, Cookie...) هي
  // "forbidden request headers" لا يُسمح بضبطها يدويًا عبر fetch()، وبعض
  // المتصفحات ترفض الطلب بالكامل إن وُجدت. نحتفظ فقط بالرؤوس الآمنة
  // والضرورية فعليًا لإعادة تشغيل الطلب (Content-Type + رؤوس المصادقة/CSRF
  // المخصصة التي يضيفها api/client.ts).
  const SAFE_HEADER_ALLOWLIST = ['content-type', 'authorization', 'x-csrf-token'];
  const headers = {};
  request.headers.forEach((value, key) => {
    if (SAFE_HEADER_ALLOWLIST.includes(key.toLowerCase())) {
      headers[key] = value;
    }
  });

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add({
      url: request.url,
      method: request.method,
      headers,
      body,
      timestamp: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function replayQueuedRequests() {
  // ملاحظة: X-CSRF-Token المُعاد إرساله هنا هو نفسه المخزَّن وقت الفشل
  // الأصلي — إن انتهت صلاحيته أو تغيّر (تسجيل خروج/دخول جديد أثناء انقطاع
  // الاتصال)، سيرفضه الخادم بـ 403. هذا مقصود وآمن: أي استجابة 4xx تُحذف
  // من الطابور أدناه بدل إعادة محاولتها إلى الأبد؛ العملية تُفقد بدل أن
  // تُنفَّذ بهوية/صلاحية غير صحيحة.
  const db = await openQueueDb();
  const all = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  for (const entry of all) {
    try {
      const response = await fetch(entry.url, {
        method: entry.method,
        headers: entry.headers,
        body: entry.body,
        credentials: 'include',
      });
      if (response.ok) {
        const db2 = await openQueueDb();
        const tx = db2.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(entry.id);
      }
      // استجابة غير ناجحة (مثلًا 401/409) تبقى في الطابور فقط إذا كانت
      // خطأ شبكة حقيقي؛ خطأ منطقي من الخادم يُحذف لتفادي إعادة محاولة لا نهائية.
      else if (response.status >= 400 && response.status < 500) {
        const db2 = await openQueueDb();
        const tx = db2.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(entry.id);
      }
    } catch (err) {
      // ما زال بدون اتصال — نتوقف ونحاول لاحقًا بدل استهلاك الطابور بالكامل بأخطاء
      break;
    }
  }

  // إبلاغ كل التبويبات المفتوحة أن الطابور تغيّر (لتحديث أي UI لعدد الطلبات المعلّقة)
  const clientsList = await self.clients.matchAll();
  clientsList.forEach((client) => client.postMessage({ type: 'QUEUE_UPDATED' }));
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'replay-queue') {
    event.waitUntil(replayQueuedRequests());
  }
});

// بعض المتصفحات (iOS Safari, بعض متصفحات Android القديمة) لا تدعم
// Background Sync API إطلاقًا — نعيد المحاولة أيضًا عند أول 'online' event
// تراه صفحة مفتوحة، عبر رسالة من الواجهة (انظر lib/offlineQueue.ts).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'REPLAY_QUEUE_NOW') {
    event.waitUntil(replayQueuedRequests());
  }
});

// SECURITY FIX: networkFirst() (طلبات API) يخزّن الاستجابات مفتاحةً
// بالـ URL فقط، بدون أي ربط بهوية المستخدم أو التوكن. لا شيء كان يُفرّغ
// هذا الكاش عند تسجيل الخروج — على جهاز مشترك، أول انقطاع شبكة بعد أن
// يسجّل مستخدم آخر دخوله كان يمكن أن يُعيد تقديم استجابات API الخاصة
// بالمستخدم السابق (مثل /sellers/me/profile أو /service-requests/me).
// الواجهة الأمامية الآن ترسل هذه الرسالة من useClearLocalSession عند كل
// تسجيل خروج (logout و logout-all)، فورًا بعد queryClient.clear().
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_API_CACHE') {
    event.waitUntil(caches.delete(API_CACHE));
  }
});

// ── معالج fetch الرئيسي ──────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // تجاهل تمامًا: chrome-extension, ws(s), إلخ.
  if (!request.url.startsWith('http')) return;

  // لا كاش أبدًا لمسارات المصادقة — بيانات حساسة ومتغيرة باستمرار.
  if (isNeverCache(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // تنقّل بين الصفحات (HTML) — SWR مع fallback على صفحة /offline.
  if (request.mode === 'navigate') {
    // AUDIT-FIX: صفحات محمية/إدارية — لا تُخزَّن إطلاقًا (لا قراءة ولا
    // كتابة كاش)، فقط شبكة مباشرة مع fallback على /offline عند الفشل.
    // يمنع أي احتمال لعرض هيكل/محتوى صفحة كانت خاصة بمستخدم سابق على
    // نفس الجهاز، بنفس فلسفة NEVER_CACHE_PATTERNS لمسارات /auth/.
    if (isProtectedPage(url)) {
      event.respondWith(
        fetch(request).catch(async () => {
          const cache = await caches.open(STATIC_CACHE);
          return (await cache.match(OFFLINE_URL)) || Response.error();
        }),
      );
      return;
    }

    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, response.clone());
          return response;
        } catch (err) {
          const cache = await caches.open(STATIC_CACHE);
          const cached = await cache.match(request);
          return cached || (await cache.match(OFFLINE_URL));
        }
      })(),
    );
    return;
  }

  // صور (محلية أو Cloudinary أو next/image proxy) — Cache First.
  if (isImageRequest(request, url)) {
    event.respondWith(
      cacheFirst(request, IMAGE_CACHE, MAX_IMAGE_ENTRIES).catch(async () => {
        // FIX SW-CRITICAL-02: caches.match() قد يُرجع undefined لو لم
        // تُخزَّن '/icon-512' مسبقًا (ليست في PRECACHE_URLS، وقد لا تكون
        // قد طُلبت بعد) — event.respondWith() لا يقبل undefined إطلاقًا
        // ويُفشل الطلب في المتصفح بدل عرض احتياطي. نضمن دائمًا Response
        // صالحة، وإن تعذّر إيجاد أي شيء في الكاش نُرجع استجابة فارغة
        // بدل استثناء غير معالَج.
        const fallback = await caches.match('/icon-512');
        return fallback || new Response(null, { status: 404 });
      }),
    );
    return;
  }

  // طلبات API.
  if (isApiRequest(url)) {
    if (request.method === 'GET') {
      event.respondWith(networkFirst(request, API_CACHE, MAX_API_ENTRIES));
      return;
    }

    // Mutations (POST/PUT/PATCH/DELETE): لا كاش إطلاقًا. عند فشل الشبكة
    // (لا استجابة خادم إطلاقًا) نضع الطلب في الطابور لإعادة الإرسال لاحقًا،
    // بدل فشله بصمت وفقدان عمل المستخدم — هذا هو جوهر متطلب "إنترنت ضعيف".
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch (err) {
          await queueFailedRequest(request.clone());
          if ('sync' in self.registration) {
            try {
              await self.registration.sync.register('replay-queue');
            } catch (_) {
              /* Background Sync غير مدعوم — سيُعاد المحاولة عند رسالة REPLAY_QUEUE_NOW */
            }
          }
          return new Response(
            JSON.stringify({
              queued: true,
              message: 'لا يوجد اتصال بالإنترنت — سيُعاد إرسال الطلب تلقائيًا عند عودة الاتصال.',
            }),
            { status: 202, headers: { 'Content-Type': 'application/json' } },
          );
        }
      })(),
    );
    return;
  }

  // كل الطلبات الأخرى (CSS/JS/fonts الخاصة بـ Next.js): SWR بسيط.
  event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
});

// ── Push Notifications ──────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (err) {
    payload = { title: 'سوق غزة', body: event.data.text() };
  }

  const title = payload.title || 'سوق غزة';
  const options = {
    body: payload.body || '',
    icon: '/icon-192',
    badge: '/icon-192',
    dir: 'rtl',
    lang: 'ar',
    // url تُستخدم عند الضغط على الإشعار لفتح الصفحة المناسبة
    // (تفصيل إعلان، محادثة، طلب خدمة... إلخ) — يُحدَّدها الباك-إند عند الإرسال.
    data: { url: payload.url || '/' },
    tag: payload.tag || undefined,
    renotify: Boolean(payload.tag),
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // إن كانت الصفحة مفتوحة أصلًا في تبويب، ركّز عليه بدل فتح تبويب جديد.
      for (const client of clientsList) {
        const clientUrl = new URL(client.url);
        if (clientUrl.pathname === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
