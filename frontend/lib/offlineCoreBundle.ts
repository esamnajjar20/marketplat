/**
 * PHASE-1 (خطة "بدون نت"): الحزمة الأساسية بدون نت (Offline Core Bundle).
 *
 * المشكلة اللي هذا الملف يحلّها: الكاش الحالي (sw.js's networkFirst) يخزّن
 * فقط طلبات API اللي المستخدم زارها فعليًا وهو أونلاين. أي تصنيف أو صفحة
 * منتجات/متاجر لم تُفتح من قبل = فشل كامل بدون نت، حتى لو المستخدم فتح
 * التطبيق يوميًا وهو متصل.
 *
 * الحل: عند فتح التطبيق أونلاين، نجلب استباقيًا نفس الطلبات الافتراضية
 * اللي تفتحها /categories و/products و/stores بأول تحميل (بدون أي فلتر من
 * المستخدم) — بنفس queryFn/params اللي تستخدمها useCategories/useProducts/
 * useStores تمامًا (page=1, sortBy='createdAt', sortOrder='desc', limit=12
 * للمنتجات) — ونخزّنها في CORE_CACHE بـ sw.js، وهو كاش منفصل عن API_CACHE
 * العادي فلا يتأثر بتقليم FIFO الناتج عن تصفح عادي (انظر تعليق CORE_CACHE
 * في public/sw.js لتفاصيل هذه المشكلة بالذات).
 *
 * ⚠️ صيانة: لو تغيّرت قيم sortBy/sortOrder/limit الافتراضية في
 * ProductsGrid.tsx أو StoresGrid.tsx، لازم تُحدَّث هنا كمان — الـ URL يجب
 * يطابق حرفيًا لأن Cache API's match() يقارن URL كامل. هذا قيد معروف لهذا
 * الحل (مو تلقائي التزامن)، مو باگ.
 *
 * النطاق متعمّد أن يبقى صغيرًا وثابتًا (تصنيفات + صفحة منتجات واحدة + صفحة
 * متاجر واحدة + صورهم المصغّرة) — لا trimming ولا حد أقصى مطلوب لأن الحجم
 * صغير أصلًا ومُدار صراحة (يُستبدل بالكامل بكل warmCoreBundle() جديدة، مو
 * يتراكم).
 *
 * PHASE-3 (تكملة): أُضيفت صفحتا ads وservice-listings الافتراضيتان بنفس
 * المنطق (نفس URL اللي يفتحه المتصفح العام بدون فلتر) — الآن ~65-70 طلب
 * إجمالًا (4 قوائم بيانات + صورها المصغّرة، لا يزال محدودًا بـ
 * thumbnailUrls.slice(0, 24) بالأسفل). لا حاجة لتغيير extractThumbnailUrls:
 * ads/service-listings يحملان images[] بنفس بنية products، فالفحص
 * الموجود أصلًا (obj.images[0]) يغطيهما دون أي تعديل.
 */

import { API_BASE_URL } from '@/lib/constants';
import { getWarmingPlan, isWarmingDisabled } from './offlineWarmingPlanner';
import { runUnderWarmingLock } from './offlineWarmingCoordinator';
import {
  reportProgress,
  subscribeWarmingProgress,
  getWarmingProgressAggregate,
} from './warmingProgress';
import { reportWarmingFailure } from './offlineWarmingReport';
import { fetchWithTimeout } from './fetchTimeout';

