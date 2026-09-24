/**
 * PHASE-3 (خطة "بدون نت"): تنقّل حقيقي على مسارات غير مُزارة — الجزءان (أ) و(ب).
 *
 * ⚠️ نطاق هذا الملف محدود عمدًا لما تحققت منه فعليًا بقراءة الكود، وليس كل
 * "تنقّل بدون نت" ممكن — انظر القسم الأخير بالأسفل لما هو غير مُغطّى وليش.
 *
 * (أ) تنقّل "قاسٍ" (hard navigation) — فتح التطبيق من الصفر بدون نت (PWA
 * مثبّتة)، كتابة رابط مباشرة بالمتصفح، أو Pull-to-refresh — لمسار زاره
 * المستخدم شخصيًا من قبل وهو أونلاين، `sw.js`'s navigate handler
 * (`cache.match(request)` على STATIC_CACHE) يرجع /offline بدل الصفحة
 * الفعلية.
 *
 * الآلية (أ): نجلب مستند HTML الخام لكل مسار (fetch عادي، مو navigate)
 * ونضعه بـ STATIC_CACHE مفتاحًا بنفس الـ URL. لاحقًا لما يصير navigate
 * حقيقي (mode:'navigate') لنفس المسار بدون نت، `cache.match(request)` بـ
 * sw.js يطابقه بنفس URL — Cache API's match() يقارن على أساس URL (+method)،
 * مو mode الطلب، فمطابقة تخزين "fetch عادي" مع بحث "navigate" لاحق أمر
 * موثّق وسليم بالمواصفة.
 *
 * (ب) تنقّل "ناعم" (soft navigation / SPA) — المستخدم فاتح التطبيق فعليًا
 * ويضغط رابط لمسار لم يُزَر بهذي الجلسة، وينقطع النت أثناءه. Next.js App
 * Router هنا لا يعمل full navigate — يرسل fetch عادي برأس RSC:'1' وquery
 * param متغيّر (`_rsc=<hash>`)، فمطابقة URL الحرفية لما خزّنته (أ) تفشل.
 * الآلية (ب): نرسل نفس طلب RSC استباقيًا (رأس RSC:'1' بدون
 * Next-Router-State-Tree) ونخزّن الرد بمفتاح ثابت منفصل (`rscShellKey`)
 * بعد حذف رأس Vary — يطابقه sw.js's isRscShellRequest() لاحقًا بنفس
 * المنطق. التفصيل الكامل (لماذا Vary يمنع المطابقة، لماذا مفتاح ثابت لا
 * URL حرفي) موثّق في تعليق PHASE-3-B بـ public/sw.js.
 *
 * لماذا الحل آمن لهذي الصفحات بالذات (`/products`, `/stores`, `/search`,
 * `/categories`) — لكلا الجزأين (أ) و(ب): لا واحدة فيها `export const
 * dynamic` ولا بيانات مخصّصة تُجلب من السيرفر — كلها shells رفيعة (تحقق من
 * نفس الملفات: `metadata` ثابت عبر `buildMetadata`، والبيانات الفعلية
 * تُجلب client-side عبر hooks React Query). يعني HTML/RSC الموثّق مطابق
 * لأي زائر بأي وقت — تخزينه استباقيًا لا يخاطر بعرض محتوى قديم خاص بمستخدم
 * آخر (بعكس صفحة محمية مثلًا). لم يُختبَر أي من الجزأين فعليًا بمتصفح —
 * انظر القيد بالأسفل.
 */

// FIX PWA-VER-01: كانت هذه القيمة عالقة على 'v4' بينما public/sw.js تجاوزها
// إلى 'v5' بجلسة سابقة — عدم تطابق حقيقي كان يعني أن warmRouteShells() تكتب
// بكاش لا يقرأ منه sw.js أبدًا، وأن 'activate' هناك يحذف هذا الكاش (v4) فورًا
// بعد كل تفعيل لأنه غير مدرَج بـ currentCaches. رُفعت هنا إلى 'v6' لتطابق
// public/sw.js's CACHE_VERSION الحالية — راجع تعليق CACHE_VERSION هناك.
// FIX SW-TRIM-ORDER-01: رُفعت إلى 'v22' لنفس السبب (راجع تعليق
// lib/offlineCoreBundle.ts's CORE_CACHE) — __tests__/unit/lib/cacheVersionSync.test.ts
// يفشل الآن تلقائيًا لو انحرفت هذه القيمة عن sw.js مستقبلًا.
// FIX OFFLINE-CREATE-PAGES-01: رُفعت إلى 'v23' لتطابق public/sw.js
// (راجع تعليق CACHE_VERSION هناك — تصنيف '/my-store' كصفحة محمية تغيّر).
// FIX SW-WEAK-NET-TIMEOUT-01: رُفعت إلى 'v24' لتطابق public/sw.js (استراتيجية
// fetch تغيّرت — سباق مهلة على نت ضعيف، راجع تعليق CACHE_VERSION هناك).
import {
  readSnapshot,
  readSnapshotForCacheVersion,
  patchRouteStatus,
  recordLiveUrls,
  recordSweepTime,
  shouldSweep,
  isBuildChanged,
  backoffForAttempts,
} from './offlineWarmingState';
import {
  getWarmingPlan,
  selectRoutesByPlan,
  isWarmingDisabled,
} from './offlineWarmingPlanner';
import { runUnderWarmingLock } from './offlineWarmingCoordinator';
import { reportProgress } from './warmingProgress';
import { reportWarmingFailure } from './offlineWarmingReport';

