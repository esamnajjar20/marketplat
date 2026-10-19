/** Bounded, public product-detail snapshots for reliable offline revisits. */
import type { ProductWithFullStore } from '@/types/product.types';
import { getOfflineJson, saveOfflineJson, clearOfflineJson } from '@/lib/offlineJsonCache';
import { localGet, localSet } from '@/lib/localStore';

const INDEX_KEY = 'offline-visited-products:index';
const CACHE_PREFIX = 'visited-product:';
const MAX_PRODUCTS = 15;
const TTL_MS = 24 * 60 * 60 * 1000;

type Snapshot = { id: string; cachedAt: number; product: ProductWithFullStore };

function readIndex(): string[] {
  const raw = localGet<unknown>(INDEX_KEY, []);
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
}

function key(id: string): string {
  return `${CACHE_PREFIX}${id}`;
}

function removeFromIndex(id: string): void {
  const next = readIndex().filter((entry) => entry !== id);
  localSet(INDEX_KEY, next);
}

function isValidSnapshot(snapshot: Snapshot | null | undefined, id: string): snapshot is Snapshot {
  if (!snapshot || snapshot.id !== id || !snapshot.product || snapshot.product.id !== id) return false;
  const now = Date.now();
  return Number.isFinite(snapshot.cachedAt) && snapshot.cachedAt <= now + 60_000 && now - snapshot.cachedAt <= TTL_MS;
}

/** Save only public-facing detail data; never persist costPrice from an API response. */
export function saveVisitedProduct(product: ProductWithFullStore): void {
  if (typeof window === 'undefined' || !product?.id) return;
  const safeProduct = { ...product, costPrice: null } as ProductWithFullStore;
  const snapshot: Snapshot = { id: product.id, cachedAt: Date.now(), product: safeProduct };
  const persisted = saveOfflineJson(key(product.id), snapshot, null);
  // Never advertise a snapshot in the index unless its write succeeded or a
  // previously persisted, still-valid copy is available after a quota error.
  const existing = getOfflineJson<Snapshot>(key(product.id), null)?.data;
  if (!persisted && !isValidSnapshot(existing, product.id)) {
    removeFromIndex(product.id);
    return;
  }

  const previousIndex = readIndex();
  const current = [product.id, ...previousIndex.filter((id) => id !== product.id)];
  const kept = current.slice(0, MAX_PRODUCTS);
  if (!localSet(INDEX_KEY, kept)) {
    // If this is a new unindexed entry, discard it rather than leave an
    // orphan snapshot that mutation cleanup cannot reliably discover.
    if (!previousIndex.includes(product.id)) clearOfflineJson(key(product.id));
    return;
  }
  for (const evictedId of current.slice(MAX_PRODUCTS)) clearOfflineJson(key(evictedId));
}

export function getVisitedProduct(id: string): ProductWithFullStore | null {
  if (!id || typeof window === 'undefined') return null;
  const entry = getOfflineJson<Snapshot>(key(id), null);
  const snapshot = entry?.data;
  if (!isValidSnapshot(snapshot, id)) {
    if (snapshot) clearOfflineJson(key(id));
    removeFromIndex(id);
    return null;
  }
  return { ...snapshot.product, costPrice: null };
}

/** Clear public detail snapshots after any product mutation. */
export function clearVisitedProducts(): void {
  for (const id of readIndex()) clearOfflineJson(key(id));
  localSet(INDEX_KEY, []);
}
