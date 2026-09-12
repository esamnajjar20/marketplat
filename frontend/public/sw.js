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

// FIX PWA-VER-01: كان CACHE_VERSION هنا 'v5' بينما lib/offlineRouteShells.ts
// وlib/offlineCoreBundle.ts (اللذان يفترض أن يطابقا هذه القيمة "حرفيًا" حسب
// تعليقاتهما الخاصة) كانا لا يزالان مثبَّتين على 'v4' — عدم تطابق حقيقي كان
// يعني: (1) warmRouteShells() تكتب شِلال الصفحات العامة المُسخَّنة مسبقًا
// (/, /products, /stores...) في كاش 'market-static-v4' الذي لا يقرأ منه
// معالج fetch هنا أبدًا (يقرأ من STATIC_CACHE = market-static-v5)، و(2)
// 'activate' أدناه يحذف أي كاش يبدأ بـ market- وليس ضمن currentCaches —
// فكاش v4 كان يُمسح فورًا بعد كل تفعيل SW جديد. نفس المشكلة بالضبط
// لـ CORE_CACHE (PHASE-1 Offline Core Bundle). النتيجة العملية: ميزتا
// "تصفّح المسارات العامة بدون نت" و"الحزمة الأساسية بدون نت" كانتا معطَّلتين
// فعليًا رغم وجود الكود بالكامل. رُفع CACHE_VERSION هنا إلى 'v6' وطُبِّق نفس
// الرقم بالملفين الآخرين لإعادة المزامنة (انظر تعليقيهما).
// FIX SW-CAPTIVE-01: رُفع إلى v7 عمدًا (وليس مجرد تغيير منطق بلا أثر على
// الكاش) — v6 قد يحمل بالفعل صفحات/ردود ملوَّثة كُتبت قبل هذا الإصلاح
// (captive portal بحالة 200 خُزِّن كـ "شكل صفحة حقيقي"). رفع الرقم يفرّغ
// تلك الكاشات القديمة عبر 'activate' أدناه بدل الاكتفاء بمنع تلوّث جديد —
// إصلاح المنطق فقط لا يصلح حالة مستخدم متضرر بالفعل بنسخة v6.
// FIX SW-AUTH-PAGE-01: رُفع إلى v8 لنفس سبب رفعات v7/v6 أعلاه — مستخدمون
// حاليون عندهم بالفعل نسخة قديمة من /login أو /register محفوظة بـ
// STATIC_CACHE v7 من قبل هذا الإصلاح (من أول زيارة لهم وهم غير مسجّلين
// دخول). إصلاح المنطق فقط يمنع تخزين نسخ قديمة *جديدة* لكن لا يمسح
// الموجودة أصلًا — رفع الرقم يفرّغها عبر 'activate' أدناه.
// FIX SW-NAV-NETFIRST-01: رُفع إلى v9 — نفس منطق FIX SW-AUTH-PAGE-01
// تحديدًا وسِّع الآن ليشمل *كل* صفحات App Shell العامة، وليس صفحات
// المصادقة فقط (انظر تعليق networkFirstPage أدناه للتفصيل الكامل).
// رفع الرقم هنا يفرّغ أي نسخة HTML/RSC قديمة كانت مخزَّنة بـ
// STATIC_CACHE v8 عبر Stale-While-Revalidate القديم — نفس السبب: إصلاح
// المنطق فقط يمنع تخزين نسخ قديمة *جديدة*، لا يمسح الموجودة أصلًا.
// FIX SW-OFFLINE-FALLBACK-SCOPE-01: رُفع إلى v11 — صفحة /offline كانت تُعاد
// كردّ حتى لطلبات أصول ثابتة (JS/CSS) عند فشل الشبكة داخل
// staleWhileRevalidate، فظهرت للمستخدم «في كل طلب» تقريبًا بدل أن تظهر
// فقط عند تنقّل حقيقي لصفحة غير مخزَّنة. تقييد الـfallback + إصلاح زر
// إعادة المحاولة يستدعي إفراغ الكاشات القديمة.
// FIX SW-AUTH-PASSTHROUGH-01 + SW-NO-FORCE-OFFLINE-RSC-01: رُفع إلى v12 —
// (1) صفحات login/register ما عاد الـSW يعترضها إطلاقًا (كانت تسبب صفحة
// بيضاء بعد كل تعديل أوفلاين حتى مسح البيانات). (2) فشل تنقّل SPA/RSC
// بدون كاش ما عاد يفرض الانتقال لـ/offline — يبقى المستخدم على صفحته.
// ارفع CACHE_VERSION فقط عند تغيّر سياسة الكاش / الـ shells / استراتيجيات fetch
// في هذا الملف — وليس مع كل deploy لا يمسّ SW. عند التفعيل (activate) تُمسَح
// كاشات market-* القديمة تلقائيًا. لا تستدعِ skipWaiting() من install.
const CACHE_VERSION = 'v16';
const STATIC_CACHE = `market-static-${CACHE_VERSION}`;
const IMAGE_CACHE = `market-images-${CACHE_VERSION}`;
const API_CACHE = `market-api-${CACHE_VERSION}`;
// FEAT-OFFLINE-MSG (وسِّع لاحقًا ليشمل /notifications، انظر
// isPersonalShellRoute أدناه): كاش شكل الصفحة (page shell) لمسارات محمية
// "شخصية لكن بلا محتوى مُخصَّص فعليًا بالـ HTML/RSC" تحديدًا — بقية الصفحات
// المحمية (isProtectedPage) تبقى "شبكة فقط" كما كانت (audit #7: محتوى شخصي،
// لا يجوز تخزينه بجانب STATIC_CACHE العام). هذا الكاش مسموح استثناءً لأنه
// يُعامَل بنفس الحماية اللي API_CACHE أصلاً يُعامَل بها (وAPI_CACHE فعليًا
// يخزّن نفس درجة الحساسية — بيانات الرسائل/الإشعارات نفسها) — يُمسح بالكامل
// عند تسجيل الخروج (CLEAR_API_CACHE أدناه) بدل تركه محفوظًا لمستخدم تالٍ
// على جهاز مشترك.
const PERSONAL_SHELL_CACHE = `market-personal-shell-${CACHE_VERSION}`;
// PHASE-1 (Offline Core Bundle): كاش منفصل عن API_CACHE عمدًا. API_CACHE
// محدود بـ MAX_API_ENTRIES=60 ويُقلَّم بترتيب FIFO تقريبي (انظر trimCache) —
// أي تصفح عادي بعد warm-up كافٍ لإخراج طلبات الحزمة الأساسية (تصنيفات/
// منتجات مميزة/متاجر) من الكاش قبل ما يحتاجها المستخدم فعليًا بدون نت.
// CORE_CACHE لا يُقلَّم أبدًا تلقائيًا — يُحدَّث فقط عبر warmCoreBundle()
// (lib/offlineCoreBundle.ts) صراحة، فيبقى ثابت المحتوى بين مرات التصفح.
const CORE_CACHE = `market-core-${CACHE_VERSION}`; // يجب مطابقة lib/offlineCoreBundle.ts's CORE_CACHE حرفيًا

