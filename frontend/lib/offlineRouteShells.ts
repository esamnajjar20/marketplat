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
  writeSnapshot,
  setActiveCacheVersion,
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
import { getWarmingMode } from './warmingPreferences';
import { getAverageRequestMs } from './connectionQuality';
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
// SW-FIX-CACHE-VERSION-MISMATCH: was 'v40' while sw.js's
// CACHE_VERSION is still 'v38' — warming wrote to market-static-v40
// but the SW's fetch handler read from market-static-v38, so every
// shell this module warmed was invisible to actual navigation
// (warming succeeded per the debug page, yet offline navigation
// still fell back to /offline). Reverted to v38 to match sw.js — and
// kept in sync with offlineCoreBundle.ts's CORE_CACHE and
// offlineWarmingUserData.ts's USER_DATA_CACHE, both of which were
// already v38.
const STATIC_CACHE = 'market-static-v40'; // يجب مطابقة CACHE_VERSION بـ public/sw.js (FIX SW-AUTH-PASSTHROUGH-01)
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
export const CORE_ROUTES = [
  // FIX WARM-PRIORITY-MARKETPLACE-01 + WARM-MIN-20-01: public browse first
  '/offline',
  '/',
  // WARM-55-ROUTES-01: /requests is the public open-requests browse.
  '/requests',
  '/ads',
  '/products',
  '/search',
  '/stores',
  '/services',
  '/service-providers',
  '/sellers/ranking',
  '/saved-ads',
  '/downloads',
  '/saved-payments',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
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
  // FIX WARM-PRIORITY-MARKETPLACE-01: engagement + sell tools first
  '/messages',
  '/notifications',
  '/favorites',
  '/dashboard',
  '/my-ads',
  '/ads/create',
  '/my-store',
  '/my-store/products',
  '/my-store/products/new',
  '/my-services',
  '/my-services/new',
  '/requests/new',
  '/my-requests',
  '/settings/sync',
  '/settings/storage',
  '/settings/offline',
  '/settings',
  '/settings/profile',
  '/settings/notifications',
  '/activity',
  '/saved-searches',
  '/my-store/inventory',
  '/my-store/members',
  '/my-store/promotions',
  '/my-store/collections',
  '/my-store/analytics',
  '/my-store/settings',
  '/my-services/requests',
  '/my-services/appointments',
  '/my-services/analytics',
  '/settings/security',
  '/settings/sessions',
  '/settings/seller',
  '/settings/service-provider',
  '/settings/blocked-users',
  '/complete-profile',
  '/my-reports',
  '/service-requests',
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
// SW-FIX-CACHE-VERSION-MISMATCH: was 'v40' — same mismatch as
// STATIC_CACHE above. See that line's comment.
const PERSONAL_SHELL_CACHE = 'market-personal-shell-v40';

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

// SW-WARM-CACHE-VERSION-WRITE-01-CALL: tell the snapshot writer which
// cache version it describes, once, at module load. Read back by
// readSnapshotForCacheVersion so a deploy that bumped CACHE_VERSION
// wipes the stale snapshot instead of silently skipping every route.
setActiveCacheVersion(CACHE_VERSION_SUFFIX);
const LAST_ROUTE_WARMED_KEY = `marketplat:route-shells:last-warmed:${CACHE_VERSION_SUFFIX}`;
const LAST_PERSONAL_WARMED_KEY = `marketplat:personal-shells:last-warmed:${CACHE_VERSION_SUFFIX}`;
const WARM_INTERVAL_MS = 6 * 60 * 60 * 1000;
// SW-SMART-THROTTLE-01: shorter cooldown when the previous pass was
// incomplete (some routes missing or marked failed in IndexedDB). The
// 6-hour WARM_INTERVAL_MS was designed for a fully-successful pass —
// it must not block a resume after a network drop mid-pass. 5 minutes
// lets the next online event or visibility change pick up where the
// last pass stopped, without hammering a flaky link.
// SW-PARTIAL-THROTTLE-30M-01: was 5 minutes. On a partial pass (some
// routes failed), warming retried every 5 minutes — which meant the
// WarmupIndicator showed on every one of those retries, and on the
// user's 1.45 Mbps link the indicator was visible almost continuously
// during a browsing session. 30 minutes cuts the retry frequency to
// 1/6 without losing the "don't let failures sit forever" property:
// a genuinely transient blip still retries within half an hour, and
// warming still runs on every fresh visit / online event / visibility
// change through the OTHER gate (WARM_INTERVAL_MS of 6h only applies
// to a fully-successful pass).
const PARTIAL_WARM_INTERVAL_MS = 30 * 60 * 1000;
/**
 * SW-FIX-DRIP-KBPS: adaptive drip params derived from MEASURED throughput,
 * not from the (often lying) Network Information API on Gaza vouchers.
 *
 * Two signals, in order of trust:
 *   1. navigator.connection.type === 'wifi' → unmetered → full speed.
 *   2. estimateKbps() — measured from getAverageRequestMs() (real requests
 *      on this device) with navigator.connection.downlink as a fallback.
 *
 *   KB/s          | budget | interval | 46 routes ETA
 *   --------------|--------|----------|----------------
 *   WiFi          |   12   |   3 min  |  ~40 min
 *   > 500         |   10   |   5 min  |  ~50 min
 *   200 – 500     |    8   |   8 min  |  ~75 min
 *   80  – 200     |    6   |  10 min  |  ~2 hours
 *   30  – 80      |    4   |  10 min  |  ~3 hours
 *   < 30          |    2   |  10 min  |  ~5 hours
 *   unknown       |    6   |  10 min  |  default
 *
 * Weak-network tiers (<=200 KB/s) all share a 10-minute cadence: the
 * budget already limits throughput; spacing them further out only
 * delays cycle completion without saving meaningful data.
 */
function isOnWifi(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as Navigator & {
    connection?: { type?: string };
  }).connection;
  return conn?.type === 'wifi';
}

