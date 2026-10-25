import { favoritesApi } from '@/api/favorites.api';
import { getCurrentOfflineUserId } from '@/lib/offlineUserScope';
import type { FavoriteEntityKind } from '@/types/favorite.types';

const DB_NAME = 'market-offline-favorite-intents';
const DB_VERSION = 1;
const STORE = 'intents';
const intentCache = new Map<string, OfflineFavoriteIntent | null>();
const loadedUsers = new Set<string>();
const loadPromises = new Map<string, Promise<void>>();
export interface OfflineFavoriteIntent {
  key: string; userId: string; type: 'AD' | FavoriteEntityKind; entityId: string;
  desired: boolean; updatedAt: number;
}
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB غير متاح'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function intentKey(userId: string, type: OfflineFavoriteIntent['type'], entityId: string) { return `${userId}:${type}:${entityId}`; }
export async function saveOfflineFavoriteIntent(userId: string, type: OfflineFavoriteIntent['type'], entityId: string, desired: boolean): Promise<void> {
  const db = await openDb();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ key: intentKey(userId, type, entityId), userId, type, entityId, desired, updatedAt: Date.now() } satisfies OfflineFavoriteIntent);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
  const key = intentKey(userId, type, entityId);
  intentCache.set(key, { key, userId, type, entityId, desired, updatedAt: Date.now() });
  loadedUsers.add(userId);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('offline-favorite-intents:updated'));
}
export async function listOfflineFavoriteIntents(userId = getCurrentOfflineUserId()): Promise<OfflineFavoriteIntent[]> {
  if (!userId) return [];
  const db = await openDb();
  try {
    const rows = await new Promise<OfflineFavoriteIntent[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly'); const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as OfflineFavoriteIntent[]).filter((item) => item.userId === userId));
      req.onerror = () => reject(req.error);
    });
    for (const [key, value] of intentCache) if (value?.userId === userId) intentCache.delete(key);
    for (const row of rows) intentCache.set(row.key, row);
    loadedUsers.add(userId);
    return rows;
  } finally { db.close(); }
}
export async function getOfflineFavoriteIntent(userId: string | null, type: OfflineFavoriteIntent['type'], entityId: string): Promise<OfflineFavoriteIntent | null> {
  if (!userId) return null;
  const key = intentKey(userId, type, entityId);
  if (loadedUsers.has(userId) && intentCache.has(key)) return intentCache.get(key) ?? null;
  let pending = loadPromises.get(userId);
  if (!pending) {
    pending = listOfflineFavoriteIntents(userId).then(() => undefined).finally(() => loadPromises.delete(userId));
    loadPromises.set(userId, pending);
  }
  await pending;
  if (!intentCache.has(key)) intentCache.set(key, null);
  return intentCache.get(key) ?? null;
}
export async function removeOfflineFavoriteIntent(key: string): Promise<void> {
  const db = await openDb();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }
  finally { db.close(); }
  intentCache.set(key, null);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('offline-favorite-intents:updated'));
}
export async function syncOfflineFavoriteIntents(userId = getCurrentOfflineUserId()): Promise<{ synced: number; failed: number }> {
  if (!userId || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { synced: 0, failed: 0 };
  const intents = await listOfflineFavoriteIntents(userId); let synced = 0; let failed = 0;
  for (const intent of intents.sort((a, b) => a.updatedAt - b.updatedAt)) {
    // Never replay a toggle blindly. Read the authoritative state first; a crash after toggle
    // but before local deletion is safe because the next pass observes the desired state.
    try {
      const actual = intent.type === 'AD'
        ? await favoritesApi.check(intent.entityId)
        : await favoritesApi.checkEntity(intent.type, intent.entityId);
      if (actual !== intent.desired) {
        if (intent.type === 'AD') await favoritesApi.toggle(intent.entityId);
        else await favoritesApi.toggleEntity(intent.type, intent.entityId);
      }
      await removeOfflineFavoriteIntent(intent.key); synced += 1;
    } catch (error) { failed += 1; console.warn('[offline-favorites] sync failed; intent retained', error); }
  }
  return { synced, failed };
}
