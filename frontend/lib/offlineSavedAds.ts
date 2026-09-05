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
 */

import { API_BASE_URL } from '@/lib/constants';
import { getDetailImageUrl, getThumbnailUrl } from '@/lib/cloudinary';
import { localGet, localSet } from '@/lib/localStore';
import type { Ad } from '@/types/ad.types';

export const SAVED_ADS_CACHE = 'market-saved-ads';

const SAVED_INDEX_KEY = 'saved-ads-offline';

/** حد أقصى معقول لعدد الإعلانات المحفوظة يدويًا — يحمي مساحة الجهاز
 * (كل إعلان قد يحمل عدة صور كاملة الجودة) من نمو غير محدود. */
const MAX_SAVED_ADS = 30;

export interface SavedOfflineAdMeta {
  id: string;
  title: string;
  price: string | null;
  city: string;
  thumbnail: string | null;
  savedAt: string;
}

export function listSavedOfflineAds(): SavedOfflineAdMeta[] {
  return localGet<SavedOfflineAdMeta[]>(SAVED_INDEX_KEY, []);
}

export function isAdSavedOffline(adId: string): boolean {
  return listSavedOfflineAds().some((a) => a.id === adId);
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

async function cachePutSafe(cache: Cache, url: string, response: Response): Promise<void> {
  try {
    if (response.ok) await cache.put(url, response.clone());
  } catch {
    // فشل تخزين عنصر واحد (مساحة ممتلئة، مثلًا) لا يجب يوقف بقية العملية.
  }
}

/**
 * يحفظ الإعلان: يعيد جلب استجابة /ads/:id الخام (نفس الرابط اللي
 * adsApi.getById يبنيه عبر axios) + كل صوره، ويخزّنهم بـ SAVED_ADS_CACHE،
 * ثم يسجّل الإعلان بفهرس localStorage لعرضه بصفحة "المحفوظة بدون اتصال".
 *
 * لا يرمي استثناءات للمستدعي — إن فشل الحفظ (لا كاش متاح، لا اتصال
 * أصلًا وقت الضغط على الزر، إلخ) يُعاد false ليعرض المكوّن toast مناسب.
 */
export async function saveAdOffline(ad: Ad): Promise<boolean> {
  if (typeof window === 'undefined' || typeof caches === 'undefined') return false;

  try {
    const cache = await caches.open(SAVED_ADS_CACHE);

    const apiUrl = adDetailUrl(ad.id);
    const apiResponse = await fetch(apiUrl);
    if (!apiResponse.ok) return false;
    await cachePutSafe(cache, apiUrl, apiResponse);

    await Promise.allSettled(
      collectImageUrls(ad).map(async (url) => {
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
      title: ad.title,
      price: ad.price,
      city: ad.city,
      thumbnail: ad.images[0] ? getThumbnailUrl(ad.images[0], 128, 128) : null,
      savedAt: new Date().toISOString(),
    });
    localSet(SAVED_INDEX_KEY, index.slice(0, MAX_SAVED_ADS));

    return true;
  } catch {
    return false;
  }
}

/**
 * يحذف الإعلان من الفهرس ومن الكاش. لا نملك هنا قائمة صور الإعلان
 * (فقط id) فنكتفي بحذف استجابة الـ API المعروفة الرابط — بقايا صور
 * بالكاش غير ضارة (ستُستبدل ببساطة عند أي حفظ لاحق لنفس الرابط) ولا
 * تمنع اعتبار الإعلان "غير محفوظ" بعد هذا الاستدعاء.
 */
export async function unsaveAdOffline(adId: string): Promise<void> {
  if (typeof window !== 'undefined' && typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(SAVED_ADS_CACHE);
      await cache.delete(adDetailUrl(adId));
    } catch {
      /* ignore */
    }
  }
  localSet(SAVED_INDEX_KEY, listSavedOfflineAds().filter((a) => a.id !== adId));
}
