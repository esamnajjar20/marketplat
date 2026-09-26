/**
 * lib/offlineSavedEntities.ts
 *
 * SAVE-ENTITY-01: generalize the "save for offline" pattern that was
 * built for ads (lib/offlineSavedAds.ts) to cover products, stores,
 * and seller profiles too. A shopper may want to reference any of the
 * four entity types later without a connection.
 *
 * Storage design — intentionally reuses the existing keys:
 *   - One Cache Storage bucket: 'market-saved-ads' (legacy name; sw.js
 *     already excludes it from activate-time cleanup under this name).
 *   - One localStorage index: 'saved-ads-offline' (same legacy name).
 *   - Every entry now carries a `type` field. Entries written before
 *     this file existed have no type → read as 'ad' automatically, so
 *     no migration is needed and previously-saved ads stay visible.
 *
 * The legacy names are kept because renaming 'market-saved-ads' would
 * require editing sw.js's currentCaches in lockstep — a change with
 * its own bug surface, for zero functional gain.
 */
'use client';

import { API_BASE_URL } from '@/lib/constants';
import { localGet, localSet } from '@/lib/localStore';
import { fetchWithTimeout } from './fetchTimeout';

/** Kept identical to sw.js's literal. Do not rename without editing
 *  sw.js's currentCaches in the same commit. */
export const SAVED_ENTITIES_CACHE = 'market-saved-ads';

const SAVED_INDEX_KEY = 'saved-ads-offline';

/** Combined cap across all four types. Ads alone already cap at 30 via
 *  MAX_SAVED_ADS in the legacy module — same order of magnitude keeps
 *  the Cache Storage bounded on low-end devices. */
const MAX_SAVED_ENTITIES = 60;

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

/** Entries written by the legacy saveAdOffline() have no `type`. */
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

async function fetchAndCache(
  url: string,
  cache: Cache,
): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return false;
    // Same X-SW-Cached-At convention the legacy ads path uses, so
    // putTimestamped-compatible trims (if ever enabled here) work too.
    const headers = new Headers(res.headers);
    headers.set('X-SW-Cached-At', String(Date.now()));
    const body = await res.clone().blob();
    await cache.put(
      url,
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

    const apiOk = await fetchAndCache(apiUrl, cache);
    if (!apiOk) return false;

    // De-dup image URLs (thumbnail often overlaps imageUrls[0]).
    const imagesToSave = new Set<string>();
    if (input.thumbnail) imagesToSave.add(input.thumbnail);
    for (const u of input.imageUrls ?? []) if (u) imagesToSave.add(u);

    await Promise.allSettled(
      Array.from(imagesToSave).map((u) => fetchAndCache(u, cache)),
    );

    const all = listSavedEntities(undefined, undefined);
    const filtered = all.filter(
      (e) =>
        !(
          e.type === type &&
          e.id === input.id &&
          (e.userId ?? null) === (userId ?? null)
        ),
    );
    filtered.unshift({
      type,
      id: input.id,
      userId,
      title: input.title,
      subtitle: input.subtitle ?? null,
      city: input.city ?? null,
      thumbnail: input.thumbnail ?? null,
      savedAt: new Date().toISOString(),
      imageUrls: Array.from(imagesToSave),
    });
    localSet(SAVED_INDEX_KEY, filtered.slice(0, MAX_SAVED_ENTITIES));
    return true;
  } catch {
    return false;
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
): Promise<void> {
  if (typeof window === 'undefined' || typeof caches === 'undefined') return;

  try {
    const all = listSavedEntities(undefined, undefined);
    const entry = all.find(
      (e) =>
        e.type === type &&
        e.id === id &&
        (e.userId ?? null) === (userId ?? null),
    );

    if (entry) {
      const cache = await caches.open(SAVED_ENTITIES_CACHE);
      await cache.delete(entityUrl(type, id)).catch(() => false);
      await Promise.allSettled(
        entry.imageUrls.map((u) => cache.delete(u).catch(() => false)),
      );
    }

    const filtered = all.filter(
      (e) =>
        !(
          e.type === type &&
          e.id === id &&
          (e.userId ?? null) === (userId ?? null)
        ),
    );
    localSet(SAVED_INDEX_KEY, filtered);
  } catch {
    /* ignore — index cleanup is best-effort */
  }
}
