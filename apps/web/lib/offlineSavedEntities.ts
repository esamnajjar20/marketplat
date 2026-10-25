'use client';

/**
 * lib/offlineSavedEntities.ts
 *
 * SAVE-ENTITY-01: generalize the "save for offline" pattern that was
 * built for ads (lib/offlineSavedAds.ts) to cover products, stores,
 * and seller profiles too. A shopper may want to reference any of the
 * four entity types later without a connection.
 *
 * Storage design — intentionally reuses the existing keys:
 *   - One Cache Storage bucket: 'market-saved-ads' (; sw.js
 *     already excludes it from activate-time cleanup under this name).
 *   - One localStorage index: 'saved-ads-offline' (same ).
 *   - Every entry now carries a `type` field. Entries written before
 *     this file existed have no type → read as 'ad' automatically, so
 *     no migration is needed and previously-saved ads stay visible.
 *
 * The are kept because renaming 'market-saved-ads' would
 * require editing sw.js's currentCaches in lockstep — a change with
 * its own bug surface, for zero functional gain.
 */

import { API_BASE_URL } from '@/lib/constants';
import { localGet, localSet } from '@/lib/localStore';
import { fetchWithTimeout } from './fetchTimeout';

/** Kept identical to sw.js's literal. Do not rename without editing
 *  sw.js's currentCaches in the same commit. */
export const SAVED_ENTITIES_CACHE = 'market-saved-ads';

const SAVED_INDEX_KEY = 'saved-ads-offline';

/** Combined cap across all four types. Ads alone already cap at 30 via
 *  MAX_SAVED_ADS in the same order of magnitude keeps
 *  the Cache Storage bounded on low-end devices. */
const MAX_SAVED_ENTITIES = 60;

/** Serialize index read-modify-write cycles. Multiple saves can finish their
 * network work concurrently; without this lock, each could read the same old
 * index and the last localStorage write would silently drop the other entry. */
let savedIndexMutationTail: Promise<void> = Promise.resolve();
async function withSavedIndexMutation<T>(operation: () => Promise<T> | T): Promise<T> {
  const previous = savedIndexMutationTail;
  let release!: () => void;
  savedIndexMutationTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

// SAVE-ENTITY-SERVICE-01: 'service' added — service listings have
// the same shape of need as products (title + price + images) and
// share the same /services/[id] route pattern, so it drops straight
// into the same cache + index.
export type SavedEntityType = 'ad' | 'product' | 'store' | 'seller' | 'service';

export interface SavedEntityMeta {
  type: SavedEntityType;
  id: string;
  userId?: string | null;
  title: string;
  /** price string for ads/products, business type / category for stores
   *  and sellers. Free-form — UI decides what to render. */
  subtitle: string | null;
  city: string | null;
  thumbnail: string | null;
  savedAt: string;
  /** Every image URL that was cached for this entity — used by unsave
   *  and by the auto-eviction path to clean the Cache Storage exactly,
   *  not just the visible index. */
  imageUrls: string[];
}

export interface SaveEntityInput {
  id: string;
  title: string;
  subtitle?: string | null;
  city?: string | null;
  thumbnail?: string | null;
  imageUrls?: string[];
}

/** Entries written by the () have no `type`. */
function normalize(
  entry: SavedEntityMeta & { type?: SavedEntityType },
): SavedEntityMeta {
  return { ...entry, type: entry.type ?? 'ad' };
}

export function listSavedEntities(
  type?: SavedEntityType,
  userId?: string | null,
): SavedEntityMeta[] {
  const raw = localGet<Array<SavedEntityMeta & { type?: SavedEntityType }>>(
    SAVED_INDEX_KEY,
    [],
  );
  let all = raw.map(normalize);
  if (userId !== undefined) {
    all = all.filter((e) => (e.userId ?? null) === (userId ?? null));
  }
  if (type) all = all.filter((e) => e.type === type);
  return all;
}

export function isEntitySavedOffline(
  type: SavedEntityType,
  id: string,
  userId?: string | null,
): boolean {
  return listSavedEntities(type, userId).some((e) => e.id === id);
}

function entityUrl(type: SavedEntityType, id: string): string {
  switch (type) {
    case 'ad':      return `${API_BASE_URL}/ads/${id}`;
    case 'product': return `${API_BASE_URL}/products/${id}`;
    case 'store':   return `${API_BASE_URL}/stores/${id}`;
    case 'seller':  return `${API_BASE_URL}/sellers/${id}`;
    case 'service': return `${API_BASE_URL}/service-listings/${id}`;
  }
}

function sameEntity(a: SavedEntityMeta, b: Pick<SavedEntityMeta, 'type' | 'id' | 'userId'>): boolean {
  return a.type === b.type && a.id === b.id && (a.userId ?? null) === (b.userId ?? null);
}

/** Cache Storage keys must be absolute URLs. API_BASE_URL is deliberately
 * relative in the browser, and fetch accepts that while Cache.put/delete/match
 * must all resolve to the same canonical URL used by the service worker. */
function absoluteCacheUrl(url: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return new URL(url, window.location.href).href;
  } catch {
    return null;
  }
}

