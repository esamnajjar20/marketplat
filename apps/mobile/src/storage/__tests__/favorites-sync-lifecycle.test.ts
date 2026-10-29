import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock favorites.store and favorites.api BEFORE imports ──
const store = vi.hoisted(() => ({
  acknowledgeFavoriteState: vi.fn(),
  listPendingFavoriteStates: vi.fn(),
  writeFavoriteAdIds: vi.fn(),
  findFavoriteState: vi.fn().mockResolvedValue(null), // إضافة الدالة المفقودة
}));

const api = vi.hoisted(() => ({
  fetchFavoriteAdIds: vi.fn(),
  setFavoriteAdState: vi.fn(),
}));

vi.mock('@/features/ads/favorites.store', () => store);
vi.mock('@/features/ads/favorites.api', () => api);

import {
  syncFavoritesIfReady,
  invalidateFavoritesSyncSession,
  type FavoritesSyncSnapshot,
} from '@/features/ads/favorites-sync-lifecycle';

const SNAP: FavoritesSyncSnapshot = {
  isOnline: true,
  isActive: true,
  userId: 'user-1',
  token: 'tok',
  csrfToken: 'csrf',
};

function pending(adId: string, favorited: boolean, operationId = `op-${adId}`) {
  return { userId: 'user-1', adId, favorited, operationId } as any;
}

