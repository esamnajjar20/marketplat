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
 * ⚠️ حدود معروفة:
 *  - PHASE-3 (تكملة): أُضيف تغطية 'ads' و'services' الآن، طالما
 *    offlineCoreBundle.ts (المرحلة ١) يخزّن استجاباتهما ضمن CORE_CACHE —
 *    نفس آلية products/stores بالضبط، فقط مصدر بيانات إضافي.
 *  - Product لا يحمل حقل rating بالـ API أصلًا (تحقق من types/product.types.ts)
 *    — نرجعه 0 دائمًا للمنتجات، مو تقريب أو اختراع.
 *  - Ad لا يحمل description بقائمة /ads (AdListRow = Omit<AdWithAuthor,
 *    'description'> — انظر ads.repository.ts's PERF FIX) — نرجعها ''
 *    دائمًا للإعلانات بنفس منطق rating للمنتجات أعلاه، مو خطأ.
 *  - ServiceListingWithProvider's provider Pick لا يحمل serviceAreaCities
 *    (فقط id/businessName/logoUrl/availabilityStatus/contactPhone) —
 *    city ترجع null دائمًا للخدمات، لأن الباك-إند وحده يعرف المدينة
 *    الممثِّلة الصحيحة (serviceAreaCities[1] أو فلتر المدينة، انظر
 *    search.repository.ts's serviceBranch's cityExpr) وليس لدينا بيانات
 *    كافية لاشتقاقها محليًا بدون تخمين.
 *  - لا ترتيب صلة حقيقي (relevance ranking) — فقط: تطابق ببداية العنوان
 *    أولًا، ثم بقية التطابقات بترتيب البيانات كما وصلت من الـ API.
 */

import { buildCoreUrls, CORE_CACHE } from '@/lib/offlineCoreBundle';
import type { PaginationMeta } from '@/types/api.types';
import type { SearchQuery, SearchResult, SearchResultType } from '@/types/search.types';

import { arabicNormalize } from './arabicNormalize';

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
    latitude: null,
    longitude: null,
  };
}

/** يحوّل صف Ad خام (من استجابة GET /ads المخزّنة) إلى SearchResult.
 * seller id/type يطابقان تحديدًا منطق backend's search.repository.ts's
 * adBranch (coalesce(sp.id, a.userId) + 'seller_profile' لو sellerProfileId
 * موجود وإلا 'user') — نفس القاعدة، مطبّقة هنا على JSON الخام بدل SQL. */
function normalizeAd(a: Record<string, unknown>): SearchResult | null {
  if (typeof a.id !== 'string' || typeof a.title !== 'string') return null;
  const sellerProfile = (a.sellerProfile ?? null) as Record<string, unknown> | null;
  const user = (a.user ?? {}) as Record<string, unknown>;
  const sellerProfileId = typeof a.sellerProfileId === 'string' ? a.sellerProfileId : null;
  return {
    id: a.id,
    type: 'ad',
    title: a.title,
    description: '', // AdListRow يستبعد description عمدًا — انظر التعليق أعلى الملف.
    image: Array.isArray(a.images) && typeof a.images[0] === 'string' ? a.images[0] : null,
    city: typeof a.city === 'string' ? a.city : null,
    rating: sellerProfile && typeof sellerProfile.averageRating === 'string'
      ? parseFloat(sellerProfile.averageRating) || 0
      : 0,
    views: typeof a.views === 'number' ? a.views : 0,
    price: typeof a.price === 'string' ? a.price : null,
    seller: {
      id: sellerProfileId ?? (typeof a.userId === 'string' ? a.userId : ''),
      name: typeof user.name === 'string' ? user.name : '',
      verified: Boolean(sellerProfile?.verified),
      type: sellerProfileId ? 'seller_profile' : 'user',
    },
    url: `/ads/${a.id}`,
    createdAt: typeof a.createdAt === 'string' ? a.createdAt : new Date(0).toISOString(),
    distanceKm: null,
    latitude: null,
    longitude: null,
  };
}

/** يحوّل صف ServiceListing خام (من استجابة GET /service-listings المخزّنة)
 * إلى SearchResult. city=null دائمًا هنا — انظر التعليق أعلى الملف. */