/**
 * Remove cache artifacts that are no longer referenced by the persisted index.
 * API URLs can be shared by the same public entity across users, and images can
 * be shared by several entities, so cleanup must compare against the retained
 * index before deleting anything.
 */
async function deleteUnreferencedArtifacts(
  cache: Cache,
  candidates: SavedEntityMeta[],
  retained: SavedEntityMeta[],
): Promise<void> {
  const retainedEntityKeys = new Set(retained.map((entry) => `${entry.type}\u0000${entry.id}`));
  const retainedImages = new Set(
    retained.flatMap((entry) => (entry.imageUrls ?? []).map(absoluteCacheUrl).filter((url): url is string => !!url)),
  );
  const deletions: Promise<unknown>[] = [];
  const safeDelete = (url: string) => {
    try { deletions.push(Promise.resolve(cache.delete(url)).catch(() => false)); }
    catch { /* cache cleanup is best-effort and must not undo a committed index */ }
  };

  for (const entry of candidates) {
    if (!retainedEntityKeys.has(`${entry.type}\u0000${entry.id}`)) {
      const apiUrl = absoluteCacheUrl(entityUrl(entry.type, entry.id));
      if (apiUrl) safeDelete(apiUrl);
    }
    for (const imageUrl of entry.imageUrls ?? []) {
      const absoluteImageUrl = imageUrl ? absoluteCacheUrl(imageUrl) : null;
      if (absoluteImageUrl && !retainedImages.has(absoluteImageUrl)) safeDelete(absoluteImageUrl);
    }
  }

  await Promise.allSettled(deletions);
}

