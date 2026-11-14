import type { Message } from '@/types/conversation.types';
import { isDeviceOffline } from '@/lib/offlineError';

const DB_NAME = 'market-conversation-media';
const DB_VERSION = 3;
const STORE = 'media';
const STORE_BLOBS = 'blobs';
const MAX_CACHED_BLOB_BYTES = 12 * 1024 * 1024;
const MAX_CONVERSATION_CACHE_BYTES = 30 * 1024 * 1024;
const MAX_USER_CACHE_BYTES = 80 * 1024 * 1024;
const MAX_AUTO_CACHE_ITEMS = 15;
const MEDIA_FETCH_TIMEOUT_MS = 12_000;
const MEDIA_FETCH_CONCURRENCY = 3;
const MEDIA_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MEDIA_PROXY_BASE = '/api/v1/conversations';

type MediaRecord = {
  key: string;
  userId: string;
  conversationId: string;
  items: Message[];
  savedAt: number;
};
type BlobRecord = {
  key: string;
  userId: string;
  conversationId: string;
  messageId: string;
  kind: 'image' | 'audio' | 'file';
  blob: Blob;
  savedAt: number;
};
type MediaCandidate = {
  messageId: string;
  kind: BlobRecord['kind'];
  url: string;
};

const inFlightBlobLoads = new Map<string, Promise<Blob | null>>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let wasBlocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
      const blobs = db.objectStoreNames.contains(STORE_BLOBS)
        ? request.transaction?.objectStore(STORE_BLOBS)
        : db.createObjectStore(STORE_BLOBS, { keyPath: 'key' });
      if (blobs && !blobs.indexNames.contains('byUserId')) {
        blobs.createIndex('byUserId', 'userId', { unique: false });
      }
      if (blobs && !blobs.indexNames.contains('byUserConversation')) {
        blobs.createIndex('byUserConversation', ['userId', 'conversationId'], { unique: false });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // An upgrade may complete after an earlier `blocked` notification. The
      // open promise has already rejected in that case, so close this late
      // connection instead of leaving an unowned handle alive.
      if (wasBlocked) {
        db.close();
        return;
      }
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Unable to open media database'));
    request.onblocked = () => {
      wasBlocked = true;
      reject(new Error('Conversation media database upgrade blocked'));
    };
  });
}

async function withDatabase<T>(operation: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    return await operation(db);
  } finally {
    db.close();
  }
}

function key(userId: string, conversationId: string): string {
  return `${userId}:${conversationId}`;
}

function blobKey(userId: string, conversationId: string, messageId: string, kind: string): string {
  return `${userId}:${conversationId}:${messageId}:${kind}`;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export async function saveConversationMedia(
  userId: string,
  conversationId: string,
  items: Message[],
): Promise<void> {
  if (!userId || !conversationId) return;
  await withDatabase(async (db) => {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put({
      key: key(userId, conversationId),
      userId,
      conversationId,
      items,
      savedAt: Date.now(),
    } satisfies MediaRecord);
    await transactionDone(transaction);
  });
}

export async function getConversationMedia(userId: string, conversationId: string): Promise<Message[]> {
  if (!userId || !conversationId) return [];
  return withDatabase(async (db) => {
    const transaction = db.transaction(STORE, 'readonly');
    const result = await requestResult<MediaRecord | undefined>(
      transaction.objectStore(STORE).get(key(userId, conversationId)),
    );
    await transactionDone(transaction);
    return result?.items ?? [];
  });
}

async function readBoundedBlob(response: Response): Promise<Blob | null> {
  if (!response.ok || !response.body) return null;
  const contentLength = response.headers.get('content-length');
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_CACHED_BLOB_BYTES) {
    await response.body.cancel().catch(() => undefined);
    return null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_CACHED_BLOB_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) return null;
  return new Blob(chunks as BlobPart[], {
    type: response.headers.get('content-type')?.split(';', 1)[0]?.trim() || 'application/octet-stream',
  });
}