// PHASE-OFFLINE-AD-DETAIL: كاش "الإعلانات المحفوظة يدويًا للعمل بدون
// اتصال" (زر بـ AdDetail.tsx، يديره lib/offlineSavedAds.ts). بدون رقم
// إصدار عمدًا — خلافًا لبقية الكاشات أعلاه، هذا اختيار صريح من المستخدم
// ولا يجب أن يُمسح تلقائيًا مع كل ترقية CACHE_VERSION عادية. يجب مطابقة
// lib/offlineSavedAds.ts's SAVED_ADS_CACHE حرفيًا، ويجب إضافته لقائمة
// currentCaches بـ 'activate' أدناه وإلا سيُحذف كأي كاش market-* غير معروف.
const SAVED_ADS_CACHE = 'market-saved-ads';

const MAX_API_ENTRIES = 60;
const OFFLINE_URL = '/offline';

// يجب مطابقة lib/offlineQueue.ts حرفيًا — الصفحة تقرأ من نفس القاعدة/المخزن.
const QUEUE_DB_NAME = 'market-offline-queue';
const QUEUE_DB_VERSION = 1;
const QUEUE_STORE_NAME = 'requests';

const SYNC_TAG = 'replay-offline-queue';

// FIX OFFLINE-AUTH-01: يجب مطابقة frontend's lib/constants.ts's
// API_BASE_URL حرفيًا (`${origin}/api/v1`) — انظر تعليق refreshAccessToken
// أدناه لسبب وجود هذا الثابت أصلًا.
const API_PATH_PREFIX = '/api/v1';

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
    // FIX PWA-NOTIF-01: كانت /notifications غائبة عن هذه القائمة رغم كونها
    // صفحة محمية شخصية بالكامل (تحت (protected) وتتطلب تسجيل دخول) — يعني
    // كانت تمر من handlePageRequest كصفحة "عامة" وتُخزَّن شكلها في
    // STATIC_CACHE العام (لا يُمسح عند تسجيل الخروج)، خلافًا لسياسة audit #7
    // الموثّقة أعلاه لبقية هذه القائمة بالضبط. لم يكن هذا يسرّب بيانات فعلية
    // (الصفحة 'use client' بالكامل ومحتوى الإشعارات يُجلب عبر React Query،
    // لا يُخبَز داخل HTML/RSC المخزَّن) لكنه تصنيف غير متسق وغير آمن
    // بالتصميم لأي تغيير مستقبلي بالصفحة. أُضيفت هنا والآن تُعامَل كصفحة
    // محمية بشِل مخزَّن آمن (انظر isPersonalShellRoute) بدل الاعتماد
    // بالصدفة على السلوك العام.
    '/notifications',
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

/** FIX SW-AUTH-PAGE-01: صفحات تسجيل الدخول/إنشاء الحساب — لازم تطابق
 * middleware.ts's AUTH_PATHS حرفيًا. هذي الصفحات كانت تمر بلا استثناء من
 * staleWhileRevalidate العام (نفس معاملة أي صفحة عامة)، فتُخزَّن أول
 * زيارة (وأنت غير مسجّل دخول) وتُعاد لاحقًا "فورًا من الكاش" حتى بعد ما
 * تسجّل دخول — قبل ما يصل الطلب أصلًا للسيرفر، يعني قبل ما يحصل middleware.ts
 * أي فرصة يشتغل تحويلته المعتادة (isLoggedIn → redirect لـ /dashboard).
 * النتيجة: مستند HTML قديم مبني على "غير مسجّل دخول" يُهيَّأ (hydrate)
 * فوق حالة عميل فعلية تقول "مسجّل دخول" (Zustand/localStorage) — تعارض
 * hydration ينتج عنه صفحة فاضية بالضبط. صفحات المصادقة، خلافًا لبقية
 * الصفحات العامة الموثّقة بـ lib/offlineRouteShells.ts (شكل ثابت لكل
 * زائر بأي وقت)، محتواها الصحيح يعتمد على حالة تسجيل الدخول تحديدًا —
 * فلا يجوز تخزينها إطلاقًا، شبكة فقط دائمًا، تمامًا مثل isNeverCache
 * أعلاه لكن لصفحات لا نقاط API. */
function isAuthPage(url) {
  const authPaths = ['/login', '/register', '/forgot-password', '/reset-password'];
  return authPaths.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));
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

/** FEAT-OFFLINE-MSG + FIX PWA-NOTIF-01: نطاق محدود عمدًا — /messages،
 * /messages/:id، و/notifications فقط، وليس كل isProtectedPage. هذه هي
 * المسارات المحمية الوحيدة التي رُوجعت وتحقّقنا أنها آمنة لتخزين شكلها
 * (لا بيانات مستخدم مخبوزة داخل HTML/RSC نفسه — كلتاهما 'use client' بالكامل
 * وتجلبان بياناتهما عبر React Query بعد الـ hydration). توسيعه لبقية
 * الصفحات المحمية (dashboard/settings/admin...) قرار منفصل يستأهل مراجعة
 * حساسية بيانات خاصة به لكل صفحة على حدة. */