async function fetchAndCache(
  url: string,
  cache: Cache,
  kind: 'api' | 'image' = 'api',
): Promise<boolean> {
  try {
    const cacheUrl = absoluteCacheUrl(url);
    if (!cacheUrl) return false;
    const res = await fetchWithTimeout(url);
    if (!res.ok || res.status === 206) return false;
    const contentType = ((res.headers.get('content-type') || '').split(';', 1)[0] ?? '').trim().toLowerCase();
    if (kind === 'api') {
      if (!contentType.includes('application/json')) return false;
      // Do not mistake a 200 HTML login/captive-portal page for an offline API snapshot.
      try { JSON.parse(await res.clone().text()); } catch { return false; }
    } else {
      // Saved-entity images bypass the Service Worker fetch handler, so apply
      // the same inspectable-response protections here as well.
      if (!contentType.startsWith('image/')) return false;
      const declaredLength = Number(res.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > 2.5 * 1024 * 1024) return false;
    }
    // Same X-SW-Cached-At convention the path uses, so
    // putTimestamped-compatible trims (if ever enabled here) work too.
    const headers = new Headers(res.headers);
    headers.set('X-SW-Cached-At', String(Date.now()));
    const body = await res.clone().blob();
    if (kind === 'image' && (body.size === 0 || body.size > 2.5 * 1024 * 1024)) return false;
    await cache.put(
      cacheUrl,
      new Response(body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Save the entity's API response and every image it references into
 * the dedicated cache, and add an entry to the shared index. Returns
 * false on any hard failure (offline at save time, cache unavailable)
 * so the caller can show the right toast.
 *
 * Best-effort image fetching: one dead image does not fail the whole
 * save — the API response is what makes the page work offline, images
 * are bonuses.
 */
export async function saveEntityOffline(
  type: SavedEntityType,
  input: SaveEntityInput,
  userId: string | null,
): Promise<boolean> {
  if (typeof window === 'undefined' || typeof caches === 'undefined') return false;

  try {
    const cache = await caches.open(SAVED_ENTITIES_CACHE);
    const apiUrl = entityUrl(type, input.id);
    const absoluteApiUrl = absoluteCacheUrl(apiUrl);
    if (!absoluteApiUrl) return false;

    const apiOk = await fetchAndCache(apiUrl, cache);
    if (!apiOk) return false;

    // De-dup image URLs (thumbnail often overlaps imageUrls[0]).
    const imagesToSave = new Set<string>();
    if (input.thumbnail) {
      const url = absoluteCacheUrl(input.thumbnail);
      if (url) imagesToSave.add(url);
    }
    for (const imageUrl of input.imageUrls ?? []) {
      if (!imageUrl) continue;
      const url = absoluteCacheUrl(imageUrl);
      if (url) imagesToSave.add(url);
    }

    await Promise.allSettled(
      Array.from(imagesToSave).map((u) => fetchAndCache(u, cache, 'image')),
    );

    return await withSavedIndexMutation(async () => {
      // Read only after acquiring the lock so a concurrent save cannot base
      // its write on a stale snapshot and overwrite another entity's entry.
      const all = listSavedEntities(undefined, undefined);
      const filtered = all.filter((entry) => !sameEntity(entry, { type, id: input.id, userId }));
      const savedEntry: SavedEntityMeta = {
        type,
        id: input.id,
        userId,
        title: input.title,
        subtitle: input.subtitle ?? null,
        city: input.city ?? null,
        thumbnail: input.thumbnail ?? null,
        savedAt: new Date().toISOString(),
        imageUrls: Array.from(imagesToSave),
      };
      const next = [savedEntry, ...filtered].slice(0, MAX_SAVED_ENTITIES);

      // Never report success unless the index itself was committed. If storage
      // is full/unavailable, remove only newly orphaned artifacts; preserve any
      // URL that an older saved entry still references.
      if (!localSet(SAVED_INDEX_KEY, next)) {
        await deleteUnreferencedArtifacts(cache, [savedEntry], all);
        return false;
      }

      // The cap evicts old entries from the index. Remove their API snapshots
      // and images only when no retained entry still references those resources.
      await deleteUnreferencedArtifacts(cache, all, next);
      return true;
    });
  } catch {
    return false;
  }
}

export type SavedEntityCacheStatus = 'available' | 'missing' | 'unknown';

/** Check the actual cached API snapshot without mutating the index. A missing
 * response is reported, never auto-pruned: Cache Storage can be temporarily
 * unavailable and the user may still want the saved metadata for recovery. */
export async function checkSavedEntityCacheStatus(
  entry: Pick<SavedEntityMeta, 'type' | 'id'>,
): Promise<SavedEntityCacheStatus> {
  if (typeof window === 'undefined' || typeof caches === 'undefined') return 'unknown';
  try {
    const url = absoluteCacheUrl(entityUrl(entry.type, entry.id));
    if (!url) return 'unknown';
    const cache = await caches.open(SAVED_ENTITIES_CACHE);
    const response = await cache.match(url);
    if (!response || !response.ok) return 'missing';
    if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) return 'missing';
    try { JSON.parse(await response.clone().text()); } catch { return 'missing'; }
    return 'available';
  } catch {
    return 'unknown';
  }
}

/**
 * Delete the API response and every cached image for this entity, and
 * remove its index entry. Safe to call when the entity was not saved —
 * it just no-ops.
 */
export async function unsaveEntityOffline(
  type: SavedEntityType,
  id: string,
  userId: string | null,
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    return await withSavedIndexMutation(async () => {
      const all = listSavedEntities(undefined, undefined);
      const entry = all.find(
        (e) =>
          e.type === type &&
          e.id === id &&
          (e.userId ?? null) === (userId ?? null),
      );

      // Removing an entry that is already absent is an idempotent success.
      if (!entry) return true;

      const filtered = all.filter((candidate) => !sameEntity(candidate, { type, id, userId }));
      // Commit the index before deleting artifacts. The caller must know if the
      // commit failed so it never announces success while the entry remains saved.
      if (!localSet(SAVED_INDEX_KEY, filtered)) return false;

      // Cache Storage cleanup is best-effort after the index commit. The entry is
      // no longer visible as saved even if the browser does not expose Cache API.
      if (typeof caches !== 'undefined') {
        try {
          const cache = await caches.open(SAVED_ENTITIES_CACHE);
          await deleteUnreferencedArtifacts(cache, [entry], filtered);
        } catch {
          // Cache cleanup is best-effort after the index has committed.
        }
      }
      return true;
    });
  } catch {
    // Exceptions before the index commit are failures.
    return false;
  }
}