// PROXY-WARMING: transient staging area for atomic per-route warming.
// Deliberately NOT versioned — sw.js's activate handler deletes any
// market-* cache not in its currentCaches list, which means this working
// area is wiped on every SW update. That is exactly what we want: its
// contents are meaningless the moment a warming pass ends.
const STAGING_CACHE = 'market-warming-staging';
// PHASE-2: personal warming uses a lock distinct from public warming so
// both can run concurrently on the same tab without starving each other.
// Route sets are disjoint (CORE_ROUTES vs PERSONAL_SHELL_ROUTES_ESSENTIAL);
// the only shared resource is chunk URLs, handled by the in-flight dedup
// map below.
const PERSONAL_LOCK_NAME = 'marketplat-warming-personal';
const STATIC_CACHE = 'market-static-v38'; // يجب مطابقة CACHE_VERSION بـ public/sw.js (FIX SW-AUTH-PASSTHROUGH-01)
// '/' أُضيفت لاحقًا (نفس شروط الأمان الموثّقة أعلاه تنطبق عليها: لا
// `export const dynamic`، `metadata` ثابت عبر buildMetadata، وكل أقسامها
// 'use client' تجلب بياناتها عبر React Query بعد الـ hydration — حتى
// RecentProductsSection.tsx's isAuth يُقرأ من Zustand store بعد الـ
// hydration، مو من HTML/RSC مُخصَّص بالسيرفر، فالـ shell المخزَّن نفسه
// لكل الزوار سواء بسواء تمامًا كباقي المسارات الأربعة).
// '/services' أُضيفت لاحقًا (نفس الفحص: لا `dynamic`، metadata ثابت،
// ServiceListingsGrid/ServiceCategoryFilter كلاهما 'use client').
// '/ads' أُضيفت لاحقًا (ADD-ADS-PAGE): app/(public)/ads/page.tsx يطابق
// نفس شروط الأمان الموثّقة أعلاه بالضبط — لا `export const dynamic`،
// metadata ثابت عبر buildMetadata، وكل مكوّناته (SearchFilters/
// SearchFiltersSheet/SearchSortBarWrapper/SearchResults من مجلد
// components/ads) 'use client' وتجلب بياناتها عبر React Query. المسار
// الآخر المسمّى "ads" بـ lib/constants.ts هو /admin/ads وهو محمي ولا
// يجوز تخزينه إطلاقًا (انظر isProtectedPage بـ public/sw.js) — لا علاقة
// له بهذا.
//
// FIX OFFLINE-SELF-LINKS-01: '/saved-ads', '/downloads', و'/saved-payments'
// أُضيفت هنا — وهذا هو التعارض الفعلي المكتشف بمراجعة هذه الميزة: صفحة
// /offline نفسها (app/offline/page.tsx) تعرض هذه الثلاثة تحديدًا كأزرار
// تحت عنوان "متاح على هذا الجهاز دون نت"، بلا أي شرط. لكن قبل هذا الإصلاح
// لم تكن أي منها ضمن CORE_ROUTES — أي أن أول زيارة (تنقّل قاسٍ، هو نفس
// السيناريو الذي أظهر أصلًا صفحة /offline: فتح التطبيق من الصفر بدون نت،
// PWA مثبّتة) لأي منها بدون أن تُزار أونلاين أولًا كانت تُقابَل بـ cache miss
// بـ STATIC_CACHE فتُعاد نفس /offline من جديد — المستخدم يضغط الزر المكتوب
// عليه "متاح دون نت" ويُعاد لنفس الصفحة التي كان فيها بالضبط، بلا أي تفسير.
// الثلاثة تطابق شروط الأمان الموثّقة أعلاه بالضبط (تحقّق فعلي من الكود):
// لا `export const dynamic`، metadata ثابت عبر buildMetadata، ومكوّن
// المحتوى الفعلي بكل واحدة ('SavedOfflineAdsPageClient'/'DownloadsPageClient'/
// 'SavedPaymentsPageClient') 'use client' بالكامل يقرأ من localStorage/Cache
// Storage المحلي فقط — لا بيانات مخصّصة بالسيرفر لأي زائر (بعكس صفحة محمية).
// FIX OFFLINE-DEAD-ROUTE-01: '/categories' أُزيلت — لا يوجد
// app/(public)/categories/page.tsx (فقط .../categories/[slug]/page.tsx
// الديناميكي)، فتخزين '/categories' هنا كان يفشل بـ404 في كل مرة
// (مؤكَّد عبر Network tab: طلبان فاشلان — html وRSC — بكل تحميل صفحة).
// مغلَّف بـtry/catch فلا يوقف شيء، لكنه هدر طلبين بطيئين بلا فائدة.
// صفحات عامة آمنة للـ shell (لا بيانات مستخدم في HTML).
// FIX OFFLINE-CORE-ROUTE-01: '/offline' added. Before this, the page
// the whole offline experience falls back to was warmed only by the
// SW's install handler (one attempt, ~30s timeout) and a manual
// online visit — never by warmRouteShells. Its JS chunks
// (page-<hash>.js and its splits) therefore stayed out of
// STATIC_CACHE across deploys, and a stale cached /offline HTML
// pointed at a chunk hash the new build no longer served. Result:
// ChunkLoadError inside the page that exists precisely to handle
// "network unavailable". warmRouteShells's normal path fetches the
// HTML, extracts every _next/static asset, and caches them — same
// treatment '/', '/products', etc. already get.
const CORE_ROUTES = [
  '/offline',
  '/', '/products', '/stores', '/search', '/services', '/ads',
  '/saved-ads', '/downloads', '/saved-payments',
  '/service-providers', '/sellers/ranking',
];

// صفحات محمية — 'use client' + بيانات عبر RQ بعد hydration.
// الشكل (HTML/RSC) قد يعكس حالة جلسة سابقة؛ يُمسَح PERSONAL_SHELL_CACHE
// كاملًا عند تسجيل الخروج (CLEAR_API_CACHE في sw.js) لنفس سبب API_CACHE.
// يجب أن تطابق isPersonalShellRoute في public/sw.js حرفيًا.
/**
 * FIX OFFLINE-WARM-PRIORITY: كان PERSONAL_SHELL_ROUTES يحتوي 40+ مسار،
 * فيُطلق ~160 طلب لكل مستخدم مسجّل عند كل تسخين — على شبكة غزة = 5-10
 * دقائق + 10-20 MB بيانات. الآن مقسّم:
 *   - ESSENTIAL: 15 مسار أساسي (يُسخَّن تلقائياً بعد login)
 *   - SECONDARY: باقي المسارات (تُسخَّن عند الزيارة عبر sw.js)
 * sw.js's isPersonalShellRoute لا يحتاج تغيير — يستخدم البادئات.
 */
