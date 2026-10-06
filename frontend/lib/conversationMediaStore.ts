import type { Message } from '@/types/conversation.types';

const DB_NAME = 'market-conversation-media';
const DB_VERSION = 2;
const STORE = 'media';
const STORE_BLOBS = 'blobs';
const MAX_CACHED_BLOB_BYTES = 12 * 1024 * 1024;
const MAX_CONVERSATION_CACHE_BYTES = 50 * 1024 * 1024;
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
  // Avoid turning every gallery refresh into an unbounded background download.
  // Cache newest-first until a conservative per-conversation budget is reached.
  let budget = MAX_CONVERSATION_CACHE_BYTES;
  for (const candidate of candidates) {
    if (!candidate.url || budget <= 0) continue;
    try {
      const existing = await getConversationMediaBlob(userId, conversationId, candidate.messageId, candidate.kind);
      if (existing) continue;
      const blob = await fetchMediaBlobWithFallback(
        conversationId,
        candidate.messageId,
        candidate.kind,
        candidate.url,
      );
      if (!blob) continue;
      if (!blob.size || blob.size > MAX_CACHED_BLOB_BYTES || blob.size > budget) continue;
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_BLOBS, 'readwrite');
        tx.objectStore(STORE_BLOBS).put({
          key: blobKey(userId, conversationId, candidate.messageId, candidate.kind),
          userId, conversationId, messageId: candidate.messageId, kind: candidate.kind,
          blob, savedAt: Date.now(),
        } satisfies BlobRecord);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      budget -= blob.size;
    } catch {
      // CORS/offline/expired URL: metadata remains usable online and the next successful fetch retries the cache.
    }
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
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE_BLOBS, 'readonly').objectStore(STORE_BLOBS).get(blobKey(userId, conversationId, messageId, kind));
      req.onsuccess = () => resolve((req.result as BlobRecord | undefined)?.blob ?? null);
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
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_BLOBS, 'readwrite');
      tx.objectStore(STORE_BLOBS).put({
        key: blobKey(userId, conversationId, messageId, kind),
        userId, conversationId, messageId, kind, blob, savedAt: Date.now(),
      } satisfies BlobRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return blob;
  } catch {
    return blob;
  }
}
