import type * as OfflineAdDraftsModule from '@/lib/offlineAdDrafts';
/**
 * __tests__/unit/lib/offlineAdDrafts.test.ts
 *
 * تغطية الإصلاحات الثلاثة من تدقيق مركز المزامنة:
 *  - FIX AD-DRAFT-QUEUE-LINK-01: operationId يُحفَظ ويُقرَأ صح
 *    (findAdDraftByOperationId / markAdDraftByOperationId يحذف عند synced)
 *  - FIX AD-DRAFT-USER-SCOPE-01: listAdDrafts(userId) لا تُرجع مسودات
 *    مستخدم آخر، وسقف المسودات (MAX_DRAFTS) لكل مستخدم لا عالميًا
 *  - FIX AD-DRAFT-LOGOUT-DATALOSS-01: clearDraftOnlyAdDrafts تحذف
 *    status:'draft' فقط وتُبقي pending_sync/failed
 *
 * IndexedDB polyfill خفيف — لا fake-indexeddb (نفس نمط
 * offlineMessagesStore.test.ts، مع إضافة store.delete() المطلوبة هنا).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
  }

  class MemStore {
    constructor(private data: StoreData) {}
    put(value: unknown, key?: IDBValidKey) {
      const req = new MemRequest<IDBValidKey>();
      const k = key ?? (value as { id?: string }).id;
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
    delete(key: IDBValidKey) {
      const req = new MemRequest<undefined>();
      this.data.delete(key);
      req.resolve(undefined);
      return req as unknown as IDBRequest<undefined>;
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
      this.objectStoreNames = { contains: (n: string) => stores.has(n) };
    }
    createObjectStore(name: string) {
      if (!this.stores.has(name)) this.stores.set(name, new Map());
      return new MemStore(this.stores.get(name)!);
    }
    transaction(storeNames: string | string[]) {
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
    open(name: string) {
      const req = new MemRequest<MemDB>();
      if (!dbs.has(name)) dbs.set(name, new Map());
      const stores = dbs.get(name)!;
      const db = new MemDB(stores);
      queueMicrotask(() => {
        if (!stores.has('drafts')) db.createObjectStore('drafts');
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

describe('offlineAdDrafts', () => {
  let cleanup: () => void;
  // FIX TEST-TYPE-IMPORT-01: was `typeof import('@/lib/offlineAdDrafts')`
  // — the eslint rule @typescript-eslint/consistent-type-imports forbids
  // import() type annotations in favor of a top-level `import type`.
  // The runtime import is still dynamic (vi.resetModules + dynamic
  // import() in beforeEach); this only replaces the *type* reference.
  let lib: typeof OfflineAdDraftsModule;

  beforeEach(async () => {
    cleanup = installMemoryIndexedDB();
    vi.resetModules();
    lib = await import('@/lib/offlineAdDrafts');
  });

  afterEach(() => cleanup());

  const payload = { title: 'إعلان تجريبي', description: 'وصف' };

  it('round-trips operationId and userId through saveAdDraft/findAdDraftByOperationId', async () => {
    await lib.saveAdDraft({
      mode: 'create',
      payload,
      status: 'pending_sync',
      operationId: 'op-abc',
      userId: 'user-1',
    });

    const found = await lib.findAdDraftByOperationId('op-abc');
    expect(found).toBeTruthy();
    expect(found?.userId).toBe('user-1');
    expect(found?.status).toBe('pending_sync');
  });

  it('markAdDraftByOperationId deletes the draft when marked synced', async () => {
    await lib.saveAdDraft({ mode: 'create', payload, operationId: 'op-1', userId: 'u1', status: 'pending_sync' });
    await lib.markAdDraftByOperationId('op-1', { status: 'synced' });

    expect(await lib.findAdDraftByOperationId('op-1')).toBeNull();
  });

  it('markAdDraftByOperationId updates status + lastError on failure, without deleting', async () => {
    await lib.saveAdDraft({ mode: 'create', payload, operationId: 'op-2', userId: 'u1', status: 'pending_sync' });
    await lib.markAdDraftByOperationId('op-2', { status: 'failed', lastError: 'تعارض 409' });

    const found = await lib.findAdDraftByOperationId('op-2');
    expect(found?.status).toBe('failed');
    expect(found?.lastError).toBe('تعارض 409');
  });

  it('markAdDraftByOperationId is a no-op when no draft matches (message arrives for something else)', async () => {
    await expect(lib.markAdDraftByOperationId('op-none', { status: 'synced' })).resolves.toBeUndefined();
  });

  it('listAdDrafts(userId) only returns that user\'s drafts', async () => {
    await lib.saveAdDraft({ mode: 'create', payload, userId: 'user-1', status: 'draft' });
    await lib.saveAdDraft({ mode: 'create', payload, userId: 'user-2', status: 'draft' });

    const forUser1 = await lib.listAdDrafts('user-1');
    expect(forUser1).toHaveLength(1);
    expect(forUser1[0].userId).toBe('user-1');
  });

  it('listAdDrafts(undefined) returns drafts across all users (internal use only)', async () => {
    await lib.saveAdDraft({ mode: 'create', payload, userId: 'user-1', status: 'draft' });
    await lib.saveAdDraft({ mode: 'create', payload, userId: 'user-2', status: 'draft' });

    expect(await lib.listAdDrafts(undefined)).toHaveLength(2);
  });

  it('clearDraftOnlyAdDrafts removes status:"draft" but keeps pending_sync/failed', async () => {
    await lib.saveAdDraft({ mode: 'create', payload, userId: 'u1', status: 'draft' });
    const pending = await lib.saveAdDraft({ mode: 'create', payload, userId: 'u1', status: 'pending_sync' });
    const failed = await lib.saveAdDraft({ mode: 'create', payload, userId: 'u1', status: 'failed' });

    await lib.clearDraftOnlyAdDrafts();

    const remaining = await lib.listAdDrafts('u1');
    const remainingIds = remaining.map((d) => d.id).sort();
    expect(remainingIds).toEqual([pending.id, failed.id].sort());
  });

  it('clearAllAdDrafts (the old behaviour) still wipes everything unconditionally', async () => {
    await lib.saveAdDraft({ mode: 'create', payload, userId: 'u1', status: 'pending_sync' });
    await lib.clearAllAdDrafts();
    expect(await lib.listAdDrafts(undefined)).toHaveLength(0);
  });

  it('per-user draft cap (MAX_DRAFTS=20) does not evict another user\'s drafts', async () => {
    // user-2 has one important pending draft
    const other = await lib.saveAdDraft({ mode: 'create', payload, userId: 'user-2', status: 'pending_sync' });

    // user-1 floods past the cap
    for (let i = 0; i < 25; i++) {
      await lib.saveAdDraft({ mode: 'create', payload, userId: 'user-1', status: 'draft' });
    }

    const user1Drafts = await lib.listAdDrafts('user-1');
    expect(user1Drafts.length).toBeLessThanOrEqual(20);

    const user2Drafts = await lib.listAdDrafts('user-2');
    expect(user2Drafts.map((d) => d.id)).toContain(other.id);
  });

  it('defaults kind to "ad" when omitted (legacy drafts / ads path)', async () => {
    const d = await lib.saveAdDraft({ mode: 'create', payload, userId: 'u1', status: 'draft' });
    expect(d.kind).toBe('ad');
  });

  it('persists kind product/service through save + list', async () => {
    await lib.saveAdDraft({
      mode: 'create',
      kind: 'product',
      payload: { title: 'منتج', name: 'منتج', description: 'د' },
      userId: 'u1',
      status: 'pending_sync',
    });
    await lib.saveAdDraft({
      mode: 'create',
      kind: 'service',
      payload: { title: 'خدمة', description: 'د' },
      userId: 'u1',
      status: 'pending_sync',
    });

    const list = await lib.listAdDrafts('u1');
    const kinds = list.map((d) => d.kind).sort();
    expect(kinds).toEqual(['product', 'service']);
  });

  it('draftDisplayTitle prefers title, falls back to name, then placeholder', () => {
    expect(
      lib.draftDisplayTitle({
        id: '1',
        mode: 'create',
        payload: { title: 'عنوان', description: '' },
        status: 'draft',
        createdAt: '',
        updatedAt: '',
      }),
    ).toBe('عنوان');

    expect(
      lib.draftDisplayTitle({
        id: '2',
        mode: 'create',
        kind: 'product',
        payload: { title: '', name: 'اسم المنتج', description: '' },
        status: 'draft',
        createdAt: '',
        updatedAt: '',
      }),
    ).toBe('اسم المنتج');

    expect(
      lib.draftDisplayTitle({
        id: '3',
        mode: 'create',
        payload: { title: '  ', description: '' },
        status: 'draft',
        createdAt: '',
        updatedAt: '',
      }),
    ).toBe('مسودة بدون عنوان');
  });

  it('draftKindLabel maps kinds to Arabic labels and defaults missing to إعلان', () => {
    expect(lib.draftKindLabel('ad')).toBe('إعلان');
    expect(lib.draftKindLabel('product')).toBe('منتج');
    expect(lib.draftKindLabel('service')).toBe('خدمة');
    expect(lib.draftKindLabel(undefined)).toBe('إعلان');
    expect(lib.draftKindLabel(null)).toBe('إعلان');
  });

  it('MAX_DRAFTS housekeeping never evicts pending_sync or failed drafts', async () => {
    const pending = await lib.saveAdDraft({
      mode: 'create',
      payload: { title: 'pending', description: '' },
      userId: 'u1',
      status: 'pending_sync',
    });
    const failed = await lib.saveAdDraft({
      mode: 'create',
      payload: { title: 'failed', description: '' },
      userId: 'u1',
      status: 'failed',
    });

    for (let i = 0; i < 25; i++) {
      await lib.saveAdDraft({
        mode: 'create',
        payload: { title: `draft-${i}`, description: '' },
        userId: 'u1',
        status: 'draft',
      });
    }

    const ids = (await lib.listAdDrafts('u1')).map((d) => d.id);
    expect(ids).toContain(pending.id);
    expect(ids).toContain(failed.id);
  });

  it('MAX_DRAFTS cap is shared across kinds for the same user (not 20 per kind)', async () => {
    // 8 ads + 8 products + 8 services = 24 > 20 → oldest excess pruned overall
    for (let i = 0; i < 8; i++) {
      await lib.saveAdDraft({
        mode: 'create',
        kind: 'ad',
        payload: { title: `ad-${i}`, description: '' },
        userId: 'u1',
        status: 'draft',
      });
    }
    for (let i = 0; i < 8; i++) {
      await lib.saveAdDraft({
        mode: 'create',
        kind: 'product',
        payload: { title: `p-${i}`, name: `p-${i}`, description: '' },
        userId: 'u1',
        status: 'draft',
      });
    }
    for (let i = 0; i < 8; i++) {
      await lib.saveAdDraft({
        mode: 'create',
        kind: 'service',
        payload: { title: `s-${i}`, description: '' },
        userId: 'u1',
        status: 'draft',
      });
    }

    const all = await lib.listAdDrafts('u1');
    expect(all.length).toBeLessThanOrEqual(20);
  });
});
