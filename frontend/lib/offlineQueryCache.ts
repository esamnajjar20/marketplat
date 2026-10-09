/** Safe public-query persistence for offline-first UI. Mutations and private/session data are never persisted. */
import type { QueryClient, QueryKey } from '@tanstack/react-query';

export const OFFLINE_QUERY_CACHE_DB = 'marketplat-offline-query-cache-v1';
export const OFFLINE_QUERY_CACHE_STORE = 'queries';
export const OFFLINE_QUERY_MAX_ENTRY_BYTES = 64 * 1024;
export const OFFLINE_QUERY_MAX_ENTRIES = 500;
export const OFFLINE_QUERY_MAX_TOTAL_BYTES = 5 * 1024 * 1024;
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
    return actualBytes !== null && actualBytes === entry.bytes && actualBytes <= OFFLINE_QUERY_MAX_ENTRY_BYTES;
  } catch {
    // One corrupt IndexedDB record must not prevent restoring other valid entries.
    return false;
  }
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
  if (root === 'home') {
    // The legacy homepage payload is public; the home-feed variant includes a
    // user identity and personalized rails, so it is deliberately not persisted.
    return queryKey.length === 3 && child === 'page' && (third === null || typeof third === 'string');
  }
  if (EXACT_PUBLIC_ROOTS.has(root)) {
    if (queryKey.length === 1) return true;
    return queryKey.length === 3 && child === 'slug' && typeof third === 'string';
  }
  if (root === 'service-providers' && queryKey.length === 2 && typeof child === 'string'
    && !new Set(['list', 'me', 'nearby', 'admin', 'stock', 'analytics']).has(child)) return true;
  const children = PUBLIC_CHILD_KEYS.get(root);
  if (!children || typeof child !== 'string' || !children.has(child)) return false;
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
    if (bytes === null || bytes > OFFLINE_QUERY_MAX_ENTRY_BYTES) continue;
    candidates.push({ id: keyIdentity(query.queryKey), queryKey: query.queryKey, data: query.state.data, dataUpdatedAt: query.state.dataUpdatedAt, savedAt: now, bytes });
  }
  return candidates.sort((a, b) => b.dataUpdatedAt - a.dataUpdatedAt).slice(0, OFFLINE_QUERY_MAX_ENTRIES);
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
    if (typeof localStorage !== 'undefined') {
      const latest = entries.reduce((value, entry) => Math.max(value, entry.dataUpdatedAt), 0);
      if (latest > 0) localStorage.setItem(LAST_CACHE_AT_KEY, String(latest));
      else localStorage.removeItem(LAST_CACHE_AT_KEY);
    }
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
    const bounded: PersistedQuery[] = [];
    let totalBytes = 0;
    for (const entry of selected) { if (totalBytes + entry.bytes > OFFLINE_QUERY_MAX_TOTAL_BYTES) continue; bounded.push(entry); totalBytes += entry.bytes; }
    const tx = db.transaction(OFFLINE_QUERY_CACHE_STORE, 'readwrite');
    const store = tx.objectStore(OFFLINE_QUERY_CACHE_STORE);
    store.clear();
    for (const entry of bounded) store.put(entry);
    const savedAt = bounded.reduce((latest, entry) => Math.max(latest, entry.dataUpdatedAt), 0);
    if (bounded.length > 0) store.put({ id: '__meta__', savedAt, bytes: totalBytes } satisfies PersistedMeta);
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed')); tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted')); });
    if (typeof localStorage !== 'undefined') {
      if (savedAt > 0) localStorage.setItem(LAST_CACHE_AT_KEY, String(savedAt));
      else localStorage.removeItem(LAST_CACHE_AT_KEY);
    }
    return bounded.length;
  } catch { return 0; } finally { db?.close(); }
}
export function getLastOfflineQueryCacheSavedAt(): number | null {
  if (typeof localStorage === 'undefined') return null;
  try {
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
    if (event.type === 'removed' && isOfflinePersistableQueryKey(event.query.queryKey)) schedule();
  });
  return () => { disposed = true; unsubscribe(); if (timer) clearTimeout(timer); };
}
