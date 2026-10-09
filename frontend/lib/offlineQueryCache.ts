/** Safe public-query persistence for offline-first UI. Mutations and private/session data are never persisted. */
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { CACHE_CONTRACT } from '@/lib/cache/cacheContract';

export const OFFLINE_QUERY_CACHE_DB = 'marketplat-offline-query-cache-v1';
export const OFFLINE_QUERY_CACHE_STORE = 'queries';
export const OFFLINE_QUERY_MAX_ENTRY_BYTES = 20 * 1024;
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
const SAFE_QUERY_PREFIXES: QueryKey[] = Object.entries(CACHE_CONTRACT.domains)
  .filter(([domain, config]) => config.scope === 'public' && domain !== 'search')
  .flatMap(([, config]) => config.queryPrefixes as QueryKey[]);

export function isOfflinePersistableQueryKey(queryKey: QueryKey): boolean {
  return Array.isArray(queryKey) && queryKey.length > 0 && SAFE_QUERY_PREFIXES.some((prefix) =>
    prefix.length <= queryKey.length && prefix.every((part, index) => stableJson(part) === stableJson(queryKey[index])),
  );
}

export function selectPersistableQueries(queries: Array<{ queryKey: QueryKey; state: { data?: unknown; dataUpdatedAt: number } }>, now = Date.now()): PersistedQuery[] {
  const candidates: PersistedQuery[] = [];
  for (const query of queries) {
    if (query.state.data === undefined || !Number.isFinite(query.state.dataUpdatedAt) || query.state.dataUpdatedAt <= 0 || query.state.dataUpdatedAt > now + 60_000 || now - query.state.dataUpdatedAt > OFFLINE_QUERY_MAX_AGE_MS || !isOfflinePersistableQueryKey(query.queryKey)) continue;
    let encoded: string;
    try { encoded = stableJson(query.state.data); } catch { continue; }
    const bytes = new TextEncoder().encode(encoded).byteLength;
    if (bytes > OFFLINE_QUERY_MAX_ENTRY_BYTES) continue;
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
    const entries = records.filter(isPersistedQuery).filter((entry) => entry.dataUpdatedAt <= now + 60_000 && now - entry.dataUpdatedAt <= OFFLINE_QUERY_MAX_AGE_MS && entry.bytes <= OFFLINE_QUERY_MAX_ENTRY_BYTES && isOfflinePersistableQueryKey(entry.queryKey)).sort((a, b) => b.dataUpdatedAt - a.dataUpdatedAt);
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
    for (const record of records) if (record.id !== '__meta__' && !validIds.has(record.id)) store.delete(record.id);
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
