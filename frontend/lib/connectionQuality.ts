/**
 * PHASE-1 UX: connection quality from request timings + Network Information API.
 * Not a substitute for navigator.onLine — complements it for "slow vs offline".
 */

export type ConnectionQuality = 'fast' | 'slow' | 'offline' | 'unknown';

const MAX_SAMPLES = 5;
const FAST_MS = 1000;
const SLOW_MS = 3000;

const samples: number[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

/** Record a finished request duration (ms). Call from axios interceptors. */
export function recordRequestTiming(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  samples.push(durationMs);
  while (samples.length > MAX_SAMPLES) samples.shift();
  notify();
}

export function subscribeConnectionQuality(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
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
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'offline';
  }

  const avg = averageMs();
  if (avg != null) {
    if (avg < FAST_MS) return 'fast';
    if (avg < SLOW_MS) return 'slow';
    return 'slow';
  }

  return fromEffectiveType() ?? 'unknown';
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
