import { AppState, type AppStateStatus } from 'react-native';
import { syncOutboxIfReady, type GuardedOutboxSyncResult } from './outbox-sync';
import { syncNextMarketplaceRequest } from './request-outbox';
import { syncNextMarketplaceOrder } from './order-outbox';
import { syncNextRequestOffer } from './request-offer-outbox';
import { syncNextOfflineCreate } from './entity-create-outbox';

export type OutboxLifecycleSnapshot = {
  isOnline: boolean;
  token: string | null | undefined;
  ownerId?: string | null;
  csrfToken?: string | null;
};

export type OutboxLifecycleOptions = {
  /** Read the latest auth/connectivity state at every trigger; do not capture stale tokens. */
  getSnapshot: () => OutboxLifecycleSnapshot;
  /** Subscribe to the app's existing connectivity source (for example NetInfo). */
  subscribeConnectivity: (listener: () => void) => () => void;
  onResult?: (result: GuardedOutboxSyncResult) => void;
  onError?: (error: unknown) => void;
};

/**
 * Connect the guarded worker to foreground/resume and the application's network
 * observer without adding a second connectivity implementation. Calls are
 * coalesced by the worker; this lifecycle controller never persists credentials.
 */
export function startOutboxSyncLifecycle(options: OutboxLifecycleOptions): () => void {
  let stopped = false;
  let generation = 0;

  const trigger = async () => {
    if (stopped || AppState.currentState !== 'active') return;
    const currentGeneration = ++generation;
    try {
      // A single connectivity/resume event should drain a bounded batch, not
      // just one row; otherwise the rest of a queue can remain stuck until the
      // next unrelated lifecycle event. Queue capacity is 50, so this bound is
      // finite. Any non-success status (offline, auth, backoff, unsupported,
      // exhausted, or failure) stops the drain immediately and preserves FIFO.
      let lastResult: GuardedOutboxSyncResult | null = null;
      for (let processed = 0; processed < 50; processed += 1) {
        if (stopped || currentGeneration !== generation || AppState.currentState !== 'active') return;
        const snapshot = options.getSnapshot();
        if (!snapshot.isOnline || !snapshot.token?.trim()) {
          lastResult = await syncOutboxIfReady(snapshot);
          break;
        }
        const result = await syncOutboxIfReady(snapshot);
        lastResult = result;
        if (result.status !== 'sync-result' || result.result.status !== 'synced') break;
      }
      // Requests use their own durable table and the backend's X-Offline-Op-Id
      // idempotency ledger; process one after the ad queue on each lifecycle pass.
      if (!stopped && currentGeneration === generation) {
        const snapshot = options.getSnapshot();
        await syncNextMarketplaceRequest({ isOnline: snapshot.isOnline, token: snapshot.token, ownerId: snapshot.ownerId, csrfToken: snapshot.csrfToken });
        // Request offers use a dedicated durable queue and server-side idempotency key.
        if (!stopped && currentGeneration === generation) {
          const offerSnapshot = options.getSnapshot();
          await syncNextRequestOffer({ isOnline: offerSnapshot.isOnline, token: offerSnapshot.token, ownerId: offerSnapshot.ownerId, csrfToken: offerSnapshot.csrfToken });
        }
        // Marketplace orders use their own durable queue and server idempotency key.
        // Stock and price are revalidated transactionally by the server at sync time.
        if (!stopped && currentGeneration === generation) {
          const latestSnapshot = options.getSnapshot();
          await syncNextMarketplaceOrder({ isOnline: latestSnapshot.isOnline, token: latestSnapshot.token, ownerId: latestSnapshot.ownerId, csrfToken: latestSnapshot.csrfToken });
        }
        // Product, service-listing, and manual-sale creation share a durable queue;
        // all three endpoints accept X-Offline-Op-Id and deduplicate on the server.
        if (!stopped && currentGeneration === generation) {
          for (let processed = 0; processed < 50; processed += 1) {
            if (stopped || currentGeneration !== generation || AppState.currentState !== 'active') break;
            const createSnapshot = options.getSnapshot();
            const result = await syncNextOfflineCreate({ isOnline: createSnapshot.isOnline, token: createSnapshot.token, ownerId: createSnapshot.ownerId, csrfToken: createSnapshot.csrfToken });
            if (result !== 'synced') break;
          }
        }
      }
      if (!stopped && currentGeneration === generation && lastResult) options.onResult?.(lastResult);
    } catch (error) {
      if (!stopped && currentGeneration === generation) options.onError?.(error);
    }
  };

  const appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') void trigger();
  });
  const unsubscribeConnectivity = options.subscribeConnectivity(() => void trigger());
  void trigger();

  return () => {
    stopped = true;
    generation += 1;
    appStateSubscription.remove();
    unsubscribeConnectivity();
  };
}
