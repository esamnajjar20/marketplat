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
 * thumbnailUrls.slice(0, 12) بالأسفل). لا حاجة لتغيير extractThumbnailUrls:
 * ads/service-listings يحملان images[] بنفس بنية products، فالفحص
 * الموجود أصلًا (obj.images[0]) يغطيهما دون أي تعديل.
 */

import { API_BASE_URL } from '@/lib/constants';
import { CORE_CACHE_NAME } from '@/lib/cacheVersion';
import { getWarmingPlan, isWarmingDisabled } from './offlineWarmingPlanner';
import { runUnderWarmingLock } from './offlineWarmingCoordinator';
import {
  reportProgress,
  subscribeWarmingProgress,
  getWarmingProgressAggregate,
} from './warmingProgress';
import { reportWarmingFailure } from './offlineWarmingReport';
import { fetchWithTimeout } from './fetchTimeout';
import { getListThumbnailUrl, getAvatarUrl } from './cloudinary';

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
export const CORE_CACHE = CORE_CACHE_NAME; // from lib/cacheVersion (must match sw.js)
// FIX WARM-MARKER-VERSION-01: append the cache version to this key so
// a CACHE_VERSION bump automatically invalidates the "recently warmed"
// marker. Without it, after every deploy the SW clears CORE_CACHE on
// activate, but this key still says "warmed 3h ago" — warmCoreBundle()
// sees it within the TTL window and returns immediately, leaving the
// user with an empty cache for up to 6 hours, exactly when offline
// coverage matters most (the window right after a fresh deploy).
//
// The suffix is derived from CORE_CACHE (which cacheVersionSync.test
// already pins to sw.js's CACHE_VERSION) rather than a hardcoded
// string, so it can never drift from the cache name it describes.
const CACHE_VERSION_SUFFIX = CORE_CACHE.split('-').pop() ?? 'unknown';
const LAST_WARMED_KEY = `marketplat:core-bundle:last-warmed:${CACHE_VERSION_SUFFIX}`;
// FIX WARM-CORE-TTL-01: كانت المدة ثابتة 6 ساعات لكل الشبكات. القوائم هنا
// هي "أحدث الإعلانات/المنتجات/الخدمات" — بعد 6 ساعات تصبح قديمة فعلاً في
// سوق إعلانات مبوّب. المدة الآن تتبع جودة الشبكة الحالية (نفس getWarmingPlan
// المستخدم بكل مكان): شبكة جيدة = تحديث أسرع (الحزمة صغيرة أصلاً)، شبكة
// بطيئة/كروت = نحافظ على النطاق الترددي كما كان.
export const CORE_TTL_BY_TIER_MS = {
  full: 90 * 60 * 1000, // 1.5 ساعة
  core: 3 * 60 * 60 * 1000, // 3 ساعات
  critical: 6 * 60 * 60 * 1000, // 6 ساعات (كما كان)
  none: 6 * 60 * 60 * 1000,
} as const;

function coreTtlMs(): number {
  return CORE_TTL_BY_TIER_MS[getWarmingPlan().tier] ?? CORE_TTL_BY_TIER_MS.critical;
}

/** هل حان وقت تحديث الحزمة؟ (بدون أي شبكة — قراءة localStorage فقط). */
export function isCoreBundleDue(now: number = Date.now()): boolean {
  try {
    const last = Number(localStorage.getItem(LAST_WARMED_KEY) ?? 0);
    return now - last >= coreTtlMs();
  } catch {
    return true;
  }
}

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
    // CORE-TAXONOMY-01: بقية تصنيفات النماذج/الاستكشاف كانت غائبة، بنفس سبب
    // FEAT-CREATE-BROADCAST-01 أعلاه — مستخدم لم يفتح الصفحة المعنية وهو
    // أونلاين يرى قائمة فارغة أول مرة بلا اتصال:
    //   - /product-categories → useProductCategories (قسم المنتجات في الاستكشاف)
    //   - /store-types        → useStoreTypes (BecomeStoreOwnerCard / فتح متجر)
    //   - /service-types      → useServiceTypes (نماذج مزوّد الخدمة)
    // الثلاثة بلا معاملات (نفس URL الذي تبنيه productCategoriesApi.getAll /
    // storeTypesApi.getAll / serviceTypesApi.getAll)، وCACHE.STATIC بالباك-إند.
    { key: 'product-categories', url: `${API_BASE_URL}/product-categories` },
    { key: 'store-types', url: `${API_BASE_URL}/store-types` },
    { key: 'service-types', url: `${API_BASE_URL}/service-types` },
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

