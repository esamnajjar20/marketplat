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
export function initConflictResolver(): void {
  if (typeof window === 'undefined' || installed) return;
  installed = true;

  navigator.serviceWorker?.addEventListener('message', (event: MessageEvent) => {
    const data = event.data;
    if (!data || !QUEUE_EVENT_TYPES.includes(data.type)) return;

    if (data.type !== 'QUEUE_ITEM_FAILED') return;

    const item: QueuedRequestSummary = {
      id: data.id,
      url: data.url ?? '',
      method: data.method ?? 'POST',
      queuedAt: Date.now(),
      status: 'failed',
      lastError: {
        status: data.status ?? 0,
        message: data.message,
      },
      operationId: data.operationId ?? null,
    };

    if (!isConflictFailure(item)) return;

    toast.error('تعارض مع نسخة السيرفر', {
      description:
        item.lastError?.message ||
        'البيانات تغيّرت على السيرفر. راجع العنصر من مركز المزامنة أو احذف العملية.',
      duration: 8000,
    });
  });
}
