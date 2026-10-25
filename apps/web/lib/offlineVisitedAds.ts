/** Bounded public ad-detail snapshots for reliable offline revisits. */
import type { Ad } from '@/types/ad.types';
import { getOfflineJson, saveOfflineJson, clearOfflineJson } from '@/lib/offlineJsonCache';
import { localGet, localSet } from '@/lib/localStore';

const INDEX_KEY = 'offline-visited-ads:index';
const CACHE_PREFIX = 'visited-ad:';
const MAX_ADS = 15;
const TTL_MS = 24 * 60 * 60 * 1000;

type Snapshot = { id: string; cachedAt: number; ad: Ad };

function readIndex(): string[] {
  const raw = localGet<unknown>(INDEX_KEY, []);
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
}
function key(id: string): string { return `${CACHE_PREFIX}${id}`; }
function removeFromIndex(id: string): void {
  localSet(INDEX_KEY, readIndex().filter((entry) => entry !== id));
}
function isValidSnapshot(snapshot: Snapshot | null | undefined, id: string): snapshot is Snapshot {
  if (!snapshot || snapshot.id !== id || !snapshot.ad || snapshot.ad.id !== id) return false;
  const now = Date.now();
  return Number.isFinite(snapshot.cachedAt) && snapshot.cachedAt <= now + 60_000 && now - snapshot.cachedAt <= TTL_MS;
}

/** Save public-facing ad detail only; the API detail shape has no private contact fields. */
export function saveVisitedAd(ad: Ad): void {
  if (typeof window === 'undefined' || !ad?.id || ad.status === 'DELETED') return;
  const snapshot: Snapshot = { id: ad.id, cachedAt: Date.now(), ad };
  const persisted = saveOfflineJson(key(ad.id), snapshot, null);
  const existing = getOfflineJson<Snapshot>(key(ad.id), null)?.data;
  if (!persisted && !isValidSnapshot(existing, ad.id)) {
    removeFromIndex(ad.id);
    return;
  }
  const previousIndex = readIndex();
  const current = [ad.id, ...previousIndex.filter((id) => id !== ad.id)];
  if (!localSet(INDEX_KEY, current.slice(0, MAX_ADS))) {
    if (!previousIndex.includes(ad.id)) clearOfflineJson(key(ad.id));
    return;
  }
  for (const evictedId of current.slice(MAX_ADS)) clearOfflineJson(key(evictedId));
}

export function getVisitedAd(id: string): Ad | null {
  if (!id || typeof window === 'undefined') return null;
  const snapshot = getOfflineJson<Snapshot>(key(id), null)?.data;
  if (!isValidSnapshot(snapshot, id)) {
    if (snapshot) clearOfflineJson(key(id));
    removeFromIndex(id);
    return null;
  }
  if (snapshot.ad.status === 'DELETED') return null;
  return snapshot.ad;
}

/** Clear public ad detail snapshots after ad mutations. */
export function clearVisitedAds(): void {
  for (const id of readIndex()) clearOfflineJson(key(id));
  localSet(INDEX_KEY, []);
}
