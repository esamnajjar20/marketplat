/**
 * Service Worker — سوق غزة PWA
 *
 * استراتيجيات التخزين المؤقت:
 *  - App Shell (HTML/CSS/JS الأساسية): Stale-While-Revalidate
 *  - الصور (Cloudinary + الأيقونات المحلية): Cache First مع حد أقصى للعمر
 *  - طلبات API (GET) وصفحات App Shell: Network First مع fallback على الكاش
 *    عند انقطاع الشبكة *أو* تجاوزها مهلة NETWORK_TIMEOUT_MS (نت ضعيف/بطيء
 *    غير منقطع فعليًا — انظر withNetworkTimeout أدناه)؛ طلب الشبكة الحقيقي
 *    يستمر بالخلفية في الحالتين لتحديث الكاش إن نجح لاحقًا
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
 * isApiRequest ومستمع CLEAR_API_CACHE مطابقة لذلك الاختبار حرفيًا.
 *
 * FIX SW-TEST-COVERAGE-01: التعليق السابق هنا كان يقر أن باقي المنطق
 * (fetch strategies، طابور IndexedDB، replay، تجديد التوكن أثناء الـ
 * replay) غير مُغطى بأي اختبار إطلاقًا. sw.test.ts يغطي الآن أيضًا:
 * trimCache (بما فيها ترتيب X-SW-Cached-At الصريح بعد FIX SW-TRIM-ORDER-01)،
 * networkFirstApi (كتابة/عدم كتابة الكاش)، handleMutation (تمرير الشبكة،
 * الحفظ كـ Blob بالطابور، ربط X-Offline-Op-Id)، refreshAccessToken (نجاح/
 * فشل/URL غير صالح)، وreplayOne/replayQueue بكل مساراتها: نجاح، 4xx غير
 * 401 (فشل بلا حجب الطابور)، 5xx/انقطاع فعلي (يبقى pending ويحجب الطابور)،
 * ومسار 401→تجديد→إعادة محاولة الأكثر تعقيدًا بالملف كله. لا يزال ينقص:
 * تشغيل فعلي بمتصفح حقيقي (Background Sync API الحقيقي، push، lifecycle
 * الفعلي لـ install/activate) — هذا يتطلب متصفحًا فعليًا، تعذّر بهذه الجلسة
 * (لا شبكة/build متاح هنا)، فقط تحقق منطقي عبر vm.runInContext + Node's
 * fetch API الحقيقي (Response/Headers/Blob) + IndexedDB مُحاكاة سلوكيًا.
 */

try { importScripts('/cache-policy.js', '/cache-contract.js'); } catch (_) {}
const MARKET_STORAGE_POLICY = self.MARKET_CACHE_POLICY?.storage?.serviceWorker ?? {};

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
// FIX SW-TRIM-ORDER-01: رُفع إلى v19 — trimCache كان يعتمد على ترتيب
// caches.keys() كتقريب لـ FIFO، وهذا الترتيب غير مضمون بمواصفة Cache API
// (لا التزام بترتيب الإدخال). أي بيئة/متصفح لا يحافظ عمليًا على هذا
// الترتيب كان قد يحذف عنصرًا حديثًا بدل الأقدم فعليًا عند التقليم. الحل:
// كل عنصر يُكتب الآن بترويسة X-SW-Cached-At صريحة (putTimestamped)،
// وtrimCache يرتّب بها مباشرة بدل الاعتماد على keys(). رفع الرقم هنا
// يفرّغ عبر 'activate' أي مدخلات API_CACHE/IMAGE_CACHE قديمة كُتبت قبل
// هذا الإصلاح وتفتقر للترويسة الجديدة (بدل معاملتها معاملة خاصة بصمت).
// ارفع CACHE_VERSION فقط عند تغيّر سياسة الكاش / الـ shells / استراتيجيات fetch
// في هذا الملف — وليس مع كل deploy لا يمسّ SW. عند التفعيل (activate) تُمسَح
// كاشات market-* القديمة تلقائيًا. لا تستدعِ skipWaiting() من install.
// FIX OFFLINE-CREATE-PAGES-01: رُفعت إلى 'v23' — تصنيف '/my-store' كصفحة
// محمية (isProtectedPage أعلاه) تغيّر للتو، فأي نسخة HTML/RSC مخزَّنة
// سابقًا لمسارات /my-store/* بالخطأ داخل STATIC_CACHE (تحت الاسم القديم)
// يجب ألا تبقى قابلة للقراءة بعد هذا الإصلاح — رفع الرقم يضمن أن 'activate'
// يحذفها كأي كاش market-* غير مُدرَج، بدل أن تبقى صالحة للمطابقة لحين
// انتهاء صلاحيتها بمحض الصدفة.
// FIX SW-WEAK-NET-TIMEOUT-01: رُفعت إلى 'v24' — استراتيجية fetch تغيّرت
// لثلاث دوال (networkFirstPage/networkFirstApi/handleProtectedPage، انظر
// NETWORK_TIMEOUT_MS وwithNetworkTimeout أدناه)، وسياسة رفع الإصدار
// الموثّقة بـdocs/OFFLINE_CACHE_ARCHITECTURE.md صريحة: أي تغيير باستراتيجية
// fetch يستوجب رفعًا، حتى لو لم يتغيّر شكل أي مُدخل مخزَّن فعليًا.
// FIX ANALYTICS-QUEUE-RACE-01 + OFFLINE-CORE-ROUTE:
// v38 — analytics events no longer queue (see isAnalyticsBeacon
// below); '/offline' added to CORE_ROUTES in offlineRouteShells.ts.
// Both fixes require a cache bump so every active SW clears the
// stale entries from v35 and the retry/marker files reset.
// FIX SW-AUTH-PUBLIC-LIST-01 + NAV-TIMEOUT-CACHED-01 + WARM-ADAPTIVE:
// v43 — (1) allowlist public list GETs into USER_DATA_CACHE even when
// Authorization is present so logged-in users on weak net get fallback.
// (2) shorter navigate timeout when a cached shell exists.
// (3) adaptive front-end warming (see offlineWarmingPlanner).
const CACHE_VERSION = 'v49';
// FIX OFFLINE-QUEUE-RELIABILITY-01: v35 — إصلاح طابور الأوفلاين:
// (1) تنظيف headers عند الحفظ/الإعادة (content-length/host…) كانت تسبب
// still-offline صامت بعد عودة النت. (2) فشل IndexedDB/حجم كبير يرجع
// JSON واضح بدل Response.error() حتى تحفظ الواجهة مسودة. (3) حد جسم
// للطابور مع مسار احتياطي للمسودات.
const STATIC_CACHE = `market-static-${CACHE_VERSION}`;
const IMAGE_CACHE = `market-images-${CACHE_VERSION}`;
const API_CACHE = `market-api-${CACHE_VERSION}`;
// PHASE-5: user-specific API responses warmed ahead of time by
// lib/offlineWarmingUserData.ts. Separate from API_CACHE for three
// reasons:
//   - API_CACHE only stores responses the user's own request produced,
//     and only for non-auth requests (T710). The warming pass runs with
//     credentials and stores responses that ARE auth-scoped — those
//     must not sit next to public data.
//   - The login-as-different-user path (T682/T710) clears API_CACHE
//     but would leave this cache behind if it shared the name.
//   - Never trimmed by LRU — a fixed ~14 endpoints, ~55 KB.
const USER_DATA_CACHE_PREFIX = `market-user-data-${CACHE_VERSION}-`;
// User data is partitioned by the authenticated subject. The SW only uses the
// decoded JWT subject as a cache partition key; the server remains the source
// of truth for authentication/authorization. If the token is opaque, no
// user-scoped cache is used.
const MAX_USER_DATA_ENTRIES = MARKET_STORAGE_POLICY.userDataEntries ?? 40;
const MAX_USER_DATA_BYTES = MARKET_STORAGE_POLICY.userDataBytes ?? 8 * 1024 * 1024;

function userDataCacheName(userId) {
  return `${USER_DATA_CACHE_PREFIX}${encodeURIComponent(userId)}`;
}

