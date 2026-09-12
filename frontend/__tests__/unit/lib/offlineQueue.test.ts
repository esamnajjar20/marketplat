/**
 * __tests__/unit/lib/offlineQueue.test.ts
 *
 * FIX QUEUE-COUNT-01: getQueuedRequestCount switched from a raw store.count()
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
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getQueuedRequestCount,
  getQueuedRequestCounts,
  listFailedRequests,
  retryFailedRequest,
  discardFailedRequest,
  requestQueueReplay,
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
        { id: 1, url: 'https://api.example.com/ads', method: 'POST', queuedAt: 1, status: 'pending' },
        { id: 2, url: 'https://api.example.com/ads/2', method: 'PATCH', queuedAt: 2, status: 'failed' },
        // no status field at all (legacy row) — must still count as pending.
        { id: 3, url: 'https://api.example.com/ads/3', method: 'DELETE', queuedAt: 3 },
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
        { id: 1, url: 'https://api.example.com/ads', method: 'POST', queuedAt: 1, status: 'pending' },
        { id: 2, url: 'https://api.example.com/ads/2', method: 'PATCH', queuedAt: 2, status: 'failed' },
        { id: 3, url: 'https://api.example.com/ads/3', method: 'PATCH', queuedAt: 3, status: 'failed' },
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
          id: 5,
          url: 'https://api.example.com/api/v1/ads/5',
          method: 'PATCH',
          queuedAt: 200,
          status: 'failed',
          lastError: { status: 403, message: 'محظور' },
        },
        {
          // رسالة محادثة فاشلة — يجب استبعادها (لها واجهتها الخاصة بالفقاعة).
          id: 6,
          url: 'https://api.example.com/api/v1/conversations/conv-1/messages',
          method: 'POST',
          queuedAt: 50,
          status: 'failed',
        },
        {
          id: 4,
          url: 'https://api.example.com/api/v1/products/4',
          method: 'DELETE',
          queuedAt: 100,
          status: 'failed',
        },
        {
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
      expect(postMessage).toHaveBeenCalledWith({ type: 'RETRY_QUEUE_ITEM', id: 9 });
    });

    it('discardFailedRequest posts DISCARD_QUEUE_ITEM with the given id', async () => {
      const postMessage = vi.fn();
      Object.defineProperty(globalThis, 'navigator', {
        value: { serviceWorker: { ready: Promise.resolve({ active: { postMessage } }) } },
        configurable: true,
        writable: true,
      });

      await discardFailedRequest(9);
      expect(postMessage).toHaveBeenCalledWith({ type: 'DISCARD_QUEUE_ITEM', id: 9 });
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
