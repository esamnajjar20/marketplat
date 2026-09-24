/**
 * PHASE-4: surface server conflicts (409/412) from the offline queue.
 * Strategy: last-write-wins is already what a successful retry does;
 * when the server rejects, we notify the user to review or discard.
 */

import { toast } from 'sonner';
import {
  QUEUE_EVENT_TYPES,
  isConflictFailure,
  type QueuedRequestSummary,
} from '@/lib/offlineQueue';

let installed = false;

/**
 * Call once from OfflineBootstrap (client). Listens for SW queue messages.
 */
/**
 * SW-CONFLICT-TOAST-BATCH-01: batch conflicts into a single toast.
 *
 * Before: every QUEUE_ITEM_FAILED that resolved as a conflict fired its
 * own toast. A user who queued 8 items offline and reconnected to a
 * server that had moved on got 8 toasts stacked in ~2 seconds — each
 * identical, each pushing the previous offscreen. Very confusing and
 * entirely avoidable.
 *
 * Now: conflicts are accumulated during a 1.5s debounce window and
 * surfaced as ONE toast with a count. The most recent conflict's
 * message is used as the description; if there are multiple, the
 * count is prepended.
 *
 * The action button links to /settings/sync so the user has a direct
 * path to review or discard — previously the toast only told them to
 * "go to the sync center", with no way there.
 */

let pendingConflicts: string[] = [];
let conflictToastTimer: ReturnType<typeof setTimeout> | null = null;
const CONFLICT_BATCH_WINDOW_MS = 1500;

function flushConflictToast(): void {
  const conflicts = pendingConflicts;
  pendingConflicts = [];
  conflictToastTimer = null;
  if (conflicts.length === 0) return;

  const summary = conflicts[conflicts.length - 1];
  const description =
    conflicts.length === 1
      ? summary
      : `${conflicts.length} عمليات متعارضة — آخرها: ${summary}`;

  // Lazy import to avoid a hard dependency at module load — the
  // conflict resolver is initialized on every page but the toast
  // path only runs when a conflict actually occurs.
  void import('@/components/shared/ui/Button').then(() => {
    toast.error('تعارض مع نسخة السيرفر', {
      description,
      duration: 8000,
      action: {
        label: 'راجع',
        onClick: () => {
          if (typeof window !== 'undefined') {
            window.location.assign('/settings/sync');
          }
        },
      },
    });
  });
}

function enqueueConflict(message: string | undefined): void {
  pendingConflicts.push(
    message ||
      'البيانات تغيّرت على السيرفر. راجع العنصر من مركز المزامنة أو احذف العملية.',
  );
  if (conflictToastTimer) clearTimeout(conflictToastTimer);
  conflictToastTimer = setTimeout(flushConflictToast, CONFLICT_BATCH_WINDOW_MS);
}

export function initConflictResolver(): void {
  if (typeof window === 'undefined' || installed) return;
  installed = true;

  navigator.serviceWorker?.addEventListener('message', (event: MessageEvent) => {
    const data = event.data;
    if (!data || data.type !== 'QUEUE_ITEM_FAILED') return;
    if (!QUEUE_EVENT_TYPES.includes(data.type)) return;

    const item: QueuedRequestSummary = {
      id: data.id,
      url: data.url ?? '',
      method: data.method ?? 'POST',
      // Not used by isConflictFailure — the check is purely on the
      // status code — but kept truthful rather than a misleading
      // Date.now().
      queuedAt: data.queuedAt ?? Date.now(),
      status: 'failed',
      lastError: {
        status: data.status ?? 0,
        message: data.message,
      },
      operationId: data.operationId ?? null,
    };

    if (!isConflictFailure(item)) return;

    enqueueConflict(item.lastError?.message);
  });
}
