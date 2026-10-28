/**
 * Weak-network N1: gate background polling when the tab is hidden or offline.
 * Callers pass a base interval; SSE-connected sessions use a longer backup interval.
 */

import { isNotificationStreamConnected } from '@/hooks/useNotificationStream';
import { getNetworkPolicy } from '@/lib/networkPolicy';

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
  pauseWhenStreamConnected = false,
): number | false {
  if (!canBackgroundPoll()) return false;

  // Stretch non-essential polling on constrained connections. This is a
  // multiplier on the caller's existing cadence, so freshness policies remain
  // intact while notifications/conversations avoid needlessly frequent reads.
  const policy = getNetworkPolicy();
  const networkMultiplier = policy.saveData || policy.tier === 'very-slow'
    ? 4
    : policy.tier === 'slow'
      ? 2
      : 1;
  const networkAdjustedBase = baseMs * networkMultiplier;

  if (isNotificationStreamConnected()) {
    if (pauseWhenStreamConnected) return false;
    return Math.max(networkAdjustedBase * streamMultiplier, networkAdjustedBase);
  }
  return networkAdjustedBase;
}