// FIX PWA-VER-01: نفس مشكلة lib/offlineRouteShells.ts's STATIC_CACHE — كانت
// عالقة على 'v4' بينما public/sw.js تجاوزها إلى 'v5'، فكان warmCoreBundle()
// يكتب بكاش يُحذف فورًا بـ 'activate' (غير مدرَج بـ currentCaches) ولا يقرأ
// منه sw.js's networkFirstApi/offline-search-index أصلاً. رُفعت إلى 'v6'
// لتطابق public/sw.js's CACHE_VERSION الحالية.
// FIX SW-TRIM-ORDER-01: رُفعت إلى 'v22' لتطابق public/sw.js (انظر تعليق
// CACHE_VERSION هناك) — راجع أيضًا __tests__/unit/lib/cacheVersionSync.test.ts
// الذي يفشل تلقائيًا الآن لو تكرر هذا النوع من الانحراف مستقبلًا بدل أن
// ينكشف فقط بمستخدم متضرر بالإنتاج.
// FIX OFFLINE-CREATE-PAGES-01: رُفعت إلى 'v23' لنفس السبب (راجع تعليق
// public/sw.js's CACHE_VERSION).
// FIX SW-WEAK-NET-TIMEOUT-01: رُفعت إلى 'v24' لتطابق public/sw.js (استراتيجية
// fetch تغيّرت — سباق مهلة على نت ضعيف، راجع تعليق CACHE_VERSION هناك).
export const CORE_CACHE = 'market-core-v41'; // يجب مطابقة CACHE_VERSION بـ public/sw.js (FIX SW-AUTH-PASSTHROUGH-01)
// FIX WARM-MARKER-VERSION-01: append the cache version to this key so
// a CACHE_VERSION bump automatically invalidates the "recently warmed"
// marker. Without it, after every deploy the SW clears CORE_CACHE on
// activate, but this key still says "warmed 3h ago" — warmCoreBundle()
// sees it within WARM_INTERVAL_MS and returns immediately, leaving the
// user with an empty cache for up to 6 hours, exactly when offline
// coverage matters most (the window right after a fresh deploy).
//
// The suffix is derived from CORE_CACHE (which cacheVersionSync.test
// already pins to sw.js's CACHE_VERSION) rather than a hardcoded
// string, so it can never drift from the cache name it describes.
const CACHE_VERSION_SUFFIX = CORE_CACHE.split('-').pop() ?? 'unknown';
const LAST_WARMED_KEY = `marketplat:core-bundle:last-warmed:${CACHE_VERSION_SUFFIX}`;
const WARM_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 ساعات — يكفي لبيانات "تصفح عام"

// PHASE-3a: core bundle uses a lock distinct from the route-shell locks
// so the three warming passes (public shells, personal shells, core
// data) can coordinate independently across tabs.
const CORE_LOCK_NAME = 'marketplat-warming-core';

// PHASE-3a: minimum fraction of items that must store successfully
// before LAST_WARMED_KEY is written. The old code used `succeeded > 0`
// — a single stored response (out of ~30 including thumbnails) marked
// the whole pass successful and locked out retries for 6 hours. That
// is WARM-FALSE-SUCCESS-01's exact pathology. 0.5 means "at least half
// of what we tried actually landed", which is a meaningful bar on a
// flaky network without being too strict for a first-visit pass.
const SUCCESS_THRESHOLD = 0.5;

// FEAT-WARMUP-UI: حالة تقدّم مشتركة يشترك بها WarmupIndicator.tsx — نفس
// نمط sharedRegistration/sharedListeners المستخدم أصلًا بـ UpdatePrompt.tsx
// لمشاركة حالة عابرة للمكوّنات بدون تمرير props أو state management خارجي.
// الواجهة تبقى مستقلة تمامًا عن التحميل نفسه: إغلاقها (X) لا يوقف
// warmCoreBundle، فقط يُخفي الشريط محليًا (انظر WarmupIndicator.tsx).
export interface WarmupProgress {
  active: boolean;
  completed: number;
  total: number;
}

let isWarming = false;

// PHASE-3c: progress is now reported to the central aggregator so the UI
// reflects all three warming passes in one bar. This module's own
// listeners were removed; onWarmupProgress/getWarmupProgress below are
// kept as thin aliases for the 'core' slice, in case anything external
// still imports them.
function notifyWarmup(progress: WarmupProgress) {
  reportProgress('core', progress);
}

/** @deprecated Use subscribeWarmingProgress from '@/lib/warmingProgress'
 * for aggregated progress across all sources. Retained for compatibility;
 * returns only the 'core' source slice. */
export function onWarmupProgress(listener: (progress: WarmupProgress) => void): () => void {
  return subscribeWarmingProgress((agg) => listener(agg.bySource.core));
}

