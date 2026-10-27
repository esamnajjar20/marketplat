import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock react-native AppState BEFORE importing the module under test ──
const appStateMock = vi.hoisted(() => {
  let state = 'active';
  return {
    get currentState() { return state; },
    __setState: (s: string) => { state = s; },
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  };
});

vi.mock('react-native', () => ({ AppState: appStateMock }));

// ── Mock all sync functions ──
vi.mock('@/storage/outbox-sync', () => ({ syncOutboxIfReady: vi.fn() }));
vi.mock('@/storage/request-outbox', () => ({ syncNextMarketplaceRequest: vi.fn() }));
vi.mock('@/storage/order-outbox', () => ({ syncNextMarketplaceOrder: vi.fn() }));
vi.mock('@/storage/request-offer-outbox', () => ({ syncNextRequestOffer: vi.fn() }));
vi.mock('@/storage/entity-create-outbox', () => ({ syncNextOfflineCreate: vi.fn() }));

import { startOutboxSyncLifecycle } from '@/storage/outbox-sync-lifecycle';
import { syncOutboxIfReady } from '@/storage/outbox-sync';
import { syncNextMarketplaceRequest } from '@/storage/request-outbox';
import { syncNextMarketplaceOrder } from '@/storage/order-outbox';
import { syncNextRequestOffer } from '@/storage/request-offer-outbox';
import { syncNextOfflineCreate } from '@/storage/entity-create-outbox';

// ── Helpers ──
const flush = () => new Promise<void>((r) => setTimeout(r, 15));

const SNAP = { isOnline: true, token: 'tok', ownerId: 'user-1', csrfToken: 'csrf' };
const SYNCED = {
  status: 'sync-result' as const,
  result: { status: 'synced' as const, id: 'x', acknowledged: true as const },
};
const NOTHING = {
  status: 'sync-result' as const,
  result: { status: 'nothing-due' as const },
};

function setup(overrides?: {
  onResult?: ReturnType<typeof vi.fn>;
  onError?: ReturnType<typeof vi.fn>;
  snapshot?: typeof SNAP;
}) {
  const onResult = overrides?.onResult ?? vi.fn();
  const onError = overrides?.onError ?? vi.fn();
  const snapshot = overrides?.snapshot ?? SNAP;
  const cleanup = startOutboxSyncLifecycle({
    getSnapshot: () => snapshot,
    subscribeConnectivity: () => () => undefined,
    onResult,
    onError,
  });
  return { cleanup, onResult, onError };
}

// ── Tests ──
describe('startOutboxSyncLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appStateMock.__setState('active');
    vi.mocked(syncOutboxIfReady).mockResolvedValue(NOTHING);
    vi.mocked(syncNextMarketplaceRequest).mockResolvedValue('nothing-due');
    vi.mocked(syncNextRequestOffer).mockResolvedValue('nothing-due');
    vi.mocked(syncNextMarketplaceOrder).mockResolvedValue('nothing-due');
    vi.mocked(syncNextOfflineCreate).mockResolvedValue('nothing-due');
  });

  it('does nothing when app is not active', async () => {
    appStateMock.__setState('background');
    const { cleanup, onResult } = setup();
    await flush();
    expect(onResult).not.toHaveBeenCalled();
    cleanup();
  });

  it('drains mutations queue until a non-synced status', async () => {
    vi.mocked(syncOutboxIfReady)
      .mockResolvedValueOnce(SYNCED)
      .mockResolvedValueOnce(SYNCED)
      .mockResolvedValueOnce(NOTHING);
    const { cleanup } = setup();
    await flush();
    expect(syncOutboxIfReady).toHaveBeenCalledTimes(3);
    cleanup();
  });

  it('drains requests queue and aggregates synced count', async () => {
    vi.mocked(syncNextMarketplaceRequest)
      .mockResolvedValueOnce('synced')
      .mockResolvedValueOnce('synced')
      .mockResolvedValueOnce('retry-scheduled');
    const { cleanup, onResult } = setup();
    await flush();
    const agg = onResult.mock.calls[0][0];
    expect(agg.queues.requests.synced).toBe(2);
    expect(agg.queues.requests.reason).toBe('retry-scheduled');
    cleanup();
  });

  it('stops a queue at first retry-scheduled', async () => {
    vi.mocked(syncNextRequestOffer).mockResolvedValueOnce('retry-scheduled');
    const { cleanup, onResult } = setup();
    await flush();
    const agg = onResult.mock.calls[0][0];
    expect(agg.queues.offers.synced).toBe(0);
    expect(agg.queues.offers.reason).toBe('retry-scheduled');
    // retry-scheduled stops the loop after first call
    expect(syncNextRequestOffer).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('aggregates counts across all 4 queues independently', async () => {
    vi.mocked(syncOutboxIfReady).mockResolvedValueOnce(SYNCED).mockResolvedValueOnce(NOTHING);
    vi.mocked(syncNextMarketplaceRequest).mockResolvedValueOnce('synced').mockResolvedValueOnce('nothing-due');
    vi.mocked(syncNextRequestOffer).mockResolvedValueOnce('synced').mockResolvedValueOnce('nothing-due');
    vi.mocked(syncNextMarketplaceOrder).mockResolvedValueOnce('nothing-due');
    vi.mocked(syncNextOfflineCreate).mockResolvedValueOnce('synced').mockResolvedValueOnce('nothing-due');
    const { cleanup, onResult } = setup();
    await flush();
    const agg = onResult.mock.calls[0][0];
    expect(agg.queues.requests.synced).toBe(1);
    expect(agg.queues.offers.synced).toBe(1);
    expect(agg.queues.orders.synced).toBe(0);
    expect(agg.queues.creates.synced).toBe(1);
    cleanup();
  });

  it('handles offline snapshot gracefully (mutation returns offline)', async () => {
    vi.mocked(syncOutboxIfReady).mockResolvedValueOnce({ status: 'offline' });
    const { cleanup, onResult } = setup({ snapshot: { ...SNAP, isOnline: false } });
    await flush();
    expect(onResult).toHaveBeenCalledTimes(1);
    const agg = onResult.mock.calls[0][0];
    expect(agg.mutations.status).toBe('offline');
    cleanup();
  });

  it('calls onError when a sync throws', async () => {
    vi.mocked(syncNextMarketplaceOrder).mockRejectedValueOnce(new Error('boom'));
    const { cleanup, onError } = setup();
    await flush();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    cleanup();
  });
});
