/** Safe public-query persistence for offline-first UI. Mutations and private/session data are never persisted. */
import type { QueryClient, QueryKey } from '@tanstack/react-query';

export const OFFLINE_QUERY_CACHE_DB = 'marketplat-offline-query-cache-v1';
export const OFFLINE_QUERY_CACHE_STORE = 'queries';
// CACHE-SIZE-01: keep ordinary query snapshots bounded, but give the unified
// homepage feed its own larger cap. It serializes several rails plus category
// metadata and may exceed 512 KiB; rejecting it drops every homepage section.
// The global store budget still limits aggregate IndexedDB usage.
export const OFFLINE_QUERY_MAX_ENTRY_BYTES = 768 * 1024;
export const OFFLINE_HOME_FEED_MAX_ENTRY_BYTES = 3 * 1024 * 1024;
export const OFFLINE_QUERY_MAX_ENTRIES = 800;
export const OFFLINE_QUERY_MAX_TOTAL_BYTES = 40 * 1024 * 1024;
export const OFFLINE_QUERY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const LAST_CACHE_AT_KEY = 'marketplat:offline-query-cache:last-saved-at';
const SAVE_DEBOUNCE_MS = 250;

interface PersistedQuery { id: string; queryKey: QueryKey; data: unknown; dataUpdatedAt: number; savedAt: number; bytes: number }
interface PersistedMeta { id: '__meta__'; savedAt: number; bytes: number }
type PersistedRecord = PersistedQuery | PersistedMeta;
const isPersistedQuery = (record: PersistedRecord): record is PersistedQuery => {
  if (!record || typeof record !== 'object' || record.id === '__meta__' || !('queryKey' in record)) return false;
  const candidate = record as Partial<PersistedQuery>;
  return typeof candidate.id === 'string'
    && Array.isArray(candidate.queryKey)
    && typeof candidate.dataUpdatedAt === 'number'
    && Number.isFinite(candidate.dataUpdatedAt)
    && candidate.dataUpdatedAt > 0
    && typeof candidate.savedAt === 'number'
    && Number.isFinite(candidate.savedAt)
    && typeof candidate.bytes === 'number'
    && Number.isFinite(candidate.bytes)
    && candidate.bytes >= 0
    && 'data' in candidate;
};


export function isValidOfflineQueryCacheEntry(record: unknown, now = Date.now()): boolean {
  try {
    if (!isPersistedQuery(record as PersistedRecord)) return false;
    const entry = record as PersistedQuery;
    if (!isOfflinePersistableQueryKey(entry.queryKey) || entry.id !== keyIdentity(entry.queryKey)) return false;
    if (entry.dataUpdatedAt > now + 60_000 || now - entry.dataUpdatedAt > OFFLINE_QUERY_MAX_AGE_MS) return false;
    if (entry.savedAt > now + 60_000 || now - entry.savedAt > OFFLINE_QUERY_MAX_AGE_MS) return false;
    const actualBytes = getOfflineQueryDataBytes(entry.data);
    return actualBytes !== null && actualBytes === entry.bytes && actualBytes <= maxEntryBytesForQueryKey(entry.queryKey);
  } catch {
    // One corrupt IndexedDB record must not prevent restoring other valid entries.
    return false;
  }
}

/**
 * localStorage can throw on access (SecurityError in privacy-restricted
 * contexts, QuotaExceededError on write). The marker is advisory only, so a
 * failure here must never turn a successful IndexedDB restore/persist into a
 * reported failure (or skip the cleanup that follows it).
 */
function writeLastCacheMarker(value: number | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value !== null && value > 0) localStorage.setItem(LAST_CACHE_AT_KEY, String(value));
    else localStorage.removeItem(LAST_CACHE_AT_KEY);
  } catch { /* best-effort */ }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const request = indexedDB.open(OFFLINE_QUERY_CACHE_DB, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(OFFLINE_QUERY_CACHE_STORE)) request.result.createObjectStore(OFFLINE_QUERY_CACHE_STORE, { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked'));
  });
}
function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed')); });
}
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}
const keyIdentity = (key: QueryKey) => stableJson(key);