export function getWarmupProgress(): WarmupProgress {
  return getWarmingProgressAggregate().bySource.core;
}

/** نفس بناء URL اللي productsApi.getAll/categoriesApi.getAll/storesApi.getAll
 * يبنونه عبر axios — يُعاد هنا يدويًا لأننا نحتاج Response خام (fetch) قابل
 * للتخزين في Cache Storage، مو JSON مُحلَّل (اللي axios يرجعه).
 */
export function buildCoreUrls(): { key: string; url: string }[] {
  return [
    { key: 'categories', url: `${API_BASE_URL}/categories` },
    {
      key: 'service-categories',
      // FEAT-CREATE-BROADCAST-01: كانت غائبة عن هذه القائمة رغم أن
      // ServiceListingForm.tsx (نموذج "خدمة جديدة") وCreateOpenRequestForm
      // (نموذج "طلب / احتياج") كلاهما يعتمد على GET /service-categories
      // لملء قائمة الفئات — دون تسخين استباقي، أي مستخدم لم يفتح صفحة
      // تجلبها من قبل وهو أونلاين يرى قائمة فئات فارغة (ولا يقدر يُكمل
      // النشر، الحقل required) أول مرة يحاول ينشر بلا اتصال. لا معاملات —
      // الـ endpoint نفسه بلا صفحات (نفس نمط 'categories' أعلاه).
      url: `${API_BASE_URL}/service-categories`,
    },
    {
      key: 'products',
      // FIX CACHE-KEY-01: ترتيب المعاملات هنا يجب يطابق حرفيًا الترتيب اللي
      // axios يبنيه فعليًا من كائن params في ProductsGrid.tsx —
      // { search, page, city, sortBy, sortOrder, hasPromotion, limit: 12 }
      // — search/city/hasPromotion غير معرّفة بالتصفح الافتراضي فتُحذف،
      // فالترتيب الفعلي يطلع page→sortBy→sortOrder→limit (limit أخيرًا،
      // مو ثانيًا). كان limit موضوع بالمرتبة الثانية هنا فـ Cache API's
      // مطابقة السلسلة الحرفية للـ URL كانت تفشل دائمًا لهذا الطلب تحديدًا
      // (miss دائم) رغم إنه محفوظ فعليًا بـ CORE_CACHE.
      url: `${API_BASE_URL}/products?page=1&sortBy=createdAt&sortOrder=desc&limit=12`,
    },
    {
      key: 'stores',
      // مطابق لقيم StoresGrid.tsx الافتراضية بدون أي فلتر من URL.
      url: `${API_BASE_URL}/stores?page=1&sortBy=createdAt&sortOrder=desc`,
    },
    {
      key: 'ads',
      // مطابق لقيم SearchResults.tsx الافتراضية (تصفّح عام بدون q) — بدون
      // limit صريح فيُطبَّق افتراضي الباك-إند (20، انظر ads.service.ts).
      // ADD-ADS-PAGE: نفس الرابط يخدم الآن أيضًا app/(public)/ads/page.tsx
      // (تستخدم نفس ads/SearchResults.tsx بنفس القيم الافتراضية)، إضافة
      // لتبويب /search?type=ads كما كان الحال سابقًا.
      url: `${API_BASE_URL}/ads?page=1&sortBy=createdAt&sortOrder=desc`,
    },
    {
      key: 'services',
      // مطابق لقيم ServiceListingsGrid.tsx الافتراضية بدون أي فلتر من URL
      // (بدون limit صريح -> افتراضي الباك-إند 20، انظر service-listings.service.ts).
      url: `${API_BASE_URL}/service-listings?page=1&sortBy=createdAt&sortOrder=desc`,
    },
    // SW-ADD-HOME-WARMING: the home page's own sections fired requests
    // the core bundle never warmed — on offline they 404'd or showed
    // empty placeholders. Adding the two stable shapes:
    //   - FeaturedAds ({isFeatured: true, limit: 4}) — no city/filters
    //   - RecentProductsSection ({limit: 8, createdAt desc}) — only
    //     when the location resolver hasn't picked a city, so the
    //     `city` param is undefined and axios drops it from the URL.
    //     The city-parametrized variant (once the resolver settles on
    //     a city) is per-user state and belongs in user-data warming,
    //     not here.
    {
      key: 'ads-featured',
      url: `${API_BASE_URL}/ads?isFeatured=true&limit=4`,
    },
    {
      key: 'products-home',
      url: `${API_BASE_URL}/products?limit=8&sortBy=createdAt&sortOrder=desc`,
    },
  ];
}