function isPersonalShellRoute(url) {
  // يجب أن يغطي PERSONAL_SHELL_ROUTES في lib/offlineRouteShells.ts
  // + بادئات للفروع (محادثة، منتج متجر، إعدادات فرعية…).
  // لا يشمل /admin أبدًا.
  const path = url.pathname;
  const exact = [
    '/messages',
    '/notifications',
    '/dashboard',
    '/favorites',
    '/my-ads',
    '/saved-searches',
    '/activity',
    '/settings',
    '/settings/profile',
    '/settings/security',
    '/settings/sessions',
    '/settings/notifications',
    '/settings/seller',
    '/settings/service-provider',
    '/settings/blocked-users',
    '/settings/storage',
    '/my-store',
    '/my-store/inventory',
    '/my-store/members',
    '/my-store/products',
    '/my-store/promotions',
    '/my-store/collections',
    '/my-store/analytics',
    '/my-store/settings',
    '/my-services',
    '/my-services/requests',
    '/my-services/appointments',
    '/my-services/analytics',
    '/service-broadcasts',
    '/service-broadcasts/quotes',
    '/my-requests',
  ];
  if (exact.includes(path)) return true;
  if (path.startsWith('/messages/')) return true;
  if (path.startsWith('/settings/')) return true;
  if (path.startsWith('/my-store/')) return true;
  if (path.startsWith('/my-services/')) return true;
  if (path.startsWith('/service-broadcasts/')) return true;
  if (path.startsWith('/my-requests/')) return true;
  if (path.startsWith('/my-ads/')) return true;
  return false;
}

// ── استراتيجيات التخزين ─────────────────────────────────────────

/** FIX SW-CAPTIVE-01: `response.ok` (200-299) لوحده لا يثبت أن هذا الرد
 * فعلًا من سيرفر التطبيق. على نت جوال ضعيف/متقطّع، رد شائع جدًا هو صفحة
 * captive portal لمزوّد الشبكة (أو صفحة خطأ من CDN/edge) بحالة 200 —
 * "المتصفح" (وهنا الكود) لا يقدر يفرّق بينها وبين رد حقيقي إلا بفحص
 * إضافي. أوضح إشارة: التحويل (redirect) لأصل مختلف عن أصل الموقع نفسه —
 * هذا بالضبط توقيع captive portal النمطي. لو مرّ رد كهذا فات فحص
 * response.ok وتخزّن كـ "شكل الصفحة الحقيقي" بـ STATIC_CACHE/PERSONAL_SHELL_CACHE،
 * فسيُعاد تقديمه لاحقًا بثقة (stale-while-revalidate) لكل زيارة تالية،
 * حتى بعد عودة النت الفعلي، لحين ما تُستبدَل بنجاح صريح لاحق — وهذا يطابق
 * تمامًا عرض "نفس المشكلة تتكرر رغم أن النت شغّال". هذا الفحص لا يُطبَّق
 * على الصور (cacheFirstImage) لأن Cloudinary أصل مختلف شرعي بالتصميم.
 */
function isSameOriginResponse(response) {
  if (!response) return false;
  if (!response.redirected) return true;
  try {
    return new URL(response.url).origin === self.location.origin;
  } catch {
    return false;
  }
}

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

/** FIX SW-RSC-OFFLINE-01: OFFLINE_URL was pre-cached once, at install
 * time, via a plain `fetch('/offline')` — a full HTML document. Both
 * fallback sites below (staleWhileRevalidate and handleProtectedPage)
 * were returning that document unconditionally, with no check for
 * whether the *failing* request was itself a hard navigation (expects
 * full HTML — correct) or a soft/RSC navigation (Next.js's client
 * router expects a React Server Components stream, sent with header
 * `RSC: '1'`). Handing the router a full HTML document where it
 * expected an RSC stream isn't a graceful "here's the offline page" —
 * Next.js has no recovery path for a 200 response in the wrong shape,
 * so the in-flight transition just breaks silently: a blank page, not
 * even the offline screen. This reproduces exactly on the RSC fetch
 * Next.js sends for `router.push()` right after login, or any other
 * in-app Link navigation, whenever the network fails mid-request.
 *
 * There's no way to *serve* a correct fallback for an RSC request —
 * we don't have (and can't fabricate) a valid RSC stream for an
 * arbitrary page we never successfully rendered. The only honest fix
 * is to stop pretending the RSC fetch can be answered at all: force
 * the actual browser window to a real hard navigation to /offline
 * (which *does* correctly receive the cached full-HTML document, via
 * this same file's normal `request.mode === 'navigate'` path) and let
 * the original RSC fetch's promise just fail — the window is about to
 * navigate away regardless, so nothing consumes that rejection.
 */
// FIX SW-OFFLINE-REBOUNCE-01: كانت تستدعي client.navigate(OFFLINE_URL) بلا
// شرط — حتى لو كان المستخدم أصلاً واقف على /offline. فالنتيجة: أي ضغطة على
// زر بصفحة /offline نفسها (مثلاً "التنزيلات") تطلق طلب RSC فاشل (بما إنه
// لسا أوفلاين وما في اتصال)، فيُعاد تحميل نفس /offline من جديد — يظهر
// للمستخدم وكأن الصفحة "ترجع" بنفسها بعد كل ضغطة. الحل: لو الـclient أصلاً
// على /offline، ما في داعي لإعادة التنقّل لنفس الوجهة — نتجاهل الطلب
// ونخلي الفشل يمر بصمت (Response.error أدناه)، فتظهر صفحة /offline مرة
// واحدة فقط عند أول انقطاع فعلي، وتبقى ثابتة بعدها بدون Reload متكرر.
async function forceHardOfflineNavigation(event) {
  try {
    const client = event.clientId && (await self.clients.get(event.clientId));
    if (!client || !('navigate' in client)) return;

    const currentPath = client.url ? new URL(client.url).pathname : '';
    if (currentPath === OFFLINE_URL) return;

    client.navigate(OFFLINE_URL);
  } catch {
    // لا شيء إضافي يمكن فعله — الطلب الأصلي سيفشل بأي حال (Response.error أدناه).
  }
}

/** Stale-While-Revalidate عام — يُستخدم لصفحات App Shell العامة (navigate +
 * RSC shells) ولأصول JS/CSS الثابتة. يرجع النسخة المخزَّنة فورًا إن وُجدت
 * (سرعة + عمل أوفلاين)، ويحدّث الكاش بالخلفية دائمًا عبر event.waitUntil. */
