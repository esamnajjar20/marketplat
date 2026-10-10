/**
 * __tests__/unit/lib/offlineQueue.test.ts
 *
 * getQueuedRequestCount switched from a raw store.count()
 * to getAll()+filter so it can exclude status:'failed' rows (see lib/offlineQueue.ts
 * for why raw count() was actively misleading). Tests below mock getAll()
 * instead of count() accordingly, and cover the new pending/failed split and
 * the generic failed-request retry/discard helpers.
 *
 * IndexedDB request handlers (onsuccess/onerror/onupgradeneeded) are
 * assigned by production code *after* open() returns, so the mock must
 * fire those events on a later macrotask (setTimeout) — not microtask —
 * or the handlers are still null when the event runs.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  getQueuedRequestCount,
  getQueuedRequestCounts,
  listFailedRequests,
  retryFailedRequest,
  discardFailedRequest,
  requestQueueReplay,
  enqueueOfflineMutationFallback,
} from '@/lib/offlineQueue';

interface FakeIDBRequest {
  result: unknown;
  error: unknown;
  onsuccess: ((ev?: unknown) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  onupgradeneeded: ((ev?: unknown) => void) | null;
}

function scheduleSuccess(req: FakeIDBRequest, beforeSuccess?: () => void) {
  setTimeout(() => {
    beforeSuccess?.();
    req.onsuccess?.(undefined);
  }, 0);
}

function scheduleError(req: FakeIDBRequest) {
  setTimeout(() => {
    req.onerror?.(undefined);
  }, 0);
}

/** يبني mock كامل لـ indexedDB.open يرجّع getAll() بنتيجة `rows` معطاة. */
function mockIndexedDbWithRows(rows: unknown[]) {
  const getAllReq: FakeIDBRequest = {
    result: rows,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  };
  const store = {
    getAll: vi.fn(() => {
      scheduleSuccess(getAllReq);
      return getAllReq;
    }),
  };
  const tx = { objectStore: vi.fn(() => store) };
  const db = {
    objectStoreNames: { contains: () => true },
    transaction: vi.fn(() => tx),
  };
  const openReq: FakeIDBRequest = {
    result: db,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  };
  Object.defineProperty(globalThis, 'indexedDB', {
    value: {
      open: vi.fn(() => {
        scheduleSuccess(openReq);
        return openReq;
      }),
    },
    configurable: true,
    writable: true,
  });
  return { db, store };
}