function userIdFromAuthorization(request) {
  try {
    const header = request.headers.get('authorization') || '';
    const match = header.match(/^Bearer\s+([^\s]+)$/i);
    if (!match) return null;
    const parts = match[1].split('.');
    if (parts.length !== 3) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(padded);
    const payload = JSON.parse(json);
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

function userDataCacheForRequest(request) {
  const userId = userIdFromAuthorization(request);
  return userId ? userDataCacheName(userId) : null;
}
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

const MAX_API_ENTRIES = MARKET_STORAGE_POLICY.apiEntries ?? 60;
/** حد صور IMAGE_CACHE — FIFO عند التجاوز (لا نترك الكاش بلا سقف). */
const MAX_IMAGE_ENTRIES = MARKET_STORAGE_POLICY.imageEntries ?? 80;

/** FIX SW-MEMORY-01: حد أقصى لمدخلات STATIC_CACHE (HTML/RSC/JS/CSS).
 * بدون حد، كل تنقّل يُخزَّن بلا تقليم → ذاكرة الهاتف تنفد بعد أشهر.
 * SW-SMART-CACHE-01: رُفع من 250 إلى 500. التغطية الفعلية: 13 route
 * shell (HTML + RSC + ~10 chunks لكل واحد) = ~130 مدخل، فـ 500 يعطي
 * هامشاً واسعاً للزيارات المتنوعة دون حذف حيّ. MAX_STATIC_BYTES أدناه
 * يقيّد الحجم الكلي على الأجهزة ذات التخزين المحدود. */
const MAX_STATIC_ENTRIES = MARKET_STORAGE_POLICY.staticEntries ?? 500;
// SW-SMART-CACHE-01: byte-based cap alongside the entry cap. Entry count
// alone lets a cache of 500 large chunks reach 50 MB on one device and
// 5 MB on another, with no way to protect the smaller one. 30 MB is a
// soft ceiling — the entry cap still fires independently, and either
// constraint alone triggers trimming. Only STATIC_CACHE passes this
// value; the other caches keep their existing entry-only policy.
const MAX_STATIC_BYTES = MARKET_STORAGE_POLICY.staticBytes ?? 30 * 1024 * 1024;

/** FIX SW-MEMORY-02: حد أقصى لمدخلات SAVED_ADS_CACHE — الإعلانات
 * المحفوظة يدويًا + صورها. عند التجاوز، الأقدم يُحذف. */
// FIX CACHE-SAVED-ADS-CAP: 30 إعلان (offlineSavedAds MAX_SAVED_ADS) ×
// حتى 21 مدخل/إعلان (10 صور × 2 + API) = 630. 500 قد يحذف إعلانات
// المستخدم القديمة. رُفع إلى 700 (احتياط 70 مدخل).
const MAX_SAVED_ADS_ENTRIES = MARKET_STORAGE_POLICY.savedAdsEntries ?? 700;

/** FIX CACHE-PERSONAL-SHELL: كان بلا حد — ينمو مع كل زيارة محمية.
 * 300 مدخل يكفي لـ ~100 صفحة (HTML + RSC + chunks). */
const MAX_PERSONAL_SHELL_ENTRIES = MARKET_STORAGE_POLICY.personalShellEntries ?? 300;

const OFFLINE_URL = '/offline';
const READ_BATCH_PATH = '/api/v1/batch';

// يجب مطابقة lib/offlineQueue.ts حرفيًا — الصفحة تقرأ من نفس القاعدة/المخزن.
const QUEUE_DB_NAME = 'market-offline-queue';
const QUEUE_DB_VERSION = 2;
const QUEUE_STORE_NAME = 'requests';

const SYNC_TAG = 'replay-offline-queue';

/**
 * FIX SW-WEAK-NET-TIMEOUT-01: نت "ضعيف" (بطيء لكن غير منقطع فعليًا) يختلف
 * جوهريًا عن أوفلاين كامل — fetch() لا يفشل بسرعة (لا reject سريع، لا
 * AbortError)، بل يبقى معلّقًا لعشرات الثواني (أحيانًا أكثر من دقيقة على
 * شبكات 2G/3G أو محمول بإشارة ضعيفة) قبل أن ينجح أو يفشل فعليًا. قبل هذا
 * الإصلاح، networkFirstPage/networkFirstApi/handleProtectedPage كانت تنتظر
 * fetch() تلك المدة كاملة قبل أن "تفشل" وتلجأ للكاش — أي أن نفس المستخدم
 * اللي الكاش مصمَّم أصلًا لخدمته (نت غير موثوق) كان يعاني أطول انتظار،
 * بينما اتصال منقطع تمامًا (فشل فوري) كان يحصل على تجربة أسرع فعليًا.
 *
 * الحل: سباق بين fetch() الحقيقي ومهلة NETWORK_TIMEOUT_MS. لو فازت المهلة،
 * نعتبرها "فشل" مؤقت لغرض القرار الفوري (نعرض الكاش الآن) — لكن fetch()
 * الحقيقي لا يُلغى (لا AbortController) ويستمر بالخلفية، فإن نجح لاحقًا
 * فعلًا يُستخدم لتحديث الكاش عبر event.waitUntil في كل مستدعٍ (نفس نمط
 * "حدّث بالخلفية" المستخدم أصلًا بـstaleWhileRevalidate) — لا نخسر تحديث
 * البيانات فقط لأننا لم ننتظره لعرض الرد.
 *
 * ملاحظة: لا تُستخدم هذه المهلة لطلبات الكتابة (handleMutation) — إلغاء
 * الانتظار هناك يخاطر بتكرار العملية (الطلب الأصلي قد ينجح فعليًا عند
 * السيرفر رغم انتهاء مهلتنا)، ولمسار الكتابة أصلًا نتيجة صريحة: قائمة
 * الانتظار offlineQueue، لا حاجة لسباق ضد الزمن.
 */
/** SLOW-NET phase4: fail-over to cache faster on weak links (was 4000). */
/** API / image soft timeout (ms). */
const NETWORK_TIMEOUT_MS = 5000

/** Navigate documents need longer on weak links — 3s caused false /offline. */
const NAVIGATE_TIMEOUT_MS = 10000
/** FIX NAV-TIMEOUT-CACHED-01: when a cached shell already exists, fail over
 * faster (3.5s) so the user sees content instead of a blank screen for 10s.
 * The real fetch continues in the background and updates the cache. */
const NAVIGATE_TIMEOUT_CACHED_MS = 3500

/** FIX QUEUE-HOL-01: max consecutive soft failures on the same head entry
 * before marking failed (unblocks the rest of the queue). */
const MAX_QUEUE_RETRIES = 5

/** Soft failures (5xx / unexpected status while online): fail faster. */
const MAX_QUEUE_SERVER_RETRIES = 3

/** Minimum gap between replay attempts on the same entry (ms). Backoff base. */
const QUEUE_RETRY_MIN_GAP_MS = 30_000;
// Updated by the page when it has a better connection-quality signal.
// Keep 30s as the conservative default for SW/background-only runs.
let queueRetryMinGapMs = QUEUE_RETRY_MIN_GAP_MS;
let queueConcurrencyHint = 1;

/** FIX OFFLINE-QUEUE-RELIABILITY-01: سقف جسم الطلب في طابور IndexedDB.
 * فوق هذا الحد نرفض الطابور ونُرجع خطأ واضحًا لتأخذ المسودة (publishFiles)
 * المسار الاحتياطي — أفضل من QuotaExceeded صامت أو still-offline أبدي. */
const MAX_QUEUE_BODY_BYTES = 6 * 1024 * 1024; // 6 MB

/** Headers must not be replayed verbatim — content-length especially
 * breaks fetch() when the Blob size differs slightly after IDB round-trip. */
const QUEUE_STRIP_HEADERS = new Set([
  'content-length',
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
  'proxy-connection',
  'accept-encoding',
  // FIX QUEUE-NO-STORE-AUTH-01: never persist Bearer access tokens in
  // IndexedDB. JWT access TTL is short (~15m) but any XSS / local malware
  // that can read the offline queue would otherwise recover a live token
  // for that window. Replay always injects a fresh token via
  // refreshAccessToken → freshCreds (same path as CSRF).
  'authorization',
]);

function decodeAccessTokenUserId(token) {
  if (typeof token !== 'string' || !token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload?.userId === 'string' && payload.userId ? payload.userId : null;
  } catch {
    return null;
  }
}

function sanitizeQueueHeaders(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw)) {
    if (QUEUE_STRIP_HEADERS.has(String(key).toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}


/** يرفض بعد ms مللي ثانية بخطأ SwTimeoutError، بدون التأثير على
 * fetchPromise نفسه (يستمر بالخلفية بمعزل عن نتيجة هذا السباق). */
function withNetworkTimeout(fetchPromise, ms) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(Object.assign(new Error('SW network timeout'), { name: 'SwTimeoutError' }));
    }, ms);

    fetchPromise.then(
      (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(response);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// FIX OFFLINE-AUTH-01: يجب مطابقة frontend's lib/constants.ts's
// API_BASE_URL حرفيًا (`${origin}/api/v1`) — انظر تعليق refreshAccessToken
// أدناه لسبب وجود هذا الثابت أصلًا.
const API_PATH_PREFIX = '/api/v1';

// ── تصنيف الطلبات ───────────────────────────────────────────────

/**
 * صفحات محمية/شخصية — لا تُقرأ ولا تُكتب أبدًا في STATIC_CACHE (audit #7):
 * محتواها خاص بالمستخدم، وتخزينه يخاطر بعرضه لمستخدم آخر على نفس الجهاز.
 */
const PROTECTED_AD_EDIT_RE = /^\/ads\/[^/]+\/edit(?:\/.*)?$/;

function isProtectedPage(url) {
  if (PROTECTED_AD_EDIT_RE.test(url.pathname)) return true;
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
    // FIX OFFLINE-CREATE-PAGES-01: نفس عائلة خلل PWA-NOTIF-01 أعلاه، لكن
    // اكتُشف هذه المرة بمراجعة معاكسة — أثناء إضافة '/my-store/products/new'
    // لـPERSONAL_SHELL_ROUTES (lib/offlineRouteShells.ts) تبيّن أن '/my-store'
    // بالكامل (لوحة المتجر، المنتجات، المخزون، الأعضاء، التحليلات، الإعدادات)
    // كانت غائبة تمامًا عن protectedPrefixes هنا — رغم أنها صفحة محمية شخصية
    // بالكامل (تحت (protected)، بيانات المتجر عبر React Query بعد الـhydration)
    // بالضبط مثل '/my-services' أعلاها في نفس القائمة. النتيجة العملية: كل
    // طلبات /my-store/* كانت تمر من handlePageRequest كصفحة "عامة" وتُخزَّن
    // شكلها في STATIC_CACHE العام عبر networkFirstPage — نفس الكاش المشترك
    // بين كل الزوار، ولا يُمسح عند تسجيل الخروج — خلافًا مباشرًا لسياسة
    // audit #7 الموثّقة أعلاه، وأيضًا يعني أن isPersonalShellRoute's بادئة
    // '/my-store/' (بالأسفل) كانت فعليًا كودًا ميتًا: handleProtectedPage
    // (المكان الوحيد الذي يقرأ isPersonalShellRoute) لم يكن يُستدعى أبدًا
    // لأي مسار /my-store/* لأن isProtectedPage نفسها كانت تُرجع false أولًا.
    '/my-store',
    '/admin',
    // FIX PROTECTED-PARITY-01: مزامنة مع middleware.ts's PROTECTED_PREFIXES.
    // الثلاث كانت غائبة تمامًا عن isProtectedPage *و* isPersonalShellRoute.
    //
    // الأخطر: /my-reports و/complete-profile هما Server Components (بـ
    // `import type { Metadata }` + لا يوجد 'use client') — يعني HTML/RSC
    // يُبنى على السيرفر ويُخزَّن. بما أنهما كانا يُخزَّنان في STATIC_CACHE
    // (الكاش المشترك بين كل الزوار، لا يُمسح عند logout)، فقد يُعرض شكل
    // الصفحة لمستخدم آخر على نفس الجهاز بعد تسجيل الأول للخروج. حتى لو
    // كان محتواهما يُجلب عبر React Query بعد hydration، الـ metadata
    // (title/description) قد يحتوي بيانات المستخدم. هذا خرق مباشر لسياسة
    // audit #7 الموثّقة أعلاه.
    //
    // /service-requests هو 'use client' بالكامل، لكن يُضاف هنا للاتساق
    // ومزامنة القوائم مع middleware.ts (يمنع تكرار الخطأ في المستقبل).
    '/service-requests',
    '/my-reports',
    '/complete-profile',
    // FIX PROTECTED-PARITY-02: seven more routes present in
    // middleware.ts's PROTECTED_PREFIXES but still missing here, on top
    // of the three PROTECTED-PARITY-01 added above. Same class of bug
    // the /my-store comment documents: handlePageRequest checks
    // isProtectedPage FIRST, so for any route that returns false here,
    // handleProtectedPage is never called — meaning isPersonalShellRoute
    // (which already covers every one of these via exact entry or
    // prefix match) is effectively dead code for them, and their page
    // shell is stored in the shared STATIC_CACHE instead of
    // PERSONAL_SHELL_CACHE. STATIC_CACHE is never cleared on logout, so
    // on a shared browser the next person to open the site could be
    // served the previous user's shell for the same URL.
    //
    // /requests/new, /requests/me, /requests/offers are listed
    // individually (not as a /requests prefix) because /requests itself
    // is public — only its write/account subroutes are protected, the
    // same boundary middleware.ts draws.
    '/my-requests',
    '/requests/new',
    '/requests/me',
    '/requests/offers',
    '/activity',
    '/saved-searches',
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

/**
 * FIX SW-AUTH-PUBLIC-LIST-01: public, mostly viewer-independent list endpoints
 * that are safe to store even when the request carries Authorization.
 * Logged-in responses may include isFavorited flags — that is fine because
 * USER_DATA_CACHE is wiped on logout (CLEAR_API_CACHE / logout path).
 * Without this, apiClient always attaches Authorization → networkFirstApi
 * never wrote the response → weak-net logged-in users waited axios 15s +
 * retry (~30s) instead of falling back after NETWORK_TIMEOUT_MS.
 * Only first-page / unfiltered-style GETs; filtered/search still skip store.
 */
const PUBLIC_LIST_API_PREFIXES = [
  '/api/v1/ads',
  '/api/v1/products',
  '/api/v1/stores',
  '/api/v1/services',
  '/api/v1/service-listings',
  '/api/v1/categories',
  '/api/v1/product-categories',
  '/api/v1/service-categories',
  '/api/v1/home',
  // The unified homepage feed is safe in USER_DATA_CACHE for authenticated
  // sessions; that cache is wiped on logout, preventing cross-user reuse.
  '/api/v1/home/feed',
];

function isPublicListApiPath(url) {
  // pathname has no query — /api/v1/ads?page=1 → pathname '/api/v1/ads'.
  // Detail routes are /api/v1/ads/<id> and must NOT match (saved ads cache).
  const path = url.pathname;
  return PUBLIC_LIST_API_PREFIXES.some((prefix) => path === prefix);
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
/** FIX QUEUE-CSRF-OFFLINE-SESSION-01: كل طلب كتابة يحتاج CSRF عند الإرسال —
 * لا فقط ما حمل ترويسة x-csrf-token وقت الحفظ. في جلسة "أوفلاين بصرية"
 * (الصفحة فُتحت بلا نت فلم يجرِ /auth/refresh) يكون توكن الـCSRF بالذاكرة
 * فارغًا، فيُحفظ الطلب بلا x-csrf-token و needsCsrf=false؛ عند الإعادة
 * يُرسَل بلا الترويسة بينما كوكي csrfToken الخاص بالباك-إند يلحقه المتصفح
 * تلقائيًا (credentials:'include') فيرفضه csrfProtection بـ 403 ويُعلَّم
 * "failed" نهائيًا. */
function isReadBatchRequest(url, request) {
  return request.method === 'POST' && url.pathname === READ_BATCH_PATH;
}

function isUnsafeMethod(method) {
  const m = String(method || 'POST').toUpperCase();
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS';
}

function isRscShellRequest(request) {
  return request.headers.get('RSC') === '1';
}

/** يجب مطابقة lib/offlineRouteShells.ts's rscShellKey() حرفيًا. */
/** MY-STORE-HUB-01: /my-store?tab=members, /my-store?tab=products&page=2 …
 * are all the SAME document (tab lives in the query, resolved on the client).
 * Key hard navigations by bare pathname so they hit the single warmed shell
 * instead of missing the cache and falling to /offline. Only /my-store is
 * normalised (plus /my-services, MY-SERVICES-HUB-01) — every other URL
 * keeps its exact-request key. */
// HUB-DOCKEY-EXT-01: every hub route is ONE warmed document whose tabs live
// in ?tab=…, resolved on the client. A hard navigation to /settings?tab=security
// (or /activity?tab=ads, …) must hit that single shell instead of missing the
// cache and falling to /offline. Set membership (not a growing || chain) keeps
// this correct as more hubs are added.
const HUB_PATHS = new Set([
  '/my-store',
  '/my-services',
  '/settings',
  '/activity',
  '/offline',
]);

function hubDocumentKey(request, url) {
  if (
    request.mode === 'navigate' &&
    HUB_PATHS.has(url.pathname) &&
    url.search
  ) {
    return url.origin + url.pathname;
  }
  return request;
}

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
  if (PROTECTED_AD_EDIT_RE.test(path)) return false;
  const exact = [
    '/messages',
    '/notifications',
    '/dashboard',
    '/favorites',
    '/my-ads',
    '/saved-searches',
    '/activity',
    // FIX OFFLINE-AD-CREATE-01: نموذج نشر إعلان جديد كان غائبًا عن هذه
    // القائمة رغم أن lib/offlineAdDrafts.ts (mode: 'create') وطابور SW
    // (handleMutation) مبنيان بالكامل لدعم نشر إعلان كامل أوفلاين —
    // النتيجة العملية قبل هذا الإصلاح: بائع يفتح /ads/create لأول مرة
    // (أو بعد hard reload) وهو أوفلاين كان يوصله لصفحة /offline العامة،
    // مو نموذج النشر، رغم أن كل البنية التحتية لحفظ المسودة وإرسالها لاحقًا
    // جاهزة وتعمل. آمن بنفس منطق /notifications (FIX PWA-NOTIF-01):
    // CreateAdGate/CreateAdForm بالكامل 'use client'، تجلب seller profile
    // عبر useMySellerProfile بعد الـhydration — لا بيانات مستخدم مُخصَّصة
    // مخبوزة بالـHTML/RSC نفسه.
    '/ads/create',
    // SETTINGS/MY-STORE/MY-SERVICES-HUB-01 + OFFLINE-HUB-01: the old sub-pages
    // (/settings/security, /my-store/products, …) are 307 redirects into the hub
    // routes below; the prefix checks further down still cover any stray
    // sub-path, so they are no longer listed one by one. /service-broadcasts*
    // and /my-requests were removed with their pages (T780 / ACTIVITY-HUB-01).
    '/settings',
    '/my-store',
    '/my-services',
    '/requests',
    '/requests/me',
    '/requests/offers',
  ];
  if (exact.includes(path)) return true;
  if (path.startsWith('/messages/')) return true;
  if (path.startsWith('/settings/')) return true;
  if (path.startsWith('/my-store/')) return true;
  if (path.startsWith('/my-services/')) return true;
  if (path.startsWith('/requests/')) return true;
  if (path.startsWith('/my-ads/')) return true;
  // صفحة حسابي /profile/:id — شكل فقط؛ يُمسَح عند logout
  if (path.startsWith('/profile/')) return true;
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

/** FIX SW-TRIM-ORDER-01: يكتب رد مع ترويسة X-SW-Cached-At صريحة (طابع
 * زمني الآن) قبل التخزين — مصدر الحقيقة الوحيد اللي trimCache يعتمد
 * عليه للترتيب، بدل الوثوق بترتيب caches.keys() غير المضمون بالمواصفة.
 * يُستخدم فقط لكاشات تُقلَّم فعليًا (API_CACHE وIMAGE_CACHE) — لا داعي
 * له لـ STATIC_CACHE/CORE_CACHE/PERSONAL_SHELL_CACHE/SAVED_ADS_CACHE
 * (لا تُقلَّم تلقائيًا أصلًا). */
async function putTimestamped(cache, request, response) {
  const headers = new Headers(response.headers);
  headers.set('X-SW-Cached-At', String(Date.now()));
  const body = await response.blob();
  const stamped = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  await cache.put(request, stamped);
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
// FIX SW-OFFLINE-REBOUNCE-01 (dead code removed): this function used
// to guard against re-navigating to /offline when the user was
// already there, back when the RSC-failure path called it. Under
// FIX SW-NO-FORCE-OFFLINE-RSC-01 the RSC path no longer forces a
// navigation at all — it just returns Response.error and lets the
// /offline page's own retry button drive recovery — so the guard had
// no callers left. Removed rather than kept as a latent "why isn't
// anyone calling this?" trap; if forced navigation ever becomes the
// chosen strategy again, re-add from git history of this file.

/** Stale-While-Revalidate عام — يُستخدم لصفحات App Shell العامة (navigate +
 * RSC shells) ولأصول JS/CSS الثابتة. يرجع النسخة المخزَّنة فورًا إن وُجدت
 * (سرعة + عمل أوفلاين)، ويحدّث الكاش بالخلفية دائمًا عبر event.waitUntil. */
async function staleWhileRevalidate(event, request, cacheKey) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(cacheKey);

  const networkFetch = fetch(request)
    .then(async (response) => {
      if (response && response.ok && response.status !== 206 && isSameOriginResponse(response)) {
        const toStore = isRscShellRequest(request)
          ? await stripVaryAndClone(response.clone())
          : response.clone();
        // FIX SW-MEMORY-01: putTimestamped + trim بدل cache.put.
        await putTimestamped(cache, cacheKey, toStore);
        await trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES, MAX_STATIC_BYTES);
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

/**
 * FIX SW-CHUNK-VERIFY-01: Before serving a cached HTML document while
 * offline, verify that every _next/static chunk the HTML references is
 * also present in STATIC_CACHE. If any is missing, the page will fail
 * to hydrate with a ChunkLoadError — a full-page error screen that is
 * strictly worse than the explicit /offline fallback. This is the
 * last-mile guard that turns "offline route partially cached" into
 * "clean /offline page", and is the counterpart of the atomic-warming
 * rewrite on the client side (lib/offlineRouteShells.ts's
 * warmRouteAtomic).
 *
 * Only called for navigate (non-RSC) requests. RSC shells reference
 * chunks through a different protocol, and a missing RSC shell
 * already falls back cleanly to Response.error() → hard navigation →
 * /offline via the existing path.
 *
 * Returns true if the response is safe to serve offline.
 */
async function verifyCachedChunks(cachedResponse, cache) {
  try {
    const html = await cachedResponse.clone().text();
    const chunkUrls = Array.from(
      html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+\.(?:js|css))"/g),
    ).map((m) => m[1]);
    if (chunkUrls.length === 0) return true;
    for (const url of chunkUrls) {
      const hit = await cache.match(url);
      if (!hit) return false;
    }
    return true;
  } catch {
    // Parse/read failure → err on the side of serving. Worst case the
    // user sees the previous ChunkLoadError behavior; best case the
    // page works. Never block on our own bug.
    return true;
  }
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
  // FIX SW-WEAK-NET-TIMEOUT-01: fetchPromise الحقيقي منفصل عن السباق —
  // يستمر بالخلفية حتى لو فازت المهلة أدناه (انظر تعليق withNetworkTimeout).
  // FIX NAV-TIMEOUT-CACHED-01: shorter timeout when a cached shell exists.
  const hasCachedShell = !!(await cache.match(cacheKey));
  const navigateTimeout = hasCachedShell ? NAVIGATE_TIMEOUT_CACHED_MS : NAVIGATE_TIMEOUT_MS;
  const fetchPromise = fetch(request);
  try {
    const response = await withNetworkTimeout(fetchPromise, navigateTimeout);
    if (response && response.ok && isSameOriginResponse(response)) {
      const toStore = isRscShellRequest(request)
        ? await stripVaryAndClone(response.clone())
        : response.clone();
      // event.waitUntil (لا await مباشر): لا داعي لتأخير الرد للمستخدم
      // بانتظار كتابة الكاش — نفس نمط handleProtectedPage/networkFirstApi.
      // FIX SW-MEMORY-01: putTimestamped + trim بدل cache.put.
      event.waitUntil(
        putTimestamped(cache, cacheKey, toStore).then(() =>
          trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES, MAX_STATIC_BYTES),
        ),
      );
    }
    return response;
  } catch (err) {
    // FIX SW-WEAK-NET-TIMEOUT-01: مهلة (نت ضعيف) لا تعني تخلّيًا عن
    // fetchPromise الحقيقي — لو نجح لاحقًا فعلًا حدِّث الكاش بالخلفية.
    if (err && err.name === 'SwTimeoutError') {
      event.waitUntil(
        fetchPromise
          .then(async (response) => {
            if (response && response.ok && response.status !== 206 && isSameOriginResponse(response)) {
              const toStore = isRscShellRequest(request)
                ? await stripVaryAndClone(response.clone())
                : response.clone();
              await putTimestamped(cache, cacheKey, toStore);
              await trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES, MAX_STATIC_BYTES);
            }
          })
          .catch(() => {}),
      );
    }
    // فشل الشبكة (أوفلاين) أو تجاوز المهلة — آخر نسخة مخزَّنة فعليًا، إن وُجدت.
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      // FIX SW-CHUNK-VERIFY-01: refuse to serve HTML whose referenced
      // chunks are not all cached — that would produce a ChunkLoadError
      // screen. Verify only for navigate (non-RSC) requests; RSC
      // shells are handled separately above.
      if (!isRscShellRequest(request)) {
        const safe = await verifyCachedChunks(cachedResponse, cache);
        if (!safe) {
          const offlineFallback = await cache.match(OFFLINE_URL);
          return offlineFallback || Response.error();
        }
      }
      return cachedResponse;
    }

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
  const cacheKey = isRscShellRequest(request) ? rscShellKey(url.pathname) : hubDocumentKey(request, url);

  const myGeneration = (protectedNavGeneration.get(url.pathname) || 0) + 1;
  protectedNavGeneration.set(url.pathname, myGeneration);
  // FIX SW-MAP-CLEANUP: Map ينمو بلا حد عند التنقل الطويل. احذف الأقدم
  // عند تجاوز 200 عنصر.
  if (protectedNavGeneration.size > 200) {
    const keysToDelete = Array.from(protectedNavGeneration.keys()).slice(0, 100);
    keysToDelete.forEach((k) => protectedNavGeneration.delete(k));
  }

  // FIX SW-WEAK-NET-TIMEOUT-01: fetchPromise الحقيقي منفصل عن السباق —
  // يستمر بالخلفية حتى لو فازت المهلة أدناه (انظر تعليق withNetworkTimeout).
  // FIX NAV-TIMEOUT-CACHED-01: shorter timeout when a personal shell is cached.
  let navigateTimeout = NETWORK_TIMEOUT_MS;
  if (useShellCache) {
    const shellCache = await caches.open(PERSONAL_SHELL_CACHE);
    if (await shellCache.match(cacheKey)) {
      navigateTimeout = NAVIGATE_TIMEOUT_CACHED_MS;
    }
  }
  const fetchPromise = fetch(request);
  try {
    const response = await withNetworkTimeout(fetchPromise, navigateTimeout);
    // FIX SW-206-PROTECTED: استثناء 206 (Partial Content) — نفس منطق
    // staleWhileRevalidate وnetworkFirstPage.
    if (useShellCache && response && response.ok && response.status !== 206 && isSameOriginResponse(response)) {
      const cache = await caches.open(PERSONAL_SHELL_CACHE);
      const toStore = isRscShellRequest(request)
        ? await stripVaryAndClone(response.clone())
        : response.clone();
      // FIX CACHE-PERSONAL-SHELL: trim بعد الكتابة.
      await putTimestamped(cache, cacheKey, toStore);
      await trimCache(PERSONAL_SHELL_CACHE, MAX_PERSONAL_SHELL_ENTRIES);
    }
    return response;
  } catch (err) {
    // FIX SW-WEAK-NET-TIMEOUT-01: مهلة (نت ضعيف، ليست AbortError ولا فشل
    // شبكة حقيقي) لا تعني تخلّيًا عن fetchPromise — لو نجح لاحقًا فعلًا
    // حدِّث shell الكاش بالخلفية، بنفس شرط useShellCache أعلاه.
    if (err && err.name === 'SwTimeoutError') {
      if (useShellCache) {
        event.waitUntil(
          fetchPromise
            .then(async (response) => {
              if (response && response.ok && response.status !== 206 && isSameOriginResponse(response)) {
                const cache = await caches.open(PERSONAL_SHELL_CACHE);
                const toStore = isRscShellRequest(request)
                  ? await stripVaryAndClone(response.clone())
                  : response.clone();
                await putTimestamped(cache, cacheKey, toStore);
                await trimCache(PERSONAL_SHELL_CACHE, MAX_PERSONAL_SHELL_ENTRIES);
              }
            })
            .catch(() => {}),
        );
      }
    }
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
      if (cachedShell) {
        // SW-CHUNK-VERIFY-PROTECTED-01: the same protection that
        // networkFirstPage got in SW-CHUNK-VERIFY-01, applied to the
        // personal-shell path. Without this, a protected page whose
        // HTML is cached but whose chunks are missing (trimCache
        // eviction, chunk-hash rotation across a deploy, or a warming
        // pass that stored HTML and failed partway through its chunks)
        // was served the HTML anyway. The browser then threw
        // ChunkLoadError, the page's error.tsx rendered, and the user
        // saw "لا يتوفر اتصال بالإنترنت" — on /settings/storage and
        // /settings/sync specifically, even while other pages worked.
        //
        // Chunks for personal pages live in STATIC_CACHE (see
        // warmPersonalRouteAtomic in lib/offlineRouteShells.ts) — pass
        // that, not shellCache, to the verifier.
        if (!isRscShellRequest(request)) {
          const staticCache = await caches.open(STATIC_CACHE);
          const safe = await verifyCachedChunks(cachedShell, staticCache);
          if (!safe) {
            if (request.mode === 'navigate') {
              const offlineFallback = await staticCache.match(OFFLINE_URL);
              return offlineFallback || Response.error();
            }
            return Response.error();
          }
        }
        return cachedShell;
      }
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

/** Cache First للصور التي رآها المستخدم — مع سقف MAX_IMAGE_ENTRIES (FIFO).
 * الإعلانات المحفوظة يدويًا تُقرأ أيضًا من SAVED_ADS_CACHE (غير مُصدَّر). */
async function cacheFirstImage(event, request, url) {

  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  // PHASE-OFFLINE-AD-DETAIL: صورة إعلان محفوظ يدويًا قد لا تكون مرّت
  // بعد بـ IMAGE_CACHE (مثلًا thumbnail بالأسفل بـ loading="lazy" لم
  // يُعرض فعليًا بعد) لكنها مخزَّنة صراحة بـ SAVED_ADS_CACHE عبر
  // lib/offlineSavedAds.ts's saveAdOffline — تحقّق منه قبل الشبكة.
  const savedCache = await caches.open(SAVED_ADS_CACHE);
  const savedHit = await savedCache.match(request);
  if (savedHit) {
    // FIX SW-MEMORY-02: trim دوري عند كل قراءة من SAVED_ADS_CACHE.
    event.waitUntil(trimCache(SAVED_ADS_CACHE, MAX_SAVED_ADS_ENTRIES));
    return savedHit;
  }

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

  // FIX SW-IMAGE-CORE-01: thumbnails warmed by warmCoreBundle live in
  // CORE_CACHE keyed by their raw URL — serve them before the network.
  try {
    const coreCache = await caches.open(CORE_CACHE);
    const coreHit = await coreCache.match(request.url);
    if (coreHit) return coreHit;
  } catch {
    // ignore — fall through to network
  }

  try {
    const response = await fetch(request);
    // FIX SW-206-IMAGE: استثناء 206 (Partial Content — Range requests
    // من <img loading="lazy">) من التخزين — وإلا قد تُخزَّن نسخة جزئية
    // فاسدة.
    if (response && response.ok && response.status !== 206) {
      // لا تخزّن صورًا ضخمة جدًا (توفير مساحة الهاتف)
      const len = response.headers.get('content-length');
      const lenNum = len ? Number(len) : 0;
      const tooLarge = Number.isFinite(lenNum) && lenNum > 2.5 * 1024 * 1024;
      if (!tooLarge) {
        event.waitUntil(
          shouldSkipDisposableCacheWrite(IMAGE_CACHE).then((skip) => {
            if (skip) return;
            return putTimestamped(cache, request, response.clone()).then(() =>
              trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES),
            );
          }),
        );
      }
    }
    return response;
  } catch (error) {
    // FIX SW-IMAGE-CORE-NEXT-01: warmCoreBundle now warms the exact
    // thumbnail URL the cards pass to next/image (getListThumbnailUrl),
    // stored in CORE_CACHE under that URL. The browser's real request is
    // /_next/image?url=<that URL>&w=..., whose `w`/`q` are chosen at render
    // time and can't be predicted — so on a NETWORK FAILURE ONLY, fall back
    // to the warmed un-optimised copy (same trade-off as the saved-ads
    // fallback above: a slightly heavier image instead of a broken one).
    // Deliberately NOT tried before the network: online users keep the
    // optimised AVIF/WebP variant.
    if (url.pathname === '/_next/image') {
      try {
        const inner = url.searchParams.get('url');
        if (inner) {
          const coreCache = await caches.open(CORE_CACHE);
          // searchParams.get() already decoded it once — decoding again would corrupt URLs containing %XX.
          const warmed = await coreCache.match(inner);
          if (warmed) return warmed;
        }
      } catch {
        // ignore — fall through to the error below
      }
    }
    console.error('[SW IMAGE] NETWORK ERROR', request.url, error);
    return Response.error();
  }
}

/** FIX SW-TRIM-ORDER-01: يقلّم بالاعتماد على ترويسة X-SW-Cached-At
 * الصريحة (مكتوبة بـ putTimestamped) بدل ترتيب caches.keys() — غير
 * مضمون بالمواصفة (سابقًا: "ترتيب FIFO تقريبي"، وهذا بالضبط ما كان قد
 * يحذف عنصرًا حديثًا خطأً على بيئة لا تحافظ على ترتيب الإدخال). أي
 * مدخل بلا الترويسة (مثلًا مدخل قديم من قبل هذا الإصلاح — نظريًا لن
 * يحدث بعد رفع CACHE_VERSION لأن activate يفرّغ الكاشات القديمة، لكن
 * دفاعًا إضافيًا) يُعامَل كطابع زمني صفر فيُحذف أولًا كأولوية. */
// SW-SMART-CACHE-01: tier inferred from cache name + URL path, used by
// trimCache to decide which entries to evict first when over the cap.
// Tier values are weights — higher = keep longer. Nothing here changes
// WHEN trimming happens (only the entry/byte caps do that); it changes
// WHICH entries go first. The previous behaviour was pure timestamp
// LRU, which could evict a frequently-used /products shell while a
// never-visited /sellers/ranking shell from the same day survived.
//
// SW-SMART-CACHE-REFINE-01: tier values, sorted highest to lowest.
//   200  saved         market-saved-ads (user-explicit; never trimmed)
//   100  critical      /offline, / (existence of the app itself)
//    55  storage-sync  /settings/storage, /settings/sync
//    60  core-html     /products /search /ads /services /stores HTML
//    45  static-chunk  _next/static/* (shared across routes; reusable)
//    20  personal      market-personal-shell-* (other pages)
//    15  api           market-api-* (small, server has TTL)
//     8  lazy          any other cached HTML route
//     3  image         market-images-* (large, refetchable)
// SW-TTL-TIERED-01: age penalty weighted per tier. Entries whose value
// decays with time (API responses) accumulate age penalty faster than
// entries whose value is largely stable (critical shells, saved ads).
//
// This is NOT a TTL. Nothing is force-deleted on age alone — the
// entry and byte caps remain the only triggers for a trim run. But
// when trimming does run, a stale API response is now preferred for
// eviction over an equally-stale critical shell.
//
// Keyed by the numeric weight that inferCacheTier returns, so no
// function signature changes.
const AGE_WEIGHT = {
  200: 0.1,  // saved-ads       — user-explicit, minimal decay
  100: 0.1,  // critical        — /offline, /, the app itself
   60: 0.5,  // core-html       — main browse pages
   55: 0.5,  // storage/sync    — management pages
   45: 1,    // static-chunk    — shared, normal decay
   20: 1,    // personal-shell  — normal decay
   15: 5,    // api             — fast decay (server has fresher)
    8: 2,    // lazy html       — faster than personal
    3: 3,    // image           — fast decay (large, refetchable)
   10: 1,    // fallback
};
function ageWeightFor(tier) {
  return AGE_WEIGHT[tier] ?? 1;
}

function inferCacheTier(cacheName, request) {
  if (cacheName.includes('saved-ads')) return 200;
  if (cacheName.includes('personal-shell')) {
    // SW-PRIORITY-STORAGE-SYNC-01: cache-management and sync-management
    // pages are elevated above generic personal shells. Both are the
    // pages a user needs most urgently when offline - to see what's
    // stored, prune storage, inspect the pending queue, and retry.
    try {
      const path = new URL(request.url).pathname;
      // SW-SMART-CACHE-REFINE-01: 80 was too high — it exceeded core
      // HTML (60), so on a full cache /products would be evicted before
      // /settings/storage. 55 sits above other personal pages (20) but
      // below core HTML, matching the actual utility ordering.
      if (path === '/settings/storage' || path === '/settings/sync') return 55;
    } catch {
      // fall through to default
    }
    return 20;
  }
  if (cacheName.includes('image')) return 3;
  if (cacheName.includes('api')) return 15;
  if (cacheName.includes('static')) {
    try {
      const path = new URL(request.url).pathname;
      if (path === '/offline' || path === '/') return 100;
      // SW-SMART-CACHE-REFINE-01: 40 -> 45. Chunks are shared across
      // routes (framework, vendor, main-app), so raising them slightly
      // above the old value keeps them alive a bit longer when other
      // routes might still reference them. But they stay BELOW core
      // HTML (60) — deleting a large chunk saves far more bytes than
      // deleting a small HTML, and when verifyCachedChunks then finds
      // a missing chunk the user gets a clean /offline fallback, not
      // an error.
      if (path.startsWith('/_next/static')) return 45;
      if (
        path.startsWith('/products') ||
        path.startsWith('/search') ||
        path.startsWith('/ads') ||
        path.startsWith('/services') ||
        path.startsWith('/stores')
      ) return 60;
      return 8;
    } catch {
      return 10;
    }
  }
  return 10;
}

/** FIX SW-TRIM-THROTTLE-01: avoid running full trim after every put.
 * Entry-over-cap still runs immediately; byte-cap / healthy caches at
 * most once per TRIM_MIN_INTERVAL_MS per cache name. */
const TRIM_MIN_INTERVAL_MS = 30_000;
const lastTrimAtByCache = new Map();

async function storagePressureRatio() {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate || typeof estimate.usage !== 'number' || typeof estimate.quota !== 'number' || estimate.quota <= 0) return null;
    return Math.min(1, Math.max(0, estimate.usage / estimate.quota));
  } catch { return null; }
}

// W7: progressively shrink only disposable network-reconstructable caches.
function adaptiveCacheLimits(cacheName, maxEntries, maxBytes, ratio) {
  if (ratio == null || (cacheName !== API_CACHE && cacheName !== IMAGE_CACHE)) return { maxEntries, maxBytes };
  if (ratio >= 0.95) return { maxEntries: Math.max(10, Math.floor(maxEntries * 0.25)), maxBytes: maxBytes ? Math.floor(maxBytes * 0.25) : undefined };
  if (ratio >= 0.90) return { maxEntries: Math.max(20, Math.floor(maxEntries * 0.5)), maxBytes: maxBytes ? Math.floor(maxBytes * 0.5) : undefined };
  return { maxEntries, maxBytes };
}

async function shouldSkipDisposableCacheWrite(cacheName) {
  const ratio = await storagePressureRatio();
  return ratio != null && ratio >= 0.95 && (cacheName === API_CACHE || cacheName === IMAGE_CACHE);
}

async function trimCache(cacheName, maxEntries, maxBytes) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const limits = adaptiveCacheLimits(cacheName, maxEntries, maxBytes, await storagePressureRatio());
  maxEntries = limits.maxEntries;
  maxBytes = limits.maxBytes;

  // Fast path 1: entry cap not reached AND no byte cap requested.
  if (keys.length <= maxEntries && maxBytes === undefined) return;

  // Over entry cap → always trim. Otherwise throttle expensive byte work.
  if (keys.length <= maxEntries) {
    const last = lastTrimAtByCache.get(cacheName) || 0;
    if (Date.now() - last < TRIM_MIN_INTERVAL_MS) return;
  }
  lastTrimAtByCache.set(cacheName, Date.now());

  // SW-SMART-CACHE-FASTPATH: when a byte cap is set and the entry count
  // is under its cap, sampling ~50 entries to estimate the total is far
  // cheaper than enumerating all 500. On a 500-entry cache this cuts
  // trimCache's header reads from 500 to 50 when the cache is healthy,
  // at the cost of a rare full read when the estimate is close to the
  // cap. Only used when we would otherwise have to do a full byte
  // enumeration anyway.
  // FIX SW-TRIM-SIZE-01: when Content-Length is absent (streamed HTML/RSC),
  // treat the sample as ~48KB so the 30MB byte cap is not silently ignored.
  const MISSING_LEN_ESTIMATE = 48 * 1024;

  if (maxBytes !== undefined && keys.length <= maxEntries) {
    const sampleSize = Math.min(50, keys.length);
    let sampleBytes = 0;
    let measured = 0;
    for (let i = 0; i < sampleSize; i += 1) {
      const res = await cache.match(keys[i]);
      const len = res && res.headers.get('content-length');
      const n = len ? Number(len) : 0;
      if (Number.isFinite(n) && n > 0) {
        sampleBytes += n;
        measured += 1;
      } else {
        sampleBytes += MISSING_LEN_ESTIMATE;
      }
    }
    const avg = sampleSize > 0 ? sampleBytes / sampleSize : 0;
    const estimated = avg * keys.length;
    // 90% margin: if the estimate is comfortably under the cap, trust
    // it. If it's near or over, fall through to the full enumeration
    // for accuracy — an underestimate must never let us skip a trim.
    // If almost nothing had Content-Length, always fall through when
    // entry count is high (estimate is rough).
    if (estimated < maxBytes * 0.9 && measured >= sampleSize * 0.3) return;
  }

  const now = Date.now();
  const entries = await Promise.all(
    keys.map(async (key) => {
      const res = await cache.match(key);
      const raw = res && res.headers.get('X-SW-Cached-At');
      const ts = raw ? Number(raw) : 0;
      // Content-Length may be missing (chunked HTML, compressed responses).
      // Use a conservative estimate so the byte cap still applies.
      const lenRaw = res && res.headers.get('content-length');
      const parsed = lenRaw ? Number(lenRaw) : NaN;
      const size = Number.isFinite(parsed) && parsed > 0 ? parsed : MISSING_LEN_ESTIMATE;
      const tier = inferCacheTier(cacheName, key);
      const ageHours = ts > 0 ? (now - ts) / 3_600_000 : 9999;
      const sizeKB = Number.isFinite(size) && size > 0 ? size / 1024 : 0;
      // score: higher = keep longer. Tier dominates; age and size break
      // ties within a tier and gently nudge across adjacent ones.
      // SW-TTL-TIERED-01: weighted age penalty — see AGE_WEIGHT above.
      const score =
        tier * 1000 - ageHours * ageWeightFor(tier) - sizeKB / 100;
      return { key, ts, size: Number.isFinite(size) ? size : 0, score };
    }),
  );

  const totalBytes = entries.reduce((s, e) => s + e.size, 0);
  const overEntries = entries.length > maxEntries;
  const overBytes = maxBytes !== undefined && totalBytes > maxBytes;
  if (!overEntries && !overBytes) return;

  // Lowest score first = first to delete.
  entries.sort((a, b) => a.score - b.score);

  let remainingEntries = entries.length;
  let remainingBytes = totalBytes;
  for (const e of entries) {
    if (remainingEntries <= maxEntries && (maxBytes === undefined || remainingBytes <= maxBytes)) {
      break;
    }
    await cache.delete(e.key);
    remainingEntries -= 1;
    remainingBytes -= e.size;
  }
}

/** Network First لطلبات API (GET) — عند فشل الشبكة: API_CACHE أولًا (آخر
 * استجابة فعلية زارها المستخدم)، ثم CORE_CACHE (الحزمة الأساسية المحمَّلة
 * استباقيًا عبر warmCoreBundle لمسارات لم تُزَر من قبل). */
async function networkFirstApi(event, request, url) {
  const cache = await caches.open(API_CACHE);
  // FIX SW-WEAK-NET-TIMEOUT-01: fetchPromise الحقيقي منفصل عن السباق —
  // يستمر بالخلفية حتى لو فازت المهلة أدناه (انظر تعليق withNetworkTimeout).
  const fetchPromise = fetch(request);
  // T710 — never store an auth-keyed response in the SHARED API_CACHE.
  // The backend's CACHE.NONE middleware sends `Cache-Control: no-store`
  // but NOT `Vary: Authorization`, so a `/users/me` (or /conversations,
  // /notifications, ...) response cached under User A would match a
  // later request for the same URL from a different session.
  // FIX SW-API-AUTH-TIMEOUT-01: this gate now guards BOTH the normal
  // path and the late-arriving (post-timeout) path — the latter used to
  // store auth'd responses without checking it.
  // FIX SW-AUTH-PUBLIC-LIST-01: public list GETs (ads/products/…) may still
  // be stored in USER_DATA_CACHE when Authorization is present — that cache
  // is cleared on logout, so isFavorited leakage across users is avoided.
  const hadAuth = request.headers.get('authorization') != null;
  const publicListOk = isPublicListApiPath(url);

  const storeIfAllowed = async (response) => {
    if (!response) return;
    // FIX SW-CAPTIVE-01 (API variant): رد API حقيقي متوقّع يكون JSON —
    // صفحة captive portal/edge error بحالة 200 عادة HTML.
    const looksLikeJson = (response.headers.get('content-type') || '').includes('application/json');
    // FIX SW-206-API: استثناء 206 أيضاً.
    if (!(response.ok && response.status !== 206 && isSameOriginResponse(response) && looksLikeJson)) {
      return;
    }
    if (!hadAuth) {
      if (await shouldSkipDisposableCacheWrite(API_CACHE)) return;
      await putTimestamped(cache, request, response.clone());
      await trimCache(API_CACHE, MAX_API_ENTRIES);
      return;
    }
    // Logged-in public lists → USER_DATA_CACHE only (cleared on logout).
    if (publicListOk) {
      const cacheName = userDataCacheForRequest(request);
      if (!cacheName) return;
      const userDataCache = await caches.open(cacheName);
      await putTimestamped(userDataCache, request, response.clone());
      await trimCache(cacheName, MAX_USER_DATA_ENTRIES, MAX_USER_DATA_BYTES);
    }
  };

  try {
    const response = await withNetworkTimeout(fetchPromise, NETWORK_TIMEOUT_MS);
    event.waitUntil(storeIfAllowed(response).catch(() => {}));
    return response;
  } catch (err) {
    const timedOut = !!(err && err.name === 'SwTimeoutError');
    if (timedOut) {
      // مهلة (نت ضعيف) لا تعني تخلّيًا عن fetchPromise الحقيقي — لو نجح
      // لاحقًا حدِّث الكاش بالخلفية (بنفس بوابة التخزين).
      event.waitUntil(fetchPromise.then(storeIfAllowed).catch(() => {}));
    }

    // FIX SW-VARY-01: entries here come only from anonymous requests and
    // the backend marks public responses `Vary: Authorization`; without
    // ignoreVary a logged-in user's request (which carries the header)
    // could never match them and the cache was useless for members.
    const cachedApi = await cache.match(request, { ignoreVary: true });
    if (cachedApi) return cachedApi;

    // PHASE-5 + SW-AUTH-PUBLIC-LIST-01: user-warmed data and auth'd public
    // lists. Ordered after API_CACHE and before CORE_CACHE.
    const userDataCacheNameForRequest = userDataCacheForRequest(request);
    if (userDataCacheNameForRequest) {
      const userDataCache = await caches.open(userDataCacheNameForRequest);
      const cachedUserData = await userDataCache.match(request, { ignoreVary: true });
      if (cachedUserData) return cachedUserData;
    }

    const coreCache = await caches.open(CORE_CACHE);
    const cachedCore = await coreCache.match(request.url);
    if (cachedCore) return cachedCore;

    // PHASE-OFFLINE-AD-DETAIL: GET /ads/:id لإعلان محفوظ يدويًا.
    const savedCache = await caches.open(SAVED_ADS_CACHE);
    const cachedSaved = await savedCache.match(request.url);
    if (cachedSaved) return cachedSaved;

    // FIX SW-TIMEOUT-NOCACHE-01: the timeout fired but nothing is cached.
    // The real request is still in flight — keep waiting for it instead of
    // handing the page a synthetic network error on a slow-but-alive link.
    if (timedOut) {
      return fetchPromise.catch(() => Response.error());
    }
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
async function queueRequestEntry(entry, lifecycleVersion = queueLifecycleVersion) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    // Check AFTER the asynchronous DB open and immediately before creating
    // the write transaction. If CLEAR_QUEUE began while openQueueDb awaited,
    // a request from the previous session must not resurrect itself afterward.
    if (queueClearInFlight || lifecycleVersion !== queueLifecycleVersion) {
      reject(Object.assign(new Error('Queue lifecycle changed before enqueue'), { code: 'QUEUE_LIFECYCLE_CHANGED' }));
      return;
    }
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
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    getReq.onsuccess = () => {
      const current = getReq.result;
      if (!current) {
        settle(resolve, null);
        return;
      }
      const updated = { ...current, ...patch };
      try {
        store.put(updated);
      } catch (putErr) {
        // Synchronous throw from put() — e.g. a DataCloneError on a
        // non-structured-cloneable value in `patch`. Surface it instead
        // of letting the transaction abort into a hanging promise.
        settle(reject, putErr);
        return;
      }
      tx.oncomplete = () => settle(resolve, updated);
    };
    getReq.onerror = () => settle(reject, getReq.error);
    // T711 — previously the transaction had NO onerror handler at all.
    // If store.put() above failed asynchronously (QuotaExceededError on
    // a low-space device, or any IndexedDB abort), the transaction
    // aborted, tx.onerror fired into a void, and the Promise never
    // settled. Callers in replayOne/replayQueueImpl await this — so
    // replayQueueInFlight would stay stuck true forever and every
    // subsequent REPLAY_QUEUE_NOW / sync event would silently no-op,
    // freezing the offline queue until the SW itself is reinstalled.
    // That is exactly the failure mode the offline feature exists to
    // avoid, on exactly the device class (constrained storage, weak
    // network) this app targets.
    tx.onabort = () => settle(reject, tx.error || new Error('queue tx aborted'));
    tx.onerror = () => settle(reject, tx.error || new Error('queue tx failed'));
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
/**
 * FIX SW-CSRF-REFRESH-CLASSIFY-01: returns a discriminated union so the
 * caller can tell failure modes apart — they need very different
 * responses:
 *   { ok: true, accessToken, csrfToken }   →  fresh creds
 *   { ok: false, reason: 'auth' }          →  server answered 401/403;
 *                                             session is genuinely gone.
 *   { ok: false, reason: 'network' }       →  no HTTP response, timeout,
 *                                             DNS, unparsable body, 5xx;
 *                                             session may be perfectly valid.
 *   null                                   →  URL unparseable (treated
 *                                             like network by callers).
 *
 * Before this, all failures collapsed to `null`, and every caller read
 * that as "session ended". A single transient network blip during one
 * refresh call therefore caused the whole queue to be replayed without
 * a CSRF header, the backend 403'd each entry with "Invalid or missing
 * CSRF token", and replayOne marked them `failed` permanently — for a
 * weak network moment, on precisely the audience this app was built for.
 */
async function refreshAccessToken(sampleUrl) {
  // PAGE-PRIORITY-01: if any window client is currently visible,
  // defer to it. The page has its own refresh path
  // (AuthHydrationProvider on mount, response interceptor on 401)
  // and the Set-Cookie it receives lands in the shared cookie jar,
  // so our next drain sees the fresh token without needing a
  // second concurrent /auth/refresh. Without this, page-mount queue
  // replay always races the page's own refresh; backend's grace
  // window makes it safe but still wasteful, and it keeps the
  // TOKEN_REUSE_DETECTED alert path one bug away from firing.
  try {
    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    const visible = clients.filter((c) => c.visibilityState === 'visible');
    if (visible.length > 0) {
      // Ask them to refresh now so we don't wait for their next 401.
      // FIX N1-PAGE-PRIORITY-RETRY: use distinct reason so replayQueueImpl
      // does NOT burn retryCount while the page owns the refresh. The
      // page's refreshSessionShared (swTokenSync) will land fresh cookies;
      // the next drain (online/visibility/periodic) picks them up.
      visible.forEach((c) => c.postMessage({ type: 'SW_REQUEST_REFRESH' }));
      return { ok: false, reason: 'page-priority' };
    }
  } catch { /* best-effort; fall through and refresh ourselves */ }
  let origin;
  try {
    origin = new URL(sampleUrl).origin;
  } catch {
    return null;
  }
  let response;
  try {
    response = await fetch(`${origin}${API_PATH_PREFIX}/auth/refresh`, {
      method: 'POST',
      // لازم include لا same-origin — الباك-إند والفرونت-إند على origins
      // مختلفة فعليًا بهذا النشر (انظر تعليق CROSS-ORIGIN-CSRF-FIX
      // بـ backend's csrf.middleware.ts)، وrefreshToken الخاص بـ
      // /auth/refresh كوكي httpOnly لا Authorization header — لازم يوصل
      // عبر الكوكيز فعليًا.
      credentials: 'include',
    });
  } catch (err) {
    console.warn('[SW] refreshAccessToken network failure:', err && err.message);
    return { ok: false, reason: 'network' };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: 'auth' };
  }
  if (!response.ok) {
    return { ok: false, reason: 'network' };
  }

  let body;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: 'network' };
  }
  const accessToken = body?.data?.tokens?.accessToken;
  const csrfToken = body?.data?.csrfToken;
  if (typeof accessToken !== 'string' || !accessToken) {
    return { ok: false, reason: 'network' };
  }

  // T700 — the backend rotates csrfToken on every /auth/refresh (see
  // backend's setCsrfCookie: crypto.randomBytes(32) per call). When the
  // SW refreshes here during offline-queue replay, the fresh csrfToken
  // lives only in this function's return value and in the response
  // Set-Cookie header — the PAGE's auth store still holds the token
  // from its last login / page-level refresh. The page's next
  // state-changing request then sends X-CSRF-Token: <stale>, the
  // browser attaches cookie csrfToken=<fresh>, csrf.middleware.ts's
  // double-submit check fails, and the page gets a 403. client.ts's
  // FIX CSRF-403-REFRESH-01 self-heals by triggering its own refresh
  // + retry, so it's not a data leak — but it costs an extra
  // round-trip and 403-Sentry noise on exactly the weak-network paths
  // the queue exists for. Broadcasting the fresh csrfToken lets the
  // page update its in-memory copy immediately, so the first request
  // after replay passes without the wasted hop. Fire-and-forget: if
  // notifyClients rejects (clients.matchAll can, in theory, on a
  // torn-down SW scope), the refresh result itself is unaffected.
  if (typeof csrfToken === 'string' && csrfToken) {
    void notifyClients({ type: 'SW_TOKEN_REFRESHED', csrfToken }).catch(() => {});
  }

  return { ok: true, accessToken, csrfToken: typeof csrfToken === 'string' ? csrfToken : null };
}

async function replayOne(entry, hasRetriedAfterRefresh, freshCreds, refreshReason, lifecycleVersion = queueLifecycleVersion) {
  if (queueClearInFlight || lifecycleVersion !== queueLifecycleVersion) return 'still-offline';
  // FIX SW-PROCESSING-01: علّم العنصر قيد المعالجة لتفادي retry متوازي
  // عبر RETRY_QUEUE_ITEM أثناء عمل replayQueue.
  await markQueuedEntry(entry.id, { processing: true, processingStartedAt: Date.now() });
  try {
    // FIX SW-CSRF-REFRESH-CLASSIFY-01: never send an entry that needs a
    // CSRF token without one. Before this guard, freshCreds===null made
    // the sendHeaders block below fall through to "no x-csrf-token", the
    // backend 403'd with "Invalid or missing CSRF token", and the 4xx
    // branch marked the entry `failed` permanently — for what was often
    // just a transient network blip during the refresh. Stay pending
    // instead; the next tick retries, and MAX_QUEUE_RETRIES still bounds
    // the genuinely-dead cases.
    // FIX QUEUE-NO-STORE-AUTH-01: entries that had a Bearer at enqueue
    // time (needsAuth) must not ship without freshCreds — there is no
    // stored Authorization left to fall back on.
    if ((entry.needsCsrf || entry.needsAuth) && !freshCreds) {
      if (refreshReason === 'auth') {
        // Session truly gone — tell the UI to prompt re-login. Do NOT
        // discard the entry; once the user logs back in it should go
        // through unchanged.
        await notifyClients({
          type: 'QUEUE_NEEDS_RELOGIN',
          operationId: entry.operationId || null,
        });
      }
      return 'still-offline';
    }

    // FIX QUEUE-CSRF-STALE-01: build the actual headers for THIS send.
    // entry.headers was stripped of x-csrf-token at enqueue time (see
    // handleMutation); if the entry needs one, it comes from freshCreds
    // which replayQueueImpl obtained once at the top of the drain — the
    // token there is guaranteed fresh (minted seconds ago), so the
    // csrfToken cookie the browser is about to attach matches what we
    // send in X-CSRF-Token and csrf.middleware.ts's double-submit check
    // passes on the first try. If freshCreds is null (refresh failed,
    // or we're offline and the caller reached here anyway), the request
    // goes out without a CSRF header and the backend falls through its
    // "no csrfToken cookie → Bearer-only client" path — which is the
    // correct behavior for an expired session anyway (it'll 401 or 403
    // and replayOne will handle it below).
    // FIX OFFLINE-QUEUE-RELIABILITY-01: sanitize every replay — entries
    // queued before this fix may still carry content-length/host.
    let sendHeaders = sanitizeQueueHeaders(entry.headers || {});
    if ((entry.needsCsrf || entry.needsAuth || isUnsafeMethod(entry.method)) && freshCreds) {
      sendHeaders = {
        ...sendHeaders,
        authorization: `Bearer ${freshCreds.accessToken}`,
        ...(freshCreds.csrfToken ? { 'x-csrf-token': freshCreds.csrfToken } : {}),
      };
    } else if (freshCreds && freshCreds.accessToken) {
      // Always prefer fresh access token when we already refreshed for this drain
      sendHeaders = {
        ...sendHeaders,
        authorization: `Bearer ${freshCreds.accessToken}`,
      };
    }
    if (queueClearInFlight || lifecycleVersion !== queueLifecycleVersion) return 'still-offline';
    // Defense-in-depth for shared devices: the queue records the user id
    // from the access token at enqueue time, without storing the token. If
    // a stale row survives an account switch, never send it as the new user.
    // Legacy rows may still carry Authorization and are decoded on demand.
    const queuedOwner =
      entry.ownerUserId || decodeAccessTokenUserId(entry.headers?.authorization);
    const currentOwner = freshCreds ? decodeAccessTokenUserId(freshCreds.accessToken) : null;
    // Unsafe rows with no recorded owner are ambiguous: replaying them while
    // another account is active would silently attribute the guest/legacy
    // operation to that account. Keep them for explicit recovery instead.
    if (isUnsafeMethod(entry.method) && currentOwner && !queuedOwner) {
      await markQueuedEntry(entry.id, {
        status: 'failed',
        needsRecovery: true,
        lastError: {
          status: 409,
          message: 'تعذّر التحقق من الحساب الذي أنشأ هذه العملية؛ لن تُرسل بجلسة حساب آخر.',
        },
      });
      await notifyClients({
        type: 'QUEUE_ITEM_FAILED',
        id: entry.id,
        url: entry.url,
        status: 409,
        message: 'تعذّر التحقق من الحساب الذي أنشأ هذه العملية؛ لن تُرسل بجلسة حساب آخر.',
        operationId: entry.operationId || null,
      });
      return 'failed';
    }
    if (entry.needsAuth && !queuedOwner) {
      await markQueuedEntry(entry.id, {
        status: 'failed',
        needsRecovery: true,
        lastError: {
          status: 409,
          message: 'عملية أوفلاين قديمة لا يمكن التحقق من الحساب الذي أنشأها. أعد تنفيذها من جديد.',
        },
      });
      await notifyClients({
        type: 'QUEUE_ITEM_FAILED',
        id: entry.id,
        url: entry.url,
        status: 409,
        message: 'عملية أوفلاين قديمة لا يمكن التحقق من الحساب الذي أنشأها. أعد تنفيذها من جديد.',
        operationId: entry.operationId || null,
      });
      return 'failed';
    }
    if (queuedOwner && currentOwner && queuedOwner !== currentOwner) {
      await markQueuedEntry(entry.id, {
        status: 'failed',
        lastError: {
          status: 403,
          message: 'هذه العملية مرتبطة بحساب آخر ولن تُرسل بهذا الحساب',
        },
      });
      await notifyClients({
        type: 'QUEUE_ITEM_FAILED',
        id: entry.id,
        url: entry.url,
        status: 403,
        message: 'هذه العملية مرتبطة بحساب آخر ولن تُرسل بهذا الحساب',
        operationId: entry.operationId || null,
      });
      return 'failed';
    }
    const replayController = new AbortController();
    activeReplayControllers.add(replayController);
    let response;
    try {
      response = await fetch(entry.url, {
        method: entry.method,
        headers: sendHeaders,
        body: entry.body ?? undefined,
        signal: replayController.signal,
        // FIX SW-CREDENTIALS-01: 'include' بدل 'same-origin' — Backend على
        // origin مختلف (Render)، فلزم إرسال cookies (refreshToken في httpOnly
        // cookie) للاتساق مع refreshAccessToken الذي يستخدم 'include'.
        credentials: 'include',
      });
    } finally {
      activeReplayControllers.delete(replayController);
    }

    // A logout/account switch may have aborted the request while it was on
    // the wire. Ignore its result even if the fetch implementation resolved.
    if (queueClearInFlight || lifecycleVersion !== queueLifecycleVersion) return 'still-offline';

    if (response.ok) {
      await deleteQueuedEntry(entry.id);
      await notifyClients({
        type: 'QUEUE_ITEM_SENT',
        id: entry.id,
        url: entry.url,
        operationId: entry.operationId || null,
      });
      return 'sent';
    }

    // FIX OFFLINE-AUTH-01: انظر التعليق الطويل فوق هذه الدالة. عمدًا قبل
    // فحص "4xx عام" أدناه — 401 وحده يستحق محاولة تجديد، لا يُعامَل
    // كفشل نهائي فورًا.
    // FIX QUEUE-CSRF-OFFLINE-SESSION-01: 403 "Invalid or missing CSRF token"
    // is a stale/missing-token problem, not a definitive rejection —
    // /auth/refresh (CSRF-exempt) re-issues the token, so treat it like a
    // 401: refresh once and retry.
    let csrfRejected = false;
    if (response.status === 403) {
      try {
        const body403 = await response.clone().json();
        csrfRejected = /csrf/i.test(String(body403?.message ?? ''));
      } catch {
        csrfRejected = false;
      }
    }

    if ((response.status === 401 || csrfRejected) && !hasRetriedAfterRefresh) {
      const fresh = await refreshAccessToken(entry.url);
      if (fresh && fresh.ok) {
        // Headers.forEach (المستخدَم بـ handleMutation) يُرجِع أسماء
        // الحقول بأحرف صغيرة دومًا (Fetch spec) — entry.headers هنا
        // بنفس الصيغة، فالمطابقة المباشرة صحيحة بلا حاجة لفحص case.
        const updatedHeaders = { ...entry.headers, authorization: `Bearer ${fresh.accessToken}` };
        // FIX SW-CSRF-REFRESH-DEADCODE-01: entry.headers had x-csrf-token
        // stripped at enqueue time (see handleMutation), so the previous
        // `'x-csrf-token' in updatedHeaders` guard was always false and
        // the branch never ran. The fresh CSRF token is applied on the
        // retry by the sendHeaders block (which reads freshCreds), not
        // here - nothing to write into the stored entry.
        const updatedEntry = await markQueuedEntry(entry.id, { headers: updatedHeaders });
        if (updatedEntry) {
          // Pass 'ok' as the reason — we just successfully refreshed,
          // so any needsCsrf guard must see valid creds and NOT trigger.
          return replayOne(updatedEntry, true, fresh, 'ok', lifecycleVersion);
        }
      }
      // FIX SW-REFRESH-NETWORK-NOT-FAILED-01: distinguish refresh
      // failure modes. Only reason:'auth' (server answered 401/403 -
      // session genuinely gone) should fall through to the 4xx branch
      // below and mark the entry 'failed' permanently. reason:'network'
      // (DNS blip, timeout, 5xx) means the session may be perfectly
      // valid and a retry in a few seconds could succeed - stay pending
      // so the next drain tick tries again, bounded by MAX_QUEUE_RETRIES.
      // Without this, a single transient network failure during refresh
      // turned a soft 401 into a terminal 'failed', losing all retries -
      // on exactly the audience this queue was built for.
      if (!fresh || fresh.reason === 'network') {
        return 'still-offline';
      }
      // فشل التجديد نفسه (refreshToken بالكوكي منتهي/غير موجود) — جلسة
      // منتهية فعليًا، لا عيب بالتصميم. يسقط للمنطق أدناه فيُعامَل كـ
      // 401 عادي (يبقى بالطابور 'failed' مع رسالة الباك-إند الحقيقية).
    }

    // Still CSRF-rejected after the refresh attempt (or refresh failed):
    // keep the entry pending — the next tick retries, and
    // MAX_QUEUE_RETRIES still bounds a genuinely dead case. Marking it
    // 'failed' here is what used to strand offline-created drafts in
    // "فشل الرفع / يحتاج مراجعة يدوية".
    if (csrfRejected) {
      return 'still-offline';
    }

    let message;
    try {
      const data = await response.clone().json();
      message = typeof data?.message === 'string' ? data.message : undefined;
    } catch {
      message = undefined;
    }

    // Retryable HTTP responses are not permanent queue failures. In
    // particular, 429 used to enter the generic 4xx branch and become a
    // terminal failure even though the server explicitly asked the client
    // to slow down. Honor Retry-After when supplied, otherwise let the drain
    // backoff increase from retryCount. 408 is also safe to replay here: the
    // queued operation has an X-Offline-Op-Id on supported creates.
    const retryableHttp = [408, 425, 429, 502, 503, 504].includes(response.status);
    if (retryableHttp) {
      const retryAfterRaw = response.headers.get('retry-after');
      let retryAfterMs = 0;
      if (retryAfterRaw) {
        const seconds = Number(retryAfterRaw);
        if (Number.isFinite(seconds)) {
          retryAfterMs = Math.max(0, seconds * 1000);
        } else {
          const dateMs = Date.parse(retryAfterRaw);
          if (Number.isFinite(dateMs)) retryAfterMs = Math.max(0, dateMs - Date.now());
        }
      }
      await markQueuedEntry(entry.id, {
        lastError: { status: response.status, message },
        ...(retryAfterMs > 0 ? { retryNotBefore: Date.now() + Math.min(retryAfterMs, 15 * 60_000) } : {}),
      });
      return 'retryable-http';
    }

    if (response.status >= 400 && response.status < 500) {
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
        operationId: entry.operationId || null,
      });
      return 'failed';
    }

    // 5xx أو حالة غير متوقعة — السيرفر وصلنا فعليًا (فيه اتصال)،
    // المشكلة بالطلب/السيرفر وليست "أوفلاين". FIX QUEUE-HOL-02.
    return 'server-error';
  } catch {
    // TypeError / network failure — انقطاع أو فشل قبل أي رد HTTP.
    return 'still-offline';
  } finally {
    // FIX SW-PROCESSING-01: أزل علم المعالجة دائماً.
    try { await markQueuedEntry(entry.id, { processing: false, processingStartedAt: null }); } catch {}
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

/** PHASE-4: priority for offline queue drain order (mirrored in lib/queuePriority.ts). */
function inferQueuePriority(url, method) {
  const u = String(url || '').toLowerCase();
  const m = String(method || 'POST').toUpperCase();
  if (
    u.includes('/messages') ||
    u.includes('/conversations') ||
    u.includes('/auth/') ||
    u.includes('/payments') ||
    u.includes('/checkout')
  ) {
    return 'critical';
  }
  if (
    u.includes('/analytics') ||
    u.includes('/views') ||
    u.includes('/presence') ||
    u.includes('/heartbeat') ||
    m === 'GET' ||
    m === 'HEAD'
  ) {
    return 'low';
  }
  return 'normal';
}

function queuePriorityRank(p) {
  if (p === 'critical') return 0;
  if (p === 'normal') return 1;
  return 2;
}

function isBatchableAnalyticsUrl(url) {
  return String(url || '').includes('/analytics/events');
}

/**
 * PHASE-4 batch: if a pending analytics POST already exists, merge JSON
 * event arrays into it instead of enqueueing another row.
 */
async function tryCoalesceAnalyticsEntry(entry) {
  if (!isBatchableAnalyticsUrl(entry.url) || entry.method !== 'POST') return false;
  if (!entry.body) return false;

  let newEvents;
  try {
    const text =
      typeof entry.body === 'string'
        ? entry.body
        : await new Response(entry.body).text();
    const parsed = JSON.parse(text);
    newEvents = Array.isArray(parsed?.events) ? parsed.events : Array.isArray(parsed) ? parsed : null;
    if (!newEvents || newEvents.length === 0) return false;
  } catch {
    return false;
  }

  const all = await getAllQueuedEntries();
  const existing = all.find(
    (e) =>
      e.status !== 'failed' && e.status !== 'cancelled' &&
      e.method === 'POST' &&
      isBatchableAnalyticsUrl(e.url),
  );
  if (!existing) return false;

  try {
    const oldText =
      typeof existing.body === 'string'
        ? existing.body
        : existing.body
          ? await new Response(existing.body).text()
          : '{}';
    const oldParsed = JSON.parse(oldText || '{}');
    const oldEvents = Array.isArray(oldParsed?.events)
      ? oldParsed.events
      : Array.isArray(oldParsed)
        ? oldParsed
        : [];
    // FIX ANALYTICS-BATCH-CAP-01: cap strictly at the backend's own
    // maximum (analytics.validation.ts's trackEventsSchema events max
    // is 20 — matches the frontend tracker's own MAX_BATCH_SIZE). The
    // previous 40 here produced batches the backend rejected with
    // "Validation failed", which replayOne's 4xx branch then marked as
    // a permanent failure — silently dropping every event in the
    // batch. Crucially, when the merged total would exceed the cap,
    // this now returns false WITHOUT mutating the existing entry: the
    // caller (handleMutation) then falls through to queueRequestEntry
    // and the incoming events go into their own separate row, which
    // the next drain will coalesce further if space permits. Returning
    // true here in the overflow case would instead lose the newEvents
    // — the exact silent data-loss mode this function exists to avoid.
    const MAX_ANALYTICS_EVENTS = 20;
    if (oldEvents.length + newEvents.length > MAX_ANALYTICS_EVENTS) {
      return false;
    }
    const merged = [...oldEvents, ...newEvents];
    const newBody = JSON.stringify(
      oldParsed && !Array.isArray(oldParsed) && typeof oldParsed === 'object'
        ? { ...oldParsed, events: merged }
        : { events: merged },
    );
    await markQueuedEntry(existing.id, {
      body: newBody,
      queuedAt: existing.queuedAt,
      // FIX SW-PRIORITY-01: احتفظ بالأولوية الأصلية بدل فرض 'low'
      priority: existing.priority || 'low',
    });
    return true;
  } catch {
    return false;
  }
}

function isOrderSensitiveQueueEntry(entry) {
  const u = String(entry.url || '');
  return (
    u.includes('/messages') ||
    u.includes('/conversations') ||
    u.includes('/chat')
  );
}

// FIX REPLAY-RACE-01: قفل يمنع تشغيل replayQueue() متوازياً.
// OfflineBootstrap يستدعي REPLAY_QUEUE_NOW من 4 مسارات (mount،
// online، visibilitychange، periodic) + عبر التبويبات/النوافذ
// المتعددة (Chrome tab + PWA standalone). بدون قفل، replayQueue()
// يُشغَّل 2-4 مرات متوازية، كل واحد يقرأ نفس العناصر من IndexedDB
// قبل حذفها → POSTs مكررة لنفس الإعلان/الرسالة.
let replayQueueInFlight = false;
let queueClearInFlight = false;
// Session/queue fence: any drain started before CLEAR_QUEUE must never send
// another queued mutation or commit a response after the clear begins.
let queueLifecycleVersion = 0;
const activeReplayControllers = new Set();
// A worker can be terminated while a row is marked processing. Keep a lease
// so a fresh worker can recover abandoned rows, while concurrent drains skip
// work that is genuinely in flight. Legacy rows without a timestamp are stale.
const QUEUE_PROCESSING_LEASE_MS = 2 * 60_000;
function hasActiveProcessingLease(entry, now = Date.now()) {
  if (!entry?.processing) return false;
  const startedAt = entry.processingStartedAt;
  return Number.isFinite(startedAt) && startedAt > 0 && now - startedAt < QUEUE_PROCESSING_LEASE_MS;
}

async function replayQueue() {
  if (queueClearInFlight || replayQueueInFlight) return;
  replayQueueInFlight = true;
  const lifecycleVersion = queueLifecycleVersion;
  const startedAt = Date.now();
  await notifyClients({ type: 'QUEUE_DRAIN_STARTED', startedAt });
  try {
    const result = await replayQueueImpl(lifecycleVersion);
    await notifyClients({
      type: 'QUEUE_DRAIN_FINISHED',
      startedAt,
      durationMs: Date.now() - startedAt,
      processed: result?.processed ?? 0,
      sent: result?.sent ?? 0,
      failed: result?.failed ?? 0,
      stillOffline: Boolean(result?.stillOffline),
    });
  } finally {
    replayQueueInFlight = false;
  }
}

/** FIX SW-PRUNE-FAILED: حد أقصى لعدد العناصر الفاشلة في الطابور.
 * بدون هذا، المستخدم الذي لديه 100+ عملية فاشلة يبقى الطابور ينمو
 * للأبد. عند التجاوز، الأقدم يُحذف تلقائياً. */
async function pruneFailedEntries(maxFailed = 50) {
  try {
    const all = await getAllQueuedEntries();
    const failed = all.filter((e) => e.status === 'failed');
    if (failed.length <= maxFailed) return;
    const sorted = failed.slice().sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0));
    const toDelete = sorted.slice(0, failed.length - maxFailed);
    for (const entry of toDelete) {
      await deleteQueuedEntry(entry.id);
    }
  } catch {
    // لا توقف replayQueue إن فشل التنظيف.
  }
}