export const PERSONAL_SHELL_ROUTES_ESSENTIAL = [
  // حساب / تنقّل
  '/messages',
  '/notifications',
  '/dashboard',
  // SW-PRIORITY-STORAGE-SYNC-01: pulled to the top of the list so the
  // 'core' tier of the network-aware planner (see offlineWarmingPlanner's
  // PRIORITY_ROUTES) reaches them. These two pages let the user manage
  // cache size and the offline sync queue - both are the exact tasks a
  // user on an unstable link actually needs offline, more so than the
  // passive /settings/profile and /settings/notifications below.
  '/settings/storage',
  '/settings/sync',
  '/favorites',
  '/my-ads',
  '/activity',
  // FIX OFFLINE-AD-CREATE-01: يجب مطابقة public/sw.js's isPersonalShellRoute
  // حرفيًا — انظر تعليقها هناك لسبب الإضافة. مُدرَج هنا أيضًا (وليس فقط
  // بالتصنيف بـsw.js) ليُسخَّن استباقيًا قبل أول زيارة فعلية، تمامًا مثل
  // '/my-store' و'/my-services' أدناه — أهم صفحة كتابة للبائع تستحق نفس
  // معاملة التسخين المسبق.
  '/ads/create',
  // الملف والإعدادات (قوائم فقط — لا sessions حساسة كـ HTML بيانات)
  '/settings',
  '/settings/profile',
  '/settings/security',
  '/settings/sessions',
  '/settings/notifications',
  '/settings/seller',
  '/settings/service-provider',
  '/settings/blocked-users',
  // متجري
  '/my-store',
  '/my-store/inventory',
  '/my-store/members',
  '/my-store/products',
  // FIX OFFLINE-CREATE-PAGES-01: نموذج إضافة منتج جديد نفسه كان غائبًا —
  // فقط قائمة المنتجات ('/my-store/products') كانت مُسخَّنة مسبقًا،
  // بنفس القياس المتبع مع '/ads/create' أعلاه (FIX OFFLINE-AD-CREATE-01):
  // بائع يفتح /my-store/products/new لأول مرة وهو أوفلاين (قبل أي زيارة
  // أونلاين سابقة لهذا المسار تحديدًا) كان يصله /offline العامة، رغم أن
  // isPersonalShellRoute بـpublic/sw.js يغطيه أصلاً عبر بادئة
  // '/my-store/' (فتُخزَّن نسخته فعليًا في PERSONAL_SHELL_CACHE بعد أول
  // زيارة أونلاين) — هذه الإضافة فقط تسخّنه استباقيًا قبل تلك الزيارة
  // الأولى، تمامًا مثل /ads/create. آمن بنفس السبب: 'use client' بالكامل،
  // ProductForm يجلب بيانات البائع/المتجر عبر React Query بعد الـhydration.
  '/my-store/products/new',
  '/my-store/promotions',
  '/my-store/collections',
  '/my-store/analytics',
  '/my-store/settings',
  // خدماتي + لوحة مقدّم الخدمة
  '/my-services',
  // FIX OFFLINE-CREATE-PAGES-01: نفس سبب '/my-store/products/new' أعلاه،
  // لنموذج نشر خدمة جديدة بدل نموذج المنتج.
  '/my-services/new',
  '/my-services/requests',
  '/my-services/appointments',
  '/my-services/analytics',
  // T780 — '/service-broadcasts' and '/service-broadcasts/quotes' were
  // removed. The backend dropped the service_request_broadcasts and
  // service_quotes tables in migration 20260917121810_drop_legacy_
  // service_broadcasts; the frontend pages were deleted alongside, but
  // these two entries stayed in the warming list, so every warm cycle
  // fired two 404-bound requests and the PERSONAL_SHELL_CACHE never
  // got a real shell for them. The whole feature is dead — no page
  // (app/ has no matching route), no component, no hook, no API client
  // all confirmed. See lib/constants.ts's ROUTES for the removal of the
  // corresponding route definitions.
  '/my-requests',
  // FIX OFFLINE-REQUESTS-NEW-01: /requests/new is a first-class
  // create page with full offline support already wired
  // (useCreateRequest.onError → saveAdDraft with kind:'open-request',
  // offlineDraftResume.resumeHrefForDraft → /requests/new?draftId=,
  // useFormDraft autosave) — but was missing from this warming list,
  // so a user who opened it fresh offline got bounced to the generic
  // /offline page instead of the form. Same treatment as
  // /ads/create and /my-services/new above.
  '/requests/new',
];

/** FIX OFFLINE-WARM-PRIORITY: القائمة الكاملة (ESSENTIAL + SECONDARY) —
 * تصديرها باسم PERSONAL_SHELL_ROUTES الأصلي للتوافق مع أي كود خارجي
 * (بما فيها الاختبارات). warmPersonalShells يستخدم ESSENTIAL فقط. */
export const PERSONAL_SHELL_ROUTES = PERSONAL_SHELL_ROUTES_ESSENTIAL;

// FIX SW-TRIM-ORDER-01: كانت هذه القيمة ثابتة على 'v18' بينما STATIC_CACHE
// بنفس الملف رُفع لـ'v22' — نفس عائلة خلل PWA-VER-01 بالضبط، لكن بثابت
// ثالث بهذا الملف لم يُكتشف بالمراجعة السابقة (رُوجعا فقط STATIC_CACHE
// وlib/offlineCoreBundle.ts's CORE_CACHE، لا هذا). النتيجة العملية لو
// بقي منحرفًا: warmRouteShells() (سطر caches.open أدناه) يكتب أشكال
// الصفحات الشخصية بكاش 'v18' الذي يُحذف فورًا عبر sw.js's 'activate'
// (غير مدرَج بـ currentCaches هناك) — تمامًا نفس أثر PWA-VER-01 الأصلي.
// يجب مطابقة CACHE_VERSION بـ public/sw.js دائمًا، وهذا الآن مغطى بـ
// __tests__/unit/lib/cacheVersionSync.test.ts.
// FIX OFFLINE-CREATE-PAGES-01: رُفعت إلى 'v23' لنفس السبب أعلاه.
// FIX SW-WEAK-NET-TIMEOUT-01: رُفعت إلى 'v24' لنفس السبب أعلاه.
const PERSONAL_SHELL_CACHE = 'market-personal-shell-v38';

/**
 * FIX OFFLINE-WARM-TIMESTAMP: نسخة مطابقة لـ sw.js's putTimestamped —
 * ضروري لأن trimCache يرتّب بـ X-SW-Cached-At، وأي مدخل بلا الترويسة
 * يُعامَل كـ ts=0 فيُحذف أولاً عند تجاوز الحد. بدون هذا، كل ما يُخزّنه
 * warmRouteShells/warmPersonalShells كان يُحذف فور تجاوز MAX_STATIC_ENTRIES.
 */
async function putTimestamped(cache: Cache, request: string, response: Response): Promise<boolean> {
  try {
    const headers = new Headers(response.headers);
    headers.set('X-SW-Cached-At', String(Date.now()));
    const body = await response.blob();
    const stamped = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
    await cache.put(request, stamped);
    return true;
  } catch {
    return false;
  }
}

/**
 * FIX OFFLINE-WARM-THROTTLE: منع التسخين المتكرر — كان warmRouteShells
 * وwarmPersonalShells يُستدعيان من mount + online + visibilitychange بلا
 * أي throttle، فكل فتح تطبيق يُطلق ~100-200 طلب. WARM_INTERVAL_MS يمنع
 * إعادة التسخين خلال 6 ساعات لكل مجموعة.
 */
// FIX WARM-MARKER-VERSION-01: same rationale as offlineCoreBundle.ts's
// versioned LAST_WARMED_KEY — append the cache version so a deploy's
// CACHE_VERSION bump invalidates these markers as well. Otherwise the
// SW clears STATIC_CACHE + PERSONAL_SHELL_CACHE on activate while these
// timestamps still read as "warmed recently", and every warm call for
// the next 6 hours returns early — the user's cache is empty right
// after each deploy, which is precisely when the offline paths matter.
//
// The suffix is derived from STATIC_CACHE (pinned to sw.js's
// CACHE_VERSION by cacheVersionSync.test), so it can never drift from
// the caches it describes. PERSONAL_SHELL_CACHE is versioned the same
// way — both get wiped together on activate, so one suffix covers both.
const CACHE_VERSION_SUFFIX = STATIC_CACHE.split('-').pop() ?? 'unknown';
const LAST_ROUTE_WARMED_KEY = `marketplat:route-shells:last-warmed:${CACHE_VERSION_SUFFIX}`;
const LAST_PERSONAL_WARMED_KEY = `marketplat:personal-shells:last-warmed:${CACHE_VERSION_SUFFIX}`;
const WARM_INTERVAL_MS = 6 * 60 * 60 * 1000;
// SW-SMART-THROTTLE-01: shorter cooldown when the previous pass was
// incomplete (some routes missing or marked failed in IndexedDB). The
// 6-hour WARM_INTERVAL_MS was designed for a fully-successful pass —
// it must not block a resume after a network drop mid-pass. 5 minutes
// lets the next online event or visibility change pick up where the
// last pass stopped, without hammering a flaky link.
const PARTIAL_WARM_INTERVAL_MS = 5 * 60 * 1000;

