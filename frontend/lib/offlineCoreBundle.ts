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

// FIX PWA-VER-01: نفس مشكلة lib/offlineRouteShells.ts's STATIC_CACHE — كانت
// عالقة على 'v4' بينما public/sw.js تجاوزها إلى 'v5'، فكان warmCoreBundle()
// يكتب بكاش يُحذف فورًا بـ 'activate' (غير مدرَج بـ currentCaches) ولا يقرأ
// منه sw.js's networkFirstApi/offline-search-index أصلاً. رُفعت إلى 'v6'
// لتطابق public/sw.js's CACHE_VERSION الحالية.
// FIX SW-TRIM-ORDER-01: رُفعت إلى 'v19' لتطابق public/sw.js (انظر تعليق
// CACHE_VERSION هناك) — راجع أيضًا __tests__/unit/lib/cacheVersionSync.test.ts
// الذي يفشل تلقائيًا الآن لو تكرر هذا النوع من الانحراف مستقبلًا بدل أن
// ينكشف فقط بمستخدم متضرر بالإنتاج.
export const CORE_CACHE = 'market-core-v19'; // يجب مطابقة CACHE_VERSION بـ public/sw.js (FIX SW-AUTH-PASSTHROUGH-01)
const LAST_WARMED_KEY = 'marketplat:core-bundle:last-warmed';
const WARM_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 ساعات — يكفي لبيانات "تصفح عام"

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

let sharedWarmupProgress: WarmupProgress = { active: false, completed: 0, total: 0 };
const warmupListeners = new Set<(progress: WarmupProgress) => void>();
let isWarming = false;

function notifyWarmup(progress: WarmupProgress) {
  sharedWarmupProgress = progress;
  warmupListeners.forEach((cb) => cb(progress));
}

/** يستمع WarmupIndicator.tsx لهذه الحالة لعرض/تحديث/إخفاء شريط التقدّم. */
export function onWarmupProgress(listener: (progress: WarmupProgress) => void): () => void {
  warmupListeners.add(listener);
  listener(sharedWarmupProgress); // أبلغ فورًا بالحالة الحالية (مثل onServiceWorkerUpdate)
  return () => {
    warmupListeners.delete(listener);
  };
}

export function getWarmupProgress(): WarmupProgress {
  return sharedWarmupProgress;
}

/** نفس بناء URL اللي productsApi.getAll/categoriesApi.getAll/storesApi.getAll
 * يبنونه عبر axios — يُعاد هنا يدويًا لأننا نحتاج Response خام (fetch) قابل
 * للتخزين في Cache Storage، مو JSON مُحلَّل (اللي axios يرجعه).
 */
export function buildCoreUrls(): { key: string; url: string }[] {
  return [
    { key: 'categories', url: `${API_BASE_URL}/categories` },
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

async function cachePut(cache: Cache, url: string, response: Response): Promise<void> {
  try {
    if (response.ok) {
      await cache.put(url, response.clone());
    }
  } catch {
    // تخزين فاشل لعنصر واحد (مساحة ممتلئة، مثلًا) لا يجب يوقف بقية الحزمة.
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
export async function warmCoreBundle(options?: { force?: boolean }): Promise<void> {
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
  notifyWarmup({ active: true, completed, total });

  try {
    const cache = await caches.open(CORE_CACHE);

    const results = await Promise.allSettled(
      urls.map(async ({ url }) => {
        try {
          const response = await fetch(url); // بدون credentials — نقاط عامة (public browse)
          await cachePut(cache, url, response.clone());
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
          const response = await fetch(url);
          await cachePut(cache, url, response);
        } catch {
          // صورة واحدة فاشلة لا توقف الباقي.
        } finally {
          completed += 1;
          notifyWarmup({ active: true, completed, total });
        }
      }),
    );

    localStorage.setItem(LAST_WARMED_KEY, String(Date.now()));
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