/** يسحب حقل الصورة المصغّرة الأول من عنصر منتج/متجر — لا نعرف الشكل الدقيق
 * بدون استيراد الأنواع الكاملة، فنتحقق دفاعيًا بدل افتراض بنية صارمة. */
function extractThumbnailUrls(items: unknown[]): string[] {
  const urls: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    if (Array.isArray(obj.images) && typeof obj.images[0] === 'string') {
      urls.push(obj.images[0] as string);
    } else if (typeof obj.logoUrl === 'string') {
      urls.push(obj.logoUrl);
    }
  }
  return urls;
}

async function cachePut(cache: Cache, url: string, response: Response): Promise<boolean> {
  try {
    if (response.ok) {
      await cache.put(url, response.clone());
      return true;
    }
    return false;
  } catch {
    // تخزين فاشل لعنصر واحد (مساحة ممتلئة، مثلًا) لا يجب يوقف بقية الحزمة.
    return false;
  }
}

/**
 * يجلب ويخزّن الحزمة الأساسية. آمن الاستدعاء المتكرر — لا يفعل شيء لو:
 *  - المتصفح غير متصل (لا فائدة، ولا داعي لإفشال طلبات بلا سبب)
 *  - Cache Storage API غير متوفرة (متصفحات قديمة/خاصة)
 *  - تم التحديث خلال آخر WARM_INTERVAL_MS (يُخزَّن بـ localStorage)
 *  - دورة تحميل سابقة ما زالت شغّالة (isWarming) — يمنع تشابك دورتين
 *    متزامنتين (مثلًا PwaBootstrap's mount + 'online' event بفارق ميلي ثانية)
 *    من إرباك شريط التقدّم بحالتين متداخلتين.
 *
 * لا يرمي استثناءات للمستدعي — فشل الحزمة الأساسية لا يجب يكسر أي شي
 * بالواجهة، هي تحسين صامت بالخلفية فقط.
 *
 * FEAT-WARMUP-UI: يبعث تقدّم الدورة عبر onWarmupProgress أثناء التنفيذ
 * (WarmupIndicator.tsx يعرضه كشريط مؤقت يختفي تلقائيًا عند total===completed).
 * هذا البث مستقل تمامًا عن التحميل نفسه — لا مستمعين مسجَّلين (لا يوجد
 * مكوّن UI مركّب أصلًا) لا يوقف أو يبطئ أي شيء، مجرد استدعاءات Set.forEach
 * على مجموعة فارغة.
 */