let isWarmingRouteShells = false;
let isWarmingPersonalShells = false;

/**
 * FIX OFFLINE-WARM-ABORT: مهلة لكل طلب — بدونها، طلب بطيء على شبكة غزة
 * قد يعلّق 30+ ثانية، فيوقف التسخين كله. 8s حد معقول لعنصر واحد.
 */
// FIX WARM-TIMEOUT-GAZA-01: was 8000ms. On a weak network (Gaza 4G/3G)
// with 20 personal-shell fetches + ~100-200 asset fetches all queued
// behind Chrome's 6-connection-per-origin ceiling, the tail of the
// queue routinely sat past 8s and each of those got an AbortError
// (= DOMException) — see the log line this produced. 15000ms covers
// the queue dwell time on Gaza networks while still bounding total
// warming time. AbortError itself is still a safe outcome (the shell
// just doesn't warm this pass), so the tradeoff is purely about how
// many of the 20 succeed per cycle.
const FETCH_TIMEOUT_MS = 15000;

function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

// WARM-INFLIGHT-DEDUP — before this, both warmRouteShells and
// warmPersonalShells used Promise.allSettled to fetch every route's
// HTML + its chunks IN PARALLEL, with a `cache.match` check before
// each chunk fetch. Because every callback passed that check at
// ~the same moment (before any chunk had actually been cached yet),
// a chunk shared across N routes was fetched N times — measured at
// 89% overlap between / (45 chunks) and /products (43 chunks), so
// most of the ~250 chunk fetches per warming pass were duplicates
// of ~40 unique URLs. On Gaza's metered mobile networks that's
// ~10MB of wasted bandwidth per warming cycle, on top of slow-link
// dwell time from Chrome's 6-connection-per-origin ceiling.
//
// This map holds the in-flight Promise<boolean> per URL, so the
// second through Nth caller await the same fetch instead of issuing
// their own. Cleared on settle so a later warming pass (or a
// genuinely-expired entry) still refetches.
//
// Applied to both warmRouteShells and warmPersonalShells because
// they share the same STATIC_CACHE for chunk storage — a route's
// chunks and a personal shell's chunks overlap heavily (webpack-*,
// main-app-*, and the shared framework chunks all appear in both).
const inflightAssetFetches = new Map<string, Promise<boolean>>();

async function fetchAndCacheAsset(cache: Cache, url: string): Promise<boolean> {
  // Fast path — already cached (from an earlier route in this pass,
  // or from a previous session).
  if (await cache.match(url)) return false;

  const existing = inflightAssetFetches.get(url);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const res = await fetchWithTimeout(url, { credentials: 'same-origin' });
      if (!res.ok) return false;
      return await putTimestamped(cache, url, res);
    } catch {
      return false;
    } finally {
      inflightAssetFetches.delete(url);
    }
  })();

  inflightAssetFetches.set(url, promise);
  return promise;
}

/** يجب مطابقة sw.js's rscShellKey() بالضبط — مفتاح كاش ثابت منفصل عن URL
 * الطلب الحرفي، لأن طلبات RSC الفعلية تحمل query param `_rsc=<hash>`
 * متغيّر ورأس Vary يمنعان مطابقة Cache API الحرفية (انظر تعليق PHASE-3-B
 * في public/sw.js لتفصيل كامل للمشكلة والحل). */
function rscShellKey(path: string): string {
  return `${path}?__offline_rsc_shell`;
}

// PROXY-WARMING — atomic per-route warming engine.
//
// The legacy warmRouteShells used Promise.allSettled over CORE_ROUTES
// and marked the whole pass "successful" if any file stored (the
// FIX WARM-FALSE-SUCCESS-01 comment even calls this out as a bug).
// On a flaky network that produced routes whose HTML was cached but
// whose chunks were not — the classic ChunkLoadError on the page that
// was supposed to be the safety net. warmRouteAtomic fixes this: no
// route's HTML touches STATIC_CACHE until every one of its chunks is
// verified present. Chunks stage in STAGING_CACHE first; only after
// verification do they get promoted, and only then does the HTML go
// in. Either the route is completely usable offline, or STATIC_CACHE
// is untouched for it — no partial states, no false success.

/** Canonical pathname form for liveUrls bookkeeping. Cache API stores
 * absolute URLs internally; our chunk lists are relative paths. */
