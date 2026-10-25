import { ApiError } from '@/api/client';
import {
  acknowledgeMutation,
  claimMutation,
  getOldestOutboxMutation,
  listAllOutboxMutations,
  markMutationFailed,
  recoverExpiredOutboxLeases,
  type OutboxItem,
} from './mutation-outbox';
import { sendOutboxCreateAd, sendOutboxDeleteAd, sendOutboxUpdateAd } from './outbox-transport';
import { decideOutboxHeadAction } from './outbox-sync-policy';

const OUTBOX_LEASE_DURATION_MS = 60_000;
let activeSync: Promise<OutboxSyncResult> | null = null;

export type OutboxSyncResult =
  | { status: 'synced'; id: string; acknowledged: true }
  | { status: 'server-succeeded-local-ack-pending'; id: string; acknowledged: false }
  | { status: 'nothing-due' }
  | { status: 'waiting-for-retry'; id: string; nextAttemptAt: number }
  | { status: 'blocked-by-exhausted'; id: string; operation: string; attempts: number }
  | { status: 'already-processing'; id: string }
  | { status: 'blocked-by-unsupported'; id: string; operation: string; count: number }
  | { status: 'login-required'; id: string; message: string }
  | { status: 'retry-scheduled'; id: string; message: string };

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'تعذر مزامنة العملية دون اتصال.';
  return message.slice(0, 500);
}

/**
 * Process at most one due supported mutation (create/update/delete ad fields) per call. Caller should invoke this
 * only when the app is online and the user has an authenticated session. The
 * durable queue row is deleted only after a valid server response.
 */
async function runNextOutboxMutation(
  token: string | null | undefined,
  csrfToken?: string | null,
): Promise<OutboxSyncResult> {
  if (!token?.trim()) {
    throw new ApiError('سجّل الدخول قبل مزامنة الإعلانات المحفوظة دون اتصال.', 401);
  }

  // Always inspect the true queue head, not merely currently-due rows. Otherwise
  // a newer mutation could leapfrog an older row in backoff or one that exhausted
  // its retry budget, violating FIFO and potentially corrupting user intent.
  // Preserve strict FIFO ordering by making every decision from the true queue head.
  await recoverExpiredOutboxLeases();
  const candidate: OutboxItem | null = await getOldestOutboxMutation();
  const decision = decideOutboxHeadAction(candidate, Date.now());
  if (decision.status === 'nothing-due' || decision.status === 'already-processing' ||
      decision.status === 'blocked-by-exhausted' || decision.status === 'waiting-for-retry') {
    return decision;
  }
  if (decision.status === 'blocked-by-unsupported') {
    const all = await listAllOutboxMutations();
    return { ...decision, count: all.filter((item) => item.operation === 'update-ad').length };
  }
  if (!candidate || (decision.status !== 'send-create-ad' && decision.status !== 'send-delete-ad' && decision.status !== 'send-update-ad')) return { status: 'nothing-due' };

  // Lease ownership prevents a stale worker from acknowledging or failing a row
  // after another worker has recovered and reclaimed it.
  const leaseOwner = `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  const claimed = await claimMutation(candidate.id, leaseOwner, OUTBOX_LEASE_DURATION_MS);
  if (!claimed) {
    // Another trigger may have claimed the head between our read and UPDATE.
    // Re-read it and report contention rather than implying the queue is empty.
    const latestHead = await getOldestOutboxMutation();
    if (latestHead?.id === candidate.id && latestHead.state === 'processing') {
      return { status: 'already-processing', id: latestHead.id };
    }
    return { status: 'nothing-due' };
  }

  try {
    if (claimed.operation === 'create-ad') await sendOutboxCreateAd(claimed, token, csrfToken);
    else if (claimed.operation === 'delete-ad') await sendOutboxDeleteAd(claimed, token, csrfToken);
    else if (claimed.operation === 'update-ad') await sendOutboxUpdateAd(claimed, token, csrfToken);
    else throw new Error(`Unsupported outbox operation: ${claimed.operation}`);
  } catch (error) {
    const message = safeErrorMessage(error);
    await markMutationFailed(claimed.id, message, leaseOwner);
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return { status: 'login-required', id: claimed.id, message };
    }
    return { status: 'retry-scheduled', id: claimed.id, message };
  }

  // The API accepted the operation. If local acknowledgement fails, leave the
  // row recoverable; retrying the same idempotency key must not create a duplicate.
  const acknowledged = await acknowledgeMutation(claimed.id, leaseOwner);
  return acknowledged
    ? { status: 'synced', id: claimed.id, acknowledged: true }
    : { status: 'server-succeeded-local-ack-pending', id: claimed.id, acknowledged: false };
}

/** Coalesce concurrent triggers so app-resume and connectivity events cannot race. */
export function syncNextOutboxMutation(
  token: string | null | undefined,
  csrfToken?: string | null,
): Promise<OutboxSyncResult> {
  if (activeSync) return activeSync;
  const work = runNextOutboxMutation(token, csrfToken);
  activeSync = work;
  void work.finally(() => {
    if (activeSync === work) activeSync = null;
  }).catch(() => {
    // The caller receives the original rejection; this branch prevents an
    // unhandled rejection from the cleanup promise.
  });
  return work;
}

export type GuardedOutboxSyncResult =
  | { status: 'offline' }
  | { status: 'login-required-before-sync' }
  | { status: 'sync-result'; result: OutboxSyncResult };

/**
 * Guarded entry point for UI/app-lifecycle callers. The caller supplies the latest
 * connectivity and session snapshot; this function never stores credentials and
 * never claims a queue row while offline or signed out.
 */
export async function syncOutboxIfReady(input: {
  isOnline: boolean;
  token: string | null | undefined;
  csrfToken?: string | null;
}): Promise<GuardedOutboxSyncResult> {
  if (!input.isOnline) return { status: 'offline' };
  if (!input.token?.trim()) return { status: 'login-required-before-sync' };
  return {
    status: 'sync-result',
    result: await syncNextOutboxMutation(input.token, input.csrfToken),
  };
}
