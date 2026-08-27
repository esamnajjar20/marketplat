/**
 * Weak-network N1: gate background polling when the tab is hidden or offline.
 * Callers pass a base interval; SSE-connected sessions use a longer backup interval.
 */

import { isNotificationStreamConnected } from '@/hooks/useNotificationStream';

/** Whether periodic refetch / heartbeat should run right now. */
export function canBackgroundPoll(): boolean {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return false;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  return true;
}

/**
 * React Query `refetchInterval` helper.
 * @param baseMs normal interval when SSE is down
 * @param streamMultiplier stretch factor when live stream is connected (backup only)
 * @returns ms or `false` to pause polling
 */
export function pollingInterval(
  baseMs: number,
  streamMultiplier = 3,
): number | false {
  if (!canBackgroundPoll()) return false;
  if (isNotificationStreamConnected()) {
    return Math.max(baseMs * streamMultiplier, baseMs);
  }
  return baseMs;
}