function normalizeService(s: Record<string, unknown>): SearchResult | null {
  if (typeof s.id !== 'string' || typeof s.title !== 'string') return null;
  const provider = (s.provider ?? {}) as Record<string, unknown>;
  const providerSellerProfile = (provider.sellerProfile ?? {}) as Record<string, unknown>;
  return {
    id: s.id,
    type: 'service',
    title: s.title,
    description: typeof s.description === 'string' ? s.description : '',
    image: Array.isArray(s.images) && typeof s.images[0] === 'string' ? s.images[0] : null,
    city: null, // provider Pick لا يحمل serviceAreaCities — انظر التعليق أعلى الملف.
    rating: typeof providerSellerProfile.averageRating === 'string'
      ? parseFloat(providerSellerProfile.averageRating) || 0
      : 0,
    views: typeof s.views === 'number' ? s.views : 0,
    price: typeof s.price === 'string' ? s.price : null,
    seller: {
      id: typeof provider.id === 'string' ? provider.id : '',
      name: typeof provider.businessName === 'string' ? provider.businessName : '',
      verified: Boolean(providerSellerProfile.verified),
      type: 'service_provider',
    },
    url: `/services/${s.id}`,
    createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date(0).toISOString(),
    distanceKm: null,
    latitude: null,
    longitude: null,
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
    latitude: null,
    longitude: null,
  };
}

/** يقرأ استجابات products/stores/ads/services المخزّنة بـ CORE_CACHE ويبني فهرسًا مسطّحًا.
 * hasBundle=false يعني: لا توجد حزمة أساسية بعد إطلاقًا (مو أن البحث فاضي
 * لعدم تطابق) — الفرق يحدد لاحقًا هل نرمي الخطأ الأصلي أو نعرض "لا نتائج". */
async function loadOfflineIndex(): Promise<{ entries: SearchResult[]; hasBundle: boolean }> {
  if (typeof caches === 'undefined') return { entries: [], hasBundle: false };

  const cache = await caches.open(CORE_CACHE);
  const urls = buildCoreUrls();

  // خريطة key -> دالة التطبيع الخاصة به — تستبدل أربع كتل متكررة
  // (products/stores، والآن ads/services) بحلقة واحدة، بدل نسخ نفس منطق
  // cache.match+json.catch+for-loop أربع مرات بشكل شبه متطابق.
  const normalizers: Record<string, (row: Record<string, unknown>) => SearchResult | null> = {
    products: normalizeProduct,
    stores: normalizeStore,
    ads: normalizeAd,
    services: normalizeService,
  };

  const entries: SearchResult[] = [];
  let hasBundle = false;

  for (const { key, url } of urls) {
    const normalize = normalizers[key];
    if (!normalize) continue; // 'categories' مثلًا — لا يشارك بالفهرس.

    const res = await cache.match(url);
    if (!res) continue;

    hasBundle = true;
    const body = await res.json().catch(() => null) as { data?: unknown[] } | null;
    if (body && Array.isArray(body.data)) {
      for (const row of body.data) {
        const normalized = normalize(row as Record<string, unknown>);
        if (normalized) entries.push(normalized);
      }
    }
  }

  return { entries, hasBundle };
}

const SEARCH_TYPE_TO_RESULT_TYPE: Partial<Record<string, SearchResultType>> = {
  products: 'product',
  stores:   'store',
  ads:      'ad',
  services: 'service',
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

  // FIX OFFLINE-SEARCH-ARABIC-01: normalize both sides via
  // arabicNormalize (same folding the backend's arabic_normalize SQL
  // function applies to FTS) so a user typing "سياره" while offline
  // finds listings stored with "سيارة" and vice versa. Previously
  // used raw .toLowerCase().includes(), meaning the same query
  // returned results online and nothing offline — same word, same
  // user, different behavior depending on connectivity. Only the
  // comparison is normalized; r.title/r.description display as-is.
  const q = arabicNormalize(query.q);
  if (q) {
    filtered = filtered.filter((r) => {
      const nTitle = arabicNormalize(r.title);
      const nDesc = arabicNormalize(r.description);
      const nCity = arabicNormalize(r.city ?? '');
      return nTitle.includes(q) || nDesc.includes(q) || nCity.includes(q);
    });
    filtered = [...filtered].sort((a, b) => {
      const aStarts = arabicNormalize(a.title).startsWith(q) ? 0 : 1;
      const bStarts = arabicNormalize(b.title).startsWith(q) ? 0 : 1;
      return aStarts - bStarts;
    });
  }

  if (query.city) {
    const cityFilter = arabicNormalize(query.city);
    filtered = filtered.filter((r) => arabicNormalize(r.city ?? '').includes(cityFilter));
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


/** نتائج بحث محلية مع تلميح «من البيانات المحفوظة». */
export async function searchOfflineWithMeta(query: SearchQuery): Promise<{
  items: SearchResult[];
  meta: PaginationMeta;
  hasBundle: boolean;
  offlineNote: string;
}> {
  const result = await searchOffline(query);
  return {
    ...result,
    offlineNote: result.hasBundle
      ? 'نتائج من البيانات المحفوظة محليًا — قد تكون قديمة'
      : 'لا توجد بيانات محفوظة كافية للبحث بدون إنترنت',
  };
}
