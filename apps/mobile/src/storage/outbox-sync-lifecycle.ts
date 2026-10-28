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

export type OutboxQueueName = 'mutations' | 'requests' | 'offers' | 'orders' | 'creates';

export type OutboxQueueSummary = {
  synced: number;
  reason: 'synced' | 'nothing-due' | 'retry-scheduled' | 'login-required' | 'skipped';
};

export type OutboxLifecycleOptions = {
  /** Read the latest auth/connectivity state at every trigger; do not capture stale tokens. */
  getSnapshot: () => OutboxLifecycleSnapshot;
  /** Subscribe to the app's existing connectivity source (for example NetInfo). */
  subscribeConnectivity: (listener: () => void) => () => void;
  /** Called once per trigger with a summary of every queue + the mutation-outbox result. */
  onResult?: (result: {
    mutations: GuardedOutboxSyncResult;
    queues: Record<OutboxQueueName, OutboxQueueSummary>;
  }) => void;
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
      let mutationsSynced = 0;
      for (let processed = 0; processed < 50; processed += 1) {
        if (stopped || currentGeneration !== generation || AppState.currentState !== 'active') return;
        const snapshot = options.getSnapshot();
        if (!snapshot.isOnline || !snapshot.token?.trim()) {
          lastResult = await syncOutboxIfReady(snapshot);
          break;
        }
        const result = await syncOutboxIfReady(snapshot);
        lastResult = result;
        if (result.status === 'sync-result' && result.result.status === 'synced') {
          mutationsSynced += 1;
          continue;
        }
        break;
      }

      // Drain every durable queue in FIFO order on the same lifecycle event.
      // Each queue aggregates its own count so callers can report "5 requests,
      // 2 orders synced" instead of a single generic message.
      const drainQueue = async (
        sync: (snapshot: OutboxLifecycleSnapshot) => Promise<'synced' | 'nothing-due' | 'retry-scheduled' | 'login-required'>,
      ): Promise<OutboxQueueSummary> => {
        let synced = 0;
        let lastReason: OutboxQueueSummary['reason'] = 'nothing-due';
        for (let processed = 0; processed < 50; processed += 1) {
          if (stopped || currentGeneration !== generation || AppState.currentState !== 'active') {
            lastReason = 'skipped';
            break;
          }
          const snapshot = options.getSnapshot();
          const result = await sync(snapshot);
          if (result === 'synced') {
            synced += 1;
            lastReason = 'synced';
            continue;
          }
          lastReason = result;
          break;
        }
        return { synced, reason: lastReason };
      };

      const queues: Record<OutboxQueueName, OutboxQueueSummary> = {
        mutations: { synced: 0, reason: 'nothing-due' },
        requests: { synced: 0, reason: 'nothing-due' },
        offers: { synced: 0, reason: 'nothing-due' },
        orders: { synced: 0, reason: 'nothing-due' },
        creates: { synced: 0, reason: 'nothing-due' },
      };

      // Mutation outbox is aggregated by its own loop above.
      queues.mutations.synced = mutationsSynced;
      if (lastResult) {
        queues.mutations.reason =
          lastResult.status === 'offline' ? 'skipped' :
          lastResult.status === 'login-required-before-sync' ? 'login-required' :
          lastResult.result.status === 'synced' ? 'synced' :
          lastResult.result.status === 'nothing-due' ? 'nothing-due' :
          lastResult.result.status === 'login-required' ? 'login-required' :
          'retry-scheduled';
      }

      if (!stopped && currentGeneration === generation) {
        queues.requests = await drainQueue(snapshot => syncNextMarketplaceRequest({
          isOnline: snapshot.isOnline, token: snapshot.token, ownerId: snapshot.ownerId, csrfToken: snapshot.csrfToken,
        }));
      }
      if (!stopped && currentGeneration === generation) {
        queues.offers = await drainQueue(snapshot => syncNextRequestOffer({
          isOnline: snapshot.isOnline, token: snapshot.token, ownerId: snapshot.ownerId, csrfToken: snapshot.csrfToken,
        }));
      }
      if (!stopped && currentGeneration === generation) {
        queues.orders = await drainQueue(snapshot => syncNextMarketplaceOrder({
          isOnline: snapshot.isOnline, token: snapshot.token, ownerId: snapshot.ownerId, csrfToken: snapshot.csrfToken,
        }));
      }
      if (!stopped && currentGeneration === generation) {
        queues.creates = await drainQueue(snapshot => syncNextOfflineCreate({
          isOnline: snapshot.isOnline, token: snapshot.token, ownerId: snapshot.ownerId, csrfToken: snapshot.csrfToken,
        }));
      }

      if (!stopped && currentGeneration === generation && lastResult) {
        options.onResult?.({ mutations: lastResult, queues });
      }
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