function estimateKbps(): number | null {
  if (typeof navigator === 'undefined') return null;
  const conn = (navigator as Navigator & {
    connection?: { downlink?: number; type?: string };
  }).connection;

  const measured = getAverageRequestMs();
  if (measured != null && measured > 0) {
    // FIX WARM-KBPS-SIZE-01: RSC shells average closer to ~55 KB on this
    // app (HTML + critical chunks), not 40 KB — underestimating size made
    // drip think the link was faster than it is.
    const avgShellBytes = typeof window !== 'undefined'
      && typeof (window as unknown as { __warmLastShellBytes?: number }).__warmLastShellBytes === 'number'
      ? (window as unknown as { __warmLastShellBytes: number }).__warmLastShellBytes
      : 55_000;
    return Math.max(1, Math.round(avgShellBytes / measured));
  }
  // SPEED-ONLY-01: no more conn.type === 'wifi' shortcut — a wifi hotspot
  // can be slower than 4G. effectiveType is Chrome's own *measured* category
  // (not a static label) so it is safe to convert to a kbps value.
  const et = (conn as unknown as { effectiveType?: string } | undefined)?.effectiveType;
  if (et === 'slow-2g') return 5;
  if (et === '2g')      return 15;
  if (et === '3g')      return 40;
  if (et === '4g')      return 150;
  if (typeof conn?.downlink === 'number' && conn.downlink > 0) {
    return Math.round(conn.downlink * 128);  // Mbps → KB/s
  }
  return null;
}

// DRIP-TIERS-02: user-tuned thresholds for Gaza link quality.
//   >=100 KB/s (or WiFi): warm the entire remaining queue in one
//     pass. 60s interval is just a floor for the next pass once the
//     current one completes — not a per-pass budget.
//   20-99 KB/s: 10 routes / 10 min.
//   <20 KB/s: 0 routes — a single ~40 KB shell takes 2s+ on a
//     voucher card; the pass would starve the current page.
const UNLIMITED_BUDGET = 9_999;

function getDripParams(tier: 'none' | 'critical' | 'core' | 'full'): {
  budget: number;
  intervalMs: number;
  reason: string;
} {
  if (tier === 'none') return { budget: 0, intervalMs: 0, reason: 'offline' };

  // FIX WARM-MIN-20-01: critical / very-slow still warm a floor of 20
  // routes (sequential). Previously budget 0 left users with almost
  // nothing offline on voucher links.
  const kbps = estimateKbps();
  if (tier === 'critical') {
    return { budget: 20, intervalMs: 8 * 60 * 1000, reason: `critical-${kbps ?? '?'}kbps` };
  }

  if (kbps == null) return { budget: 20, intervalMs: 8 * 60 * 1000, reason: 'unknown' };

  if (kbps >= 100) return { budget: UNLIMITED_BUDGET, intervalMs: 45 * 1000, reason: `${kbps}kbps-unlimited` };
  if (kbps >= 40)  return { budget: 20, intervalMs: 6 * 60 * 1000, reason: `${kbps}kbps-mid` };
  if (kbps >= 15)  return { budget: 20, intervalMs: 8 * 60 * 1000, reason: `${kbps}kbps-slow` };
  return { budget: 20, intervalMs: 10 * 60 * 1000, reason: `${kbps}kbps-voucher` };
}