function maxEntryBytesForQueryKey(queryKey: QueryKey): number {
  return queryKey[0] === 'home' && queryKey[1] === 'feed'
    ? OFFLINE_HOME_FEED_MAX_ENTRY_BYTES
    : OFFLINE_QUERY_MAX_ENTRY_BYTES;
}
// Cache-contract prefixes are intentionally NOT sufficient here: keys such as
// ['products', 'me', ...] share a broad prefix with public catalogue queries.
// Persist only the exact public shapes this app actually uses.
const PUBLIC_CHILD_KEYS = new Map<string, ReadonlySet<string>>([
  ['ads', new Set(['list', 'detail', 'related', 'infinite'])],
  ['products', new Set(['list', 'detail', 'infinite', 'promoted'])],
  ['stores', new Set(['list', 'detail', 'infinite'])],
  ['service-listings', new Set(['list', 'detail', 'infinite'])],
  ['service-providers', new Set(['list'])],
  ['categories', new Set(['slug'])],
  ['product-categories', new Set(['slug'])],
  ['service-categories', new Set(['slug'])],
]);
const EXACT_PUBLIC_ROOTS = new Set(['categories', 'product-categories', 'service-categories', 'service-types']);
const PRIVATE_OR_CONTEXTUAL_PARAM = /^(?:q|query|search|term|lat|lng|latitude|longitude|location|coordinates|providerId|userId|ownerId|sellerId|storeOwnerId)$/i;

function hasUnsafeQueryParams(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).some(([key, param]) => {
    if (!PRIVATE_OR_CONTEXTUAL_PARAM.test(key)) return false;
    return param !== undefined && param !== null && param !== '';
  });
}