describe('offlineQueue', () => {
  const originalIndexedDB = globalThis.indexedDB;
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    window.localStorage.setItem('marketplace-auth', JSON.stringify({ state: { user: { id: 'user-a' } } }));
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', {
      value: originalIndexedDB,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
    window.localStorage.removeItem('marketplace-auth');
  });

  describe('enqueueOfflineMutationFallback', () => {
    const baseInput = {
      url: '/api/v1/ads/ad-1',
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: 'Bearer never-store-this' },
      body: JSON.stringify({ title: 'edited offline' }),
      ownerUserId: 'user-a',
      needsAuth: true,
      needsCsrf: true,
    };

    it('refuses to queue work owned by a different account', async () => {
      await expect(enqueueOfflineMutationFallback({ ...baseInput, ownerUserId: 'user-b' }))
        .resolves.toMatchObject({ queued: false, reason: 'missing-or-stale-owner' });
    });

    it('persists an owned mutation without persisting live auth or CSRF tokens', async () => {
      const stored: Array<Record<string, unknown>> = [];
      const tx: Record<string, unknown> = {
        objectStore: () => ({ add: (entry: Record<string, unknown>) => { stored.push(entry); return {}; } }),
        oncomplete: null,
        onerror: null,
        onabort: null,
      };
      const db = {
        objectStoreNames: { contains: () => true },
        transaction: () => {
          queueMicrotask(() => (tx.oncomplete as (() => void) | null)?.());
          return tx;
        },
        close: vi.fn(),
      };
      const openReq: FakeIDBRequest = { result: db, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      Object.defineProperty(globalThis, 'indexedDB', {
        value: { open: vi.fn(() => { scheduleSuccess(openReq); return openReq; }) },
        configurable: true,
        writable: true,
      });

      await expect(enqueueOfflineMutationFallback(baseInput)).resolves.toMatchObject({ queued: true });
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ status: 'pending', ownerUserId: 'user-a', method: 'PATCH' });
      const storedHeaders = stored[0]?.headers as Record<string, string>;
      expect(storedHeaders.authorization).toBeUndefined();
      expect(storedHeaders['x-csrf-token']).toBeUndefined();
      expect(stored[0]?.body).toBe(baseInput.body);
    });

    it('does not queue authentication, presence, analytics, or batch transport calls', async () => {
      for (const url of [
        '/api/v1/auth/login',
        '/api/v1/users/me/presence',
        '/api/v1/analytics/events',
        '/api/v1/batch',
      ]) {
        await expect(enqueueOfflineMutationFallback({ ...baseInput, url }))
          .resolves.toMatchObject({ queued: false, reason: 'non-queueable-endpoint' });
      }
    });

    it('rejects bodies beyond the documented queue budget instead of claiming they were saved', async () => {
      const oversized = new Blob([new Uint8Array(6 * 1024 * 1024 + 1)]);
      await expect(enqueueOfflineMutationFallback({ ...baseInput, body: oversized }))
        .resolves.toMatchObject({ queued: false, reason: 'body-too-large' });
    });
  });

  describe('getQueuedRequestCount', () => {
    it('returns 0 when indexedDB is unavailable', async () => {
      Object.defineProperty(globalThis, 'indexedDB', {
        value: undefined,
        configurable: true,
        writable: true,
      });

      await expect(getQueuedRequestCount()).resolves.toBe(0);
    });

    it('counts only pending rows, excluding status:failed', async () => {
      mockIndexedDbWithRows([
        { ownerUserId: 'user-a', id: 1, url: 'https://api.example.com/ads', method: 'POST', queuedAt: 1, status: 'pending' },
        { ownerUserId: 'user-a', id: 2, url: 'https://api.example.com/ads/2', method: 'PATCH', queuedAt: 2, status: 'failed' },
        // no status field at all () — must still count as pending.
        { ownerUserId: 'user-a', id: 3, url: 'https://api.example.com/ads/3', method: 'DELETE', queuedAt: 3 },
      ]);

      await expect(getQueuedRequestCount()).resolves.toBe(2);
    });

    it('creates the object store on upgradeneeded when missing', async () => {
      const createObjectStore = vi.fn();
      const getAllReq: FakeIDBRequest = {
        result: [],
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      const db = {
        objectStoreNames: { contains: () => false },
        createObjectStore,
        transaction: vi.fn(() => ({
          objectStore: () => ({
            getAll: () => {
              scheduleSuccess(getAllReq);
              return getAllReq;
            },
          }),
        })),
      };
      const openReq: FakeIDBRequest = {
        result: db,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      Object.defineProperty(globalThis, 'indexedDB', {
        value: {
          open: vi.fn(() => {
            scheduleSuccess(openReq, () => {
              openReq.onupgradeneeded?.(undefined);
            });
            return openReq;
          }),
        },
        configurable: true,
        writable: true,
      });

      await expect(getQueuedRequestCount()).resolves.toBe(0);
      expect(createObjectStore).toHaveBeenCalledWith('requests', {
        keyPath: 'id',
        autoIncrement: true,
      });
    });

    it('returns 0 when the open request fails', async () => {
      const openReq: FakeIDBRequest = {
        result: null,
        error: new Error('open failed'),
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      Object.defineProperty(globalThis, 'indexedDB', {
        value: {
          open: vi.fn(() => {
            scheduleError(openReq);
            return openReq;
          }),
        },
        configurable: true,
        writable: true,
      });

      await expect(getQueuedRequestCount()).resolves.toBe(0);
    });

    it('returns 0 when the getAll request fails', async () => {
      const getAllReq: FakeIDBRequest = {
        result: [],
        error: new Error('getAll failed'),
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      const db = {
        objectStoreNames: { contains: () => true },
        transaction: vi.fn(() => ({
          objectStore: () => ({
            getAll: () => {
              scheduleError(getAllReq);
              return getAllReq;
            },
          }),
        })),
      };
      const openReq: FakeIDBRequest = {
        result: db,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      Object.defineProperty(globalThis, 'indexedDB', {
        value: {
          open: vi.fn(() => {
            scheduleSuccess(openReq);
            return openReq;
          }),
        },
        configurable: true,
        writable: true,
      });

      await expect(getQueuedRequestCount()).resolves.toBe(0);
    });
  });

  describe('getQueuedRequestCounts', () => {
    it('splits pending vs failed', async () => {
      mockIndexedDbWithRows([
        { ownerUserId: 'user-a', id: 1, url: 'https://api.example.com/ads', method: 'POST', queuedAt: 1, status: 'pending' },
        { ownerUserId: 'user-a', id: 2, url: 'https://api.example.com/ads/2', method: 'PATCH', queuedAt: 2, status: 'failed' },
        { ownerUserId: 'user-a', id: 3, url: 'https://api.example.com/ads/3', method: 'PATCH', queuedAt: 3, status: 'failed' },
      ]);

      await expect(getQueuedRequestCounts()).resolves.toEqual({ pending: 1, failed: 2 });
    });

    it('returns zeros when indexedDB is unavailable', async () => {
      Object.defineProperty(globalThis, 'indexedDB', {
        value: undefined,
        configurable: true,
        writable: true,
      });

      await expect(getQueuedRequestCounts()).resolves.toEqual({ pending: 0, failed: 0 });
    });
  });

  describe('listFailedRequests', () => {
    it('returns failed non-message rows only, oldest first', async () => {
      mockIndexedDbWithRows([
        {
          ownerUserId: 'user-a',
          id: 5,
          url: 'https://api.example.com/api/v1/ads/5',
          method: 'PATCH',
          queuedAt: 200,
          status: 'failed',
          lastError: { status: 403, message: 'محظور' },
        },
        {
          // رسالة محادثة فاشلة — يجب استبعادها (لها واجهتها الخاصة بالفقاعة).
          ownerUserId: 'user-a',
          id: 6,
          url: 'https://api.example.com/api/v1/conversations/conv-1/messages',
          method: 'POST',
          queuedAt: 50,
          status: 'failed',
        },
        {
          ownerUserId: 'user-a',
          id: 4,
          url: 'https://api.example.com/api/v1/products/4',
          method: 'DELETE',
          queuedAt: 100,
          status: 'failed',
        },
        {
          ownerUserId: 'user-a',
          id: 7,
          url: 'https://api.example.com/api/v1/ads/7',
          method: 'POST',
          queuedAt: 300,
          status: 'pending',
        },
      ]);

      const result = await listFailedRequests();
      expect(result.map((r) => r.id)).toEqual([4, 5]);
      expect(result[1].lastError).toEqual({ status: 403, message: 'محظور' });
    });

    it('returns an empty list when indexedDB is unavailable', async () => {
      Object.defineProperty(globalThis, 'indexedDB', {
        value: undefined,
        configurable: true,
        writable: true,
      });

      await expect(listFailedRequests()).resolves.toEqual([]);
    });
  });

  describe('retryFailedRequest / discardFailedRequest', () => {
    it('retryFailedRequest posts RETRY_QUEUE_ITEM with the given id', async () => {
      const postMessage = vi.fn();
      Object.defineProperty(globalThis, 'navigator', {
        value: { serviceWorker: { ready: Promise.resolve({ active: { postMessage } }) } },
        configurable: true,
        writable: true,
      });

      await retryFailedRequest(9);
      expect(postMessage).toHaveBeenCalledWith({ type: 'RETRY_QUEUE_ITEM', id: 9, ownerUserId: 'user-a' });
    });

    it('discardFailedRequest posts DISCARD_QUEUE_ITEM with the given id', async () => {
      const postMessage = vi.fn();
      Object.defineProperty(globalThis, 'navigator', {
        value: { serviceWorker: { ready: Promise.resolve({ active: { postMessage } }) } },
        configurable: true,
        writable: true,
      });

      await discardFailedRequest(9);
      expect(postMessage).toHaveBeenCalledWith({ type: 'DISCARD_QUEUE_ITEM', id: 9, ownerUserId: 'user-a' });
    });

    it('both no-op when serviceWorker is not supported', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      });

      await expect(retryFailedRequest(1)).resolves.toBeUndefined();
      await expect(discardFailedRequest(1)).resolves.toBeUndefined();
    });
  });

  describe('requestQueueReplay', () => {
    it('no-ops when serviceWorker is not supported', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      });

      await expect(requestQueueReplay()).resolves.toBeUndefined();
    });

    it('posts REPLAY_QUEUE_NOW to the active service worker', async () => {
      const postMessage = vi.fn();
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          serviceWorker: {
            ready: Promise.resolve({ active: { postMessage } }),
          },
        },
        configurable: true,
        writable: true,
      });

      await requestQueueReplay();

      expect(postMessage).toHaveBeenCalledWith({ type: 'REPLAY_QUEUE_NOW' });
    });

    it('tolerates a registration with no active worker', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          serviceWorker: {
            ready: Promise.resolve({ active: null }),
          },
        },
        configurable: true,
        writable: true,
      });

      await expect(requestQueueReplay()).resolves.toBeUndefined();
    });
  });
});