function toPath(url: string): string {
  try {
    if (url.startsWith('/')) return url;
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

interface WarmResult {
  ok: boolean;
  urls: string[];
  error?: string;
}

async function warmRouteAtomic(
  route: string,
  staticCache: Cache,
  stagingCache: Cache,
): Promise<WarmResult> {
  const stagedPaths: string[] = [];
  try {
    // 1. Fetch the route HTML.
    const htmlRes = await fetchWithTimeout(route, { credentials: 'same-origin' });
    if (!htmlRes.ok || htmlRes.redirected) {
      return {
        ok: false,
        urls: [],
        error: `html-${htmlRes.status}${htmlRes.redirected ? '-redirected' : ''}`,
      };
    }

    // 2. Extract every _next/static asset the HTML references.
    const html = await htmlRes.clone().text();
    const chunkUrls = Array.from(
      html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+\.(?:js|css))"/g),
    )
      .map((m) => m[1])
      .filter((u): u is string => Boolean(u));

    // 3. Stage every chunk. Skip ones already in STATIC_CACHE from an
    //    earlier pass — they are already live.
    const stageResults = await Promise.allSettled(
      chunkUrls.map(async (url) => {
        const alreadyLive = await staticCache.match(url);
        if (alreadyLive) return { url, skipped: true };
        const res = await fetchWithTimeout(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`chunk-${res.status}`);
        await putTimestamped(stagingCache, url, res);
        stagedPaths.push(url);
        return { url, skipped: false };
      }),
    );

    // 4. Verify — every chunk present in EITHER cache.
    const missing: string[] = [];
    for (const url of chunkUrls) {
      const inStaging = await stagingCache.match(url);
      const inStatic = await staticCache.match(url);
      if (!inStaging && !inStatic) missing.push(url);
    }
    if (missing.length > 0) {
      const firstFail = stageResults.find(
        (r) => r.status === 'rejected',
      ) as PromiseRejectedResult | undefined;
      const why =
        firstFail?.reason instanceof Error
          ? firstFail.reason.message
          : `missing-${missing.length}`;
      for (const url of stagedPaths) {
        try { await stagingCache.delete(url); } catch { /* noop */ }
      }
      return { ok: false, urls: [], error: why };
    }

    // 5. Promote staged chunks to STATIC_CACHE.
    for (const url of chunkUrls) {
      const staged = await stagingCache.match(url);
      if (staged) {
        await staticCache.put(url, staged);
        await stagingCache.delete(url);
      }
    }

    // 6. Commit HTML — from here the route is offline-complete.
    await putTimestamped(staticCache, route, htmlRes);

    // 7. RSC shell — best effort. Its absence degrades offline SPA
    //    navigation to a hard navigation (which lands on the now-cached
    //    HTML), not to an error.
    try {
      const rscRes = await fetchWithTimeout(route, {
        credentials: 'same-origin',
        headers: { RSC: '1' },
      });
      if (rscRes.ok) {
        const headers = new Headers(rscRes.headers);
        headers.delete('Vary');
        headers.set('X-SW-Cached-At', String(Date.now()));
        const stored = new Response(await rscRes.clone().blob(), {
          status: rscRes.status,
          statusText: rscRes.statusText,
          headers,
        });
        await staticCache.put(rscShellKey(route), stored);
      }
    } catch {
      // Non-fatal.
    }

    return { ok: true, urls: [route, ...chunkUrls, rscShellKey(route)] };
  } catch (err) {
    for (const url of stagedPaths) {
      try { await stagingCache.delete(url); } catch { /* noop */ }
    }
    const msg =
      err instanceof DOMException
        ? err.name
        : err instanceof Error
          ? `${err.name}: ${err.message}`
          : String(err);
    return { ok: false, urls: [], error: msg };
  }
}

/** Delete every _next/static entry in STATIC_CACHE not part of the
 * current build's liveUrls set. HTML routes and RSC shells are left
 * alone — only hashed chunks churn between deploys. */
async function sweepOrphans(cache: Cache, liveUrls: Set<string>): Promise<number> {
  const keys = await cache.keys();
  let swept = 0;
  for (const req of keys) {
    const path = toPath(req.url);
    if (!path.startsWith('/_next/static/')) continue;
    if (liveUrls.has(path)) continue;
    try {
      await cache.delete(req);
      swept += 1;
    } catch {
      // noop
    }
  }
  return swept;
}

export async function warmRouteShells(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!navigator.onLine) return;
  if (typeof caches === 'undefined') return;
  // FIX OFFLINE-WARM-THROTTLE
  if (isWarmingRouteShells) return;
  const last = Number(localStorage.getItem(LAST_ROUTE_WARMED_KEY) ?? 0);
  if (Date.now() - last < WARM_INTERVAL_MS) return;
  isWarmingRouteShells = true;
  // FIX WARM-FALSE-SUCCESS-01: انظر نفس التعليق بـofflineCoreBundle.ts's
  // warmCoreBundle — نفس الباگ بالضبط هنا: LAST_ROUTE_WARMED_KEY كان
  // يُسجَّل بلا شرط حتى لو فشل تخزين كل مسار. succeeded يتتبّع عدد عمليات
  // التخزين الناجحة فعليًا (HTML/chunks/RSC مجتمعين)؛ لا نكتب
  // LAST_ROUTE_WARMED_KEY إلا لو succeeded > 0.
  let succeeded = 0;

  try {
    const cache = await caches.open(STATIC_CACHE);

    // (أ) تنقّل قاسٍ — مستند HTML عادي، مفتاحه URL المسار كما هو.
    // FIX OFFLINE-CHUNK-01: كانت تُخزَّن HTML فقط — نفس الخلل بالضبط
    // الموثّق بـpublic/sw.js's install handler لـ/offline، لكنه هنا يطال
    // كل مسار بـCORE_ROUTES: أول تنقّل حقيقي بدون نت لمسار (مثلاً
    // /saved-ads) لم يُحمَّل chunk-ه أونلاين من قبل بهذا الجهاز تحديدًا
    // ينتج عنه "ChunkLoadError" (مؤكَّد فعليًا: طلب مستخدم ضغط زر
    // "التنزيلات" من صفحة /offline، فشل بـchunk 2708 لمسار
    // app/(public)/saved-ads، وعاد تلقائيًا لصفحة /offline خلال ثانية).
    // الحل: بعد جلب HTML كل مسار، نستخرج ونخزّن أصول _next/static
    // الخاصة فيه أيضًا — تمامًا نفس منطق sw.js's install handler.
    await Promise.allSettled(
      CORE_ROUTES.map(async (path) => {
        try {
          const response = await fetchWithTimeout(path, { credentials: 'same-origin' });
          // FIX WARM-REDIRECT-GUARD-01: skip redirected responses.
          // A protected route fetched without a valid session (guest
          // visitor, expired cookie) is served the /login page after
          // a redirect, with ok=true and the shell text of /login
          // under the protected URL. Caching it would make the
          // offline /messages (etc.) shell resolve to login HTML —
          // exactly the wrong document to show an authenticated
          // user later, and worth skipping for guests too (they
          // can't usefully view the shell either way).
          if (!response.ok || response.redirected) return;
          if (await putTimestamped(cache, path, response.clone())) succeeded += 1;

          const html = await response.clone().text();
          const assetUrls = Array.from(
            html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+\.(?:js|css))"/g),
          )
            .map((match) => match[1])
            .filter((url): url is string => Boolean(url));

          await Promise.allSettled(
            assetUrls.map(async (assetUrl) => {
              // WARM-INFLIGHT-DEDUP — see the helper's own comment.
              // Replaces the old sequential cache.match-then-fetch
              // (which missed every shared chunk because all routes
              // passed the check before any finished putting).
              if (await fetchAndCacheAsset(cache, assetUrl)) succeeded += 1;
            }),
          );
        } catch (err) {
          // FIX OFFLINE-WARM-LOGGING
          console.warn('[route-shells] warmRouteShells path failed:', path, err);
        }
      }),
    );

    // (ب) تنقّل SPA (soft navigation) — نفس المسارات، لكن بطلب RSC (رأس
    // RSC:'1') يحاكي ما يرسله Next.js Router الفعلي، فيُملأ مفتاح
    // sw.js's isRscShellRequest() استباقيًا بدل انتظار أول تنقّل SPA حقيقي
    // وقت انقطاع النت (اللي حينها يفشل مرة واحدة قبل أي كاش). الاستجابة
    // تُخزَّن بدون رأس Vary (نفس منطق sw.js's stripVaryAndClone) لأن
    // Cache API's مطابقة Vary الداخلية سترفض المطابقة لاحقًا وإن كان مفتاح
    // البحث مطابقًا تمامًا.
    await Promise.allSettled(
      CORE_ROUTES.map(async (path) => {
        try {
          const response = await fetchWithTimeout(path, {
            credentials: 'same-origin',
            headers: { RSC: '1' },
          });
          if (!response.ok) return;
          const headers = new Headers(response.headers);
          headers.delete('Vary');
          // FIX OFFLINE-WARM-TIMESTAMP
          headers.set('X-SW-Cached-At', String(Date.now()));
          const stored = new Response(await response.clone().blob(), {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
          await cache.put(rscShellKey(path), stored);
          succeeded += 1;
        } catch (err) {
          console.warn('[route-shells] warmRouteShells RSC failed:', path, err);
        }
      }),
    );

    // FIX OFFLINE-WARM-THROTTLE: سجّل نجاح الجلسة كاملة
    if (succeeded > 0) {
      localStorage.setItem(LAST_ROUTE_WARMED_KEY, String(Date.now()));
    }
  } catch (err) {
    // FIX OFFLINE-WARM-LOGGING
    console.warn('[route-shells] warmRouteShells failed:', err);
  } finally {
    isWarmingRouteShells = false;
  }
}

/**
 * تسخين أشكال الصفحات المحمية (رسائل، إشعارات، لوحة، مفضلة…) في
 * PERSONAL_SHELL_CACHE — يُستدعى فقط والمستخدم مسجّل دخول وأونلاين.
 * HTML + JS/CSS chunks + RSC shell بنفس منطق warmRouteShells.
 */
export async function warmPersonalShells(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!navigator.onLine) return;
  if (typeof caches === 'undefined') return;

  // FIX OFFLINE-WARM-NET-AWARE: this function pre-fetches 8 personal
  // routes (HTML + assets + RSC each). On a fast link that is cheap
  // background work; on a slow or metered link it competes directly
  // with the actual page data the user is waiting for — observed on
  // Gaza's 3G-ish links as ~40-60 extra requests in the first few
  // seconds of any protected page, most of them above the fold in the
  // Network panel. Skip warming entirely when the browser reports
  // data-saver, or an effective type of slow-2g/2g/3g. The offline
  // benefit is unchanged for users on Wi-Fi/4G; users on slow links
  // still get the shell cached the first time they actually visit the
  // route (warmRouteShells + normal SW caching).
  const conn =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & {
          connection?: { saveData?: boolean; effectiveType?: string };
        }).connection
      : undefined;
  if (conn) {
    if (conn.saveData) return;
    const et = conn.effectiveType;
    if (et === 'slow-2g' || et === '2g' || et === '3g') return;
  }

  // FIX OFFLINE-WARM-THROTTLE
  if (isWarmingPersonalShells) return;
  const last = Number(localStorage.getItem(LAST_PERSONAL_WARMED_KEY) ?? 0);
  if (Date.now() - last < WARM_INTERVAL_MS) return;
  isWarmingPersonalShells = true;

  // FIX OFFLINE-WARM-HIDDEN: previously deferred to requestIdleCallback
  // with a 5s deadline — but on 4G/WiFi the net-aware gate above let
  // it through, and a 5s window was short enough that the warm fired
  // during the same session as the navigation, still adding ~40KB of
  // RSC payloads (my-ads / favorites / messages / my-store / analytics
  // / my-services / products) to a page the user had already finished
  // reading. Warming is by definition background work the user did not
  // ask for; the safest time to do it is when the tab is no longer
  // visible (user switched apps, locked the phone, opened another tab).
  // Wait for the first hidden/visibilitychange, and give up entirely if
  // the user stays engaged for 60s without ever leaving — a session
  // that long implies they are actively using the app, not idly
  // navigating away.
  await new Promise<void>((resolve) => {
    if (typeof document === 'undefined') {
      resolve();
      return;
    }
    if (document.visibilityState === 'hidden') {
      resolve();
      return;
    }
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      document.removeEventListener('visibilitychange', onVis);
      resolve();
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') settle();
    };
    document.addEventListener('visibilitychange', onVis);
    // WARM-TIMEOUT-60S — was 60_000. On a typical 2-3 minute session
    // (open the app, browse, close), 60s often meant the safety valve
    // never fired before the user left, so warmPersonalShells silently
    // never ran and the personal routes were never cached. 15s is
    // still comfortably long for a user who opened a route on purpose
    // and is still reading it (their visibility change will fire first
    // anyway in the common case), but short enough that a
    // quick-browsing session still gets one warm in.
    window.setTimeout(settle, 15_000);
  });
  // FIX WARM-FALSE-SUCCESS-01: نفس الإصلاح المطبَّق بـwarmRouteShells أعلاه.
  let succeeded = 0;

  try {
    const cache = await caches.open(PERSONAL_SHELL_CACHE);
    const staticCache = await caches.open(STATIC_CACHE);

    await Promise.allSettled(
      PERSONAL_SHELL_ROUTES_ESSENTIAL.map(async (path) => {
        try {
          const response = await fetchWithTimeout(path, { credentials: 'same-origin' });
          // FIX WARM-REDIRECT-GUARD-01: skip redirected responses.
          // A protected route fetched without a valid session (guest
          // visitor, expired cookie) is served the /login page after
          // a redirect, with ok=true and the shell text of /login
          // under the protected URL. Caching it would make the
          // offline /messages (etc.) shell resolve to login HTML —
          // exactly the wrong document to show an authenticated
          // user later, and worth skipping for guests too (they
          // can't usefully view the shell either way).
          if (!response.ok || response.redirected) return;
          if (await putTimestamped(cache, path, response.clone())) succeeded += 1;

          const html = await response.clone().text();
          const assetUrls = Array.from(
            html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+\.(?:js|css))"/g),
          )
            .map((match) => match[1])
            .filter((url): url is string => Boolean(url));

          await Promise.allSettled(
            assetUrls.map(async (assetUrl) => {
              // WARM-INFLIGHT-DEDUP — same map as warmRouteShells, so a
              // chunk being warmed by a route at the same moment is
              // awaited rather than re-fetched.
              if (await fetchAndCacheAsset(staticCache, assetUrl)) succeeded += 1;
            }),
          );
        } catch (err) {
          // FIX WARM-LOG-01: `err` prints as `DOMException {}` under
          // Chrome remote debugging, which is unactionable. Log the
          // distinguishing fields — name (AbortError vs
          // QuotaExceededError vs TypeError are very different
          // problems) and message when present.
          const name = err instanceof DOMException
            ? err.name
            : err instanceof Error
              ? `${err.name}: ${err.message}`
              : String(err);
          console.warn('[route-shells] warmPersonalShells path failed:', path, name);
        }
      }),
    );

    await Promise.allSettled(
      PERSONAL_SHELL_ROUTES_ESSENTIAL.map(async (path) => {
        try {
          const response = await fetchWithTimeout(path, {
            credentials: 'same-origin',
            headers: { RSC: '1' },
          });
          if (!response.ok) return;
          const headers = new Headers(response.headers);
          headers.delete('Vary');
          headers.set('X-SW-Cached-At', String(Date.now()));
          const stored = new Response(await response.clone().blob(), {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
          await cache.put(rscShellKey(path), stored);
          succeeded += 1;
        } catch (err) {
          // FIX WARM-LOG-01: see the HTML-path logger above.
          const name = err instanceof DOMException
            ? err.name
            : err instanceof Error
              ? `${err.name}: ${err.message}`
              : String(err);
          console.warn('[route-shells] warmPersonalShells RSC failed:', path, name);
        }
      }),
    );

    if (succeeded > 0) {
      localStorage.setItem(LAST_PERSONAL_WARMED_KEY, String(Date.now()));
    }
  } catch (err) {
    console.warn('[route-shells] warmPersonalShells failed:', err);
  } finally {
    isWarmingPersonalShells = false;
  }
}