export function isOfflinePersistableQueryKey(queryKey: QueryKey): boolean {
  if (!Array.isArray(queryKey) || queryKey.length === 0 || typeof queryKey[0] !== 'string') return false;
  const root = queryKey[0];
  if (typeof root !== 'string') return false;
  const child = queryKey[1];
  const third = queryKey[2];
  const fourth = queryKey[3];
  // Public seller profile pages use ['sellers', sellerId], while the
  // account's own profile uses ['sellers', 'me']. Persist only the former.
  // IDs are opaque strings; reserved branches are explicitly excluded so a
  // future private sibling cannot become persistable by sharing this prefix.
  if (root === 'sellers') {
    if (queryKey.length === 2 && typeof child === 'string'
      && child.length > 0 && !new Set(['me', 'admin', 'ranking', 'attention']).has(child)) return true;
    // The ranking page is public and already has a separate bounded offline
    // list cache. This exact key is safe for React Query persistence too.
    if (queryKey.length === 3 && child === 'ranking' && typeof third === 'number'
      && Number.isInteger(third) && third > 0 && third <= 100) return true;
    // Public seller ratings use ['sellers', sellerId, 'ratings', {page, limit}].
    // Keep this narrowly allowlisted: only pagination is accepted, never
    // account/admin branches or arbitrary contextual parameters.
    if (queryKey.length === 4 && typeof child === 'string' && child.length > 0
      && !new Set(['me', 'admin', 'ranking', 'attention']).has(child)
      && third === 'ratings' && !!fourth && typeof fourth === 'object'
      && !Array.isArray(fourth)
      && Object.entries(fourth as Record<string, unknown>).every(([key, value]) =>
        (key === 'page' || key === 'limit')
        && typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 1000)) return true;
    return false;
  }
  // Public user profile endpoints explicitly return a PII-safe projection.
  // Keep the public detail and that user's public ads only; never persist
  // account/session branches or keys that contain search/location context.
  if (root === 'users') {
    if (queryKey.length === 2 && typeof child === 'string'
      && child.length > 0 && !new Set(['me', 'admin', 'presence']).has(child)) return true;
    return queryKey.length === 4 && typeof child === 'string'
      && !new Set(['me', 'admin', 'presence']).has(child)
      && third === 'ads' && !!fourth && typeof fourth === 'object'
      && !Array.isArray(fourth) && !hasUnsafeQueryParams(fourth);
  }
  // Deterministic public alternatives for a public service listing. The backend
  // route is unauthenticated and computes matches only from public listing,
  // category, city and provider-trust fields; it does not vary by viewer.
  // The component always requests the fixed default limit (8), so listing ID
  // fully identifies the response. Keep this exact shape only.
  if (root === 'service-listing-matches') {
    return queryKey.length === 2 && typeof child === 'string' && child.length > 0
      && !new Set(['me', 'admin', 'nearby']).has(child);
  }
  // Public review lists are viewer-independent and contain published reviews only.
  // Keep pagination keys exact; never persist mutation, moderation, or owner-only branches.
  if (root === 'store-reviews') {
    return queryKey.length === 3 && typeof child === 'string' && child.length > 0
      && !!third && typeof third === 'object' && !Array.isArray(third)
      && Object.entries(third as Record<string, unknown>).every(([key, value]) =>
        (key === 'page' || key === 'limit')
        && typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 1000);
  }
  if (root === 'service-reviews') {
    return queryKey.length === 4 && child === 'seller'
      && typeof third === 'string' && third.length > 0
      && !!fourth && typeof fourth === 'object' && !Array.isArray(fourth)
      && Object.entries(fourth as Record<string, unknown>).every(([key, value]) =>
        (key === 'page' || key === 'limit')
        && typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 1000);
  }
  // Public storefront collections and their active product lists. Do not
  // allow the private owner collection branches ['collections','me'|'detail', ...].
  if (root === 'collections') {
    if (queryKey.length === 3 && child === 'store' && typeof third === 'string' && third.length > 0) return true;
    return queryKey.length === 3 && typeof child === 'string' && child.length > 0
      && !new Set(['me', 'detail', 'admin']).has(child) && third === 'products';
  }
  // Public badges are read-only projections for storefront/provider pages.
  if (root === 'badges') {
    return queryKey.length === 3 && (child === 'store' || child === 'provider')
      && typeof third === 'string' && third.length > 0;
  }
  // Public aggregate statistics are served by the explicit /public/stores
  // endpoint and keyed by a store slug, not by the current account.
  if (root === 'public-store-sales-stats') {
    return queryKey.length === 2 && typeof child === 'string' && child.length > 0;
  }
  // Public store-type reference data powers storefront filters and the
  // dynamic fields in product/store forms. The same query-key factory is
  // also reused by the admin editor with an `admin:` sentinel, so only the
  // public root list and concrete non-admin type IDs may be persisted.
  if (root === 'store-types') {
    if (queryKey.length === 1) return true;
    return queryKey.length === 3
      && child === 'fields'
      && typeof third === 'string'
      && third.length > 0
      && !third.startsWith('admin:');
  }
  // Public open-request browse is viewer-independent: the API builds this
  // feed from the query alone. Keep only the exact ['requests', 'open', params]
  // shape and reject real search text or contextual location coordinates.
  // Do NOT persist ['requests', 'detail', id]: GET /requests/:id varies by
  // viewer because owners see all offers, signed-in offerers see their own,
  // and anonymous viewers see no offers. Reusing that response across auth
  // states could expose private offer data.
  if (root === 'requests') {
    return queryKey.length === 3 && child === 'open'
      && !!third && typeof third === 'object' && !Array.isArray(third)
      && !hasUnsafeQueryParams(third);
  }
  if (root === 'home') {
    // The legacy homepage payload.
    if (queryKey.length === 3 && child === 'page' && (third === null || typeof third === 'string')) return true;
    // CACHE-OFFLINE-HOME-FEED-01: allow the unified home feed to persist.
    // The query key includes the user identity
    // (['home','feed',city|__ALL__,userId|'guest']) so different users get
    // different IndexedDB entries; authCleanup.ts clears this cache on
    // logout. Both invariants together make cross-user leakage impossible,
    // which was the reason this branch previously excluded home.feed.
    // Persisting it lets the home page render its rails offline instead of
    // the generic skeletons the user was seeing.
    if (queryKey.length === 4 && child === 'feed'
      && (third === null || typeof third === 'string')
      && typeof fourth === 'string' && fourth.length > 0) return true;
    return false;
  }
  if (EXACT_PUBLIC_ROOTS.has(root)) {
    if (queryKey.length === 1) return true;
    return queryKey.length === 3 && child === 'slug' && typeof third === 'string';
  }
  if (root === 'service-providers' && queryKey.length === 2 && typeof child === 'string'
    && !new Set(['list', 'me', 'nearby', 'admin', 'stock', 'analytics']).has(child)) return true;
  const children = PUBLIC_CHILD_KEYS.get(root);
  if (!children || typeof child !== 'string' || !children.has(child)) return false;
  // The ads infinite-query factory has the concrete shape
  // ['ads', 'infinite', mode, params], unlike the ordinary list keys.
  // Persist only the non-search browse feed; search results may encode a
  // user's private search terms and must never be restored from this store.
  if (root === 'ads' && child === 'infinite') {
    return queryKey.length === 4
      && third === 'browse'
      && !!fourth && typeof fourth === 'object' && !Array.isArray(fourth)
      && !hasUnsafeQueryParams(fourth);
  }
  if (child === 'detail' || child === 'related') return queryKey.length === 3 && typeof third === 'string' && third !== 'me' && third !== 'admin';
  if (child === 'slug') return queryKey.length === 3 && typeof third === 'string';
  if (child === 'promoted') return queryKey.length === 4 && third === 'infinite' && typeof fourth === 'number';
  if (child === 'list' || child === 'infinite') {
    return queryKey.length === 3 && !!third && typeof third === 'object' && !Array.isArray(third) && !hasUnsafeQueryParams(third);
  }
  return false;
}

