/**
 * __tests__/unit/lib/offlineQueue.test.ts
 *
 * Phase 1 / P0: offlineQueue.ts previously had 0% coverage.
 * The real queue lives in IndexedDB (public/sw.js); this module only
 * counts pending rows and asks the SW to replay. Tests mock IDB + SW.
 *
 * IndexedDB request handlers (onsuccess/onerror/onupgradeneeded) are
 * assigned by production code *after* open() returns, so the mock must
 * fire those events on a later macrotask (setTimeout) — not microtask —
 * or the handlers are still null when the event runs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getQueuedRequestCount, requestQueueReplay } from '@/lib/offlineQueue';

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

    it('returns the object-store count on success', async () => {
      const countReq: FakeIDBRequest = {
        result: 3,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      const store = {
        count: vi.fn(() => {
          scheduleSuccess(countReq);
          return countReq;
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

      await expect(getQueuedRequestCount()).resolves.toBe(3);
      expect(db.transaction).toHaveBeenCalledWith('requests', 'readonly');
      expect(store.count).toHaveBeenCalled();
    });

    it('creates the object store on upgradeneeded when missing', async () => {
      const createObjectStore = vi.fn();
      const countReq: FakeIDBRequest = {
        result: 0,
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
            count: () => {
              scheduleSuccess(countReq);
              return countReq;
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

    it('returns 0 when the count request fails', async () => {
      const countReq: FakeIDBRequest = {
        result: 0,
        error: new Error('count failed'),
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      const db = {
        objectStoreNames: { contains: () => true },
        transaction: vi.fn(() => ({
          objectStore: () => ({
            count: () => {
              scheduleError(countReq);
              return countReq;
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