async function fetchBounded(
  url: string,
  credentials: RequestCredentials = 'include',
): Promise<Blob | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MEDIA_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      credentials,
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    return await readBoundedBlob(response);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchMediaBlobWithFallback(
  conversationId: string,
  messageId: string,
  kind: BlobRecord['kind'],
  remoteUrl: string,
): Promise<Blob | null> {
  // Provider CORS may reject direct fetches. Never accept a non-HTTPS external
  // URL here; the same-origin proxy is the authenticated fallback.
  try {
    const parsed = new URL(remoteUrl, typeof location !== 'undefined' ? location.origin : 'https://invalid.local');
    if (parsed.protocol === 'https:' && parsed.hostname === 'res.cloudinary.com') {
      const direct = await fetchBounded(parsed.href, 'omit');
      if (direct) return direct;
    }
  } catch {
    // Expected for provider CORS, expired media, or a failed network request.
  }

  try {
    const proxy = `${MEDIA_PROXY_BASE}/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/media/${kind}`;
    return await fetchBounded(proxy);
  } catch {
    return null;
  }
}

async function putConversationMediaBlob(
  userId: string,
  conversationId: string,
  record: BlobRecord,
): Promise<boolean> {
  if (record.blob.size <= 0 || record.blob.size > MAX_CACHED_BLOB_BYTES) return false;

  return withDatabase(async (db) => new Promise<boolean>((resolve, reject) => {
    const transaction = db.transaction(STORE_BLOBS, 'readwrite');
    const store = transaction.objectStore(STORE_BLOBS);
    const userIndex = store.index('byUserId');
    const rowsRequest = userIndex.getAll(IDBKeyRange.only(userId));
    let accepted = false;

    rowsRequest.onsuccess = () => {
      const rows = (rowsRequest.result as BlobRecord[]).filter((row) => row.key !== record.key);
      const conversationRows = rows.filter((row) => row.conversationId === conversationId);
      let userTotal = rows.reduce((sum, row) => sum + (row.blob?.size ?? 0), 0);
      let conversationTotal = conversationRows.reduce((sum, row) => sum + (row.blob?.size ?? 0), 0);
      const oldestFirst = [...rows].sort((a, b) => a.savedAt - b.savedAt);
      const removedKeys = new Set<string>();

      // First enforce the conversation budget, then the account-wide budget.
      // Track deleted keys explicitly: inferring deletion from the remaining
      // byte total can subtract a row twice when the cache was already under
      // the conversation limit but still over the account limit.
      for (const row of oldestFirst) {
        if (conversationTotal + record.blob.size <= MAX_CONVERSATION_CACHE_BYTES) break;
        if (row.conversationId !== conversationId) continue;
        store.delete(row.key);
        removedKeys.add(row.key);
        const bytes = row.blob?.size ?? 0;
        conversationTotal -= bytes;
        userTotal -= bytes;
      }
      for (const row of oldestFirst) {
        if (userTotal + record.blob.size <= MAX_USER_CACHE_BYTES) break;
        if (removedKeys.has(row.key)) continue;
        store.delete(row.key);
        removedKeys.add(row.key);
        const bytes = row.blob?.size ?? 0;
        userTotal -= bytes;
        if (row.conversationId === conversationId) conversationTotal -= bytes;
      }

      if (
        conversationTotal + record.blob.size <= MAX_CONVERSATION_CACHE_BYTES &&
        userTotal + record.blob.size <= MAX_USER_CACHE_BYTES
      ) {
        store.put(record);
        accepted = true;
      }
    };
    rowsRequest.onerror = () => reject(rowsRequest.error ?? new Error('Unable to inspect media cache budget'));
    transaction.oncomplete = () => resolve(accepted);
    transaction.onerror = () => reject(transaction.error ?? new Error('Media cache transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Media cache transaction aborted'));
  }));
}

async function loadAndStoreBlob(
  userId: string,
  conversationId: string,
  messageId: string,
  kind: BlobRecord['kind'],
  remoteUrl: string,
): Promise<Blob | null> {
  const cached = await getConversationMediaBlob(userId, conversationId, messageId, kind);
  if (cached) return cached;

  const blob = await fetchMediaBlobWithFallback(conversationId, messageId, kind, remoteUrl);
  if (!blob) return null;

  try {
    await putConversationMediaBlob(userId, conversationId, {
      key: blobKey(userId, conversationId, messageId, kind),
      userId,
      conversationId,
      messageId,
      kind,
      blob,
      savedAt: Date.now(),
    });
  } catch {
    // Keep the fetched Blob usable for this view even when storage is unavailable.
  }
  return blob;
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      if (item !== undefined) await run(item);
    }
  });
  await Promise.all(workers);
}

