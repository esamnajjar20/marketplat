/**
 * __tests__/unit/lib/offlineAdDraftSync.test.ts
 *
 * before this, a QUEUE_ITEM_SENT/FAILED
 * message from the SW and the ad draft it corresponds to were two
 * completely unlinked systems (see audit — permanently-stuck "awaiting
 * upload" drafts even after the underlying ad had actually published).
 * These tests cover the listener that reconciles them by operationId.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { markAdDraftByOperationId, deleteAdDraftByOperationId } from '@/lib/offlineAdDrafts';

vi.mock('@/lib/offlineAdDrafts', () => ({
  markAdDraftByOperationId: vi.fn().mockResolvedValue(undefined),
  deleteAdDraftByOperationId: vi.fn().mockResolvedValue(undefined),
}));

// captured after initAdDraftSync() registers its listener
let capturedListener: ((event: { data: unknown }) => void) | null = null;

function setupServiceWorkerMock() {
  const swContainer = {
    addEventListener: vi.fn((evt: string, cb: (event: { data: unknown }) => void) => {
      if (evt === 'message') capturedListener = cb;
    }),
  };
  Object.defineProperty(window.navigator, 'serviceWorker', {
    value: swContainer,
    configurable: true,
  });
  return swContainer;
}

async function importFresh() {
  // initAdDraftSync() installs its listener only once per module
  // instance (module-level `installed` flag) — reset modules between
  // tests so each test gets a fresh, uninstalled listener.
  vi.resetModules();
  const mod = await import('@/lib/offlineAdDraftSync');
  return mod;
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedListener = null;
});

describe('initAdDraftSync', () => {
  it('does nothing when serviceWorker is not supported (no throw)', async () => {
    // @ts-expect-error deliberately removing the property for this case
    delete window.navigator.serviceWorker;
    const { initAdDraftSync } = await importFresh();
    expect(() => initAdDraftSync()).not.toThrow();
  });

  it('registers a single message listener even if called twice', async () => {
    const sw = setupServiceWorkerMock();
    const { initAdDraftSync } = await importFresh();
    initAdDraftSync();
    initAdDraftSync();
    expect(sw.addEventListener).toHaveBeenCalledTimes(1);
  });

  it('QUEUE_ITEM_SENT with an operationId marks the matching draft as synced', async () => {
    setupServiceWorkerMock();
    const { initAdDraftSync } = await importFresh();
    initAdDraftSync();
    expect(capturedListener).toBeTruthy();

    capturedListener!({ data: { type: 'QUEUE_ITEM_SENT', operationId: 'op-1', id: 1, url: '/ads' } });
    await vi.waitFor(() => expect(markAdDraftByOperationId).toHaveBeenCalledWith('op-1', { status: 'synced' }));
  });

  it('QUEUE_ITEM_FAILED marks the matching draft as failed with the error message', async () => {
    setupServiceWorkerMock();
    const { initAdDraftSync } = await importFresh();
    initAdDraftSync();

    capturedListener!({
      data: { type: 'QUEUE_ITEM_FAILED', operationId: 'op-2', status: 409, message: 'تعارض بالبيانات' },
    });
    await vi.waitFor(() =>
      expect(markAdDraftByOperationId).toHaveBeenCalledWith('op-2', {
        status: 'failed',
        lastError: 'تعارض بالبيانات',
      }),
    );
  });

  it('QUEUE_ITEM_FAILED falls back to a status-based message when none is given', async () => {
    setupServiceWorkerMock();
    const { initAdDraftSync } = await importFresh();
    initAdDraftSync();

    capturedListener!({ data: { type: 'QUEUE_ITEM_FAILED', operationId: 'op-3', status: 500 } });
    await vi.waitFor(() =>
      expect(markAdDraftByOperationId).toHaveBeenCalledWith('op-3', {
        status: 'failed',
        lastError: 'رُفض الطلب (500)',
      }),
    );
  });

  it('QUEUE_ITEM_DISCARDED deletes the matching draft (not mark-as-synced)', async () => {
    setupServiceWorkerMock();
    const { initAdDraftSync } = await importFresh();
    initAdDraftSync();

    capturedListener!({ data: { type: 'QUEUE_ITEM_DISCARDED', operationId: 'op-4' } });
    await vi.waitFor(() => expect(deleteAdDraftByOperationId).toHaveBeenCalledWith('op-4'));
    expect(markAdDraftByOperationId).not.toHaveBeenCalled();
  });

  it('ignores messages without an operationId (e.g. unrelated queue activity)', async () => {
    setupServiceWorkerMock();
    const { initAdDraftSync } = await importFresh();
    initAdDraftSync();

    capturedListener!({ data: { type: 'QUEUE_ITEM_SENT', id: 5, url: '/messages/123' } });
    await new Promise((r) => setTimeout(r, 0));
    expect(markAdDraftByOperationId).not.toHaveBeenCalled();
    expect(deleteAdDraftByOperationId).not.toHaveBeenCalled();
  });

  it('ignores malformed messages (no type field) without throwing', async () => {
    setupServiceWorkerMock();
    const { initAdDraftSync } = await importFresh();
    initAdDraftSync();

    expect(() => capturedListener!({ data: { foo: 'bar' } })).not.toThrow();
    expect(() => capturedListener!({ data: null })).not.toThrow();
  });
});
