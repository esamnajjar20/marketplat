/**
 * PHASE-2 (خطة "بدون نت"): فهرس بحث محلي.
 *
 * المشكلة: GET /search?q=X يُخزَّن بـ networkFirst فقط لو نفس q بالضبط
 * طُلبت سابقًا وهو أونلاين (URL كامل = مفتاح الكاش). أي كلمة بحث جديدة
 * بدون نت = فشل، حتى لو الكلمة تطابق منتج/متجر موجود فعليًا بحزمة المرحلة ١.
 *
 * الحل: لا نبني فهرس نص كامل (overkill لنطاق صغير — ~30 عنصر). نعيد بناء
 * فهرس بسيط كل مرة من نفس استجابات products/stores المخزّنة بـ CORE_CACHE
 * (المرحلة ١ — lib/offlineCoreBundle.ts) ونطابق substring مباشرة. تعمّدت
 * عدم تخزين الفهرس بشكل منفصل بـ IndexedDB: CORE_CACHE هو مصدر الحقيقة
 * الوحيد أصلًا، وإعادة الاشتقاق منه بكل بحث يتجنب مشكلة تزامن نسختين من
 * نفس البيانات.
 *
 * ⚠️ حدود معروفة (نطاق المرحلة ٢ متعمّد أن يبقى صغيرًا):
 *  - يغطي فقط النوعين المخزّنين بحزمة المرحلة ١: 'products' و'stores'.
 *    بحث بـ type='ads' أو type='services' بدون نت يرجع صفر نتائج دائمًا
 *    (لا بيانات إعلانات/خدمات بالحزمة الأساسية حاليًا) — تحسين محتمل
 *    لمرحلة لاحقة لو ثبت أنه مطلوب فعليًا.
 *  - Product لا يحمل حقل rating بالـ API أصلًا (تحقق من types/product.types.ts)
 *    — نرجعه 0 دائمًا للمنتجات، مو تقريب أو اختراع.
 *  - لا ترتيب صلة حقيقي (relevance ranking) — فقط: تطابق ببداية العنوان
 *    أولًا، ثم بقية التطابقات بترتيب البيانات كما وصلت من الـ API.
 */

import { buildCoreUrls, CORE_CACHE } from '@/lib/offlineCoreBundle';
import type { PaginationMeta } from '@/types/api.types';
import type { SearchQuery, SearchResult, SearchResultType } from '@/types/search.types';

const EMPTY_PAGINATION: PaginationMeta = {
  total: 0, page: 1, limit: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false,
};

/** يحوّل صف Product خام (من استجابة GET /products المخزّنة) إلى SearchResult.
 * وصول دفاعي لكل حقل — لا نفترض بنية صارمة لأن هذا JSON خام من الكاش. */
function normalizeProduct(p: Record<string, unknown>): SearchResult | null {
  if (typeof p.id !== 'string' || typeof p.name !== 'string') return null;
  const store = (p.store ?? {}) as Record<string, unknown>;
  return {
    id: p.id,
    type: 'product',
    title: p.name,
    description: typeof p.description === 'string' ? p.description : '',
    image: Array.isArray(p.images) && typeof p.images[0] === 'string' ? p.images[0] : null,
    city: typeof store.city === 'string' ? store.city : null,
    rating: 0, // Product ما عنده حقل rating بالـ API — انظر التعليق أعلاه.
    views: typeof p.views === 'number' ? p.views : 0,
    price: typeof p.price === 'string' ? p.price : null,
    seller: {
      id: typeof store.id === 'string' ? store.id : (typeof p.storeId === 'string' ? p.storeId : ''),
      name: typeof store.name === 'string' ? store.name : '',
      verified: false, // غير متوفر بشكل ProductWithStore المختصر من /products
      type: 'store',
    },
    url: `/products/${p.id}`,
    createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date(0).toISOString(),
    distanceKm: null,
  };
}

