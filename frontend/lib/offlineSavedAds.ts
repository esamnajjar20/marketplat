/**
 * PHASE-OFFLINE-AD-DETAIL: حفظ إعلان محدد صراحةً للعمل بدون اتصال.
 *
 * المشكلة: صفحة تفاصيل الإعلان تُجلب أولًا من السيرفر (SSR عبر
 * lib/prefetch.ts) — هذا الطلب لا يمر إطلاقًا عبر شبكة المتصفح، فلا
 * يعترضه sw.js ولا يُخزَّن بأي كاش. حتى لو حدث لاحقًا refetch من جهة
 * العميل (useAd's staleTime=120s)، فهو يدخل API_CACHE العادي المحدود
 * بـ MAX_API_ENTRIES=60 بترتيب FIFO — أي تصفح كافٍ بين مشاهدة الإعلان
 * وانقطاع الاتصال يُخرجه من الكاش قبل ما يحتاجه المستخدم فعليًا. صور
 * الإعلان نفسها ليست المشكلة (IMAGE_CACHE بلا تقليم أصلًا)، لكنها قد لا
 * تكون كلها محمَّلة بعد (thumbnails بالأسفل بـ loading="lazy").
 *
 * الحل: كاش مستقل خاص بهذه الميزة (SAVED_ADS_CACHE) — بدون رقم إصدار
 * عمدًا، ومُستثنى صراحة من الحذف بـ public/sw.js's 'activate' handler —
 * يحفظ استجابة GET /ads/:id نفسها + كل صور الإعلان (بحجمي التفاصيل
 * والمصغّر)، بمعزل تام عن أي تقليم تلقائي. هذا كاش "يختاره المستخدم"
 * صراحة (زر "حفظ للعمل دون اتصال" بـ AdDetail.tsx)، لا نتيجة تصفح عابر.
 *
 * SAVED_ADS_CACHE يجب أن يبقى مطابقًا حرفيًا لنفس الاسم بـ public/sw.js
 * (نفس نمط CORE_CACHE المُكرَّر بين lib/offlineCoreBundle.ts وsw.js).
 *
 * FIX SAVED-ADS-LEAK-01: قبل هذا الإصلاح، MAX_SAVED_ADS=30 كانت تحدّ فقط
 * فهرس localStorage (SAVED_INDEX_KEY عبر index.slice(0, MAX_SAVED_ADS))
 * — العنصر رقم 31 يُقصى من الفهرس المعروض بصفحة "المحفوظات"، لكن استجابة
 * /ads/:id وكل صوره تبقى في SAVED_ADS_CACHE (Cache Storage الفعلي) للأبد،
 * لأن لا شيء كان يحذفها فعليًا. بمرور الوقت هذا يعني نموًا غير محدود
 * لمساحة تخزين حقيقية (صور كاملة الجودة لكل إعلان حُفظ يومًا) بلا أي حد
 * فعلي رغم وجود MAX_SAVED_ADS بالاسم فقط — خطر حقيقي على جهاز بمساحة
 * محدودة. بالإضافة: unsaveAdOffline نفسها (الحذف اليدوي الصريح) كانت
 * تحذف فقط استجابة /ads/:id، لا صور الإعلان — تعليقها القديم برّر هذا
 * بـ"بقايا غير ضارة" لكن هذا التبرير ينهار مع الاستخدام المتكرر: بلا سقف
 * فعلي، "غير ضار" يتراكم إلى استهلاك حقيقي غير محدود لمساحة الجهاز.
 *
 * الحل: تخزين قائمة روابط صور كل إعلان محفوظ ضمن الفهرس نفسه
 * (SavedOfflineAdMeta.imageUrls)، حتى يقدر أي حذف — تلقائي بالإقصاء عن
 * السقف أو يدوي عبر الزر — تنظيف Cache Storage الفعلي بدقة (API response
 * + كل الصور)، لا فقط تحديث الفهرس المعروض.
 */

import { API_BASE_URL } from '@/lib/constants';
import { getDetailImageUrl, getThumbnailUrl } from '@/lib/cloudinary';
import { localGet, localSet } from '@/lib/localStore';
import type { Ad } from '@/types/ad.types';