describe('favorites-sync-lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.acknowledgeFavoriteState.mockReset();
    store.listPendingFavoriteStates.mockReset();
    store.writeFavoriteAdIds.mockReset();
    api.fetchFavoriteAdIds.mockReset();
    api.setFavoriteAdState.mockReset();
  });

  // ── Skip conditions ─────────────────────────────────────────────
  it('skips when offline', async () => {
    const r = await syncFavoritesIfReady({ ...SNAP, isOnline: false });
    expect(r.status).toBe('skipped');
    if (r.status === 'skipped') expect(r.reason).toBe('offline');
  });

  it('skips when inactive', async () => {
    const r = await syncFavoritesIfReady({ ...SNAP, isActive: false });
    expect(r.status).toBe('skipped');
    if (r.status === 'skipped') expect(r.reason).toBe('inactive');
  });

  it('skips when signed out', async () => {
    const r = await syncFavoritesIfReady({ ...SNAP, userId: null, token: null });
    expect(r.status).toBe('skipped');
    if (r.status === 'skipped') expect(r.reason).toBe('signed-out');
  });

  // ── Empty queue ─────────────────────────────────────────────────
  it('reconciles server state when queue empty', async () => {
    store.listPendingFavoriteStates.mockResolvedValueOnce([]); // initial
    store.listPendingFavoriteStates.mockResolvedValueOnce([]); // after while loop
    store.listPendingFavoriteStates.mockResolvedValueOnce([]); // after fetch (newerPending)
    api.fetchFavoriteAdIds.mockResolvedValue(['ad-1', 'ad-2']);
    store.writeFavoriteAdIds.mockResolvedValue(undefined);

    const r = await syncFavoritesIfReady(SNAP);
    expect(r.status).toBe('synced');
    if (r.status === 'synced') {
      expect(r.pendingAcknowledged).toBe(0);
      expect(r.favoriteCount).toBe(2);
    }
    expect(store.writeFavoriteAdIds).toHaveBeenCalledWith(['ad-1', 'ad-2'], 'user-1');
  });

  // ── Pending operations ──────────────────────────────────────────
  it('sends one pending op, acknowledges, then reconciles', async () => {
    const op = pending('ad-1', true);
    // Flow: initial → [op] | current (same opId) → [op] | remaining → [] | newerPending → []
    store.listPendingFavoriteStates
      .mockResolvedValueOnce([op])   // initial
      .mockResolvedValueOnce([op])   // current check (must match operationId)
      .mockResolvedValueOnce([])     // end of while (after ack)
      .mockResolvedValueOnce([]);    // newerPending after fetch
    api.setFavoriteAdState.mockResolvedValue(undefined);
    store.acknowledgeFavoriteState.mockResolvedValue(true);
    api.fetchFavoriteAdIds.mockResolvedValue(['ad-1']);
    store.writeFavoriteAdIds.mockResolvedValue(undefined);

    const r = await syncFavoritesIfReady(SNAP);
    expect(r.status).toBe('synced');
    if (r.status === 'synced') {
      expect(r.pendingAcknowledged).toBe(1);
      expect(r.favoriteCount).toBe(1);
    }
    expect(api.setFavoriteAdState).toHaveBeenCalledWith('ad-1', true, 'tok', 'op-ad-1', 'csrf');
  });

  it('returns deferred when new tap arrives during fetch', async () => {
    const newerOp = pending('ad-2', false);
    // Flow: initial [] → while skipped → fetch → newerPending [newerOp] → deferred
    store.listPendingFavoriteStates
      .mockResolvedValueOnce([])         // initial (empty)
      .mockResolvedValueOnce([newerOp]); // newerPending after fetch
    api.fetchFavoriteAdIds.mockResolvedValue(['ad-1']);
    store.writeFavoriteAdIds.mockResolvedValue(undefined);

    const r = await syncFavoritesIfReady(SNAP);
    expect(r.status).toBe('deferred');
    if (r.status === 'deferred') {
      expect(r.reason).toMatch(/وصل تغيير جديد/);
    }
    // Merge: serverIds=['ad-1'] + newerOp(unfav ad-2, not in set) → still ['ad-1']
    expect(store.writeFavoriteAdIds).toHaveBeenCalledWith(['ad-1'], 'user-1');
  });

  // ── Session invalidation ────────────────────────────────────────
  it('returns deferred when session invalidated mid-sync', async () => {
    const op = pending('ad-1', true);
    // Flow: initial [op] → current check must return [op] with SAME opId → proceeds to send
    store.listPendingFavoriteStates
      .mockResolvedValueOnce([op])    // initial
      .mockResolvedValueOnce([op]);   // current check (must match operationId)
    api.setFavoriteAdState.mockImplementation(async () => {
      invalidateFavoritesSyncSession();  // session changes while HTTP in flight
    });
    store.acknowledgeFavoriteState.mockResolvedValue(true);
    api.fetchFavoriteAdIds.mockResolvedValue([]);
    store.writeFavoriteAdIds.mockResolvedValue(undefined);

    const r = await syncFavoritesIfReady(SNAP);
    expect(r.status).toBe('deferred');
    if (r.status === 'deferred') {
      expect(r.reason).toMatch(/تغيّرت جلسة تسجيل الدخول/);
    }
  });

  // ── Cross-account guard ─────────────────────────────────────────
  it('skips ops belonging to a different account', async () => {
    const foreign = { userId: 'other-user', adId: 'ad-x', favorited: true, operationId: 'op-x' } as any;
    store.listPendingFavoriteStates
      .mockResolvedValueOnce([foreign])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    api.fetchFavoriteAdIds.mockResolvedValue([]);
    store.writeFavoriteAdIds.mockResolvedValue(undefined);

    const r = await syncFavoritesIfReady(SNAP);
    expect(r.status).toBe('synced');
    // Foreign op never sent
    expect(api.setFavoriteAdState).not.toHaveBeenCalled();
  });

  // ── Stale intent protection ─────────────────────────────────────
  it('skips op when newer tap replaced it before sending', async () => {
    const op = pending('ad-1', true, 'op-old');
    const newer = pending('ad-1', false, 'op-new');

    // Flow:
    //   call 1: initial → [op-old]
    //   pass 1, op-old: call 2 → [newer] (different opId → skip op-old, op-new not sent yet)
    //   call 3: end of pass 1 → [newer]
    //   pass 2, newer: call 4 → [newer] (same opId → send)
    //   call 5: end of pass 2 → []
    //   fetch → []
    //   call 6: newerPending → []
    //   synced
    store.listPendingFavoriteStates
      .mockResolvedValueOnce([op])       // initial
      .mockResolvedValueOnce([newer])    // current for op-old (different opId → skip)
      .mockResolvedValueOnce([newer])    // end of pass 1
      .mockResolvedValueOnce([newer])    // current for newer (same opId → send)
      .mockResolvedValueOnce([])         // end of pass 2 (empty)
      .mockResolvedValueOnce([])         // newerPending
      .mockResolvedValue([]);            // safety net

    api.setFavoriteAdState.mockResolvedValue(undefined);
    store.acknowledgeFavoriteState.mockResolvedValue(true);
    api.fetchFavoriteAdIds.mockResolvedValue([]);
    store.writeFavoriteAdIds.mockResolvedValue(undefined);

    const r = await syncFavoritesIfReady(SNAP);
    expect(r.status).toBe('synced');

    const sentOpIds = api.setFavoriteAdState.mock.calls.map((c) => c[3]);
    expect(sentOpIds).not.toContain('op-old');
    expect(sentOpIds).toContain('op-new');
  });

  // ── Concurrency guard ───────────────────────────────────────────
  it('returns same promise when called concurrently for same user', async () => {
    store.listPendingFavoriteStates.mockResolvedValue([]);
    api.fetchFavoriteAdIds.mockResolvedValue([]);
    store.writeFavoriteAdIds.mockResolvedValue(undefined);

    const p1 = syncFavoritesIfReady(SNAP);
    const p2 = syncFavoritesIfReady(SNAP);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.status).toBe('synced');
    expect(r2.status).toBe('synced');
    // fetchFavoriteAdIds should be called exactly once (coalesced)
    expect(api.fetchFavoriteAdIds).toHaveBeenCalledTimes(1);
  });

  // ── Error handling ──────────────────────────────────────────────
  it('returns deferred on API error', async () => {
    store.listPendingFavoriteStates.mockResolvedValue([]);
    api.fetchFavoriteAdIds.mockRejectedValueOnce(new Error('network down'));

    const r = await syncFavoritesIfReady(SNAP);
    expect(r.status).toBe('deferred');
    if (r.status === 'deferred') {
      expect(r.reason).toBe('network down');
    }
  });
});
