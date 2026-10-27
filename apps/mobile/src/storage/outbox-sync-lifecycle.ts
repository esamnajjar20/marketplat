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
      // Drain every durable queue in FIFO order on the same lifecycle event.
      // A single successful operation must not leave later offline operations
      // stranded until another unrelated network/foreground event.
      const drainQueue = async (
        sync: (snapshot: OutboxLifecycleSnapshot) => Promise<'synced' | 'nothing-due' | 'retry-scheduled' | 'login-required'>,
      ) => {
        for (let processed = 0; processed < 50; processed += 1) {
          if (stopped || currentGeneration !== generation || AppState.currentState !== 'active') return;
          const snapshot = options.getSnapshot();
          const result = await sync(snapshot);
          if (result !== 'synced') return;
        }
      };

      if (!stopped && currentGeneration === generation) {
        await drainQueue(snapshot => syncNextMarketplaceRequest({
          isOnline: snapshot.isOnline, token: snapshot.token, ownerId: snapshot.ownerId, csrfToken: snapshot.csrfToken,
        }));
      }
      if (!stopped && currentGeneration === generation) {
        await drainQueue(snapshot => syncNextRequestOffer({
          isOnline: snapshot.isOnline, token: snapshot.token, ownerId: snapshot.ownerId, csrfToken: snapshot.csrfToken,
        }));
      }
      if (!stopped && currentGeneration === generation) {
        await drainQueue(snapshot => syncNextMarketplaceOrder({
          isOnline: snapshot.isOnline, token: snapshot.token, ownerId: snapshot.ownerId, csrfToken: snapshot.csrfToken,
        }));
      }
      if (!stopped && currentGeneration === generation) {
        await drainQueue(snapshot => syncNextOfflineCreate({
          isOnline: snapshot.isOnline, token: snapshot.token, ownerId: snapshot.ownerId, csrfToken: snapshot.csrfToken,
        }));
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