export const SAVED_ADS_CACHE = 'market-saved-ads';

const SAVED_INDEX_KEY = 'saved-ads-offline';

/** حد أقصى معقول لعدد الإعلانات المحفوظة يدويًا — يحمي مساحة الجهاز
 * (كل إعلان قد يحمل عدة صور كاملة الجودة) من نمو غير محدود. مُطبَّق الآن
 * فعليًا على Cache Storage نفسها لا فقط على الفهرس المعروض — انظر
 * FIX SAVED-ADS-LEAK-01 أعلاه. */
const MAX_SAVED_ADS = 30;

export interface SavedOfflineAdMeta {
  id: string;
  /** FIX SAVED-ADS-USER-SCOPE: معرّف صاحب الحفظ. بدونه، حساب آخر يسجّل
   * دخول على نفس الجهاز يرى محفوظات الحساب السابق. null لعناصر قديمة. */
  userId?: string | null;
  title: string;
  price: string | null;
  city: string;
  thumbnail: string | null;
  savedAt: string;
  /** كل روابط صور الإعلان (تفاصيل + مصغّرة) — تُستخدم لحذف كل ما يخص هذا
   * الإعلان من SAVED_ADS_CACHE بدقة عند الإقصاء التلقائي أو الحذف اليدوي.
   * قد تكون فارغة لعنصر محفوظ بنسخة سابقة من التطبيق (قبل هذا الإصلاح) —
   * حذفه حينها يقتصر على استجابة الـ API كما كان الحال سابقًا، لا خطأ. */
  imageUrls: string[];
}

/**
 * FIX SAVED-ADS-USER-SCOPE: userId اختياري — مررها لتصفية محفوظات
 * المستخدم الحالي فقط. بلا userId تُرجَع كل المحفوظات (للتنظيف الشامل).
 */
export function listSavedOfflineAds(userId?: string | null): SavedOfflineAdMeta[] {
  const all = localGet<SavedOfflineAdMeta[]>(SAVED_INDEX_KEY, []);
  if (userId === undefined) return all;
  return all.filter((a) => (a.userId ?? null) === (userId ?? null));
}

export function isAdSavedOffline(adId: string, userId?: string | null): boolean {
  return listSavedOfflineAds(userId).some((a) => a.id === adId);
}

function adDetailUrl(id: string): string {
  return `${API_BASE_URL}/ads/${id}`;
}

/** يجمع كل روابط الصور اللي الصفحة فعليًا تعرضها (AdDetail.tsx) —
 * بنفس الأبعاد بالضبط، حتى تُطابَق لاحقًا Cache API's match() حرفيًا. */
function collectImageUrls(ad: Ad): string[] {
  const urls: string[] = [];
  for (const img of ad.images) {
    urls.push(getDetailImageUrl(img), getThumbnailUrl(img, 128, 128));
  }
  return urls;
}

/**
 * FIX SAVED-ADS-TIMESTAMP: نسخة من putTimestamped (نفس منطق sw.js) —
 * بدونها كل مدخلات SAVED_ADS_CACHE لها ts=0، فـ trimCache يحذفها بشكل
 * عشوائي بدل الأقدم أولاً عند تجاوز الحد.
 */
async function cachePutSafe(cache: Cache, url: string, response: Response): Promise<void> {
  try {
    if (!response.ok) return;
    const headers = new Headers(response.headers);
    headers.set('X-SW-Cached-At', String(Date.now()));
    const body = await response.clone().blob();
    const stamped = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
    await cache.put(url, stamped);
  } catch {
    // فشل تخزين عنصر واحد (مساحة ممتلئة، مثلًا) لا يجب يوقف بقية العملية.
  }
}

/** يحذف استجابة /ads/:id وكل صور الإعلان المعروفة من SAVED_ADS_CACHE —
 * منطق الحذف المشترك بين الإقصاء التلقائي (تجاوز MAX_SAVED_ADS) والحذف
 * اليدوي (unsaveAdOffline)، بدل تكراره بمكانين (FIX SAVED-ADS-LEAK-01). */
