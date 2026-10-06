import type { Message } from '@/types/conversation.types';

const DB_NAME = 'market-conversation-media';
const DB_VERSION = 2;
const STORE = 'media';
const STORE_BLOBS = 'blobs';
const MAX_CACHED_BLOB_BYTES = 12 * 1024 * 1024;
const MAX_CONVERSATION_CACHE_BYTES = 50 * 1024 * 1024;
const MEDIA_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MEDIA_PROXY_BASE = '/api/v1/conversations';

type MediaRecord = { key: string; userId: string; conversationId: string; items: Message[]; savedAt: number };
type BlobRecord = { key: string; userId: string; conversationId: string; messageId: string; kind: 'image' | 'audio' | 'file'; blob: Blob; savedAt: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(STORE_BLOBS)) db.createObjectStore(STORE_BLOBS, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function key(userId: string, conversationId: string) { return `${userId}:${conversationId}`; }
function blobKey(userId: string, conversationId: string, messageId: string, kind: string) { return `${userId}:${conversationId}:${messageId}:${kind}`; }

export async function saveConversationMedia(userId: string, conversationId: string, items: Message[]): Promise<void> {
  if (!userId || !conversationId) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ key: key(userId, conversationId), userId, conversationId, items, savedAt: Date.now() } satisfies MediaRecord);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getConversationMedia(userId: string, conversationId: string): Promise<Message[]> {
  if (!userId || !conversationId) return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key(userId, conversationId));
    req.onsuccess = () => resolve((req.result as MediaRecord | undefined)?.items ?? []);
    req.onerror = () => reject(req.error);
  });
}

async function fetchMediaBlobWithFallback(
  conversationId: string,
  messageId: string,
  kind: BlobRecord['kind'],
  remoteUrl: string,
): Promise<Blob | null> {
  // First use the direct provider URL. If CORS blocks it, the same-origin
  // backend proxy fetches the already-authorized message media server-side.
  try {
    const direct = await fetch(remoteUrl, { credentials: 'include', cache: 'no-store' });
    if (direct.ok) return await direct.blob();
  } catch {
    // Expected for providers that omit Access-Control-Allow-Origin.
  }

  try {
    const proxy = `${MEDIA_PROXY_BASE}/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/media/${kind}`;
    const proxied = await fetch(proxy, { credentials: 'include', cache: 'no-store' });
    if (!proxied.ok) return null;
    return await proxied.blob();
  } catch {
    return null;
  }
}

/** Cache binary media separately from message metadata so reload/offline can still preview/download it. */
async function putConversationMediaBlob(
  userId: string,
  conversationId: string,
  record: BlobRecord,
): Promise<boolean> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, 'readwrite');
    const store = tx.objectStore(STORE_BLOBS);
    const allReq = store.getAll();
    allReq.onsuccess = () => {
      const rows = (allReq.result as BlobRecord[]).filter(
        (row) => row.userId === userId && row.conversationId === conversationId && row.key !== record.key,
      );
      let total = rows.reduce((sum, row) => sum + (row.blob?.size ?? 0), 0);
      if (record.blob.size > MAX_CACHED_BLOB_BYTES) return resolve(false);
      rows.sort((a, b) => a.savedAt - b.savedAt);
      while (total + record.blob.size > MAX_CONVERSATION_CACHE_BYTES && rows.length) {
        const oldest = rows.shift();
        if (!oldest) break;
        total -= oldest.blob?.size ?? 0;
        store.delete(oldest.key);
      }
      if (total + record.blob.size > MAX_CONVERSATION_CACHE_BYTES) return resolve(false);
      store.put(record);
    };
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Media cache transaction aborted'));
  });
}

export async function cacheConversationMediaBlobs(
  userId: string,
  conversationId: string,
  items: Message[],
): Promise<void> {
  if (!userId || !conversationId || typeof fetch === 'undefined') return;
  const candidates = items.flatMap((item) => {
    const out: Array<{ messageId: string; kind: BlobRecord['kind']; url?: string | null }> = [];
    if (item.imageUrl) out.push({ messageId: item.id, kind: 'image', url: item.imageUrl });
    if (item.audioUrl) out.push({ messageId: item.id, kind: 'audio', url: item.audioUrl });
    if (item.fileUrl) out.push({ messageId: item.id, kind: 'file', url: item.fileUrl });
    return out;
  });
  for (const candidate of candidates) {
    if (!candidate.url) continue;
    try {
      const existing = await getConversationMediaBlob(userId, conversationId, candidate.messageId, candidate.kind);
      if (existing) continue;
      const blob = await fetchMediaBlobWithFallback(conversationId, candidate.messageId, candidate.kind, candidate.url);
      if (!blob || !blob.size || blob.size > MAX_CACHED_BLOB_BYTES) continue;
      await putConversationMediaBlob(userId, conversationId, {
        key: blobKey(userId, conversationId, candidate.messageId, candidate.kind),
        userId,
        conversationId,
        messageId: candidate.messageId,
        kind: candidate.kind,
        blob,
        savedAt: Date.now(),
      });
    } catch {
      // CORS/offline/expired URL: metadata remains usable and the next successful fetch retries the cache.
    }
  }
}

async function deleteExpiredMediaBlob(keyValue: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_BLOBS, 'readwrite');
      tx.objectStore(STORE_BLOBS).delete(keyValue);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* best effort */ }
}

export async function getConversationMediaBlob(
  userId: string,
  conversationId: string,
  messageId: string,
  kind: BlobRecord['kind'],
): Promise<Blob | null> {
  if (!userId || !conversationId || !messageId) return null;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE_BLOBS, 'readonly').objectStore(STORE_BLOBS).get(blobKey(userId, conversationId, messageId, kind));
      req.onsuccess = () => {
        const row = req.result as BlobRecord | undefined;
        if (!row) return resolve(null);
        if (!Number.isFinite(row.savedAt) || Date.now() - row.savedAt > MEDIA_TTL_MS) {
          void deleteExpiredMediaBlob(row.key);
          return resolve(null);
        }
        resolve(row.blob ?? null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function clearConversationMediaStore(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE, STORE_BLOBS], 'readwrite');
      tx.objectStore(STORE).clear();
      tx.objectStore(STORE_BLOBS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    // Propagate cleanup failure so logout can wait for or report it instead
    // of silently leaving private media behind on disk.
    throw error;
  }
}


/**
 * Returns a durable local object URL when the provider URL is blocked by CORS
 * or unavailable. Online callers populate IndexedDB through the app proxy;
 * offline callers only read the already-cached blob.
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
  if (!remoteUrl || typeof navigator !== 'undefined' && !navigator.onLine) return null;
  const blob = await fetchMediaBlobWithFallback(conversationId, messageId, kind, remoteUrl);
  if (!blob || blob.size > MAX_CACHED_BLOB_BYTES) return null;
  try {
    await putConversationMediaBlob(userId, conversationId, {
      key: blobKey(userId, conversationId, messageId, kind),
      userId, conversationId, messageId, kind, blob, savedAt: Date.now(),
    });
    return blob;
  } catch {
    return blob;
  }
}