async function replayQueueImpl(lifecycleVersion = queueLifecycleVersion) {
  const metrics = { processed: 0, sent: 0, failed: 0, stillOffline: false };
  // FIX SW-PRUNE-FAILED: نظّف العناصر الفاشلة القديمة قبل المعالجة.
  await pruneFailedEntries(50);
  if (queueClearInFlight || lifecycleVersion !== queueLifecycleVersion) return metrics;

  let entries;
  try {
    entries = await getAllQueuedEntries();
  } catch {
    return metrics;
  }

  if (queueClearInFlight || lifecycleVersion !== queueLifecycleVersion) return metrics;

  // FIX QUEUE-CSRF-STALE-01: if ANY live entry was queued with a CSRF
  // token (needsCsrf), obtain fresh credentials ONCE for this entire
  // drain rather than per-entry — /auth/refresh rotates both the
  // access token and the csrfToken, and calling it N times would
  // thrash that rotation for no benefit. Failed entries are excluded
  // (they're skipped below anyway) so a dead entry doesn't force an
  // otherwise-unnecessary refresh on every drain tick.
  let freshCreds = null;
  // FIX SW-CSRF-REFRESH-CLASSIFY-01: track *why* refresh produced nothing
  // — replayOne uses this to decide between "stay pending, retry on next
  // tick" (network) and "session actually ended, prompt re-login" (auth).
  let refreshReason = null; // 'auth' | 'network' | null
  const anyNeedsCsrf = entries.some(
    (e) =>
      e.status !== 'failed' && e.status !== 'cancelled' &&
      (e.needsCsrf || e.needsAuth || isUnsafeMethod(e.method)),
  );
  if (anyNeedsCsrf && !(typeof navigator !== 'undefined' && navigator.onLine === false)) {
    const r = await refreshAccessToken(entries[0].url);
    if (queueClearInFlight || lifecycleVersion !== queueLifecycleVersion) return metrics;
    if (r && r.ok) {
      freshCreds = r;
    } else {
      refreshReason = r?.reason ?? 'network';
    }
  }

  // FIX QUEUE-HOL-01/02/03:
  //  - still-offline  → no HTTP response (network)
  //  - server-error   → 5xx while connected
  //  - Real offline (navigator.onLine === false): stop loop (no point).
  //  - Server error / soft fail: fail-fast then continue so one item
  //    cannot park 50+ others. Message/chat URLs stay FIFO (break).
  //  - minGap backoff per entry; non-sensitive entries skip if too soon.
  const trulyOffline =
    typeof navigator !== 'undefined' && navigator.onLine === false;

  // PHASE-4: critical (messages/auth) before normal before low (analytics)
  entries = entries.slice().sort((a, b) => {
    const ra = queuePriorityRank(a.priority || inferQueuePriority(a.url, a.method));
    const rb = queuePriorityRank(b.priority || inferQueuePriority(b.url, b.method));
    if (ra !== rb) return ra - rb;
    return (a.queuedAt || 0) - (b.queuedAt || 0);
  });

  // Bound each drain so a fast connection can catch up without allowing a
  // huge queue to monopolize the radio, while slow links get a deliberately
  // small batch. A later online/sync tick continues from where this pass stops.
  const maxDrainEntries = Math.max(4, Math.min(12, queueConcurrencyHint * 4));
  let processedEntries = 0;

  for (const entry of entries) {
    if (queueClearInFlight || lifecycleVersion !== queueLifecycleVersion) break;
    if (processedEntries >= maxDrainEntries) break;
    if (entry.status === 'failed' || entry.status === 'cancelled') continue;

    // Never replay a row that another drain is actively sending. Recover a
    // stale lease left by a terminated worker; rows from older versions have
    // no processingStartedAt and are therefore recoverable too.
    if (hasActiveProcessingLease(entry)) continue;
    if (entry.processing) {
      await markQueuedEntry(entry.id, { processing: false, processingStartedAt: null });
      entry.processing = false;
      entry.processingStartedAt = null;
    }

    const now = Date.now();
    const lastAttemptAt =
      typeof entry.lastAttemptAt === 'number' ? entry.lastAttemptAt : 0;
    const retries = typeof entry.retryCount === 'number' ? entry.retryCount : 0;
    const minGap = Math.min(
      queueRetryMinGapMs * Math.pow(2, Math.max(0, retries - 1)),
      5 * 60_000,
    );
    const tooSoon = lastAttemptAt > 0 && now - lastAttemptAt < minGap;
    const retryNotBefore = typeof entry.retryNotBefore === 'number' ? entry.retryNotBefore : 0;
    const retryAfterGate = retryNotBefore > now;
    const orderSensitive = isOrderSensitiveQueueEntry(entry);

    if (tooSoon || retryAfterGate) {
      if (orderSensitive || trulyOffline) break;
      continue; // try later items that may be eligible
    }

    processedEntries += 1;
    metrics.processed += 1;
    const result = await replayOne(entry, false, freshCreds, refreshReason, lifecycleVersion);

    if (result === 'sent' || result === 'failed') {
      if (result === 'sent') metrics.sent += 1;
      else metrics.failed += 1;
      continue;
    }

    // FIX N1-PAGE-PRIORITY-RETRY: when the only reason we could not send
    // is that a visible page owns the token refresh (or a transient
    // network refresh failure left us without freshCreds), do NOT burn
    // retryCount. Otherwise 5 page-open drains mark the entry `failed`
    // without ever attempting a real fetch. Keep lastAttemptAt so the
    // minGap backoff still spaces retries; page refresh + next drain
    // will supply creds.
    const deferRetryCount =
      result === 'still-offline' &&
      (refreshReason === 'page-priority' ||
        refreshReason === 'network' ||
        ((entry.needsCsrf || entry.needsAuth) && !freshCreds));

    if (deferRetryCount) {
      await markQueuedEntry(entry.id, {
        lastAttemptAt: now,
        lastSoftError: result,
        processing: false,
      });
      if (trulyOffline) { metrics.stillOffline = true; break; }
      if (orderSensitive) break;
      continue;
    }

    const nextRetries = retries + 1;
    const isServer = result === 'server-error' || result === 'retryable-http';
    const limit = isServer ? MAX_QUEUE_SERVER_RETRIES : MAX_QUEUE_RETRIES;

    if (nextRetries >= limit) {
      metrics.failed += 1;
      await markQueuedEntry(entry.id, {
        status: 'failed',
        retryCount: nextRetries,
        lastAttemptAt: now,
        lastError: {
          status: isServer ? (entry.lastError?.status ?? 500) : 0,
          message: isServer
            ? 'فشل الطلب بعد عدة محاولات — أعد المحاولة يدويًا أو احذف العملية'
            : 'تعذّر الإرسال بعد عدة محاولات — أعد المحاولة يدويًا أو احذف الطلب',
        },
        retryNotBefore: 0,
      });
      await notifyClients({
        type: 'QUEUE_ITEM_FAILED',
        id: entry.id,
        url: entry.url,
        status: isServer ? 500 : 0,
        message: isServer
          ? 'فشل السيرفر بعد عدة محاولات'
          : 'تعذّر الإرسال بعد عدة محاولات',
        operationId: entry.operationId || null,
      });
      continue;
    }

    await markQueuedEntry(entry.id, {
      retryCount: nextRetries,
      lastAttemptAt: now,
      lastSoftError: result,
      retryNotBefore: result === 'retryable-http' ? (entry.retryNotBefore || 0) : 0,
    });

    // Real offline → stop entire drain.
    // FIX SW-REDUNDANT-OFFLINE-01: trulyOffline is computed once above;
    // the previous second clause (typeof navigator... onLine===false)
    // duplicated it exactly.
    if (trulyOffline) {
      metrics.stillOffline = true;
      break;
    }
    // Chat/messages: preserve order.
    if (orderSensitive) {
      break;
    }
    // Other operations: continue so one stuck ad/product mutation
    // does not freeze the rest of the queue.
  }

  await notifyClients({ type: 'QUEUE_REPLAYED' });
  return metrics;
}