async function staleWhileRevalidate(event, request, cacheKey) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(cacheKey);

  const networkFetch = fetch(request)
    .then(async (response) => {
      if (response && response.ok && isSameOriginResponse(response)) {
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

  // FIX SW-NO-FORCE-OFFLINE-RSC-01: فشل RSC بدون كاش → Response.error فقط.
  // لا نفرض الانتقال لـ/offline (كان يُزعج المستخدم عند كل رابط).
  if (isRscShellRequest(request)) {
    return Response.error();
  }

  // FIX SW-OFFLINE-FALLBACK-SCOPE-01: HTML /offline فقط لتنقّل حقيقي بلا كاش.
  if (request.mode === 'navigate') {
    const offlineFallback = await cache.match(OFFLINE_URL);
    return offlineFallback || Response.error();
  }

  return Response.error();
}

/** FIX SW-NAV-NETFIRST-01: شبكة أولًا لصفحات App Shell العامة (navigate +
 * RSC shells) — كانت سابقًا Stale-While-Revalidate (انظر تلك الدالة
 * أعلاه)، والتي تعرض النسخة المخزَّنة *فورًا* دون انتظار الشبكة، حتى لو
 * أصبح ذلك المستند يشير لملفات JS/CSS لم تعد موجودة على السيرفر —
 * أسماء تلك الملفات مبنية على content-hash يتغيّر مع كل نشر Next.js
 * جديد. هذه بالضبط نفس آلية الخلل الموثّق أعلاه لصفحات المصادقة (FIX
 * SW-AUTH-PAGE-01: "صفحة فاضية بالضبط") لكنها كانت محصورة هناك بصفحات
 * auth فقط، وعولجت بمنع الكاش عنها كليًا (شبكة فقط) لأن محتواها يعتمد
 * على حالة تسجيل الدخول (middleware.ts). صفحات App Shell العامة هنا
 * شكلها ثابت لكل زائر (lib/offlineRouteShells.ts) بغض النظر عن حالة
 * الدخول، فلا داعي لمنع الكاش عنها بالكامل كما فُعل هناك — يكفي تفضيل
 * الشبكة دائمًا، مع الإبقاء على آخر نسخة مخزَّنة كـ fallback فقط عند
 * انقطاع الاتصال (بدل عرضها أولًا وتحديثها بالخلفية كما كان). النتيجة:
 * أي زائر متصل بالإنترنت يرى دائمًا آخر نسخة منشورة فعليًا — لا فرق بعد
 * الآن بين أول تحميل بعد أي deploy والزيارات اللاحقة — يقفل هذه الفئة
 * من الأخطاء على مستوى كل صفحات الموقع، لا صفحات المصادقة فقط.
 *
 * ملاحظة مهمة: أصول JS/CSS/الخطوط الثابتة (تمر من معالج fetch أدناه كـ
 * "أصول ثابتة أخرى" في نهاية الملف) تبقى عمدًا على Stale-While-Revalidate
 * ولم تُغيَّر — أسماء تلك الملفات نفسها content-hashed وثابتة المحتوى
 * بشكل دائم (لا يوجد اسم ملف يُعاد استخدامه بمحتوى مختلف)، فلا يوجد خطر
 * "نسخة قديمة" لها أصلًا وتخزينها أولًا مكسب سرعة/أوفلاين بلا أي كلفة.
 * الخلل كان فقط بمستند الـ HTML/RSC الذي *يشير* لتلك الأسماء، وهو بالضبط
 * ما تعالجه هذه الدالة. */
async function networkFirstPage(event, request, cacheKey) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok && isSameOriginResponse(response)) {
      const toStore = isRscShellRequest(request)
        ? await stripVaryAndClone(response.clone())
        : response.clone();
      // event.waitUntil (لا await مباشر): لا داعي لتأخير الرد للمستخدم
      // بانتظار كتابة الكاش — نفس نمط handleProtectedPage/networkFirstApi.
      event.waitUntil(cache.put(cacheKey, toStore));
    }
    return response;
  } catch {
    // فشل الشبكة (أوفلاين) — آخر نسخة مخزَّنة فعليًا، إن وُجدت.
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) return cachedResponse;

    // FIX SW-NO-FORCE-OFFLINE-RSC-01: بلا إجبار /offline على فشل RSC.
    if (isRscShellRequest(request)) {
      return Response.error();
    }

    // فقط تنقّل حقيقي (mode=navigate) لصفحة غير موجودة في الكاش → /offline.
    if (request.mode === 'navigate') {
      const offlineFallback = await cache.match(OFFLINE_URL);
      return offlineFallback || Response.error();
    }

    return Response.error();
  }
}

/** تنقّل/RSC لصفحة محمية: شبكة أولًا، بدون أي قراءة أو كتابة على STATIC_CACHE
 * العام (audit #7 — يبقى ساريًا لكل الصفحات المحمية الأخرى). عند فشل
 * الشبكة، أقصى ما نقدّمه لغالبية الصفحات المحمية هو /offline نفسها —
 * لا نسخة مخزَّنة من الصفحة المحمية (لا توجد أصلًا).
 *
 * FEAT-OFFLINE-MSG + FIX PWA-NOTIF-01: استثناء محدود لمسارات الرسائل
 * والإشعارات فقط (isPersonalShellRoute) — "قراءة المحادثات/الإشعارات
 * المحفوظة أوفلاين" يتطلب أن يصل المستخدم أصلًا لشكل الصفحة (/messages،
 * /messages/:id، أو /notifications) حتى تقدر بياناتها (المخزَّنة أصلاً
 * بـ API_CACHE عبر networkFirstApi لطلبات API، وبـ localStorage عبر
 * lib/notificationsCache.ts للإشعارات تحديدًا) تُعرض؛ بدون هذا، أي تنقّل
 * (حتى soft-nav RSC) وهو أوفلاين كان يفشل عند طلب شكل الصفحة نفسه ويعرض
 * /offline العامة بدل المحتوى المخزَّن فعليًا. مخزَّن بـ PERSONAL_SHELL_CACHE
 * (كاش منفصل، يُمسح كاملًا عند تسجيل الخروج تمامًا مثل API_CACHE — انظر
 * تعليق تعريفه أعلاه). */
