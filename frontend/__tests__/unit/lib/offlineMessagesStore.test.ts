/**
 * __tests__/unit/lib/offlineMessagesStore.test.ts
 *
 * اختبارات IndexedDB لمخزن الرسائل دون اتصال.
 * تستخدم fake-indexeddb إن وُجدت، وإلا polyfill خفيف مبني على Map.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ConversationListItem, Message } from '@/types/conversation.types';

// ── Minimal IndexedDB polyfill (no extra dependency required) ─────
type StoreData = Map<IDBValidKey, unknown>;

function installMemoryIndexedDB() {
  const dbs = new Map<string, Map<string, StoreData>>();

  class MemRequest<T> implements Partial<IDBRequest<T>> {
    result!: T;
    error: DOMException | null = null;
    onsuccess: ((this: IDBRequest<T>, ev: Event) => unknown) | null = null;
    onerror: ((this: IDBRequest<T>, ev: Event) => unknown) | null = null;
    readyState: IDBRequestReadyState = 'pending';
    resolve(value: T) {
      this.result = value;
      this.readyState = 'done';
      queueMicrotask(() => this.onsuccess?.call(this as IDBRequest<T>, {} as Event));
    }
    reject(err: DOMException) {
      this.error = err;
      this.readyState = 'done';
      queueMicrotask(() => this.onerror?.call(this as IDBRequest<T>, {} as Event));
    }
  }

  class MemStore {
    constructor(private data: StoreData) {}
    put(value: unknown, key?: IDBValidKey) {
      const req = new MemRequest<IDBValidKey>();
      const k =
        key ??
        ((value as { id?: string; conversationId?: string; key?: string }).id ??
          (value as { conversationId?: string }).conversationId ??
          (value as { key?: string }).key);
      this.data.set(k as IDBValidKey, value);
      req.resolve(k as IDBValidKey);
      return req as unknown as IDBRequest<IDBValidKey>;
    }
    get(key: IDBValidKey) {
      const req = new MemRequest<unknown>();
      req.resolve(this.data.get(key));
      return req as unknown as IDBRequest<unknown>;
    }
    getAll() {
      const req = new MemRequest<unknown[]>();
      req.resolve([...this.data.values()]);
      return req as unknown as IDBRequest<unknown[]>;
    }
    clear() {
      const req = new MemRequest<undefined>();
      this.data.clear();
      req.resolve(undefined);
      return req as unknown as IDBRequest<undefined>;
    }
  }

  class MemTx {
    oncomplete: (() => void) | null = null;
    onerror: (() => void) | null = null;
    error: DOMException | null = null;
    private stores: Map<string, MemStore>;
    constructor(stores: Map<string, MemStore>) {
      this.stores = stores;
      queueMicrotask(() => this.oncomplete?.());
    }
    objectStore(name: string) {
      return this.stores.get(name)!;
    }
  }

  class MemDB {
    objectStoreNames: { contains: (n: string) => boolean };
    private stores: Map<string, StoreData>;
    constructor(stores: Map<string, StoreData>) {
      this.stores = stores;
      this.objectStoreNames = {
        contains: (n: string) => stores.has(n),
      };
    }
    createObjectStore(name: string) {
      if (!this.stores.has(name)) this.stores.set(name, new Map());
      return new MemStore(this.stores.get(name)!);
    }
    transaction(storeNames: string | string[], _mode?: IDBTransactionMode) {
      const names = Array.isArray(storeNames) ? storeNames : [storeNames];
      const map = new Map<string, MemStore>();
      for (const n of names) {
        if (!this.stores.has(n)) this.stores.set(n, new Map());
        map.set(n, new MemStore(this.stores.get(n)!));
      }
      return new MemTx(map) as unknown as IDBTransaction;
    }
  }

  const indexedDB = {
    open(name: string, _version?: number) {
      const req = new MemRequest<MemDB>();
      if (!dbs.has(name)) dbs.set(name, new Map());
      const stores = dbs.get(name)!;
      const db = new MemDB(stores);
      // fire upgrade then success
      queueMicrotask(() => {
        const upgradeTargets = ['conversations', 'messages', 'meta'];
        for (const s of upgradeTargets) {
          if (!stores.has(s)) db.createObjectStore(s);
        }
        (req as MemRequest<MemDB> & { onupgradeneeded?: (() => void) | null }).onupgradeneeded?.();
        req.resolve(db);
      });
      return req as unknown as IDBOpenDBRequest;
    },
  };

  vi.stubGlobal('indexedDB', indexedDB);
  return () => {
    dbs.clear();
    vi.unstubAllGlobals();
  };
}

describe('offlineMessagesStore', () => {
  let cleanup: () => void;

  beforeEach(async () => {
    cleanup = installMemoryIndexedDB();
    // dynamic import after IDB is stubbed so openDb sees the polyfill
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
  });

  it('saves and reads conversations list including empty array', async () => {
    const {
      saveConversationsList,
      getConversationsList,
    } = await import('@/lib/offlineMessagesStore');

    const sample = [
      {
        id: 'c1',
        adId: null,
        serviceRequestId: null,
        buyerId: 'b1',
        sellerId: 's1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
        ad: null,
        serviceRequest: null,
        buyer: { id: 'b1', name: 'Buyer', avatarUrl: null },
        seller: { id: 's1', name: 'Seller', avatarUrl: null },
        unreadCount: 1,
        lastMessage: null,
      },
    ] as ConversationListItem[];

    await saveConversationsList(sample);
    const got = await getConversationsList();
    expect(got).toHaveLength(1);
    expect(got[0].id).toBe('c1');

    // empty list must clear previous data (FIX OFFLINE-MSG-EMPTY-01)
    await saveConversationsList([]);
    const empty = await getConversationsList();
    expect(empty).toHaveLength(0);
  });

  it('saves and reads messages per conversation including empty', async () => {
    const {
      saveMessagesForConversation,
      getMessagesForConversation,
    } = await import('@/lib/offlineMessagesStore');

    const msgs = [
      {
        id: 'm1',
        conversationId: 'c1',
        senderId: 'b1',
        body: 'hello',
        readAt: null,
        deletedAt: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ] as Message[];

    await saveMessagesForConversation('c1', msgs);
    const got = await getMessagesForConversation('c1');
    expect(got).toHaveLength(1);
    expect(got![0].body).toBe('hello');

    await saveMessagesForConversation('c1', []);
    const cleared = await getMessagesForConversation('c1');
    expect(cleared).toEqual([]);
  });

  it('persists and clears unread count via clearOfflineMessagesStore', async () => {
    const {
      saveUnreadConversationCount,
      getUnreadConversationCount,
      clearOfflineMessagesStore,
    } = await import('@/lib/offlineMessagesStore');

    await saveUnreadConversationCount(7);
    expect(await getUnreadConversationCount()).toBe(7);

    await clearOfflineMessagesStore();
    expect(await getUnreadConversationCount()).toBeNull();
  });
});