async function purgeSavedAdFromCache(entry: Pick<SavedOfflineAdMeta, 'id' | 'imageUrls'>): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(SAVED_ADS_CACHE);
    await cache.delete(adDetailUrl(entry.id));
    await Promise.allSettled(entry.imageUrls.map((url) => cache.delete(url)));
  } catch {
    /* ignore */
  }
}

/**
 * يحفظ الإعلان: يعيد جلب استجابة /ads/:id الخام (نفس الرابط اللي
 * adsApi.getById يبنيه عبر axios) + كل صوره، ويخزّنهم بـ SAVED_ADS_CACHE،
 * ثم يسجّل الإعلان بفهرس localStorage لعرضه بصفحة "المحفوظة بدون اتصال".
 *
 * FIX SAVED-ADS-LEAK-01: أي إعلان يُقصى من الفهرس بسبب تجاوز MAX_SAVED_ADS
 * يُحذف الآن أيضًا فعليًا من SAVED_ADS_CACHE (API response + صوره) بدل
 * البقاء فيها للأبد بصمت.
 *
 * لا يرمي استثناءات للمستدعي — إن فشل الحفظ (لا كاش متاح، لا اتصال
 * أصلًا وقت الضغط على الزر، إلخ) يُعاد false ليعرض المكوّن toast مناسب.
 */
export async function saveAdOffline(ad: Ad, userId?: string | null): Promise<boolean> {
  if (typeof window === 'undefined' || typeof caches === 'undefined') return false;

  try {
    const cache = await caches.open(SAVED_ADS_CACHE);

    const apiUrl = adDetailUrl(ad.id);
    const apiResponse = await fetch(apiUrl);
    if (!apiResponse.ok) return false;
    await cachePutSafe(cache, apiUrl, apiResponse);

    const imageUrls = collectImageUrls(ad);
    await Promise.allSettled(
      imageUrls.map(async (url) => {
        try {
          const imgResponse = await fetch(url);
          await cachePutSafe(cache, url, imgResponse);
        } catch {
          // صورة واحدة فاشلة لا توقف حفظ الباقي.
        }
      }),
    );

    const index = listSavedOfflineAds().filter((a) => a.id !== ad.id);
    index.unshift({
      id: ad.id,
      userId: userId ?? null,
      title: ad.title,
      price: ad.price,
      city: ad.city,
      thumbnail: ad.images[0] ? getThumbnailUrl(ad.images[0], 128, 128) : null,
      savedAt: new Date().toISOString(),
      imageUrls,
    });

    const kept = index.slice(0, MAX_SAVED_ADS);
    const evicted = index.slice(MAX_SAVED_ADS);
    localSet(SAVED_INDEX_KEY, kept);
    // FIX SAVED-ADS-LEAK-01: نظّف Cache Storage لكل عنصر أُقصي من الفهرس —
    // بلا هذا، تجاوز السقف يُخفي العنصر عن الواجهة فقط بينما يبقى استهلاكه
    // الفعلي للمساحة قائمًا للأبد.
    await Promise.allSettled(evicted.map((a) => purgeSavedAdFromCache(a)));

    return true;
  } catch {
    return false;
  }
}

/**
 * يحذف الإعلان من الفهرس ومن الكاش — استجابة الـ API وكل صوره المعروفة
 * (FIX SAVED-ADS-LEAK-01؛ سابقًا كانت تُحذف استجابة الـ API فقط وتبقى
 * الصور "بقايا غير ضارة" بالكاش، وهو افتراض لا يصمد بلا سقف فعلي مُطبَّق).
 */
export async function unsaveAdOffline(adId: string, userId?: string | null): Promise<void> {
  const current = listSavedOfflineAds(userId);
  const entry = current.find((a) => a.id === adId);
  await purgeSavedAdFromCache({ id: adId, imageUrls: entry?.imageUrls ?? [] });
  localSet(SAVED_INDEX_KEY, current.filter((a) => a.id !== adId));
}