/** طلبات API غير GET (POST/PUT/PATCH/DELETE).
 *
 * FIX SW-ONLINE-PASSTHROUGH-01:
 *   أونلاين → تمرير شفاف `fetch(request)` بلا catch يختلق 503.
 *   السبب: أي فشل لحظي (أو TypeError) كان يُحوَّل لـ 503 JSON
 *   `{code:NETWORK_ERROR}` (~150 بايت) فيظهر في Network كـ POST ads 503
 *   رغم أن GET للـ API ينجح والخادم سليم — رسالة مضلّلة.
 *   التمرير الشفاف يعيد سلوك المتصفح/axios الطبيعي (رد السيرفر الحقيقي
 *   أو خطأ شبكة status 0) دون اختلاق 503 من الـ SW.
 *
 *   أوفلاين → طابور + 202 {queued:true} (SW-QUEUE-ONLY-OFFLINE-01).
 */
// FIX ANALYTICS-QUEUE-RACE-01 — /analytics/events is fire-and-forget
// telemetry. It is safe to lose (the event is already stale by the
// time we'd replay it), the backend CSRF-exempts it (see
// csrf.middleware.ts's CSRF_EXEMPT_PATHS), and queuing it caused a
// real bug: every queued analytics POST has needsCsrf=true (it's a
// non-safe method), so the next replayQueue pass called
// refreshAccessToken BEFORE sending it. That SW refresh ran
// concurrently with AuthHydrationProvider's own /auth/refresh at the
// following page load; the backend's atomicRefreshRotate Lua script
// rotates the cookie exactly once, so one of the two calls always
// 401'd with TOKEN_MISMATCH. AuthHydrationProvider was the loser
// often enough to produce the "يخرجني من حسابي على كل ريفرش"
// regression. Never queuing these requests eliminates the race
// entirely — the beacon is exactly the kind of call that should be
// dropped silently when the network is down.
function isAnalyticsBeacon(url) {
  return url.pathname === '/api/v1/analytics/events';
}