/**
 * ما هو غير مُغطّى: افتراض RSC بدون Next-Router-State-Tree — راجع تعليق
 * PHASE-3-B في public/sw.js. لم يُختبر كل مسار محمي بمتصفح حقيقي بعد.
 */

/**
 * PROXY-WARMING — warming entry point that runs under a cross-tab lock
 * and uses the atomic per-route engine above. Coexists with the legacy
 * warmRouteShells during rollout; OfflineBootstrap switches to this in
 * a follow-up.
 *
 * Differences vs. legacy:
 *   - Cross-tab lock (Web Locks; localStorage fallback).
 *   - Route set filtered by getWarmingPlan() — save-data and slow links
 *     get a reduced (or empty) list.
 *   - Per-route atomic: no route marked complete until every chunk is
 *     verified. No more WARM-FALSE-SUCCESS-01.
 *   - Per-route state persists in IndexedDB — an interrupted pass
 *     resumes on the next visit.
 *   - Orphan chunks from previous builds are swept after a successful
 *     pass, so the cache does not grow without bound across deploys.
 */
export async function warmRouteShellsAtomic(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (typeof caches === 'undefined') return;
  if (!navigator.onLine) return;

  await runUnderWarmingLock(async () => {
    const plan = getWarmingPlan();
    if (isWarmingDisabled(plan)) return;

    const routes = selectRoutesByPlan(plan, CORE_ROUTES);
    if (routes.length === 0) return;

    // SW-SMART-THROTTLE-01: read snapshot BEFORE the throttle check so
    // we can tell "fully warmed" from "partially warmed". A pass that
    // died mid-flight (network dropped) should resume within
    // PARTIAL_WARM_INTERVAL_MS; only a fully-warmed set earns the long
    // WARM_INTERVAL_MS cooldown. Without this, a user on an unstable
    // link (Gaza 2G/3G) had warming blocked for 6 hours after every
    // disconnect even though most routes were still uncached.
    // SW-WARM-CACHE-VERSION-01: use the versioned reader so a
    // snapshot from a previous CACHE_VERSION (whose chunks the SW's
    // activate handler already deleted) is treated as absent, not as
    // "everything is already warmed".
    const snapshotEarly = await readSnapshotForCacheVersion(CACHE_VERSION_SUFFIX);
    const incompleteCount = routes.filter(
      (r) => snapshotEarly?.routes[r]?.status !== 'complete',
    ).length;
    const throttleMs =
      incompleteCount === 0 ? WARM_INTERVAL_MS : PARTIAL_WARM_INTERVAL_MS;
    const last = Number(localStorage.getItem(LAST_ROUTE_WARMED_KEY) ?? 0);
    if (Date.now() - last < throttleMs) return;

    reportProgress('routes', { active: true, completed: 0, total: routes.length });
    let completedThisPass = 0;
    try {
    const staticCache = await caches.open(STATIC_CACHE);
    const stagingCache = await caches.open(STAGING_CACHE);

    const snapshot = await readSnapshot();
    const liveUrls: string[] = [];

    for (const route of routes) {
      const prior = snapshot?.routes[route];
      if (prior?.status === 'complete' && prior.chunks.length > 0) {
        liveUrls.push(...prior.chunks.map(toPath));
        continue;
      }

      const delay = backoffForAttempts(prior?.attempts ?? 0);
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const result = await warmRouteAtomic(route, staticCache, stagingCache);

      await patchRouteStatus(route, {
        status: result.ok ? 'complete' : 'failed',
        chunks: result.urls.map(toPath),
        attempts: (prior?.attempts ?? 0) + 1,
        lastAttempt: Date.now(),
        warmedAt: result.ok ? Date.now() : prior?.warmedAt,
        lastError: result.ok ? undefined : result.error,
      });

      if (!result.ok) {
        reportWarmingFailure({
          source: 'routes',
          route,
          error: result.error ?? 'unknown',
          attempts: (prior?.attempts ?? 0) + 1,
        });
      }

      if (result.ok) {
        completedThisPass += 1;
        liveUrls.push(...result.urls.map(toPath));
      }
      reportProgress('routes', {
        active: true,
        completed: completedThisPass,
        total: routes.length,
      });

      if (plan.interRouteDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, plan.interRouteDelayMs));
      }
    }

    if (completedThisPass > 0) {
      localStorage.setItem(LAST_ROUTE_WARMED_KEY, String(Date.now()));
    }

    const prevLive = snapshot?.liveUrls ?? [];
    if (liveUrls.length > 0 && isBuildChanged(prevLive, liveUrls)) {
      if (shouldSweep(snapshot?.lastSweepAt ?? 0)) {
        const swept = await sweepOrphans(staticCache, new Set(liveUrls));
        if (swept > 0) {
          console.warn(`[route-shells] swept ${swept} orphan chunks`);
        }
        await recordSweepTime();
      }
    }

    if (liveUrls.length > 0) {
      await recordLiveUrls(liveUrls);
    }
    } finally {
      reportProgress('routes', { active: false, completed: completedThisPass, total: routes.length });
    }
  });
}