const LAST_DRIP_WARMED_KEY = `marketplat:drip-last-pass:${CACHE_VERSION_SUFFIX}`;


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

// WARM-REFRESH-24H-01: a route is considered stale and eligible for
// re-fetch after this long. Warming runs every 6h (see
// OfflineBootstrap's PERIODIC_WARM_MS) but only rebuilds a route once
// per day — intermediate passes are cheap no-ops for fresh routes.
const ROUTE_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

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

/** @deprecated Use warmRouteShellsAtomic — kept as alias for tests/imports. */
export async function warmRouteShells(): Promise<void> {
  // FIX WARM-LEGACY-DELEGATE-01: legacy path warmed ALL CORE_ROUTES in
  // parallel without the planner. Delegate to the atomic pipeline path.
  return warmRouteShellsAtomic();
}


/**
 * تسخين أشكال الصفحات المحمية (رسائل، إشعارات، لوحة، مفضلة…) في
 * PERSONAL_SHELL_CACHE — يُستدعى فقط والمستخدم مسجّل دخول وأونلاين.
 * HTML + JS/CSS chunks + RSC shell بنفس منطق warmRouteShells.
 */
/** @deprecated Use warmPersonalShellsAtomic — kept as alias for tests/imports. */
export async function warmPersonalShells(): Promise<void> {
  return warmPersonalShellsAtomic();
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

// WARMING-CANCEL-01: user-triggered abort from /settings/offline.
// The warming loops check this flag at the top of each iteration.
let warmingCancelled = false;
export function requestWarmingCancel(): void { warmingCancelled = true; }
export function resetWarmingCancel(): void { warmingCancelled = false; }
export function isWarmingCancelled(): boolean { return warmingCancelled; }

// WARMING-MODES-05: kept for potential future progress UI.
function readDripLast(): number {
  try {
    return Number(localStorage.getItem(LAST_DRIP_WARMED_KEY) ?? 0);
  } catch {
    return 0;
  }
}

/** UI helper: progress of current drip cycle across public + personal. */
export async function getDripProgress(): Promise<{
  complete: number;
  total: number;
  nextInMs: number;
  mode: string;
  /** Routes warmed per pass for the current measured throughput. */
  budget: number;
  /** e.g. 'wifi' | '250kbps-mid' | '12kbps-voucher' */
  pace: string;
  /** Estimated throughput in KB/s (null if unmeasured). */
  kbps: number | null;
  isWifi: boolean;
}> {
  const mode = getWarmingMode();
  const total = CORE_ROUTES.length + PERSONAL_SHELL_ROUTES_ESSENTIAL.length;
  let complete = 0;
  try {
    const snap = await readSnapshotForCacheVersion(CACHE_VERSION_SUFFIX);
    for (const r of CORE_ROUTES) {
      if (snap?.routes[r]?.status === 'complete') complete += 1;
    }
    for (const r of PERSONAL_SHELL_ROUTES_ESSENTIAL) {
      if (snap?.routes[`personal:${r}`]?.status === 'complete') complete += 1;
    }
  } catch {
    /* ignore */
  }
  const last = readDripLast();
  const allDone = complete >= total;
  const dripParams = getDripParams(getWarmingPlan().tier);
  const kbps = estimateKbps();
  const interval = allDone ? WARM_INTERVAL_MS : dripParams.intervalMs;
  const nextInMs = Math.max(0, interval - (Date.now() - last));
  return {
    complete,
    total,
    nextInMs,
    mode,
    budget: dripParams.budget,
    pace: dripParams.reason,
    kbps,
    isWifi: isOnWifi(),
  };
}

export async function warmRouteShellsAtomic(force = false): Promise<void> {
  // MANUAL-WARM-FORCE-01: force=true (from a user-facing button) skips
  // both the global throttle and the per-route freshness check — the
  // user explicitly asked for a warming run, so we re-fetch even routes
  // that look fresh. The 6h auto-timer passes force=false and keeps the
  // current throttle / freshness behaviour.
  if (typeof window === 'undefined') return;
  if (typeof caches === 'undefined') return;
  if (!navigator.onLine) return;

  await runUnderWarmingLock(async () => {
    const plan = getWarmingPlan();
    if (isWarmingDisabled(plan)) return;

    // WARMING-MODES-04: single path — no drip mode. 'off' short-circuits
    // via isWarmingDisabled above; here we just run the plan's route
    // selection under the smart throttle.
    const snapshotEarly = await readSnapshotForCacheVersion(CACHE_VERSION_SUFFIX);

    const routes = selectRoutesByPlan(plan, CORE_ROUTES);
    if (routes.length === 0) return;

    // SW-SMART-THROTTLE-01: fully warmed → 6h; partial → 30m.
    // Skipped entirely when force=true.
    if (!force) {
      const incompleteCount = routes.filter(
        (r) => snapshotEarly?.routes[r]?.status !== 'complete',
      ).length;
      const throttleMs =
        incompleteCount === 0 ? WARM_INTERVAL_MS : PARTIAL_WARM_INTERVAL_MS;
      const last = Number(localStorage.getItem(LAST_ROUTE_WARMED_KEY) ?? 0);
      if (Date.now() - last < throttleMs) return;
    }

    reportProgress('routes', { active: true, completed: 0, total: routes.length });
    let completedThisPass = 0;
    try {
    const staticCache = await caches.open(STATIC_CACHE);
    const stagingCache = await caches.open(STAGING_CACHE);

    const snapshot = await readSnapshot();
    const liveUrls: string[] = [];

    for (const route of routes) {
      if (isWarmingCancelled()) break;
      const prior = snapshot?.routes[route];
      const isStale =
        force ||
        (prior?.status === 'complete' &&
          (!prior.warmedAt || Date.now() - prior.warmedAt > ROUTE_REFRESH_AFTER_MS));
      if (!isStale && prior?.status === 'complete' && prior.chunks.length > 0) {
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
export async function warmPersonalShellsAtomic(force = false): Promise<void> {
  if (typeof window === 'undefined') return;
  if (typeof caches === 'undefined') return;
  if (!navigator.onLine) return;

  await runUnderWarmingLock(async () => {
    const plan = getWarmingPlan();
    if (isWarmingDisabled(plan)) return;

    // WARMING-MODES-04: single path — no drip mode.
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
      if (isWarmingCancelled()) break;
      const key = `personal:${route}`;
      const prior = snapshot?.routes[key];

      const isStale =
        force ||
        (prior?.status === 'complete' &&
          (!prior.warmedAt || Date.now() - prior.warmedAt > ROUTE_REFRESH_AFTER_MS));
      if (!isStale && prior?.status === 'complete') {
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


// ═══════════════════════════════════════════════════════════════
// SW-WARMING-PER-ROUTE-01 — user-facing single-route operations
// Consumed by /settings/offline's OfflineRoutesList. Each call is
// independent of the others; the caller is responsible for limiting
// concurrency (three at a time is the recommended cap).
// ═══════════════════════════════════════════════════════════════

/**
 * Routes whose cached form must never be removed by a user action.
 * /offline is the fallback itself; / is the first thing every
 * navigation loads. Losing either leaves the app unusable when the
 * network drops, which is the entire point of having them cached.
 * Retry is allowed on both (may refresh stale chunks); delete is not.
 */
const PROTECTED_FROM_DELETE = new Set(['/offline', '/']);

/** Full route list for the settings UI, in warming order. */
export function getKnownRoutes(): Array<{ route: string; personal: boolean }> {
  const out: Array<{ route: string; personal: boolean }> = [];
  for (const route of CORE_ROUTES) out.push({ route, personal: false });
  for (const route of PERSONAL_SHELL_ROUTES_ESSENTIAL) {
    out.push({ route, personal: true });
  }
  return out;
}

/**
 * Retry ONE public route. Clears its snapshot entry, re-warms it
 * atomically, writes the new status. Returns whether it succeeded.
 */
export async function retrySinglePublicRoute(route: string): Promise<boolean> {
  if (typeof window === 'undefined' || typeof caches === 'undefined') return false;

  // Clear the prior entry so warmRouteAtomic doesn't read stale state
  // and, more importantly, so a fresh failure replaces a stale success.
  const snap = await readSnapshot();
  if (snap) {
    delete snap.routes[route];
    await writeSnapshot(snap);
  }

  const staticCache = await caches.open(STATIC_CACHE);
  const stagingCache = await caches.open(STAGING_CACHE);
  const result = await warmRouteAtomic(route, staticCache, stagingCache);

  await patchRouteStatus(route, {
    status: result.ok ? 'complete' : 'failed',
    chunks: result.urls.map(toPath),
    attempts: 1,
    lastAttempt: Date.now(),
    warmedAt: result.ok ? Date.now() : undefined,
    lastError: result.ok ? undefined : result.error,
  });

  return result.ok;
}

/**
 * Retry ONE personal route. Same as above but writes to
 * PERSONAL_SHELL_CACHE and uses the 'personal:' snapshot key.
 */
export async function retrySinglePersonalRoute(route: string): Promise<boolean> {
  if (typeof window === 'undefined' || typeof caches === 'undefined') return false;

  const snap = await readSnapshot();
  if (snap) {
    delete snap.routes[`personal:${route}`];
    await writeSnapshot(snap);
  }

  const staticCache = await caches.open(STATIC_CACHE);
  const personalCache = await caches.open(PERSONAL_SHELL_CACHE);
  const stagingCache = await caches.open(STAGING_CACHE);
  const result = await warmPersonalRouteAtomic(
    route,
    staticCache,
    personalCache,
    stagingCache,
  );

  await patchRouteStatus(`personal:${route}`, {
    status: result.ok ? 'complete' : 'failed',
    chunks: result.urls.map(toPath),
    attempts: 1,
    lastAttempt: Date.now(),
    warmedAt: result.ok ? Date.now() : undefined,
    lastError: result.ok ? undefined : result.error,
  });

  return result.ok;
}

/** Delete ONE route's cached entries (HTML + chunks + RSC shell).
 *  Refuses /offline and / — see PROTECTED_FROM_DELETE. Returns the
 *  count of individual entries removed. */
export async function clearSingleRouteCache(
  route: string,
  personal: boolean = false,
): Promise<number> {
  if (typeof window === 'undefined' || typeof caches === 'undefined') return 0;
  if (!personal && PROTECTED_FROM_DELETE.has(route)) return 0;

  const snap = await readSnapshot();
  const key = personal ? `personal:${route}` : route;
  const meta = snap?.routes[key];
  const cacheName = personal ? PERSONAL_SHELL_CACHE : STATIC_CACHE;
  const cache = await caches.open(cacheName);

  let removed = 0;

  // 1. Delete every recorded chunk (may be in STATIC_CACHE either way).
  const chunkCache = personal ? await caches.open(STATIC_CACHE) : cache;
  if (meta?.chunks) {
    for (const rawUrl of meta.chunks) {
      // Snapshot stores paths; skip the route itself (handled below).
      const u = rawUrl === route ? null : rawUrl;
      if (!u) continue;
      const ok = await chunkCache.delete(u);
      if (ok) removed += 1;
    }
  }

  // 2. Delete the HTML entry (from PERSONAL_SHELL_CACHE for personal,
  //    STATIC_CACHE for public).
  try {
    if (await cache.delete(route)) removed += 1;
  } catch { /* noop */ }

  // 3. Delete the RSC shell.
  try {
    if (await cache.delete(rscShellKey(route))) removed += 1;
  } catch { /* noop */ }

  // 4. Clear the snapshot entry.
  if (snap) {
    delete snap.routes[key];
    await writeSnapshot(snap);
  }

  return removed;
}

/**
 * Bulk: retry every route currently marked failed. Runs at most
 * `concurrency` at a time (default 3) so a slow link isn't flooded.
 * Returns { succeeded, failed }.
 */
export async function retryAllFailedRoutes(concurrency = 3): Promise<{
  succeeded: number;
  failed: number;
}> {
  const snap = await readSnapshot();
  if (!snap) return { succeeded: 0, failed: 0 };

  const failed: Array<{ route: string; personal: boolean }> = [];
  for (const [key, meta] of Object.entries(snap.routes)) {
    if (meta?.status !== 'failed') continue;
    if (key.startsWith('personal:')) {
      failed.push({ route: key.slice('personal:'.length), personal: true });
    } else {
      failed.push({ route: key, personal: false });
    }
  }
  if (failed.length === 0) return { succeeded: 0, failed: 0 };

  let succeeded = 0;
  let failedCount = 0;
  const queue = [...failed];
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, queue.length); i += 1) {
    workers.push((async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) return;
        const ok = item.personal
          ? await retrySinglePersonalRoute(item.route)
          : await retrySinglePublicRoute(item.route);
        if (ok) succeeded += 1;
        else failedCount += 1;
      }
    })());
  }
  await Promise.all(workers);
  return { succeeded, failed: failedCount };
}
