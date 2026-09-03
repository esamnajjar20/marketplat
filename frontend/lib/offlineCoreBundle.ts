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
 * متاجر واحدة + صورهم المصغّرة، ~25-30 طلب إجمالًا) — لا trimming ولا حد
 * أقصى مطلوب لأن الحجم صغير أصلًا ومُدار صراحة (يُستبدل بالكامل بكل
 * warmCoreBundle() جديدة، مو يتراكم).
 */

import { API_BASE_URL } from '@/lib/constants';

export const CORE_CACHE = 'market-core-v3'; // يجب مطابقة CACHE_VERSION بـ public/sw.js
const LAST_WARMED_KEY = 'marketplat:core-bundle:last-warmed';
const WARM_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 ساعات — يكفي لبيانات "تصفح عام"

/** نفس بناء URL اللي productsApi.getAll/categoriesApi.getAll/storesApi.getAll
 * يبنونه عبر axios — يُعاد هنا يدويًا لأننا نحتاج Response خام (fetch) قابل
 * للتخزين في Cache Storage، مو JSON مُحلَّل (اللي axios يرجعه).
 */
export function buildCoreUrls(): { key: string; url: string }[] {
  return [
    { key: 'categories', url: `${API_BASE_URL}/categories` },
    {
      key: 'products',
      // مطابق لقيم ProductsGrid.tsx الافتراضية بدون أي فلتر من URL.
      url: `${API_BASE_URL}/products?page=1&limit=12&sortBy=createdAt&sortOrder=desc`,
    },
    {
      key: 'stores',
      // مطابق لقيم StoresGrid.tsx الافتراضية بدون أي فلتر من URL.
      url: `${API_BASE_URL}/stores?page=1&sortBy=createdAt&sortOrder=desc`,
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
 *
 * لا يرمي استثناءات للمستدعي — فشل الحزمة الأساسية لا يجب يكسر أي شي
 * بالواجهة، هي تحسين صامت بالخلفية فقط.
 */
export async function warmCoreBundle(options?: { force?: boolean }): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!navigator.onLine) return;
  if (typeof caches === 'undefined') return;

  if (!options?.force) {
    const last = Number(localStorage.getItem(LAST_WARMED_KEY) ?? 0);
    if (Date.now() - last < WARM_INTERVAL_MS) return;
  }

  try {
    const cache = await caches.open(CORE_CACHE);
    const urls = buildCoreUrls();

    const results = await Promise.allSettled(
      urls.map(async ({ url }) => {
        const response = await fetch(url); // بدون credentials — نقاط عامة (public browse)
        await cachePut(cache, url, response.clone());
        return response.ok ? response.json() : null;
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

    await Promise.allSettled(
      thumbnailUrls.slice(0, 24).map(async (url) => {
        try {
          const response = await fetch(url);
          await cachePut(cache, url, response);
        } catch {
          // صورة واحدة فاشلة لا توقف الباقي.
        }
      }),
    );

    localStorage.setItem(LAST_WARMED_KEY, String(Date.now()));
  } catch {
    // فشل الحزمة كاملة (مثلًا الشبكة انقطعت أثناء الجلب) — لا مشكلة،
    // سيُعاد المحاولة بأول فتح تطبيق أونلاين تالي (لم نحدّث LAST_WARMED_KEY).
  }
}
