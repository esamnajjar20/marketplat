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
  // T725 — owner of this auto-read entry. Without it every viewer's
  // visited ads (guests included) shared one un-scoped list, and
  // EmptySearchSuggestions rendered the previous user's browsing
  // history under "شوهد مؤخرًا" on a shared device. Undefined on
  // entries written before this field existed — see listAutoReadAds.
  userId?: string | null;
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

/**
 * T726 — takes an optional userId. With it, only that user's entries
 * are returned (and legacy userId-less entries read as guests/null —
 * matches a null userId, hidden from a signed-in user). Without it
 * (undefined), all entries are returned — used by authCleanup's
 * unconditional clearAutoReadCache(). */
export function listAutoReadAds(userId?: string | null): AutoReadMeta[] {
  // نسخة متزامنة (بلا cache cleanup) للاستخدام في UI — التنظيف الفعلي
  // يحدث عند autoSaveVisitedAd's pruneExpiredAndCleanCache.
  const now = Date.now();
  return listRaw().filter((e) => {
    const exp = Date.parse(e.expiresAt);
    if (!Number.isFinite(exp) || exp <= now) return false;
    if (userId === undefined) return true;
    return (e.userId ?? null) === (userId ?? null);
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
export async function autoSaveVisitedAd(ad: Ad, userId?: string | null): Promise<void> {
  if (typeof window === 'undefined' || typeof caches === 'undefined') return;
  if (!ad?.id) return;

  try {
    const cache = await caches.open(CACHE_NAME);
    const apiUrl = adDetailUrl(ad.id);
    try {
      const res = await fetch(apiUrl);
      if (res.ok) {
        // FIX AUTOREAD-TIMESTAMP: X-SW-Cached-At على المدخلات — يحمي
        // من الحذف العشوائي لو أُضيف trimCache مستقبلاً.
        const headers = new Headers(res.headers);
        headers.set('X-SW-Cached-At', String(Date.now()));
        const body = await res.clone().blob();
        await cache.put(apiUrl, new Response(body, {
          status: res.status,
          statusText: res.statusText,
          headers,
        }));
      }
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
        if (imgRes.ok) {
          // FIX AUTOREAD-TIMESTAMP: X-SW-Cached-At على الصورة أيضاً —
          // يحمي من الحذف العشوائي لو أُضيف trimCache مستقبلاً.
          const headers = new Headers(imgRes.headers);
          headers.set('X-SW-Cached-At', String(Date.now()));
          const body = await imgRes.clone().blob();
          await cache.put(thumbUrl, new Response(body, {
            status: imgRes.status,
            statusText: imgRes.statusText,
            headers,
          }));
        }
      } catch {
        /* ignore */
      }
    }

    const now = Date.now();
    const pruned = await pruneExpiredAndCleanCache(listRaw());
    // T725 — replace only THIS user's previous entry for the same ad
    // (was `e.id !== ad.id` which removed every user's).
    const list = pruned.filter(
      (e) => !(e.id === ad.id && (e.userId ?? null) === (userId ?? null)),
    );
    list.unshift({
      id: ad.id,
      userId: userId ?? null,
      title: ad.title,
      savedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + TTL_MS).toISOString(),
      thumbnail: thumbUrl,
    });

    // T721 — cap per-user, not globally. The previous `list.slice(0,
    // MAX_AUTO)` evicted the oldest entries across the WHOLE list — on
    // a shared device, User B opening one ad evicted User A's oldest
    // auto-read entries (their cache included). Each user now gets
    // their own MAX_AUTO window; other users' rows are preserved in
    // the written index.
    const isMine = (e: AutoReadMeta) => (e.userId ?? null) === (userId ?? null);
    const myEntries = list.filter(isMine);
    const myKept = myEntries.slice(0, MAX_AUTO);
    const myEvicted = myEntries.slice(MAX_AUTO);
    const kept = [...myKept, ...list.filter((e) => !isMine(e))];

    // Persist first so the visible index and the Cache Storage eviction
    // stay in sync even if the cache.delete calls below fail — evicted
    // entries are already gone from the visible list.
    localSet(INDEX_KEY, kept);

    // FIX AUTO-READ-EVICT-CLEANUP: delete both API + thumbnail for every
    // evicted entry (was: only entries beyond the global cap).
    await Promise.allSettled(
      myEvicted.map(async (e) => {
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

/**
 * FIX AUTOREAD-CLEAR-ON-LOGOUT-01: the auto-read index keyed visited ad
 * ids and titles into localStorage, and the corresponding API responses
 * + thumbnails into a Cache Storage bucket -- both WITHOUT any user
 * scoping. AdDetail.tsx calls autoSaveVisitedAd for every viewer
 * (guests included), and EmptySearchSuggestions renders
 * listAutoReadAds() under "شوهد مؤخرًا". On a shared device, User B
 * logging in after User A would open a zero-result search and see A's
 * browsing history. This is a privacy leak, not just a cache hygiene
 * issue, so the fix is to wipe both on any identity change, matching
 * clearSavedPaymentMethods' pattern rather than trying to per-user
 * scope a cache whose URL keys can't express identity.
 *
 * Fire-and-forget (the Cache Storage half is async); authCleanup calls
 * it without awaiting, so logout UX stays synchronous.
 */
export async function clearAutoReadCache(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(INDEX_KEY);
  } catch {
    /* ignore */
  }
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    /* ignore */
  }
}