/**
 * FIX WARM-THUMBS-01: الصور المصغّرة كانت تُسخَّن بالرابط الخام
 * (`images[0]`) بينما البطاقات (AdCard/ProductCard/ServiceListingCard)
 * تعرض `getListThumbnailUrl(raw, 320, 224)` عبر next/image — رابط مختلف
 * تمامًا، فالنسخ المخزَّنة لم تُخدَم أبدًا (تحميل ضائع بحجم الصورة
 * الأصلية، مئات الـKB لكل صورة). ثم كان `slice(0, 12)` يستهلكها بالكامل
 * منتجات فقط، فلا إعلانات ولا خدمات ولا متاجر.
 *
 * الآن: نفس دالة الروابط التي تستخدمها البطاقات (بنفس الأبعاد)، وحد لكل
 * قائمة بدل حد إجمالي واحد. المتاجر تعرض شعارًا عبر getAvatarUrl(…, 96).
 * ⚠️ صيانة: لو تغيّرت أبعاد الصور في البطاقات (320×224 / 96) حدّثها هنا.
 */
export const THUMB_CAPS = { ads: 8, products: 6, services: 6, stores: 4 } as const;
const CARD_THUMB_W = 320;
const CARD_THUMB_H = 224;
const STORE_LOGO_SIZE = 96;

function firstImage(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null;
  const images = (item as Record<string, unknown>).images;
  return Array.isArray(images) && typeof images[0] === 'string' && images[0] ? images[0] : null;
}

export function collectThumbnailUrls(
  bodies: Partial<Record<'ads' | 'products' | 'services' | 'stores', unknown>>,
): string[] {
  const out = new Set<string>();
  const dataOf = (key: keyof typeof bodies): unknown[] => {
    const body = bodies[key] as { data?: unknown } | undefined;
    return Array.isArray(body?.data) ? (body!.data as unknown[]) : [];
  };
  const push = (u: string | null | undefined) => {
    if (u && !u.startsWith('data:')) out.add(u);
  };

  // الأولوية: إعلانات (المحتوى الرئيسي) ثم منتجات ثم خدمات ثم شعارات المتاجر.
  for (const key of ['ads', 'products', 'services'] as const) {
    for (const item of dataOf(key).slice(0, THUMB_CAPS[key])) {
      const raw = firstImage(item);
      if (raw) push(getListThumbnailUrl(raw, CARD_THUMB_W, CARD_THUMB_H));
    }
  }
  for (const item of dataOf('stores').slice(0, THUMB_CAPS.stores)) {
    const logo = (item as Record<string, unknown> | null)?.logoUrl;
    if (typeof logo === 'string' && logo) push(getAvatarUrl(logo, STORE_LOGO_SIZE));
  }
  return Array.from(out);
}