export async function cacheConversationMediaBlobs(
  userId: string,
  conversationId: string,
  items: Message[],
): Promise<void> {
  if (!userId || !conversationId || typeof fetch === 'undefined') return;
  const candidates: MediaCandidate[] = items.flatMap((item) => {
    const result: MediaCandidate[] = [];
    if (item.imageUrl) result.push({ messageId: item.id, kind: 'image', url: item.imageUrl });
    if (item.audioUrl) result.push({ messageId: item.id, kind: 'audio', url: item.audioUrl });
    if (item.fileUrl) result.push({ messageId: item.id, kind: 'file', url: item.fileUrl });
    return result;
  }).slice(-MAX_AUTO_CACHE_ITEMS);

  await runWithConcurrency(candidates, MEDIA_FETCH_CONCURRENCY, async (candidate) => {
    try {
      await getOrCacheConversationMediaBlob(
        userId,
        conversationId,
        candidate.messageId,
        candidate.kind,
        candidate.url,
      );
    } catch {
      // CORS/offline/expired URL: metadata remains usable and the next online pass retries.
    }
  });
}

async function deleteExpiredMediaBlob(keyValue: string): Promise<void> {
  try {
    await withDatabase(async (db) => {
      const transaction = db.transaction(STORE_BLOBS, 'readwrite');
      transaction.objectStore(STORE_BLOBS).delete(keyValue);
      await transactionDone(transaction);
    });
  } catch {
    // Best effort cleanup; the TTL check still prevents returning expired data.
  }
}

export async function getConversationMediaBlob(
  userId: string,
  conversationId: string,
  messageId: string,
  kind: BlobRecord['kind'],
): Promise<Blob | null> {
  if (!userId || !conversationId || !messageId) return null;
  try {
    return await withDatabase(async (db) => {
      const transaction = db.transaction(STORE_BLOBS, 'readonly');
      const row = await requestResult<BlobRecord | undefined>(
        transaction.objectStore(STORE_BLOBS).get(blobKey(userId, conversationId, messageId, kind)),
      );
      await transactionDone(transaction);
      if (!row) return null;
      if (!Number.isFinite(row.savedAt) || Date.now() - row.savedAt > MEDIA_TTL_MS) {
        void deleteExpiredMediaBlob(row.key);
        return null;
      }
      return row.blob ?? null;
    });
  } catch {
    return null;
  }
}

export async function clearConversationMediaStore(): Promise<void> {
  // Clear only this origin's media database; all opened connections are closed
  // before this Promise resolves so logout cannot race a lingering transaction.
  await withDatabase(async (db) => {
    const transaction = db.transaction([STORE, STORE_BLOBS], 'readwrite');
    transaction.objectStore(STORE).clear();
    transaction.objectStore(STORE_BLOBS).clear();
    await transactionDone(transaction);
  });
}

/**
 * Returns a durable local Blob when available, otherwise fetches it once and
 * stores it under a bounded per-user LRU policy. Concurrent callers for the
 * same media key share one network operation.
 */
export async function getOrCacheConversationMediaBlob(
  userId: string,
  conversationId: string,
  messageId: string,
  kind: BlobRecord['kind'],
  remoteUrl?: string | null,
): Promise<Blob | null> {
  const cached = await getConversationMediaBlob(userId, conversationId, messageId, kind);
  if (cached) return cached;
  if (!remoteUrl || (isDeviceOffline())) return null;

  const keyValue = blobKey(userId, conversationId, messageId, kind);
  const pending = inFlightBlobLoads.get(keyValue);
  if (pending) return pending;

  const task = loadAndStoreBlob(userId, conversationId, messageId, kind, remoteUrl);
  inFlightBlobLoads.set(keyValue, task);
  try {
    return await task;
  } finally {
    if (inFlightBlobLoads.get(keyValue) === task) inFlightBlobLoads.delete(keyValue);
  }
}
