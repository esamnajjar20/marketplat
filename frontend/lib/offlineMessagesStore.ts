/**
 * PHASE-2 Offline Messages — IndexedDB لبيانات المحادثات والرسائل.
 *
 * Online: API → هذا المخزن → UI (عبر React Query)
 * Offline: هذا المخزن → UI
 *
 * حدود التخزين (لا نخزّن بلا سقف):
 * - آخر MAX_CONVERSATIONS محادثة
 * - آخر MAX_MESSAGES_PER_CONV رسالة لكل محادثة
 *
 * طابور الإرسال (pending/failed) يبقى في market-offline-queue عبر
 * offlineMessagesQueue.ts + sw.js Background Sync — لا نكرّره هنا.
 */

import type { ConversationListItem, Message } from '@/types/conversation.types';
import { OFFLINE_DATA_LIMITS } from '@/lib/offlineCachePolicy';

const DB_NAME = 'market-offline-messages';
const DB_VERSION = 1;

const STORE_CONVERSATIONS = 'conversations';
const STORE_MESSAGES = 'messages';
const STORE_META = 'meta';

const MAX_CONVERSATIONS = OFFLINE_DATA_LIMITS.conversations;
const MAX_MESSAGES_PER_CONV = OFFLINE_DATA_LIMITS.messagesPerConversation;

const META_UNREAD = 'unreadCount';
const META_LAST_SYNC = 'lastSyncedAt';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CONVERSATIONS)) {
        db.createObjectStore(STORE_CONVERSATIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        // key = conversationId, value = { conversationId, items, savedAt }
        db.createObjectStore(STORE_MESSAGES, { keyPath: 'conversationId' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** حفظ قائمة المحادثات (آخر N محادثة حسب ترتيب القائمة الواردة). */
export async function saveConversationsList(
  items: ConversationListItem[],
): Promise<void> {
  try {
    const db = await openDb();
    const limited = items.slice(0, MAX_CONVERSATIONS);
    const tx = db.transaction(STORE_CONVERSATIONS, 'readwrite');
    const store = tx.objectStore(STORE_CONVERSATIONS);
    // استبدال بسيط: امسح ثم أعد الكتابة للحفاظ على الحد
    await idbReq(store.clear());
    for (const item of limited) {
      store.put(item);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await setMeta(META_LAST_SYNC, new Date().toISOString());
  } catch {
    // لا نكسر مسار الشبكة إن فشل التخزين المحلي
  }
}

/** قراءة قائمة المحادثات المحفوظة (قد تكون فارغة). */
export async function getConversationsList(): Promise<ConversationListItem[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_CONVERSATIONS, 'readonly');
    const all = await idbReq(tx.objectStore(STORE_CONVERSATIONS).getAll());
    // ترتيب تقريبي: updatedAt تنازلي
    return (all as ConversationListItem[]).sort((a, b) =>
      (b.updatedAt || '').localeCompare(a.updatedAt || ''),
    );
  } catch {
    return [];
  }
}

/** حفظ رسائل محادثة واحدة (أحدث N رسالة بعد الترتيب الزمني التصاعدي للعرض). */
export async function saveMessagesForConversation(
  conversationId: string,
  items: Message[],
): Promise<void> {
  if (!conversationId) return;
  try {
    const db = await openDb();
    // items هنا بالترتيب التصاعدي (كما يعيدها useMessages بعد reverse)
    const limited =
      items.length > MAX_MESSAGES_PER_CONV
        ? items.slice(items.length - MAX_MESSAGES_PER_CONV)
        : items;
    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    tx.objectStore(STORE_MESSAGES).put({
      conversationId,
      items: limited,
      savedAt: new Date().toISOString(),
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

export async function getMessagesForConversation(
  conversationId: string,
): Promise<Message[] | null> {
  if (!conversationId) return null;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_MESSAGES, 'readonly');
    const row = await idbReq(
      tx.objectStore(STORE_MESSAGES).get(conversationId),
    );
    if (!row || !Array.isArray((row as { items?: Message[] }).items)) return null;
    return (row as { items: Message[] }).items;
  } catch {
    return null;
  }
}

export async function saveUnreadConversationCount(count: number): Promise<void> {
  await setMeta(META_UNREAD, count);
}

export async function getUnreadConversationCount(): Promise<number | null> {
  const v = await getMeta(META_UNREAD);
  return typeof v === 'number' ? v : null;
}

async function setMeta(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put({ key, value });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

async function getMeta(key: string): Promise<unknown> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_META, 'readonly');
    const row = await idbReq(tx.objectStore(STORE_META).get(key));
    return row ? (row as { value: unknown }).value : null;
  } catch {
    return null;
  }
}

/** مسح كل بيانات الرسائل المحلية (مثلاً عند تسجيل الخروج). */
export async function clearOfflineMessagesStore(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(
      [STORE_CONVERSATIONS, STORE_MESSAGES, STORE_META],
      'readwrite',
    );
    tx.objectStore(STORE_CONVERSATIONS).clear();
    tx.objectStore(STORE_MESSAGES).clear();
    tx.objectStore(STORE_META).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}