async function warmCoreBundleImpl(options?: { force?: boolean }): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!navigator.onLine) return;
  if (typeof caches === 'undefined') return;
  if (isWarming) return;

  if (!options?.force) {
    const last = Number(localStorage.getItem(LAST_WARMED_KEY) ?? 0);
    if (Date.now() - last < WARM_INTERVAL_MS) return;
  }

  isWarming = true;
  const urls = buildCoreUrls();
  let completed = 0;
  let total = urls.length; // يُحدَّث لاحقًا ليشمل الصور المصغّرة بعد معرفة عددها الفعلي.
  // FIX WARM-FALSE-SUCCESS-01: كان LAST_WARMED_KEY يُسجَّل دائمًا بعد
  // الحلقتين بلا شرط، حتى لو فشل تخزين كل عنصر (fetch فشل، أو ok:false،
  // أو cache.put رمى استثناء) — Promise.allSettled يبلع كل هذا صامتًا.
  // النتيجة: فشل كامل مرة واحدة (شبكة، CORS، مسار خاطئ...) = "نجاح"
  // مسجَّل زورًا يقفل إعادة المحاولة 6 ساعات كاملة بلا أي أثر بالواجهة.
  // succeeded يتتبّع عدد عناصر cache.put الناجحة فعليًا؛ لا نكتب
  // LAST_WARMED_KEY إلا لو succeeded > 0.
  let succeeded = 0;
  notifyWarmup({ active: true, completed, total });

  try {
    const cache = await caches.open(CORE_CACHE);

    const results = await Promise.allSettled(
      urls.map(async ({ url }) => {
        try {
          const response = await fetchWithTimeout(url); // بدون credentials — نقاط عامة (public browse)
          if (await cachePut(cache, url, response.clone())) succeeded += 1;
          return response.ok ? response.json() : null;
        } finally {
          completed += 1;
          notifyWarmup({ active: true, completed, total });
        }
      }),
    );

    // نجمع روابط الصور المصغّرة من نتائج products/stores الناجحة فقط،
    // ونخزّنها بنفس CORE_CACHE (SW's isImageRequest سيتعرف عليها بنفس
    // الطريقة سواء جاءت من هذا الطلب الاستباقي أو من عرض عادي بالواجهة).
    const thumbnailUrls: string[] = [];
    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      const body = result.value as { data?: unknown };
      if (Array.isArray(body.data)) {
        thumbnailUrls.push(...extractThumbnailUrls(body.data));
      }
    }

    const thumbnails = thumbnailUrls.slice(0, 24);
    total = urls.length + thumbnails.length;
    notifyWarmup({ active: true, completed, total });

    await Promise.allSettled(
      thumbnails.map(async (url) => {
        try {
          const response = await fetchWithTimeout(url);
          if (await cachePut(cache, url, response)) succeeded += 1;
        } catch {
          // صورة واحدة فاشلة لا توقف الباقي.
        } finally {
          completed += 1;
          notifyWarmup({ active: true, completed, total });
        }
      }),
    );

    // PHASE-3a: threshold, not `succeeded > 0`. See SUCCESS_THRESHOLD's
    // comment above for why. On the flip side: if fewer than half the
    // items stored, LAST_WARMED_KEY is NOT written, so the next visit
    // (or the next online event) will retry the whole pass. That is the
    // whole point — a broken network pass should not look successful.
    const threshold = Math.ceil(total * SUCCESS_THRESHOLD);
    if (succeeded >= threshold) {
      localStorage.setItem(LAST_WARMED_KEY, String(Date.now()));
    } else {
      reportWarmingFailure({
        source: 'core',
        route: 'core-bundle',
        error: `low-threshold-${succeeded}/${total}`,
        attempts: 2,
      });
    }
  } catch {
    // فشل الحزمة كاملة (مثلًا الشبكة انقطعت أثناء الجلب) — لا مشكلة،
    // سيُعاد المحاولة بأول فتح تطبيق أونلاين تالي (لم نحدّث LAST_WARMED_KEY).
  } finally {
    isWarming = false;
    // active:false هو إشارة الإخفاء التلقائي اللي WarmupIndicator.tsx يعتمدها —
    // تُبعَث دائمًا هنا (نجاح أو فشل جزئي) فلا يبقى الشريط عالقًا لو انقطع
    // الاتصال أثناء التحميل.
    notifyWarmup({ active: false, completed, total });
  }
}

/**
 * PHASE-3a — public entry point. Guards with the same online/caches
 * checks as before, then defers to warmCoreBundleImpl under a cross-tab
 * lock. The plan gate here is intentionally coarse (skip if
 * save-data or worse-than-3g): warming API data behind the user's back
 * on a metered link is exactly what the old code did not do, and the
 * cost/benefit on that class of connection is poor.
 *
 * The old isWarming per-tab flag still lives inside the impl — the
 * lock handles cross-tab serialization, the flag handles intra-tab
 * double-call races (mount + online event firing in the same tick).
 */
export async function warmCoreBundle(options?: { force?: boolean }): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!navigator.onLine) return;
  if (typeof caches === 'undefined') return;

  const plan = getWarmingPlan();
  if (isWarmingDisabled(plan)) return;

  await runUnderWarmingLock(
    () => warmCoreBundleImpl(options),
    CORE_LOCK_NAME,
  );
}
