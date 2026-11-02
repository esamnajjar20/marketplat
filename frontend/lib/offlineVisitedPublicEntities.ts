/** Bounded offline snapshots for public store and service-listing details. */
import type { StoreWithSellerAndCounts } from '@/types/store.types';
import type { ServiceListingWithProvider } from '@/types/service.types';
import { clearOfflineJson, getOfflineJson, saveOfflineJson } from '@/lib/offlineJsonCache';
import { localGet, localSet } from '@/lib/localStore';

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_STORES = 20;
const MAX_SERVICE_LISTINGS = 20;
const STORE_INDEX_KEY = 'offline-visited-public-stores:index';
const SERVICE_INDEX_KEY = 'offline-visited-public-service-listings:index';
const STORE_PREFIX = 'visited-public-store:';
const SERVICE_PREFIX = 'visited-public-service-listing:';

type Snapshot<T> = { lookupKey: string; cachedAt: number; value: T };

function readIndex(key: string): string[] {
  const raw = localGet<unknown>(key, []);
  return Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function makeKey(prefix: string, lookupKey: string): string {
  return `${prefix}${encodeURIComponent(lookupKey)}`;
}

function isFreshSnapshot<T>(snapshot: Snapshot<T> | null | undefined, lookupKey: string): snapshot is Snapshot<T> {
  if (!snapshot || snapshot.lookupKey !== lookupKey || !snapshot.value) return false;
  const age = Date.now() - snapshot.cachedAt;
  return Number.isFinite(snapshot.cachedAt) && snapshot.cachedAt <= Date.now() + 60_000 && age >= 0 && age <= TTL_MS;
}

function saveSnapshot<T>(options: {
  lookupKey: string;
  value: T;
  prefix: string;
  indexKey: string;
  maxEntries: number;
  isPublic: (value: T, lookupKey: string) => boolean;
}): void {
  if (typeof window === 'undefined' || !options.lookupKey || !options.isPublic(options.value, options.lookupKey)) return;
  const key = makeKey(options.prefix, options.lookupKey);
  const snapshot: Snapshot<T> = { lookupKey: options.lookupKey, cachedAt: Date.now(), value: options.value };
  const written = saveOfflineJson(key, snapshot, null);
  const existing = getOfflineJson<Snapshot<T>>(key, null)?.data;
  if (!written && !isFreshSnapshot(existing, options.lookupKey)) return;

  const previous = readIndex(options.indexKey);
  const next = [options.lookupKey, ...previous.filter((item) => item !== options.lookupKey)];
  if (!localSet(options.indexKey, next.slice(0, options.maxEntries))) {
    if (!previous.includes(options.lookupKey)) clearOfflineJson(key);
    return;
  }
  for (const evicted of next.slice(options.maxEntries)) {
    clearOfflineJson(makeKey(options.prefix, evicted));
  }
}

function getSnapshot<T>(lookupKey: string, prefix: string, indexKey: string): T | null {
  if (typeof window === 'undefined' || !lookupKey) return null;
  const key = makeKey(prefix, lookupKey);
  const snapshot = getOfflineJson<Snapshot<T>>(key, null)?.data;
  if (!isFreshSnapshot(snapshot, lookupKey)) {
    if (snapshot) clearOfflineJson(key);
    localSet(indexKey, readIndex(indexKey).filter((item) => item !== lookupKey));
    return null;
  }
  return snapshot.value;
}

function clearSnapshot(lookupKey: string, prefix: string, indexKey: string): void {
  if (!lookupKey) return;
  clearOfflineJson(makeKey(prefix, lookupKey));
  localSet(indexKey, readIndex(indexKey).filter((item) => item !== lookupKey));
}

function clearSnapshots(prefix: string, indexKey: string): void {
  for (const lookupKey of readIndex(indexKey)) clearOfflineJson(makeKey(prefix, lookupKey));
  localSet(indexKey, []);
}

export function saveVisitedPublicStore(lookupKey: string, store: StoreWithSellerAndCounts): void {
  saveSnapshot({
    lookupKey,
    value: store,
    prefix: STORE_PREFIX,
    indexKey: STORE_INDEX_KEY,
    maxEntries: MAX_STORES,
    isPublic: (value, key) => value.status === 'ACTIVE' && (value.id === key || value.slug === key),
  });
}

export function getVisitedPublicStore(lookupKey: string): StoreWithSellerAndCounts | null {
  return getSnapshot<StoreWithSellerAndCounts>(lookupKey, STORE_PREFIX, STORE_INDEX_KEY);
}

export function clearVisitedPublicStore(lookupKey: string): void {
  clearSnapshot(lookupKey, STORE_PREFIX, STORE_INDEX_KEY);
}

export function clearVisitedPublicStores(): void {
  clearSnapshots(STORE_PREFIX, STORE_INDEX_KEY);
}

export function saveVisitedPublicServiceListing(lookupKey: string, listing: ServiceListingWithProvider): void {
  saveSnapshot({
    lookupKey,
    value: listing,
    prefix: SERVICE_PREFIX,
    indexKey: SERVICE_INDEX_KEY,
    maxEntries: MAX_SERVICE_LISTINGS,
    isPublic: (value, key) => value.status === 'ACTIVE' && value.id === key,
  });
}

export function getVisitedPublicServiceListing(lookupKey: string): ServiceListingWithProvider | null {
  return getSnapshot<ServiceListingWithProvider>(lookupKey, SERVICE_PREFIX, SERVICE_INDEX_KEY);
}

export function clearVisitedPublicServiceListing(lookupKey: string): void {
  clearSnapshot(lookupKey, SERVICE_PREFIX, SERVICE_INDEX_KEY);
}

export function clearVisitedPublicServiceListings(): void {
  clearSnapshots(SERVICE_PREFIX, SERVICE_INDEX_KEY);
}
