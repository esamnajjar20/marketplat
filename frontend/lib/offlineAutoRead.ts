/**
 * PHASE-2: auto-cache visited ad details for offline reading (24h TTL).
 * Distinct from manual "حفظ دون اتصال" — uses a separate index key so
 * manual saves are never auto-evicted by browsing.
 */
import type { Ad } from '@/types/ad.types';
import { localGet, localSet } from '@/lib/localStore';
import { getThumbnailUrl } from '@/lib/cloudinary';
import { API_BASE_URL } from '@/lib/constants';

const INDEX_KEY = 'marketplat:auto-read-ads';
const MAX_AUTO = 15;
const TTL_MS = 24 * 60 * 60 * 1000;
// FIX AUTO-READ-CACHE-NAME: يجب أن يطابق lib/offlineSavedAds.ts's
// SAVED_ADS_CACHE (بدون إصدار) + يُضاف لـ sw.js currentCaches.
// بدون هذا، sw.js's activate يمسحه فور كل SW update (نفس نمط v24).
const CACHE_NAME = 'market-auto-read-ads';

export interface AutoReadMeta {
  id: string;
  title: string;
  savedAt: string;
  expiresAt: string;
  thumbnail: string | null;
}

function listRaw(): AutoReadMeta[] {
  return localGet<AutoReadMeta[]>(INDEX_KEY, []);
}

/**
 * FIX AUTO-READ-PRUNE-CACHE: قبل هذا، pruneExpired كان يحذف العنصر من
 * الفهرس فقط — استجابة API + الصورة تبقى في Cache Storage للأبد. الآن
 * نحذفها من الكاش أيضاً عند انتهاء الصلاحية.
 */
async function pruneExpiredAndCleanCache(list: AutoReadMeta[]): Promise<AutoReadMeta[]> {
  const now = Date.now();
  const kept: AutoReadMeta[] = [];
  const expired: AutoReadMeta[] = [];
  for (const e of list) {
    const exp = Date.parse(e.expiresAt);
    if (Number.isFinite(exp) && exp > now) kept.push(e);
    else expired.push(e);
  }

  if (expired.length > 0 && typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(CACHE_NAME);
      for (const e of expired) {
        await cache.delete(adDetailUrl(e.id));
        // حاول حذف الصورة بالحجمين (128 من الفهرس، 400 من نسخ قديمة)
        if (e.thumbnail) {
          try { await cache.delete(e.thumbnail); } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }
  return kept;
}

export function listAutoReadAds(): AutoReadMeta[] {
  // نسخة متزامنة (بلا cache cleanup) للاستخدام في UI — التنظيف الفعلي
  // يحدث عند autoSaveVisitedAd's pruneExpiredAndCleanCache.
  const now = Date.now();
  return listRaw().filter((e) => {
    const exp = Date.parse(e.expiresAt);
    return Number.isFinite(exp) && exp > now;
  });
}

// FIX AUTO-READ-URL: استخدام API_BASE_URL الموحّد (نفس offlineSavedAds).
// قبل: process.env.NEXT_PUBLIC_API_URL المباشر — إن اختلف عن origin الحالي
// → URLs مختلفة → cache miss عند القراءة أوفلاين.
function adDetailUrl(id: string): string {
  return `${API_BASE_URL}/ads/${id}`;
}

// FIX AUTO-READ-IMAGE-SIZE: حجم واحد موحّد (128×128) — نفس الحجم الذي
// يستخدمه الفهرس. قبل: 400×300 مخزَّن، لكن UI يطلب 128×128 → صورة مكسورة.
const THUMB_SIZE = 128;

/**
 * Best-effort: cache GET /ads/:id + first image for offline open later.
 * Never throws to the UI.
 */
export async function autoSaveVisitedAd(ad: Ad): Promise<void> {
  if (typeof window === 'undefined' || typeof caches === 'undefined') return;
  if (!ad?.id) return;

  try {
    const cache = await caches.open(CACHE_NAME);
    const apiUrl = adDetailUrl(ad.id);
    try {
      const res = await fetch(apiUrl);
      if (res.ok) await cache.put(apiUrl, res.clone());
    } catch {
      /* offline already — skip network put */
    }

    // FIX AUTO-READ-IMAGE-SIZE: صورة واحدة بالحجم الموحّد (128×128).
    const thumbUrl = ad.images?.[0]
      ? getThumbnailUrl(ad.images[0], THUMB_SIZE, THUMB_SIZE)
      : null;
    if (thumbUrl) {
      try {
        const imgRes = await fetch(thumbUrl);
        if (imgRes.ok) await cache.put(thumbUrl, imgRes.clone());
      } catch {
        /* ignore */
      }
    }

    const now = Date.now();
    const pruned = await pruneExpiredAndCleanCache(listRaw());
    let list = pruned.filter((e) => e.id !== ad.id);
    list.unshift({
      id: ad.id,
      title: ad.title,
      savedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + TTL_MS).toISOString(),
      thumbnail: thumbUrl,
    });
    const kept = list.slice(0, MAX_AUTO);
    const dropped = list.slice(MAX_AUTO);
    localSet(INDEX_KEY, kept);

    // FIX AUTO-READ-EVICT-CLEANUP: حذف API + الصورة معاً عند الإقصاء.
    // قبل: كان يحذف API فقط → تسريب صورة لكل إعلان مُقصى.
    await Promise.allSettled(
      dropped.map(async (e) => {
        try {
          await cache.delete(adDetailUrl(e.id));
          if (e.thumbnail) {
            try { await cache.delete(e.thumbnail); } catch { /* ignore */ }
          }
        } catch {
          /* ignore */
        }
      }),
    );
  } catch {
    /* ignore */
  }
}
