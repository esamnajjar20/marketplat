/**
 * PHASE-4: classify offline queue operations so critical work drains first.
 * Mirrored in public/sw.js (cannot import this module from the SW).
 */

export type QueuePriority = 'critical' | 'normal' | 'low';

const CRITICAL_FRAGMENTS = [
  '/messages',
  '/conversations',
  '/auth/',
  '/payments',
  '/checkout',
];

const LOW_FRAGMENTS = [
  '/analytics',
  '/views',
  '/presence',
  '/heartbeat',
];

export function classifyQueuePriority(url: string, method = 'POST'): QueuePriority {
  const u = String(url || '').toLowerCase();
  const m = String(method || 'POST').toUpperCase();

  if (CRITICAL_FRAGMENTS.some((f) => u.includes(f))) return 'critical';
  if (LOW_FRAGMENTS.some((f) => u.includes(f))) return 'low';
  // Mutations on catalog entities are normal priority
  if (m === 'GET' || m === 'HEAD') return 'low';
  return 'normal';
}

export function queuePriorityRank(priority: QueuePriority): number {
  if (priority === 'critical') return 0;
  if (priority === 'normal') return 1;
  return 2;
}

export function queuePriorityLabel(priority: QueuePriority): string {
  switch (priority) {
    case 'critical':
      return 'عاجل';
    case 'normal':
      return 'عادي';
    default:
      return 'منخفض';
  }
}