async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const n = Math.max(1, Math.min(concurrency, queue.length));
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (queue.length > 0) {
        const item = queue.shift() as T;
        await worker(item);
      }
    }),
  );
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
 *  - تم التحديث خلال مدة CORE_TTL_BY_TIER_MS للشبكة الحالية (العلامة بـ localStorage)
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

  if (!options?.force && !isCoreBundleDue()) return;

  isWarming = true;
  const plan = getWarmingPlan();
  // FIX WARM-CORE-CONCURRENCY-01: كانت كل الطلبات (8 JSON ثم 12 صورة)
  // تنطلق دفعة واحدة مهما كانت الشبكة، بينما الخطة تقول concurrency=1 على
  // الشبكات الضعيفة — فكانت تتزاحم وتنتهي مهلتها كلها معًا.
  const concurrency = Math.max(1, plan.concurrency || 1);
  const timeoutMs = plan.requestTimeoutMs > 0 ? plan.requestTimeoutMs : 15_000;

  const urls = buildCoreUrls();
  let completed = 0;
  let total = urls.length; // يُحدَّث لاحقًا ليشمل الصور المصغّرة بعد معرفة عددها الفعلي.
  // FIX WARM-FALSE-SUCCESS-01: نجاح فعلي فقط (cache.put) يُحتسب.
  let jsonSucceeded = 0;
  notifyWarmup({ active: true, completed, total });

  try {
    const cache = await caches.open(CORE_CACHE);
    const bodies: Partial<Record<'ads' | 'products' | 'services' | 'stores', unknown>> = {};

    await runPool(urls, concurrency, async ({ key, url }) => {
      try {
        const response = await fetchWithTimeout(url, {}, timeoutMs); // بدون credentials — نقاط عامة
        if (await cachePut(cache, url, response.clone())) {
          jsonSucceeded += 1;
          if (key === 'ads' || key === 'products' || key === 'services' || key === 'stores') {
            try {
              bodies[key] = await response.json();
            } catch {
              // JSON تالف — التخزين تم، لكن لا صور من هذه القائمة.
            }
          }
        }
      } catch {
        // طلب واحد فاشل لا يوقف الباقي.
      } finally {
        completed += 1;
        notifyWarmup({ active: true, completed, total });
      }
    });

    // FIX WARM-CORE-MARKER-01: علامة "تم التسخين" تعتمد على قوائم JSON
    // فقط. كانت الصور تُحسب معها بالنسبة 50%، فعلى شبكة بطيئة تفشل
    // الصور → لا علامة → كل فتح تطبيق يعيد جلب الـ8 قوائم من الصفر.
    const jsonThreshold = Math.ceil(urls.length * SUCCESS_THRESHOLD);
    const jsonOk = jsonSucceeded >= jsonThreshold;
    if (jsonOk) {
      localStorage.setItem(LAST_WARMED_KEY, String(Date.now()));
    } else {
      reportWarmingFailure({
        source: 'core',
        route: 'core-bundle',
        error: `low-threshold-${jsonSucceeded}/${urls.length}`,
        attempts: 2,
      });
    }

    // الصور best-effort: تُسخَّن فقط إن نجحت القوائم (وإلا لا معنى لها).
    const thumbnails = jsonOk ? collectThumbnailUrls(bodies) : [];
    total = urls.length + thumbnails.length;
    notifyWarmup({ active: true, completed, total });

    await runPool(thumbnails, concurrency, async (url) => {
      try {
        const response = await fetchWithTimeout(url, {}, timeoutMs);
        await cachePut(cache, url, response);
      } catch {
        // صورة واحدة فاشلة لا توقف الباقي.
      } finally {
        completed += 1;
        notifyWarmup({ active: true, completed, total });
      }
    });

    // FIX WARM-CORE-PRUNE-01: الكاش كان يتراكم — كل دورة تضيف صور الإعلانات
    // "الحالية" ولا تحذف أي قديمة، وCORE_CACHE بلا تقليم (انظر sw.js) فيكبر
    // حتى نشر النسخة التالية. نحذف كل ما ليس ضمن مجموعة هذه الدورة (روابط
    // الـ JSON المعروفة + الصور المطلوبة الآن).
    if (jsonOk) {
      try {
        const keep = new Set<string>([...urls.map((u) => u.url), ...thumbnails]);
        const existing = await cache.keys();
        await Promise.all(
          existing.filter((req) => !keep.has(req.url)).map((req) => cache.delete(req)),
        );
      } catch {
        // تنظيف best-effort.
      }
    }
  } catch {
    // فشل الحزمة كاملة — يُعاد المحاولة لاحقًا (لم نحدّث LAST_WARMED_KEY).
  } finally {
    isWarming = false;
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