// FIX SW-ABORT-02: err.name === 'AbortError' does NOT reliably mean "a
// newer navigation superseded this one." A real connection drop/timeout
// on a flaky mobile network can *also* surface as AbortError (mobile
// browsers/OS abort long-running fetches on backgrounding, poor-signal
// timeouts, etc.) with no newer request actually in flight to replace
// it. SW-ABORT-01 re-threw every AbortError unconditionally on that
// false assumption — when there truly was no superseding navigation,
// re-throwing left the RSC fetch promise rejected with nothing else to
// resolve it, and Next.js's router had no fallback UI for that: a blank
// white page instead of /offline. This map tracks, per pathname, a
// monotonically increasing generation counter so we can tell the two
// cases apart: only re-throw (silently drop) when a *newer* request for
// the same path actually started after this one — a genuine superseded
// race. Otherwise fall through to the normal fallback path below, same
// as any other network failure.
const protectedNavGeneration = new Map();

async function handleProtectedPage(event, request, url) {
  const useShellCache = isPersonalShellRoute(url);
  const cacheKey = isRscShellRequest(request) ? rscShellKey(url.pathname) : request;

  const myGeneration = (protectedNavGeneration.get(url.pathname) || 0) + 1;
  protectedNavGeneration.set(url.pathname, myGeneration);

  try {
    const response = await fetch(request);
    if (useShellCache && response && response.ok && isSameOriginResponse(response)) {
      const cache = await caches.open(PERSONAL_SHELL_CACHE);
      const toStore = isRscShellRequest(request)
        ? await stripVaryAndClone(response.clone())
        : response.clone();
      await cache.put(cacheKey, toStore);
    }
    return response;
  } catch (err) {
    // FIX SW-ABORT-01 (refined by SW-ABORT-02 above): only treat this as
    // a superseded race — safe to re-throw and let it die quietly — when
    // a newer request for this same pathname was actually issued after
    // this one started. A newer generation number proves that; anything
    // else (including AbortError with no newer request behind it) is
    // treated as a real failure and falls through to the fallback below,
    // so the user always lands on something (cached shell or /offline)
    // instead of an unhandled rejection.
    const isSupersededRace =
      err && err.name === 'AbortError' && protectedNavGeneration.get(url.pathname) !== myGeneration;
    if (isSupersededRace) {
      throw err;
    }
    if (useShellCache) {
      const shellCache = await caches.open(PERSONAL_SHELL_CACHE);
      const cachedShell = await shellCache.match(cacheKey);
      if (cachedShell) return cachedShell;
    }
    // FIX SW-NO-FORCE-OFFLINE-RSC-01: فشل soft-nav لصفحة محمية بدون shell
    // مخزَّن → لا نُجبر /offline (يبقى المستخدم على الصفحة الحالية).
    if (isRscShellRequest(request)) {
      return Response.error();
    }
    // تنقّل حقيقي فقط لصفحة غير مخزَّنة → /offline.
    if (request.mode === 'navigate') {
      const cache = await caches.open(STATIC_CACHE);
      const offlineFallback = await cache.match(OFFLINE_URL);
      return offlineFallback || Response.error();
    }
    return Response.error();
  }
}

async function handlePageRequest(event, request, url) {
  if (isProtectedPage(url)) {
    return handleProtectedPage(event, request, url);
  }
  // FIX SW-AUTH-PASSTHROUGH-01: صفحات المصادقة لا يجب أن تمر من هنا أصلًا
  // (يُعاد مبكرًا من مستمع fetch). دفاع إضافي إن وصلت.
  if (isAuthPage(url)) {
    return fetch(request);
  }
  // FIX SW-NAV-NETFIRST-01: كان staleWhileRevalidate — انظر تعليق
  // networkFirstPage أعلاه للسبب الكامل.
  const cacheKey = isRscShellRequest(request) ? rscShellKey(url.pathname) : request;
  return networkFirstPage(event, request, cacheKey);
}

/** Cache First للصور — تُخزَّن لأجل غير مسمى (لا تنتهي صلاحيتها تلقائيًا هنا؛
 * حجم كاش الصور محدود عمليًا بعدد الصور المعروضة فعليًا للمستخدم). */
async function cacheFirstImage(event, request, url) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  // PHASE-OFFLINE-AD-DETAIL: صورة إعلان محفوظ يدويًا قد لا تكون مرّت
  // بعد بـ IMAGE_CACHE (مثلًا thumbnail بالأسفل بـ loading="lazy" لم
  // يُعرض فعليًا بعد) لكنها مخزَّنة صراحة بـ SAVED_ADS_CACHE عبر
  // lib/offlineSavedAds.ts's saveAdOffline — تحقّق منه قبل الشبكة.
  const savedCache = await caches.open(SAVED_ADS_CACHE);
  const savedHit = await savedCache.match(request);
  if (savedHit) return savedHit;

  // PHASE-OFFLINE-AD-DETAIL (fallback ثانٍ): Next.js Image Optimization
  // مفعّل (next.config.ts's images.remotePatterns)، فالطلب الفعلي اللي
  // المتصفح يرسله عبر <SafeImage>/next-image ليس رابط Cloudinary الخام
  // اللي saveAdOffline حفظه صراحة، بل /_next/image?url=<مُرمَّز>&w=...
  // بمقاس يختاره Next وقت العرض (يعتمد على حجم الشاشة/DPR — غير قابل
  // للتنبؤ به مسبقًا). فك ترميز ?url= هنا ومطابقته بالرابط الخام
  // المحفوظ يعطي أقله نسخة غير محسَّنة من نفس الصورة بدل فشل تحميل
  // كامل — تدهور مقبول لا صورة مكسورة تمامًا.
  if (url.pathname === '/_next/image') {
    const inner = url.searchParams.get('url');
    if (inner) {
      try {
        const rawHit = await savedCache.match(decodeURIComponent(inner));
        if (rawHit) return rawHit;
      } catch {
        // رابط ?url= مُرمَّز بشكل غير صالح — تجاهل والمتابعة للشبكة.
      }
    }
  }

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
async function networkFirstApi(event, request, _url) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    // FIX SW-CAPTIVE-01 (API variant): إضافة لفحص same-origin، رد API حقيقي
    // متوقّع يكون JSON — صفحة captive portal/edge error بحالة 200 عادة HTML.
    const looksLikeJson = (response.headers.get('content-type') || '').includes('application/json');
    if (response && response.ok && isSameOriginResponse(response) && looksLikeJson) {
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

    // PHASE-OFFLINE-AD-DETAIL: GET /ads/:id لإعلان محفوظ يدويًا — آخر
    // طبقة fallback، بعد API_CACHE (تصفح عادي حديث) وCORE_CACHE (حزمة
    // استباقية عامة). انظر تعليق lib/offlineSavedAds.ts للسياق الكامل.
    const savedCache = await caches.open(SAVED_ADS_CACHE);
    const cachedSaved = await savedCache.match(request.url);
    if (cachedSaved) return cachedSaved;

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

/** status افتراضيًا 'pending' — أُضيف صراحة مع FEAT-OFFLINE-MSG (كان
 * ضمنيًا/غير موجود سابقًا: كل عنصر بالطابور كان "معلّقًا" حتى يُحذف عند
 * نجاح أو فشل نهائي، بلا تمييز). لا يُكسر أي مستهلك قديم للطابور — عنصر
 * بلا status يُعامَل كـ pending أيضًا (انظر الفحص أدناه). */
async function queueRequestEntry(entry) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE_NAME, 'readwrite');
    tx.objectStore(QUEUE_STORE_NAME).add({ status: 'pending', ...entry });
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