export function getOfflineQueryDataBytes(data: unknown): number | null {
  try {
    const encoded = stableJson(data);
    return new TextEncoder().encode(encoded).byteLength;
  } catch {
    return null;
  }
}

export function selectPersistableQueries(queries: Array<{ queryKey: QueryKey; state: { data?: unknown; dataUpdatedAt: number } }>, now = Date.now()): PersistedQuery[] {
  const candidates: PersistedQuery[] = [];
  for (const query of queries) {
    if (query.state.data === undefined || !Number.isFinite(query.state.dataUpdatedAt) || query.state.dataUpdatedAt <= 0 || query.state.dataUpdatedAt > now + 60_000 || now - query.state.dataUpdatedAt > OFFLINE_QUERY_MAX_AGE_MS || !isOfflinePersistableQueryKey(query.queryKey)) continue;
    const bytes = getOfflineQueryDataBytes(query.state.data);
    if (bytes === null || bytes > maxEntryBytesForQueryKey(query.queryKey)) continue;
    candidates.push({ id: keyIdentity(query.queryKey), queryKey: query.queryKey, data: query.state.data, dataUpdatedAt: query.state.dataUpdatedAt, savedAt: now, bytes });
  }
  return candidates.sort((a, b) => b.dataUpdatedAt - a.dataUpdatedAt).slice(0, OFFLINE_QUERY_MAX_ENTRIES);
}

/**
 * FIX OFFLINE-PERSIST-MERGE-01: merge the in-memory snapshot into what is
 * already persisted instead of replacing the whole store.
 *
 * Previously persistOfflineQueryCache() did store.clear() + put(memory only),
 * and subscribeOfflineQueryCache() re-ran it on every 'removed' event. React
 * Query garbage-collects unobserved queries after gcTime (10 min), so any
 * page not currently in memory was deleted from IndexedDB shortly after —
 * the advertised 7-day offline lifetime was really ~10 minutes. Entries that
 * are valid but not in memory are now kept; in-memory data always wins for
 * the same key, and the age/entry/byte limits still apply.
 */
export function mergePersistedQueries(
  existing: unknown[],
  selected: PersistedQuery[],
  now = Date.now(),
): PersistedQuery[] {
  const memoryIds = new Set(selected.map((entry) => entry.id));
  const kept = existing.filter(
    (record): record is PersistedQuery =>
      isValidOfflineQueryCacheEntry(record, now) && !memoryIds.has((record as PersistedQuery).id),
  );
  const merged = [...selected, ...kept].sort((a, b) => b.dataUpdatedAt - a.dataUpdatedAt).slice(0, OFFLINE_QUERY_MAX_ENTRIES);
  const bounded: PersistedQuery[] = [];
  let totalBytes = 0;
  for (const entry of merged) {
    if (totalBytes + entry.bytes > OFFLINE_QUERY_MAX_TOTAL_BYTES) continue;
    bounded.push(entry);
    totalBytes += entry.bytes;
  }
  return bounded;
}