/**
 * PHASE-2 — atomic per-route warming for the personal shell cache.
 *
 * Mirrors warmRouteAtomic's all-or-nothing semantics: a personal route's
 * HTML does not enter PERSONAL_SHELL_CACHE until every chunk it needs is
 * verified present in STATIC_CACHE. Chunks stage in STAGING_CACHE first,
 * so a partially-fetched route never leaves a half-written HTML pointing
 * at chunks that aren't there.
 *
 * Chunk storage is shared with the public path (both use STATIC_CACHE) —
 * deliberate: the same framework/vendor chunks back public and personal
 * routes, and the in-flight dedup map already avoids fetching them twice.
 *
 * HTML and RSC shell go into PERSONAL_SHELL_CACHE (not STATIC_CACHE)
 * because the SW clears PERSONAL_SHELL_CACHE on logout — see sw.js's
 * CLEAR_API_CACHE handler and the audit #7 comments there. Putting
 * personal HTML in the shared cache would leak one user's shell into
 * another user's session on a shared device.
 */
async function warmPersonalRouteAtomic(
  route: string,
  staticCache: Cache,
  personalCache: Cache,
  stagingCache: Cache,
): Promise<WarmResult> {
  const stagedPaths: string[] = [];
  try {
    const htmlRes = await fetchWithTimeout(route, { credentials: 'same-origin' });
    if (!htmlRes.ok || htmlRes.redirected) {
      return {
        ok: false,
        urls: [],
        error: `html-${htmlRes.status}${htmlRes.redirected ? '-redirected' : ''}`,
      };
    }

    const html = await htmlRes.clone().text();
    const chunkUrls = Array.from(
      html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+\.(?:js|css))"/g),
    )
      .map((m) => m[1])
      .filter((u): u is string => Boolean(u));

    await Promise.allSettled(
      chunkUrls.map(async (url) => {
        const alreadyLive = await staticCache.match(url);
        if (alreadyLive) return;
        const res = await fetchWithTimeout(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`chunk-${res.status}`);
        await putTimestamped(stagingCache, url, res);
        stagedPaths.push(url);
      }),
    );

    const missing: string[] = [];
    for (const url of chunkUrls) {
      const inStaging = await stagingCache.match(url);
      const inStatic = await staticCache.match(url);
      if (!inStaging && !inStatic) missing.push(url);
    }
    if (missing.length > 0) {
      for (const url of stagedPaths) {
        try { await stagingCache.delete(url); } catch { /* noop */ }
      }
      return { ok: false, urls: [], error: `missing-${missing.length}` };
    }

    for (const url of chunkUrls) {
      const staged = await stagingCache.match(url);
      if (staged) {
        await staticCache.put(url, staged);
        await stagingCache.delete(url);
      }
    }

    await putTimestamped(personalCache, route, htmlRes);

    try {
      const rscRes = await fetchWithTimeout(route, {
        credentials: 'same-origin',
        headers: { RSC: '1' },
      });
      if (rscRes.ok) {
        const headers = new Headers(rscRes.headers);
        headers.delete('Vary');
        headers.set('X-SW-Cached-At', String(Date.now()));
        const stored = new Response(await rscRes.clone().blob(), {
          status: rscRes.status,
          statusText: rscRes.statusText,
          headers,
        });
        await personalCache.put(rscShellKey(route), stored);
      }
    } catch {
      // non-fatal
    }

    return { ok: true, urls: [route, ...chunkUrls] };
  } catch (err) {
    for (const url of stagedPaths) {
      try { await stagingCache.delete(url); } catch { /* noop */ }
    }
    const msg =
      err instanceof DOMException
        ? err.name
        : err instanceof Error
          ? `${err.name}: ${err.message}`
          : String(err);
    return { ok: false, urls: [], error: msg };
  }
}