async function getQueuedEntry(id) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE_NAME, 'readonly');
    const req = tx.objectStore(QUEUE_STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result || null);
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

/** FEAT-OFFLINE-MSG: يستبدل حذف العنصر بتحديثه (put بنفس الـ id — keyPath
 * صريح بالكائن، لا حاجة لتمريره منفصلًا) — يبقيه بالطابور بحالة 'failed'
 * بدل اختفائه بصمت، وهذا بالضبط ما يسمح لواجهة المحادثة بعرض "فشل
 * الإرسال" مع خيار إعادة المحاولة/الحذف بدل أن تُسقِط الرسالة بلا أثر. */
async function markQueuedEntry(id, patch) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const current = getReq.result;
      if (!current) {
        resolve(null);
        return;
      }
      const updated = { ...current, ...patch };
      store.put(updated);
      tx.oncomplete = () => resolve(updated);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

async function notifyClients(message) {
  const clientsList = await self.clients.matchAll();
  clientsList.forEach((client) => client.postMessage(message));
}

/**
 * FIX CONFLICT-01 (كان جزءًا من replayQueue حرفيًا قبل هذا التعديل):
 * محاولة إرسال عنصر واحد من الطابور. الفرق عن السلوك القديم —
 * خطأ عميل نهائي (4xx، مثلًا 403 USER_BLOCKED لو حظر الطرف الآخر أثناء
 * الانقطاع، أو 404 لو حُذفت المحادثة) كان يُحذف من الطابور بصمت تمامًا
 * كنجاح — أي أن رسالة "فشلت" فعليًا تختفي بلا أي أثر للمستخدم، فيظن أنها
 * وصلت. الآن: 4xx يُبقي العنصر بالطابور بحالة 'failed' (مع تفاصيل الخطأ)
 * بدل حذفه، ويُخطر الواجهة بعنصر بعينه فشل — القرار (إعادة محاولة يدويًا/
 * حذف) يُترك للمستخدم بدل أن يُتخذ صامتًا نيابة عنه. 5xx/انقطاع فعلي يبقيان
 * كما كانا: العنصر يبقى pending ولا يُخطَر بفشل (قد ينجح لاحقًا بلا تدخل).
 * يُرجع 'sent' | 'failed' | 'still-offline' — يستخدمها replayQueue لمعرفة
 * متى تتوقف عن باقي الطابور (فقط عند 'still-offline').
 *
 * FIX OFFLINE-AUTH-01: طلبات الطابور تُخزَّن بـ headers لحظة الانقطاع
 * بالضبط (بما فيها Authorization: Bearer <accessToken>) — انظر
 * handleMutation أدناه. JWT_EXPIRES_IN الافتراضي بالباك-إند = 15 دقيقة
 * فقط، وميزة "طابور أوفلاين" بالتعريف مبنية لانقطاعات أطول من ذلك
 * (نفق، منطقة ضعيفة التغطية، وضع الطيران). قبل هذا الإصلاح: أي عنصر
 * بالطابور يُعاد إرساله بعد انتهاء صلاحية التوكن يرجع 401 من الباك-إند،
 * وكانت تُعامَل كأي 4xx آخر أعلاه — 'failed' نهائي، والمستخدم يشوف
 * "فشل الإرسال" بلا أي طريقة صحيحة لحله (زر "إعادة المحاولة" يعيد نفس
 * الـ headers المنتهية بالضبط فيفشل بنفس الشكل مجددًا). حذف الرسالة
 * وإعادة كتابتها يدويًا كان الحل الوحيد.
 *
 * الحل: عند 401 تحديدًا (لا أي 4xx آخر) وقبل أول محاولة تجديد لهذا
 * العنصر، جرّب تجديد accessToken مباشرة من هنا (نفس نداء /auth/refresh
 * اللي api/client.ts's response interceptor يسويه بالصفحة العادية —
 * انظر تعليق refreshAccessToken أدناه) وأعد المحاولة مرة واحدة بالتوكن
 * الجديد. لو التجديد نفسه فشل (يعني حتى refreshToken بالكوكي منتهي أو
 * غير موجود — جلسة منتهية فعليًا لا مجرد توكن قصير الأمد) أو كانت هذه
 * أصلًا محاولة ثانية بعد تجديد سابق، يسقط للمسار القديم: 'failed' نهائي
 * بنفس منطق أي 4xx — هذا صحيح الآن لأنه فشل مصادقة حقيقي، لا عيب بالتصميم.
 */
async function refreshAccessToken(sampleUrl) {
  let origin;
  try {
    origin = new URL(sampleUrl).origin;
  } catch {
    return null;
  }
  try {
    const response = await fetch(`${origin}${API_PATH_PREFIX}/auth/refresh`, {
      method: 'POST',
      // لازم include لا same-origin — الباك-إند والفرونت-إند على origins
      // مختلفة فعليًا بهذا النشر (انظر تعليق CROSS-ORIGIN-CSRF-FIX
      // بـ backend's csrf.middleware.ts)، وrefreshToken الخاص بـ
      // /auth/refresh كوكي httpOnly لا Authorization header — لازم يوصل
      // عبر الكوكيز فعليًا.
      credentials: 'include',
    });
    if (!response.ok) return null;
    const body = await response.json();
    const accessToken = body?.data?.tokens?.accessToken;
    const csrfToken = body?.data?.csrfToken;
    if (typeof accessToken !== 'string' || !accessToken) return null;
    return { accessToken, csrfToken: typeof csrfToken === 'string' ? csrfToken : null };
  } catch {
    return null;
  }
}

