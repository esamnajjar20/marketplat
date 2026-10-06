import { recordConnectionSnapshot, recordRequestCompleted, recordRequestStarted, type RequestFailureType } from './networkObservability';

/**
 * UX: connection quality from request timings + Network Information API.
 * Not a substitute for navigator.onLine — complements it for "slow vs offline".
 */

export type ConnectionQuality = 'fast' | 'slow' | 'offline' | 'unknown';

const MAX_SAMPLES = 5;
const FAST_MS = 1000;
/** Ignore sub-this timings — almost always Cache API / SW hits, not real RTT. */
const MIN_NETWORK_SAMPLE_MS = 80;

const samples: number[] = [];
/** Consecutive request failures / soft timeouts — used to pause warming. */
let consecutiveFailures = 0;
const listeners = new Set<() => void>();

/** Call when an API request fails or hits a soft timeout (not SW cache hits). */
export function recordRequestStartedSample(): void {
  recordRequestStarted();
}

export function recordRequestFailure(durationMs?: number, failureType: RequestFailureType = 'network'): void {
  if (failureType === 'network') consecutiveFailures += 1;
  recordRequestCompleted(durationMs ?? 0, false, failureType);
  notify();
}

/** Call when a network request succeeds (real RTT recorded). */
export function recordRequestSuccess(): void {
  consecutiveFailures = 0;
}

export function getConsecutiveFailures(): number {
  return consecutiveFailures;
}

/** True when recent traffic suggests the link cannot sustain background warming. */
export function shouldPauseWarming(): boolean {
  return consecutiveFailures >= 3;
}

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

/** Record a finished request duration (ms). Call from axios interceptors.
 * drop near-instant samples (SW/Cache API hits) so
 * they do not pull the average into 'fast' while the real network is slow. */
export function recordRequestTiming(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;

  // Every successful response counts toward request observability. Very fast
  // responses are still excluded from RTT samples because they are commonly
  // served by the Service Worker/Cache API rather than the network.
  recordRequestCompleted(durationMs, true);

  if (durationMs < MIN_NETWORK_SAMPLE_MS) return;
  samples.push(durationMs);
  while (samples.length > MAX_SAMPLES) samples.shift();
  // A measured network sample implies the request completed — clear failure streak.
  consecutiveFailures = 0;
  notify();
}

export function subscribeConnectionQuality(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// exported for the warming planner, which
// uses measured request timings to decide drip budget/cadence (see
// estimateKbps in offlineRouteShells). Not exported previously because
// only the internal getConnectionQuality used it.
export function getAverageRequestMs(): number | null {
  return averageMs();
}

function averageMs(): number | null {
  if (samples.length === 0) return null;
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

function fromEffectiveType(): ConnectionQuality | null {
  if (typeof navigator === 'undefined') return null;
  const conn = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  }).connection;
  if (!conn?.effectiveType) return null;
  const t = conn.effectiveType;
  if (t === 'slow-2g' || t === '2g') return 'slow';
  if (t === '3g') return 'slow';
  if (t === '4g') return 'fast';
  return null;
}

/**
 * Resolve quality:
 * 1) offline if navigator says so
 * 2) avg of last samples if available
 * 3) effectiveType fallback
 * 4) unknown
 */
export function getConnectionQuality(): ConnectionQuality {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const conn = typeof navigator !== 'undefined'
    ? (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean } }).connection
    : undefined;
  const avg = averageMs();
  const quality: ConnectionQuality = offline
    ? 'offline'
    : avg != null
      ? (avg < FAST_MS ? 'fast' : 'slow')
      : (fromEffectiveType() ?? 'unknown');

  recordConnectionSnapshot({
    tier: quality === 'offline' ? 'offline' : quality === 'slow' ? 'slow' : quality === 'fast' ? 'fast' : 'unknown',
    effectiveType: conn?.effectiveType ?? null,
    downlinkMbps: typeof conn?.downlink === 'number' ? conn.downlink : null,
    rttMs: typeof conn?.rtt === 'number' ? conn.rtt : avg,
    saveData: Boolean(conn?.saveData),
    consecutiveFailures,
  });
  return quality;
}

export function connectionQualityLabel(q: ConnectionQuality): string {
  switch (q) {
    case 'fast':
      return 'اتصال ممتاز';
    case 'slow':
      return 'اتصال بطيء';
    case 'offline':
      return 'لا يوجد اتصال';
    default:
      return 'جاري قياس الاتصال…';
  }
}

/** Rough ETA for replaying N queue items once online (client hint only). */
export function estimateSyncSeconds(pendingCount: number): number {
  if (pendingCount <= 0) return 0;
  const avg = averageMs() ?? 1500;
  // sequential replay + backoff cushion
  const perItem = Math.min(Math.max(avg / 1000, 0.8), 8);
  return Math.max(5, Math.round(pendingCount * perItem + 5));
}

export function formatSyncEta(pendingCount: number): string {
  if (pendingCount <= 0) return '';
  const sec = estimateSyncSeconds(pendingCount);
  if (sec < 60) return `~${sec} ثانية`;
  const min = Math.round(sec / 60);
  return `~${min} دقيقة`;
}

export { getNetworkObservabilitySnapshot, subscribeNetworkObservability } from './networkObservability';