/** يحوّل صف Store خام (من استجابة GET /stores المخزّنة) إلى SearchResult. */
function normalizeStore(s: Record<string, unknown>): SearchResult | null {
  if (typeof s.id !== 'string' || typeof s.name !== 'string') return null;
  const sellerProfile = (s.sellerProfile ?? {}) as Record<string, unknown>;
  return {
    id: s.id,
    type: 'store',
    title: s.name,
    description: typeof s.description === 'string' ? s.description : '',
    image: typeof s.logoUrl === 'string' ? s.logoUrl : null,
    city: typeof s.city === 'string' ? s.city : null,
    rating: typeof sellerProfile.averageRating === 'number' ? sellerProfile.averageRating : 0,
    views: typeof s.views === 'number' ? s.views : 0,
    price: null,
    seller: {
      id: typeof sellerProfile.id === 'string' ? sellerProfile.id : s.id,
      name: s.name,
      verified: Boolean(sellerProfile.verified),
      type: 'store',
    },
    url: `/stores/${s.id}`,
    createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date(0).toISOString(),
    distanceKm: null,
  };
}

/** يقرأ استجابات products/stores المخزّنة بـ CORE_CACHE ويبني فهرسًا مسطّحًا.
 * hasBundle=false يعني: لا توجد حزمة أساسية بعد إطلاقًا (مو أن البحث فاضي
 * لعدم تطابق) — الفرق يحدد لاحقًا هل نرمي الخطأ الأصلي أو نعرض "لا نتائج". */
async function loadOfflineIndex(): Promise<{ entries: SearchResult[]; hasBundle: boolean }> {
  if (typeof caches === 'undefined') return { entries: [], hasBundle: false };

  const cache = await caches.open(CORE_CACHE);
  const urls = buildCoreUrls();
  const productsUrl = urls.find((u) => u.key === 'products')?.url;
  const storesUrl = urls.find((u) => u.key === 'stores')?.url;

  const entries: SearchResult[] = [];
  let hasBundle = false;

  if (productsUrl) {
    const res = await cache.match(productsUrl);
    if (res) {
      hasBundle = true;
      const body = await res.json().catch(() => null) as { data?: unknown[] } | null;
      if (body && Array.isArray(body.data)) {
        for (const row of body.data) {
          const normalized = normalizeProduct(row as Record<string, unknown>);
          if (normalized) entries.push(normalized);
        }
      }
    }
  }

  if (storesUrl) {
    const res = await cache.match(storesUrl);
    if (res) {
      hasBundle = true;
      const body = await res.json().catch(() => null) as { data?: unknown[] } | null;
      if (body && Array.isArray(body.data)) {
        for (const row of body.data) {
          const normalized = normalizeStore(row as Record<string, unknown>);
          if (normalized) entries.push(normalized);
        }
      }
    }
  }

  return { entries, hasBundle };
}

const SEARCH_TYPE_TO_RESULT_TYPE: Partial<Record<string, SearchResultType>> = {
  products: 'product',
  stores:   'store',
};

/**
 * بحث محلي — نفس شكل إرجاع unwrapPaginated's {items, meta} اللي useSearch
 * يتوقعه، فـ SearchResults.tsx ما يحتاج أي تعديل ليقرأه.
 *
 * hasBundle=false بالإرجاع يعني: لا توجد حزمة أساسية مخزّنة إطلاقًا (لم
 * يُفتح التطبيق أونلاين بعد التثبيت، مثلًا) — المستدعي (useSearch) يقرر
 * حينها رمي خطأ الشبكة الأصلي بدل عرض "لا نتائج" مضلِّلة.
 */
export async function searchOffline(
  query: SearchQuery,
): Promise<{ items: SearchResult[]; meta: PaginationMeta; hasBundle: boolean }> {
  const { entries, hasBundle } = await loadOfflineIndex();
  if (!hasBundle) {
    return { items: [], meta: EMPTY_PAGINATION, hasBundle: false };
  }

  let filtered = entries;

  if (query.type && query.type !== 'all') {
    const mapped = SEARCH_TYPE_TO_RESULT_TYPE[query.type];
    filtered = mapped ? filtered.filter((r) => r.type === mapped) : [];
  }

  const q = (query.q ?? '').trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        (r.city ?? '').toLowerCase().includes(q),
    );
    filtered = [...filtered].sort((a, b) => {
      const aStarts = a.title.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.title.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts;
    });
  }

  if (query.city) {
    const cityFilter = query.city.toLowerCase();
    filtered = filtered.filter((r) => (r.city ?? '').toLowerCase().includes(cityFilter));
  }

  const total = filtered.length;
  const limited = filtered.slice(0, 24);

  return {
    items: limited,
    meta: {
      total,
      page: 1,
      limit: limited.length,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    },
    hasBundle: true,
  };
}