async function replayOne(entry, hasRetriedAfterRefresh) {
  try {
    const response = await fetch(entry.url, {
      method: entry.method,
      headers: entry.headers,
      body: entry.body ?? undefined,
      credentials: 'same-origin',
    });

    if (response.ok) {
      await deleteQueuedEntry(entry.id);
      await notifyClients({ type: 'QUEUE_ITEM_SENT', id: entry.id, url: entry.url });
      return 'sent';
    }

    // FIX OFFLINE-AUTH-01: انظر التعليق الطويل فوق هذه الدالة. عمدًا قبل
    // فحص "4xx عام" أدناه — 401 وحده يستحق محاولة تجديد، لا يُعامَل
    // كفشل نهائي فورًا.
    if (response.status === 401 && !hasRetriedAfterRefresh) {
      const fresh = await refreshAccessToken(entry.url);
      if (fresh) {
        // Headers.forEach (المستخدَم بـ handleMutation) يُرجِع أسماء
        // الحقول بأحرف صغيرة دومًا (Fetch spec) — entry.headers هنا
        // بنفس الصيغة، فالمطابقة المباشرة صحيحة بلا حاجة لفحص case.
        const updatedHeaders = { ...entry.headers, authorization: `Bearer ${fresh.accessToken}` };
        if (fresh.csrfToken && 'x-csrf-token' in updatedHeaders) {
          updatedHeaders['x-csrf-token'] = fresh.csrfToken;
        }
        const updatedEntry = await markQueuedEntry(entry.id, { headers: updatedHeaders });
        if (updatedEntry) {
          return replayOne(updatedEntry, true);
        }
      }
      // فشل التجديد نفسه (refreshToken بالكوكي منتهي/غير موجود) — جلسة
      // منتهية فعليًا، لا عيب بالتصميم. يسقط للمنطق أدناه فيُعامَل كـ
      // 401 عادي (يبقى بالطابور 'failed' مع رسالة الباك-إند الحقيقية).
    }

    if (response.status >= 400 && response.status < 500) {
      let message;
      try {
        const data = await response.clone().json();
        message = typeof data?.message === 'string' ? data.message : undefined;
      } catch {
        message = undefined;
      }
      await markQueuedEntry(entry.id, {
        status: 'failed',
        lastError: { status: response.status, message },
      });
      await notifyClients({
        type: 'QUEUE_ITEM_FAILED',
        id: entry.id,
        url: entry.url,
        status: response.status,
        message,
      });
      return 'failed';
    }

    // 5xx أو حالة غير متوقعة أخرى — مشكلة خادم مؤقتة على الأرجح، اترك
    // العنصر pending وأعد المحاولة لاحقًا بلا تغيير حالته.
    return 'still-offline';
  } catch {
    return 'still-offline';
  }
}

/** تُستدعى من حدث 'sync' (Background Sync) ومن رسالة REPLAY_QUEUE_NOW
 * (fallback يدوي للمتصفحات بلا Background Sync، خاصة iOS Safari — انظر
 * lib/offlineQueue.ts's requestQueueReplay). تُعيد المحاولة بترتيب الإدخال؛
 * تتخطى العناصر 'failed' (فشل نهائي مُعلَن — لا تُعاد تلقائيًا، فقط عبر
 * RETRY_QUEUE_ITEM الصريح)، وتتوقف عند أول عنصر لا يزال "أوفلاين فعليًا"
 * (still-offline) لتحافظ على الترتيب — لكنها لا تتوقف عند 4xx نهائي بعد
 * الآن (FIX CONFLICT-01)، فرسالة فشلت لسبب لا علاقة له بالاتصال لا يجب أن
 * تحجب باقي عناصر الطابور (لمحادثات/عمليات أخرى قد تنجح بلا مشكلة). */
async function replayQueue() {
  let entries;
  try {
    entries = await getAllQueuedEntries();
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.status === 'failed') continue;
    const result = await replayOne(entry, false);
    if (result === 'still-offline') break;
  }

  await notifyClients({ type: 'QUEUE_REPLAYED' });
}

/** طلبات API غير GET (POST/PUT/PATCH/DELETE) — عند فشل الشبكة تُحفظ بالطابور
 * وتُرجَع استجابة 202 {queued:true} يتعرّف عليها api/client.ts's response
 * interceptor فيمنع أي onSuccess/toast نجاح كاذب لعملية لم تصل فعليًا. */
