/**
 * PHASE-2: auto-cache visited ad details for offline reading (24h TTL).
 * Distinct from manual "حفظ دون اتصال" — uses a separate index key so
 * manual saves are never auto-evicted by browsing.
 */
import type { Ad } from '@/types/ad.types';
import { localGet, localSet } from '@/lib/localStore';
import { getThumbnailUrl } from '@/lib/cloudinary';

const INDEX_KEY = 'marketplat:auto-read-ads';
const MAX_AUTO = 15;
const TTL_MS = 24 * 60 * 60 * 1000;
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

function pruneExpired(list: AutoReadMeta[]): AutoReadMeta[] {
  const now = Date.now();
  return list.filter((e) => {
    const exp = Date.parse(e.expiresAt);
    return Number.isFinite(exp) && exp > now;
  });
}

export function listAutoReadAds(): AutoReadMeta[] {
  return pruneExpired(listRaw());
}

function adDetailUrl(id: string): string {
  const base =
    typeof window !== 'undefined'
      ? (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '')
      : '';
  return `${base}/api/v1/ads/${id}`;
}

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

    if (ad.images?.[0]) {
      try {
        const thumb = getThumbnailUrl(ad.images[0], 400, 300);
        const imgRes = await fetch(thumb);
        if (imgRes.ok) await cache.put(thumb, imgRes.clone());
      } catch {
        /* ignore */
      }
    }

    const now = Date.now();
    let list = pruneExpired(listRaw()).filter((e) => e.id !== ad.id);
    list.unshift({
      id: ad.id,
      title: ad.title,
      savedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + TTL_MS).toISOString(),
      thumbnail: ad.images?.[0] ? getThumbnailUrl(ad.images[0], 128, 128) : null,
    });
    const kept = list.slice(0, MAX_AUTO);
    const dropped = list.slice(MAX_AUTO);
    localSet(INDEX_KEY, kept);

    await Promise.allSettled(
      dropped.map(async (e) => {
        try {
          await cache.delete(adDetailUrl(e.id));
        } catch {
          /* ignore */
        }
      }),
    );
  } catch {
    /* ignore */
  }
}