export async function restoreOfflineQueryCache(queryClient: QueryClient): Promise<number> {
  let db: IDBDatabase | undefined;
  try {
    db = await openDb();
    const records = await requestResult(db.transaction(OFFLINE_QUERY_CACHE_STORE, 'readonly').objectStore(OFFLINE_QUERY_CACHE_STORE).getAll() as IDBRequest<PersistedRecord[]>);
    const now = Date.now();
    const entries = records.filter((record): record is PersistedQuery => isValidOfflineQueryCacheEntry(record, now) && isPersistedQuery(record)).sort((a, b) => b.dataUpdatedAt - a.dataUpdatedAt);
    let restored = 0;
    for (const entry of entries) {
      const current = queryClient.getQueryState(entry.queryKey);
      if (current?.data !== undefined && current.dataUpdatedAt >= entry.dataUpdatedAt) continue;
      queryClient.setQueryData(entry.queryKey, entry.data, { updatedAt: entry.dataUpdatedAt });
      restored += 1;
    }
    writeLastCacheMarker(entries.reduce((value, entry) => Math.max(value, entry.dataUpdatedAt), 0));
    const validIds = new Set(entries.map((entry) => entry.id));
    const cleanup = db.transaction(OFFLINE_QUERY_CACHE_STORE, 'readwrite');
    const store = cleanup.objectStore(OFFLINE_QUERY_CACHE_STORE);
    for (const record of records) {
      if (record && typeof record.id === 'string' && record.id !== '__meta__' && !validIds.has(record.id)) store.delete(record.id);
    }
    return restored;
  } catch { return 0; } finally { db?.close(); }
}

export async function persistOfflineQueryCache(queryClient: QueryClient): Promise<number> {
  let db: IDBDatabase | undefined;
  try {
    db = await openDb();
    const selected = selectPersistableQueries(queryClient.getQueryCache().getAll().map((query) => ({ queryKey: query.queryKey, state: { data: query.state.data, dataUpdatedAt: query.state.dataUpdatedAt } })));
    const tx = db.transaction(OFFLINE_QUERY_CACHE_STORE, 'readwrite');
    const store = tx.objectStore(OFFLINE_QUERY_CACHE_STORE);
    let persistedCount = 0;
    let savedAt = 0;
    // Read + rewrite inside one transaction (callback style keeps it active),
    // so a concurrent persist cannot interleave between the read and the write.
    const readRequest = store.getAll() as IDBRequest<PersistedRecord[]>;
    readRequest.onsuccess = () => {
      const bounded = mergePersistedQueries(readRequest.result ?? [], selected);
      store.clear();
      for (const entry of bounded) store.put(entry);
      persistedCount = bounded.length;
      savedAt = bounded.reduce((latest, entry) => Math.max(latest, entry.dataUpdatedAt), 0);
      const totalBytes = bounded.reduce((sum, entry) => sum + entry.bytes, 0);
      if (bounded.length > 0) store.put({ id: '__meta__', savedAt, bytes: totalBytes } satisfies PersistedMeta);
    };
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed')); tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted')); });
    writeLastCacheMarker(savedAt);
    return persistedCount;
  } catch { return 0; } finally { db?.close(); }
}
export function getLastOfflineQueryCacheSavedAt(): number | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LAST_CACHE_AT_KEY);
    if (!raw) return null;
    const value = Number(raw);
    // Ignore corrupt/future markers (clock changes or manually edited storage).
    return Number.isFinite(value) && value > 0 && value <= Date.now() + 60_000 ? value : null;
  } catch {
    // Storage can throw in privacy-restricted contexts; offline cache remains best-effort.
    return null;
  }
}
export async function clearOfflineQueryCache(): Promise<void> {
  let db: IDBDatabase | undefined;
  try {
    db = await openDb(); const tx = db.transaction(OFFLINE_QUERY_CACHE_STORE, 'readwrite'); tx.objectStore(OFFLINE_QUERY_CACHE_STORE).clear();
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error ?? new Error('IndexedDB clear failed')); tx.onabort = () => reject(tx.error ?? new Error('IndexedDB clear aborted')); });
  } catch { /* logout must continue if IndexedDB is unavailable */ } finally { db?.close(); try { localStorage.removeItem(LAST_CACHE_AT_KEY); } catch { /* ignore */ } }
}
export function subscribeOfflineQueryCache(queryClient: QueryClient): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined; let disposed = false;
  const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = undefined; if (!disposed) void persistOfflineQueryCache(queryClient); }, SAVE_DEBOUNCE_MS); };
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'success' && isOfflinePersistableQueryKey(event.query.queryKey)) schedule();
    // FIX OFFLINE-PERSIST-MERGE-01: no 'removed' trigger. GC of an unobserved query is not a
    // reason to forget its persisted snapshot; stale rows expire by age (7 days) instead.
  });
  return () => { disposed = true; unsubscribe(); if (timer) clearTimeout(timer); };
}