async function handleMutation(request) {
  const requestForQueue = request.clone();
  try {
    return await fetch(request);
  } catch {
    // FIX OFFLINE-ADS-01: كان الجسم يُقرأ عبر .text()، وهذا يفكّ ترميز
    // البايتات كـ UTF-8 قبل إعادة تخزينها — عملية غير عكسية لبيانات
    // ثنائية. طلبات إنشاء/تعديل الإعلانات (وأي رفع صور آخر) هي
    // multipart/form-data وتحمل بايتات صور خامة ضمن نفس الجسم النصي
    // ظاهريًا؛ .text() كان يُتلف تلك البايتات بصمت (كل بايت غير صالح
    // UTF-8 يُستبدل بحرف ), فيصل السيرفر لاحقًا صورة تالفة أو يفشل تحليل
    // multipart أصلاً — أي أن "طابور الأوفلاين" كان يبتلع الطلب بصمت وكأنه
    // نجح (202 queued) بينما هو فعليًا مفقود عمليًا عند إعادة الإرسال.
    // .blob() يحفظ البايتات كما هي تمامًا؛ IndexedDB يخزّن Blob مباشرة
    // (structured clone) و fetch() يقبله كـ body دون أي تحويل إضافي.
    let body = null;
    try {
      const blob = await requestForQueue.blob();
      body = blob.size > 0 ? blob : null;
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
  // الصفحة المصمَّمة.
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(STATIC_CACHE);
        const response = await fetch(OFFLINE_URL, { credentials: 'same-origin' });
        if (!response.ok) return;
        await cache.put(OFFLINE_URL, response.clone());

        // FIX OFFLINE-CHUNK-01: cache.add(OFFLINE_URL) وحده كان يخزّن مستند
        // /offline الـHTML فقط — لا الـJS/CSS اللي الصفحة نفسها تحتاجه
        // للـ hydration (مثلاً app/offline/page-<hash>.js). أول انقطاع نت
        // حقيقي حيث هذا الـchunk بالذات لم يُطلب أونلاين من قبل: الشبكة
        // تفشل، وfallback بـstaleWhileRevalidate (أسفله) يرجّع HTML صفحة
        // /offline كردّ على طلب ملف .js — المتصفح يحاول ينفّذها كجافاسكربت
        // فيفشل بـ"ChunkLoadError: Loading chunk X failed" — بالضبط
        // الصفحة المصمَّمة لتظهر عند انقطاع النت هي اللي تفشل بالضبط عند
        // انقطاع النت. الحل: نجلب HTML الصفحة، نستخرج كل مسار script/link
        // يشير لـ_next/static، ونخزّنه بنفس STATIC_CACHE أيضًا.
        const html = await response.clone().text();
        const assetUrls = Array.from(
          html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+\.(?:js|css))"/g),
        )
          .map((match) => match[1])
          .filter((url) => Boolean(url));

        await Promise.allSettled(
          assetUrls.map(async (assetUrl) => {
            try {
              const assetResponse = await fetch(assetUrl, { credentials: 'same-origin' });
              if (assetResponse.ok) await cache.put(assetUrl, assetResponse.clone());
            } catch {
              // أصل واحد فاشل لا يوقف تخزين الباقي.
            }
          }),
        );
      } catch {
        // فشل التخزين المسبق (مثلًا لا اتصال أصلًا وقت التثبيت، حالة نادرة)
        // لا يجب أن يوقف تثبيت الـ SW — ستُخزَّن لاحقًا بأول زيارة عادية
        // لها إن حدثت.
      }
    })(),
  );
  // FIX SW-AUTOUPDATE-01 (مُستعاد): لا نستدعي self.skipWaiting() هنا.
  // التفعيل يتم فقط بإذن المستخدم عبر رسالة SKIP_WAITING من زر "تحديث الآن"
  // (lib/pwa.ts → activateWaitingServiceWorker → UpdatePrompt).
  // السبب: skipWaiting غير المشروط + controllerchange→reload + فحص تحديث
  // دوري كان يسبب حلقة "تحديث لا نهائي" كلما بدا محتوى /sw.js غير مستقر
  // بين الطلبات (deploy متداخل، edge، إلخ) — حتى لو الفرق بايتًا واحدًا.
});

self.addEventListener('activate', (event) => {
  const currentCaches = [
    STATIC_CACHE,
    IMAGE_CACHE,
    API_CACHE,
    CORE_CACHE,
    SAVED_ADS_CACHE,
    PERSONAL_SHELL_CACHE,
  ];
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('market-') && !currentCaches.includes(name))
          .map((name) => caches.delete(name)),
      );

      // FIX SW-AUTH-PASSTHROUGH-01: دفاع إضافي — امسح أي مستند مصادقة قد
      // يكون تسرّب لكاش الإصدار الحالي (نادر، لكن يفسّر الصفحة البيضاء
      // بعد تعديلات الأوفلاين دون مسح بيانات يدوي).
      try {
        const staticCache = await caches.open(STATIC_CACHE);
        const keys = await staticCache.keys();
        const authPathPrefixes = ['/login', '/register', '/forgot-password', '/reset-password'];
        await Promise.all(
          keys
            .filter((req) => {
              try {
                const p = new URL(req.url).pathname;
                return authPathPrefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
              } catch {
                return false;
              }
            })
            .map((req) => staticCache.delete(req)),
        );
      } catch {
        // لا تمنع التفعيل.
      }
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
    // FEAT-OFFLINE-MSG + FIX PWA-NOTIF-01: PERSONAL_SHELL_CACHE يحمل نفس
    // درجة الحساسية (شكل صفحة محادثة قد يتضمن أسماء/معاينة رسائل، أو شكل
    // صفحة إشعارات) — يُمسح هنا معه لنفس السبب.
    event.waitUntil(Promise.all([caches.delete(API_CACHE), caches.delete(PERSONAL_SHELL_CACHE)]));
    return;
  }

  if (type === 'REPLAY_QUEUE_NOW') {
    event.waitUntil(replayQueue());
  }

  // FEAT-OFFLINE-MSG: إعادة محاولة عنصر فاشل بعينه (زر "إعادة المحاولة"
  // على فقاعة رسالة فشلت — انظر lib/offlineMessagesQueue.ts). يعيد الحالة
  // إلى pending فقط لو نجحت المحاولة فورًا فشلت مجددًا بـ 4xx (replayOne
  // يحدّثها هو نفسه)؛ لو لا يزال أوفلاين فعليًا تبقى الحالة كما أعادها
  // المستخدم ضمنيًا (still-offline لا يغيّر status هنا عمدًا — ستُلتقط
  // بأول replayQueue تلقائي لاحقًا بما أنها لم تعد 'failed').
  if (type === 'RETRY_QUEUE_ITEM' && event.data.id != null) {
    event.waitUntil(
      (async () => {
        const entry = await getQueuedEntry(event.data.id);
        if (!entry) return;
        if (entry.status === 'failed') {
          await markQueuedEntry(entry.id, { status: 'pending' });
        }
        await replayOne({ ...entry, status: 'pending' }, false);
        await notifyClients({ type: 'QUEUE_REPLAYED' });
      })(),
    );
  }

  // FEAT-OFFLINE-MSG: تجاهل نهائي لعنصر فاشل بعينه (زر "حذف" على فقاعة
  // رسالة فشلت) — يُسقطه من الطابور دون أي محاولة إرسال أخرى.
  if (type === 'DISCARD_QUEUE_ITEM' && event.data.id != null) {
    event.waitUntil(
      (async () => {
        await deleteQueuedEntry(event.data.id);
        await notifyClients({ type: 'QUEUE_ITEM_DISCARDED', id: event.data.id });
      })(),
    );
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

  // FIX SW-AUTH-PASSTHROUGH-01: لا اعتراض إطلاقًا على /login و/register و…
  // أي نسخة قديمة في الكاش لن تُخدم، ولن يحدث تعارض hydration → صفحة بيضاء.
  if (isAuthPage(url)) {
    return;
  }

  if (isImageRequest(request, url)) {
    event.respondWith(cacheFirstImage(event, request, url));
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