/**
 * PHASE-2 — personal-shell analogue of warmRouteShellsAtomic. Runs under
 * a distinct lock, respects the same network-aware planner, resumes from
 * IndexedDB state, and skips routes whose cached HTML has disappeared
 * (logout clears PERSONAL_SHELL_CACHE but leaves IndexedDB intact —
 * without this sanity check, a re-login on the same device would think
 * every route was already warmed and cache nothing).
 *
 * Does NOT touch liveUrls: those describe chunks in STATIC_CACHE, which
 * the public pass owns. Personal warming only adds HTML/RSC to
 * PERSONAL_SHELL_CACHE; its chunks are a subset of what public warming
 * (or a later public pass) records.
 */
export async function warmPersonalShellsAtomic(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (typeof caches === 'undefined') return;
  if (!navigator.onLine) return;

  await runUnderWarmingLock(async () => {
    const plan = getWarmingPlan();
    if (isWarmingDisabled(plan)) return;

    // SW-SMART-THROTTLE-01: same reasoning as warmRouteShellsAtomic —
    // resume quickly after a partial pass, long cooldown only after a
    // fully successful one.
    const snapshotEarlyP = await readSnapshotForCacheVersion(CACHE_VERSION_SUFFIX);
    const routesEarlyP = selectRoutesByPlan(
      plan,
      PERSONAL_SHELL_ROUTES_ESSENTIAL,
    );
    const incompletePersonal = routesEarlyP.filter(
      (r) => snapshotEarlyP?.routes[`personal:${r}`]?.status !== 'complete',
    ).length;
    const throttleMsP =
      incompletePersonal === 0 ? WARM_INTERVAL_MS : PARTIAL_WARM_INTERVAL_MS;
    const last = Number(localStorage.getItem(LAST_PERSONAL_WARMED_KEY) ?? 0);
    if (Date.now() - last < throttleMsP) return;

    // SW-IDLE-SCHEDULE-01: prefer requestIdleCallback over a blind 15s
    // wait. Warming is background work the user did not ask for; the
    // ideal moment is when the main thread is quiet, which on a typical
    // page happens 1-3s after load, not 15s. The previous behaviour
    // waited 15s on visible tabs, so on a fast-browsing session the
    // personal warming often never ran at all. Now:
    //   1. If the tab is hidden → fire immediately.
    //   2. Else, requestIdleCallback with an 8s hard timeout (fires even
    //      if the browser never reports idle, e.g. a page with ongoing
    //      animations).
    //   3. Else (Safari < 15.4 / no rIC) → setTimeout 5s, which is still
    //      shorter than the old 15s and does not need the hidden tab.
    await new Promise<void>((resolve) => {
      if (typeof document === 'undefined') { resolve(); return; }
      if (document.visibilityState === 'hidden') { resolve(); return; }
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        document.removeEventListener('visibilitychange', onVis);
        resolve();
      };
      const onVis = () => {
        if (document.visibilityState === 'hidden') settle();
      };
      document.addEventListener('visibilitychange', onVis);
      const ric = (
        window as Window & {
          requestIdleCallback?: (
            cb: () => void,
            opts?: { timeout: number },
          ) => number;
        }
      ).requestIdleCallback;
      if (typeof ric === 'function') {
        ric(() => settle(), { timeout: 8_000 });
      } else {
        window.setTimeout(settle, 5_000);
      }
    });

    const routes = selectRoutesByPlan(plan, PERSONAL_SHELL_ROUTES_ESSENTIAL);
    if (routes.length === 0) return;

    reportProgress('personal', { active: true, completed: 0, total: routes.length });
    let completedThisPass = 0;
    try {
    const staticCache = await caches.open(STATIC_CACHE);
    const personalCache = await caches.open(PERSONAL_SHELL_CACHE);
    const stagingCache = await caches.open(STAGING_CACHE);

    const snapshot = await readSnapshot();

    for (const route of routes) {
      const key = `personal:${route}`;
      const prior = snapshot?.routes[key];

      if (prior?.status === 'complete') {
        // Sanity: logout wipes PERSONAL_SHELL_CACHE but not IndexedDB.
        const htmlHit = await personalCache.match(route);
        if (htmlHit) continue;
      }

      const delay = backoffForAttempts(prior?.attempts ?? 0);
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const result = await warmPersonalRouteAtomic(
        route,
        staticCache,
        personalCache,
        stagingCache,
      );

      await patchRouteStatus(key, {
        status: result.ok ? 'complete' : 'failed',
        chunks: result.urls.map(toPath),
        attempts: (prior?.attempts ?? 0) + 1,
        lastAttempt: Date.now(),
        warmedAt: result.ok ? Date.now() : prior?.warmedAt,
        lastError: result.ok ? undefined : result.error,
      });

      if (!result.ok) {
        reportWarmingFailure({
          source: 'personal',
          route,
          error: result.error ?? 'unknown',
          attempts: (prior?.attempts ?? 0) + 1,
        });
      }

      if (result.ok) completedThisPass += 1;
      reportProgress('personal', {
        active: true,
        completed: completedThisPass,
        total: routes.length,
      });

      if (plan.interRouteDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, plan.interRouteDelayMs));
      }
    }

    if (completedThisPass > 0) {
      localStorage.setItem(LAST_PERSONAL_WARMED_KEY, String(Date.now()));
    }
    } finally {
      reportProgress('personal', { active: false, completed: completedThisPass, total: routes.length });
    }
  }, PERSONAL_LOCK_NAME);
}