async function handleMutation(request) {
  // Bind this request to the queue/session lifecycle at entry. A network
  // failure may resolve after logout cleanup; that stale request must not
  // enqueue itself into the next user's queue.
  const enqueueLifecycleVersion = queueLifecycleVersion;
  // FIX ANALYTICS-QUEUE-RACE-01: bypass queue entirely for the public
  // analytics beacon. Transparent network pass-through when online;
  // Response.error() when offline (the client's sendBeacon wrapper
  // swallows it — an analytics call failing is a non-event).
  try {
    const beaconUrl = new URL(request.url);
    if (isAnalyticsBeacon(beaconUrl)) {
      try {
        return await fetch(request);
      } catch {
        return Response.error();
      }
    }
  } catch {
    /* unparsable URL — fall through to normal handling */
  }

  // FIX PRESENCE-SKIP-QUEUE-01: never queue presence heartbeats.
  // touchPresence fires roughly every 45s while the app is open (see
  // useHeartbeat). On Gaza mobile networks a single failed PATCH is
  // common — and every one that reached the queue stayed there, so an
  // hour of flaky connectivity meant 80+ queue rows for a value nothing
  // reads afterwards (the next successful tick supersedes it). Failing
  // fast here lets the next tick try on its own; the queue stays for
  // things that actually need replay (drafts, messages, likes).
  try {
    const presenceUrl = new URL(request.url);
    if (presenceUrl.pathname.endsWith('/users/me/presence')) {
      // Bypass the queueing logic entirely — the caller already treats
      // a failed heartbeat as best-effort (see the client-side presence
      // hook's own catch), so a thrown network error here is the correct
      // shape.
      return fetch(request);
    }
  } catch {
    /* unparsable URL — fall through to normal handling */
  }

  // FIX MUTATION-SOFT-OFFLINE-01: navigator.onLine يعكس فقط وجود واجهة
  // شبكة نشطة، لا اتصال إنترنت فعلي شغّال — قيد موثّق بالـAPI نفسه. كان
  // فرع "أونلاين" هنا (navigator.onLine !== false) يُنفّذ fetch(request)
  // بلا try/catch إطلاقًا ويُعيد أي فشل شبكة كما هو للواجهة — أي طلب
  // (وأهمها: رسائل المحادثة، critical priority) يفشل ويُفقد نهائيًا بدل
  // أن يُقيَّد بالطابور، تحديدًا بالحالة الأكثر شيوعًا للجمهور المستهدف:
  // شبكة "متصلة" حسب المتصفح لكن بطيئة/متقطعة فعليًا. الحل: استنساخ
  // الطلب واعتماد try/catch دائمًا بغض النظر عن navigator.onLine —
  // أي استثناء (لا رد HTTP إطلاقًا) يُعامَل كـ"يحتاج طابور"، تمامًا
  // كما تُصنَّف نفس الحالة أصلًا بـreplayOne (catch → 'still-offline').
  const isOffline =
    typeof navigator !== 'undefined' && navigator.onLine === false;
  const requestForQueue = request.clone();
  try {
    return await fetch(request);
  } catch {
    // FIX OFFLINE-ADS-01: .blob() بدل .text() حتى لا تُتلف بايتات الصور
    // في multipart عند إعادة الإرسال لاحقًا.
    let body = null;
    try {
      const blob = await requestForQueue.blob();
      body = blob.size > 0 ? blob : null;
    } catch (blobErr) {
      console.warn('[SW] queue body read failed:', blobErr && blobErr.message);
      body = null;
    }

    // FIX OFFLINE-QUEUE-RELIABILITY-01: جسم أكبر من السقف → لا نُحاول
    // IndexedDB (غالبًا يفشل Quota). نُرجع خطأ واضح لتأخذ الواجهة
    // مسار المسودة + publishFiles وتعيد الرفع عند عودة النت.
    if (body && body.size > MAX_QUEUE_BODY_BYTES) {
      console.warn('[SW] body too large for offline queue:', body.size);
      return new Response(
        JSON.stringify({
          queued: false,
          code: 'QUEUE_BODY_TOO_LARGE',
          message:
            'حجم المرفقات كبير للأوفلاين — حُفظت مسودة محلية وستُرفع عند عودة الاتصال.',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const headers = {};
    let ownerUserId = null;
    // FIX QUEUE-CSRF-STALE-01: strip x-csrf-token at queue time and
    // record only that the entry needs one.
    let needsCsrf = false;
    // FIX QUEUE-NO-STORE-AUTH-01: remember that this entry requires a
    // Bearer token without storing the token itself in IndexedDB.
    let needsAuth = false;
    requestForQueue.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === 'x-csrf-token') {
        needsCsrf = true;
        return;
      }
      if (lower === 'authorization') {
        needsAuth = true;
        ownerUserId = decodeAccessTokenUserId(value);
        return;
      }
      // FIX OFFLINE-QUEUE-RELIABILITY-01: لا نخزّن headers تُكسر الـ replay
      if (QUEUE_STRIP_HEADERS.has(lower)) return;
      headers[key] = value;
    });

    // FIX AD-DRAFT-QUEUE-LINK-01: X-Offline-Op-Id → حقل operationId مستقل.
    const operationId =
      headers['x-offline-op-id'] || headers['X-Offline-Op-Id'] || null;

    try {
      const priority = inferQueuePriority(requestForQueue.url, requestForQueue.method);
      if (queueClearInFlight || enqueueLifecycleVersion !== queueLifecycleVersion) {
        return new Response(
          JSON.stringify({
            queued: false,
            code: 'QUEUE_SESSION_CHANGED',
            message: 'تغيّرت الجلسة أثناء حفظ العملية؛ لم تُحفظ لإعادة الإرسال بحساب آخر.',
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Authenticated operations must retain an owner. An unsafe operation
      // created without an owner must not later inherit whichever account
      // happens to be active when the queue is replayed.
      const entry = {
        url: requestForQueue.url,
        method: requestForQueue.method,
        headers,
        body,
        queuedAt: Date.now(),
        operationId,
        priority,
        needsCsrf,
        needsAuth,
        ownerUserId,
        retryCount: 0,
      };
      // PHASE-4: merge offline analytics beacons into one queue row
      const coalesced = await tryCoalesceAnalyticsEntry(entry);
      if (!coalesced) {
        await queueRequestEntry(entry, enqueueLifecycleVersion);
      }
    } catch (storeErr) {
      // FIX OFFLINE-QUEUE-RELIABILITY-01: كان Response.error() صامتًا —
      // الواجهة ما تعرف تحفظ مسودة بسياق "طابور فشل"، والمستخدم يظن
      // أن العملية اختفت. 503 + code واضح → isNetworkLikeFailure + onError.
      const lifecycleChanged =
        storeErr?.code === 'QUEUE_LIFECYCLE_CHANGED' ||
        queueClearInFlight || enqueueLifecycleVersion !== queueLifecycleVersion;
      console.warn('[SW] queueRequestEntry failed:', storeErr && storeErr.message);
      return new Response(
        JSON.stringify({
          queued: false,
          code: lifecycleChanged ? 'QUEUE_SESSION_CHANGED' : 'QUEUE_STORE_FAILED',
          message: lifecycleChanged
            ? 'تغيّرت الجلسة أثناء حفظ العملية؛ لم تُحفظ لإعادة الإرسال بحساب آخر.'
            : 'تعذّر حفظ العملية في طابور الأوفلاين — حُفظت مسودة محلية إن أمكن وستُرفع عند عودة الاتصال.',
        }),
        { status: lifecycleChanged ? 409 : 503, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (self.registration && self.registration.sync) {
      try {
        await self.registration.sync.register(SYNC_TAG);
      } catch {
        // Background Sync غير مدعوم (iOS Safari) — REPLAY_QUEUE_NOW يغطي.
      }
    }

    return new Response(
      JSON.stringify({
        queued: true,
        message: isOffline
          ? 'لا يوجد اتصال — سيُعاد إرسال العملية تلقائيًا عند عودة الاتصال.'
          : 'تعذّر إرسال الطلب — سيُعاد المحاولة تلقائيًا.',
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
        // FIX SW-CAPTIVE-02: تحقق من isSameOriginResponse أيضاً — بدونها
        // captive portal قد يُخزَّن كصفحة /offline شرعية.
        if (!response.ok || !isSameOriginResponse(response)) return;
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
    // FIX AUTO-READ-CACHE-PRESERVE: market-auto-read-ads كان يُحذف فور كل
    // SW update لأنه ليس في currentCaches → كل الإعلانات المزارة تختفي
    // (نفس نمط v24 لـ CORE_CACHE). الآن يُحفظ عبر التحديثات.
    'market-auto-read-ads',
  ];
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) =>
            name.startsWith('market-') &&
            !currentCaches.includes(name) &&
            !name.startsWith(USER_DATA_CACHE_PREFIX),
          )
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

  if (type === 'GET_SW_STATUS') {
    const status = {
      type: 'SW_STATUS',
      cacheVersion: CACHE_VERSION,
      state: self.registration?.active ? 'active' : 'running',
      timestamp: Date.now(),
    };
    // Prefer the request's MessagePort so callers can use a bounded request
    // without adding a permanent global message listener.
    const replyPort = event.ports && event.ports[0];
    if (replyPort) replyPort.postMessage(status);
    else if (event.source && typeof event.source.postMessage === 'function') {
      event.source.postMessage(status);
    }
    return;
  }

  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (type === 'INVALIDATE_API_CACHE') {
    const prefixes = Array.isArray(event.data?.prefixes)
      ? event.data.prefixes.filter((value) => typeof value === 'string' && value.startsWith('/'))
      : [];
    const domains = Array.isArray(event.data?.domains)
      ? event.data.domains.filter((value) => typeof value === 'string')
      : [];
    // Prefixes remain the authoritative physical deletion selector; domains
    // are the canonical logical contract and are retained for diagnostics.
    if (prefixes.length === 0 && domains.length === 0) return;

    const contractPrefixes = domains.length && self.MARKET_CACHE_CONTRACT?.invalidation
      ? self.MARKET_CACHE_CONTRACT.invalidation
          .filter((rule) => Array.isArray(rule.domains) && rule.domains.some((domain) => domains.includes(domain)))
          .flatMap((rule) => Array.isArray(rule.prefixes) ? rule.prefixes : [])
      : [];
    const effectivePrefixes = [...new Set([...prefixes, ...contractPrefixes])];

    const matchesPrefix = (request) => {
      try {
        const pathname = new URL(request.url).pathname;
        return effectivePrefixes.some((prefix) =>
          pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`),
        );
      } catch {
        return false;
      }
    };

    event.waitUntil((async () => {
      const cacheNames = await caches.keys();
      const targetNames = cacheNames.filter((name) =>
        name === API_CACHE ||
        name.startsWith(USER_DATA_CACHE_PREFIX),
      );
      await Promise.all(targetNames.map(async (name) => {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        await Promise.all(keys.filter(matchesPrefix).map((request) => cache.delete(request)));
      }));
    })());
    return;
  }

  if (type === 'TRIM_DISPOSABLE_CACHES') {
    // CACHE-W11: pressure cleanup is coordinated by the SW so we trim the
    // disposable layers instead of deleting the whole API/image cache.
    // Protected caches (core, saved ads, personal shells, queue) are never
    // touched by this command.
    event.waitUntil((async () => {
      const ratio = await storagePressureRatio();
      const factor = ratio != null && ratio >= 0.95 ? 0.25 : 0.5;
      await Promise.all([
        trimCache(API_CACHE, Math.max(10, Math.floor(MAX_API_ENTRIES * factor))),
        trimCache(IMAGE_CACHE, Math.max(10, Math.floor(MAX_IMAGE_ENTRIES * factor))),
      ]);
      // Auto-read is explicitly disposable and has its own bounded index.
      // Clear only its Cache Storage payload here; the index will naturally
      // repopulate from subsequent visits.
      try { await caches.delete('market-auto-read-ads'); } catch (_) {}
    })());
    return;
  }

  if (type === 'CLEAR_API_CACHE') {
    // SECURITY FIX (audit #2): تُستدعى عند تسجيل الخروج (useAuthMutations.ts's
    // clearServiceWorkerApiCache) — تمنع تسريب استجابات API مخزَّنة لمستخدم
    // سابق على جهاز مشترك للمستخدم التالي الذي يسجّل دخوله.
    // FEAT-OFFLINE-MSG + FIX PWA-NOTIF-01: PERSONAL_SHELL_CACHE يحمل نفس
    // درجة الحساسية (شكل صفحة محادثة قد يتضمن أسماء/معاينة رسائل، أو شكل
    // صفحة إشعارات) — يُمسح هنا معه لنفس السبب.
    // PHASE-5: USER_DATA_CACHE joins API_CACHE and PERSONAL_SHELL_CACHE
    // on logout. Its 14 endpoints include /users/me, /favorites,
    // /notifications, /conversations — every one of them is the previous
    // user's private data. Without this clear, User B on a shared
    // device would see User A's dashboard, favorites, and inbox offline
    // until the next warming pass overwrote them.
    event.waitUntil(Promise.all([
      caches.delete(API_CACHE),
      caches.delete(PERSONAL_SHELL_CACHE),
      caches.keys().then((names) =>
        Promise.all(names.filter((name) => name.startsWith(USER_DATA_CACHE_PREFIX)).map((name) => caches.delete(name))),
      ),
    ]));
    return;
  }

  if (type === 'NETWORK_POLICY_UPDATE') {
    const tier = String(event.data?.tier || 'unknown');
    const allowed = new Set(['offline', 'very-slow', 'slow', 'normal', 'fast', 'unknown']);
    if (allowed.has(tier)) {
      const gaps = {
        offline: 60_000,
        'very-slow': 60_000,
        slow: 45_000,
        normal: 30_000,
        fast: 15_000,
        unknown: 30_000,
      };
      queueRetryMinGapMs = gaps[tier] || QUEUE_RETRY_MIN_GAP_MS;
      const requestedConcurrency = Number(event.data?.queueConcurrency);
      queueConcurrencyHint = Number.isFinite(requestedConcurrency)
        ? Math.max(1, Math.min(3, Math.floor(requestedConcurrency)))
        : 1;
    }
    return;
  }

  if (type === 'REPLAY_QUEUE_NOW') {
    event.waitUntil(replayQueue());
  }

  // FIX QUEUE-CLEAR-ON-LOGOUT: يحذف كل عناصر الطابور — يُستدعى من
  // authCleanup عند logout، بدلاً من ترك عناصر User A (مع توكنه) تظهر
  // لـ User B على نفس الجهاز. لا يحاول replay أثناء الحذف.
  if (type === 'CLEAR_QUEUE') {
    event.waitUntil(
      (async () => {
        // Invalidate every snapshot/drain immediately, before awaiting IDB.
        // This closes the race where an old drain continued to the next row
        // after CLEAR_QUEUE had deleted the queue and released its lock.
        queueLifecycleVersion += 1;
        queueClearInFlight = true;
        // Abort mutations currently on the wire before deleting their
        // IndexedDB rows. Logout must not race a replay and let an old
        // user's mutation reach the server after local session teardown.
        activeReplayControllers.forEach((controller) => {
          try { controller.abort(); } catch {}
        });
        try {
          const all = await getAllQueuedEntries();
          for (const entry of all) {
            await deleteQueuedEntry(entry.id);
          }
          await notifyClients({ type: 'QUEUE_CLEARED' });
        } catch (err) {
          console.warn('[SW] CLEAR_QUEUE failed:', err);
          await notifyClients({ type: 'QUEUE_CLEAR_FAILED' });
        } finally {
          queueClearInFlight = false;
        }
      })(),
    );
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
        if (!entry.ownerUserId || event.data.ownerUserId !== entry.ownerUserId) return;
        // FIX SW-PROCESSING-01: تجاوز إذا كانت replayQueue تعالج نفس العنصر
        if (hasActiveProcessingLease(entry)) return;
        if (entry.processing) {
          // Recover stale/legacy leases before explicit retry.
          await markQueuedEntry(entry.id, { processing: false, processingStartedAt: null });
          entry.processing = false;
          entry.processingStartedAt = null;
        }

        // T706 — flipping failed→pending BEFORE checking the drain lock.
        // If a drain is currently in flight, its replayQueueImpl() will
        // see this entry as 'pending' on its next iteration and attempt
        // it; calling replayOne() directly here as well would produce a
        // duplicate POST when the drain reaches the same id (the drain
        // does not check `processing` before calling replayOne). The
        // window is tight — user must click retry while a drain is
        // mid-flight AND before the drain reaches this id — but on the
        // weak-network paths this queue exists for, drains run often
        // and last long, so the window is real. Same class of race as
        // the one REPLAY-RACE-01's lock already prevents for
        // REPLAY_QUEUE_NOW.
        const wasFailed = entry.status === 'failed';
        if (wasFailed) {
          await markQueuedEntry(entry.id, { status: 'pending', retryCount: 0, lastAttemptAt: 0, retryNotBefore: 0, lastSoftError: undefined, lastError: undefined });
        }

        if (replayQueueInFlight) {
          // Drain is running — it will pick up the (now-pending) entry.
          // Just signal the UI so any subscriber refreshes its view.
          await notifyClients({ type: 'QUEUE_REPLAYED' });
          return;
        }

        // FIX N1-MANUAL-RETRY: ask any visible page to refresh first,
        // then run a full drain so needsAuth/needsCsrf entries get
        // freshCreds. Calling replayOne(..., null, null) previously
        // always returned still-offline for auth entries.
        try {
          const clients = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
          });
          clients
            .filter((c) => c.visibilityState === 'visible')
            .forEach((c) => c.postMessage({ type: 'SW_REQUEST_REFRESH' }));
        } catch { /* best-effort */ }
        // Short delay so page refreshSessionShared can complete; then
        // drain the whole queue (single-entry path lacked creds).
        await new Promise((r) => setTimeout(r, 400));
        await replayQueue();
        await notifyClients({ type: 'QUEUE_REPLAYED' });
      })(),
    );
  }

  // إلغاء الإرسال بدون حذف الحمولة: تبقى محليًا بحالة cancelled،
  // فلا تعود للمزامنة تلقائيًا ولا يفقد المستخدم محتواه. يمكنه لاحقًا
  // إعادة المحاولة أو حذفها صراحة.
  if (type === 'CANCEL_QUEUE_ITEM' && event.data.id != null) {
    event.waitUntil(
      (async () => {
        const entry = await getQueuedEntry(event.data.id);
        if (!entry || !entry.ownerUserId || event.data.ownerUserId !== entry.ownerUserId) return;
        await markQueuedEntry(event.data.id, { status: 'cancelled' });
        await notifyClients({
          type: 'QUEUE_ITEM_CANCELLED',
          id: event.data.id,
          operationId: entry.operationId || null,
        });
      })(),
    );
  }

  if (type === 'RETRY_QUEUE_OPERATION' && typeof event.data.operationId === 'string') {
    event.waitUntil(
      (async () => {
        const all = await getAllQueuedEntries();
        const ownerUserId = typeof event.data.ownerUserId === 'string' ? event.data.ownerUserId : null;
        const matches = all.filter((entry) => entry.operationId === event.data.operationId && entry.ownerUserId && ownerUserId === entry.ownerUserId);
        for (const entry of matches) {
          await markQueuedEntry(entry.id, { status: 'pending', lastError: undefined });
        }
        event.ports?.[0]?.postMessage({ found: matches.length > 0 });
        if (matches.length > 0) {
          await replayQueue();
          await notifyClients({ type: 'QUEUE_REPLAYED' });
        }
      })(),
    );
  }

  if (type === 'CANCEL_QUEUE_OPERATION' && typeof event.data.operationId === 'string') {
    event.waitUntil(
      (async () => {
        const all = await getAllQueuedEntries();
        const ownerUserId = typeof event.data.ownerUserId === 'string' ? event.data.ownerUserId : null;
        const matches = all.filter((entry) => entry.operationId === event.data.operationId && entry.ownerUserId && ownerUserId === entry.ownerUserId);
        for (const entry of matches) {
          await markQueuedEntry(entry.id, { status: 'cancelled' });
          await notifyClients({ type: 'QUEUE_ITEM_CANCELLED', id: entry.id, operationId: entry.operationId || null });
        }
        event.ports?.[0]?.postMessage({ found: matches.length > 0 });
      })(),
    );
  }

  // FEAT-OFFLINE-MSG: تجاهل نهائي لعنصر فاشل بعينه (زر "حذف" على فقاعة
  // رسالة فشلت) — يُسقطه من الطابور دون أي محاولة إرسال أخرى.
  if (type === 'DISCARD_QUEUE_ITEM' && event.data.id != null) {
    event.waitUntil(
      (async () => {
        // FIX AD-DRAFT-QUEUE-LINK-01: اقرأ operationId قبل الحذف — بعده
        // العنصر لم يعد موجودًا لنقرأه منه.
        const entry = await getQueuedEntry(event.data.id);
        if (!entry || !entry.ownerUserId || event.data.ownerUserId !== entry.ownerUserId) return;
        await deleteQueuedEntry(event.data.id);
        await notifyClients({
          type: 'QUEUE_ITEM_DISCARDED',
          id: event.data.id,
          operationId: entry?.operationId || null,
        });
      })(),
    );
  }

  // FIX PERMANENT-4XX-CLEAR-QUEUE: discards a queued entry BY its
  // operationId rather than its internal id. offlineDraftPublisher
  // sends this when the server has returned a permanent 4xx for the
  // operation (validation error, forbidden, etc.) — the request will
  // never succeed, so keeping it in the queue only causes the sync
  // center to keep counting it as "in queue" and every subsequent
  // replay tick to keep re-attempting it. The Publisher doesn't know
  // the entry's numeric id (that's SW-internal) — only the
  // operationId it and the draft both carry — hence this variant.
  if (type === 'DISCARD_QUEUE_ITEM_BY_OP_ID' && typeof event.data.operationId === 'string') {
    event.waitUntil(
      (async () => {
        try {
          const opId = event.data.operationId;
          const ownerUserId = typeof event.data.ownerUserId === 'string' ? event.data.ownerUserId : null;
          if (!ownerUserId) return;
          const all = await getAllQueuedEntries();
          const matches = all.filter((e) => e.operationId === opId && e.ownerUserId === ownerUserId);
          for (const m of matches) {
            await deleteQueuedEntry(m.id);
            await notifyClients({
              type: 'QUEUE_ITEM_DISCARDED',
              id: m.id,
              operationId: opId,
            });
          }
        } catch (err) {
          // Never let a discard failure take down the SW — the
          // server-side rejection is already recorded on the draft.
          console.warn('[SW] DISCARD_QUEUE_ITEM_BY_OP_ID failed:', err);
        }
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
// الحمولة المتوقَّعة من backend/.../pushService.ts: { title, body, url?, tag?, image?, urgent?, type? }

// NOTIF-SW-UX-01: type-specific action buttons. The type comes from the
// payload when present; otherwise it is inferred from the tag prefix so older
// servers / queued payloads keep working. Labels are Arabic (dir/lang below).
function pushActionsFor(data) {
  const tag = typeof data.tag === 'string' ? data.tag : '';
  const type = typeof data.type === 'string' ? data.type : '';
  const dismiss = { action: 'dismiss', title: 'تجاهل' };
  if (type === 'NEW_MESSAGE' || tag.startsWith('conversation-')) {
    return [{ action: 'open', title: 'رد' }, dismiss];
  }
  if (type === 'NEW_REQUEST_OFFER' || type === 'REQUEST_OFFER_ACCEPTED') {
    return [{ action: 'open', title: 'عرض العرض' }, dismiss];
  }
  if (type === 'FAV_AD_SOLD' || type === 'FAV_AD_PRICE_CHANGED') {
    return [{ action: 'open', title: 'عرض الإعلان' }, dismiss];
  }
  if (type === 'TEST') {
    return [dismiss];
  }
  return [{ action: 'open', title: 'فتح' }, dismiss];
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || 'سوق غزة';
  const targetUrl = data.url || '/';
  const options = {
    body: data.body || '',
    tag: data.tag,
    renotify: Boolean(data.tag),
    data: { url: targetUrl },
    icon: '/icon-192',
    badge: '/icon-192',
    // Arabic-first UI: without these the OS may lay the banner out LTR.
    dir: 'rtl',
    lang: 'ar',
    // Rich: optional large image — https only (http is blocked as mixed content
    // and would be a tracking/downgrade vector).
    ...(typeof data.image === 'string' && data.image.startsWith('https://')
      ? { image: data.image }
      : {}),
    actions: pushActionsFor(data),
  };

  // PUSH-PRESENCE-01: if the user is already looking at this very
  // conversation (visible + focused window on the target path), the
  // message is already on screen via SSE — a banner on top of it is pure
  // noise. Deliberately narrow: only chat pushes (tag 'conversation-…'),
  // only a window that is both visible AND focused, only an exact path
  // match. Every other case still shows the notification, so a broken
  // SSE connection or a background tab can never swallow a push.
  event.waitUntil(
    (async () => {
      try {
        if (typeof data.tag === 'string' && data.tag.startsWith('conversation-')) {
          const targetPath = new URL(targetUrl, self.location.origin).pathname;
          const windows = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
          });
          const viewing = windows.some((c) => {
            try {
              return (
                c.visibilityState === 'visible' &&
                c.focused === true &&
                new URL(c.url).pathname === targetPath
              );
            } catch {
              return false;
            }
          });
          if (viewing) return;
        }
      } catch {
        /* presence check failed — fall through and show it */
      }
      await self.registration.showNotification(title, options);
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  event.notification.close();
  if (action === 'dismiss') return;

  const rawUrl = (event.notification.data && event.notification.data.url) || '/';

  // FIX SW-CLICK-URL-MATCH-01: previous matching used
  // `client.url.includes(url)`, which:
  //   1. mismatched when url was '/': every client URL contains '/',
  //      so the loop focused the FIRST open window regardless of what
  //      page it was showing. A notification that should have opened
  //      /notifications could land the user on any random tab.
  //   2. matched prefixes falsely: url='/messages/abc' would also match
  //      a client at '/messages/abc-def', skipping the real target.
  // Now normalize both sides to pathname and compare exactly. Same
  // query string on the client is ignored — a user at
  // /notifications?filter=unread should still be reused when the
  // notification targets /notifications.
  const targetPath = (() => {
    try {
      return new URL(rawUrl, self.location.origin).pathname;
    } catch {
      return '/';
    }
  })();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      // FIX SW-COLDOPEN-RACE: previously only an exact-path match was
      // reused, so tapping a /notifications notification while the
      // user's only open tab was on /dashboard opened a brand-new
      // window — a cold start with no in-memory session state, where
      // ProtectedLayout's auth gate can fire its /login redirect a
      // fraction of a second before AuthHydrationProvider's
      // /auth/refresh completes. The user sees /login once, hits
      // refresh, and is suddenly back in as if nothing happened
      // because by then the refresh has finished and the cookies are
      // already there. Fix: prefer an exact path match, then fall
      // back to any client on our own origin and navigate it there.
      // Only when there is no tab at all is a new window opened.
      let sameOriginFallback = null;
      for (const client of clientsList) {
        try {
          const parsed = new URL(client.url);
          if (parsed.origin !== self.location.origin) continue;
          if (parsed.pathname === targetPath && 'focus' in client) {
            return client.focus();
          }
          if (!sameOriginFallback) sameOriginFallback = client;
        } catch {
          /* malformed client URL — skip */
        }
      }
      if (sameOriginFallback && 'focus' in sameOriginFallback) {
        if ('navigate' in sameOriginFallback) {
          return sameOriginFallback.navigate(rawUrl);
        }
        return sameOriginFallback.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(rawUrl);
      return undefined;
    }),
  );
});

// ── Fetch ────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // READ-BATCH: /batch is a POST transport envelope containing only safe GETs.
  // Never queue it as an offline mutation; the individual GETs remain read-only.
  if (isReadBatchRequest(url, request)) return;

  // FIX SW-CROSSORIGIN-BYPASS-01: do not intercept requests that are not
  // same-origin AND are not our API or an image (Cloudinary via
  // isImageRequest). gstatic.com (Google Sign-In) and any other external
  // host fell through to staleWhileRevalidate, where cache.put failed for
  // CORS reasons and the page saw 'network error response'.
  if (
    url.origin !== self.location.origin &&
    !isApiRequest(url) &&
    !isImageRequest(request, url)
  ) {
    return;
  }

  // FIX SW-OPTIONS-01: استثناء OPTIONS (CORS preflight) — إدخاله في
  // الطابور لا فائدة له، فهو سؤال عن الصلاحيات لا طلب فعلي.
  if (request.method !== 'GET' && request.method !== 'OPTIONS') {
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
    // FIX SW-IMAGE-DEBUG-BYPASS-01: removed the temporary network-only debug
    // bypass — it made IMAGE_CACHE, SAVED_ADS_CACHE and the thumbnails
    // warmed into CORE_CACHE dead weight (downloaded, never served).
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
