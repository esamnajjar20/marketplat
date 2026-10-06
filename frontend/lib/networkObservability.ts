export type NetworkTier = 'offline' | 'very-slow' | 'slow' | 'normal' | 'fast' | 'unknown';

export type NetworkObservabilitySnapshot = {
  measuredAt: number;
  requests: {
    total: number;
    successful: number;
    failed: number;
    networkFailures: number;
    httpFailures: number;
    retries: number;
    averageMs: number | null;
    lastMs: number | null;
    p95Ms: number | null;
  };
  uploads: {
    attempts: number;
    successful: number;
    failed: number;
    lastFailureAt: number | null;
  };
  queue: {
    drains: number;
    completedDrains: number;
    itemsSent: number;
    itemsFailed: number;
    stillOffline: number;
    lastDrainAt: number | null;
    lastDrainDurationMs: number | null;
  };
  connection: {
    tier: NetworkTier;
    effectiveType: string | null;
    downlinkMbps: number | null;
    rttMs: number | null;
    saveData: boolean;
    consecutiveFailures: number;
  };
};

const MAX_REQUEST_SAMPLES = 40;
const requestDurations: number[] = [];
const listeners = new Set<() => void>();

const state = {
  requests: { total: 0, successful: 0, failed: 0, networkFailures: 0, httpFailures: 0, retries: 0 },
  uploads: { attempts: 0, successful: 0, failed: 0, lastFailureAt: null as number | null },
  queue: {
    drains: 0,
    completedDrains: 0,
    itemsSent: 0,
    itemsFailed: 0,
    stillOffline: 0,
    lastDrainAt: null as number | null,
    lastDrainDurationMs: null as number | null,
  },
  connection: {
    tier: 'unknown' as NetworkTier,
    effectiveType: null as string | null,
    downlinkMbps: null as number | null,
    rttMs: null as number | null,
    saveData: false,
    consecutiveFailures: 0,
  },
};

function notify() {
  listeners.forEach((listener) => {
    try { listener(); } catch { /* observability must never affect app flow */ }
  });
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index] ?? null;
}

export function recordRequestStarted(): void {
  state.requests.total += 1;
}

export type RequestFailureType = 'network' | 'http';

export function recordRequestCompleted(
  durationMs: number,
  success: boolean,
  failureType?: RequestFailureType,
): void {
  if (Number.isFinite(durationMs) && durationMs > 0) {
    requestDurations.push(durationMs);
    while (requestDurations.length > MAX_REQUEST_SAMPLES) requestDurations.shift();
  }
  if (success) {
    state.requests.successful += 1;
  } else {
    state.requests.failed += 1;
    if (failureType === 'network') state.requests.networkFailures += 1;
    else if (failureType === 'http') state.requests.httpFailures += 1;
  }
  notify();
}

export function recordRequestRetry(): void {
  state.requests.retries += 1;
  notify();
}

export function recordUploadAttempt(): void {
  state.uploads.attempts += 1;
}

export function recordUploadResult(success: boolean): void {
  if (success) state.uploads.successful += 1;
  else {
    state.uploads.failed += 1;
    state.uploads.lastFailureAt = Date.now();
  }
  notify();
}

export type QueueDrainResult = {
  durationMs?: number;
  sent?: number;
  failed?: number;
  stillOffline?: boolean;
};

export function recordQueueDrainStarted(): void {
  state.queue.drains += 1;
  state.queue.lastDrainAt = Date.now();
  notify();
}

export function recordQueueDrainCompleted(result: QueueDrainResult = {}): void {
  state.queue.completedDrains += 1;
  state.queue.itemsSent += Math.max(0, result.sent ?? 0);
  state.queue.itemsFailed += Math.max(0, result.failed ?? 0);
  if (result.stillOffline) state.queue.stillOffline += 1;
  if (Number.isFinite(result.durationMs)) state.queue.lastDrainDurationMs = Math.max(0, result.durationMs!);
  notify();
}

export function recordConnectionSnapshot(snapshot: {
  tier: NetworkTier;
  effectiveType?: string | null;
  downlinkMbps?: number | null;
  rttMs?: number | null;
  saveData?: boolean;
  consecutiveFailures?: number;
}): void {
  state.connection = {
    tier: snapshot.tier,
    effectiveType: snapshot.effectiveType ?? null,
    downlinkMbps: snapshot.downlinkMbps ?? null,
    rttMs: snapshot.rttMs ?? null,
    saveData: Boolean(snapshot.saveData),
    consecutiveFailures: Math.max(0, snapshot.consecutiveFailures ?? 0),
  };
  notify();
}

export function getNetworkObservabilitySnapshot(): NetworkObservabilitySnapshot {
  const totalMs = requestDurations.reduce((sum, value) => sum + value, 0);
  return {
    measuredAt: Date.now(),
    requests: {
      ...state.requests,
      averageMs: requestDurations.length ? totalMs / requestDurations.length : null,
      lastMs: requestDurations.at(-1) ?? null,
      p95Ms: percentile(requestDurations, 0.95),
    },
    uploads: { ...state.uploads },
    queue: { ...state.queue },
    connection: { ...state.connection },
  };
}

export function subscribeNetworkObservability(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetNetworkObservabilityForTests(): void {
  requestDurations.length = 0;
  state.requests = { total: 0, successful: 0, failed: 0, networkFailures: 0, httpFailures: 0, retries: 0 };
  state.uploads = { attempts: 0, successful: 0, failed: 0, lastFailureAt: null };
  state.queue = {
    drains: 0,
    completedDrains: 0,
    itemsSent: 0,
    itemsFailed: 0,
    stillOffline: 0,
    lastDrainAt: null,
    lastDrainDurationMs: null,
  };
  state.connection = {
    tier: 'unknown',
    effectiveType: null,
    downlinkMbps: null,
    rttMs: null,
    saveData: false,
    consecutiveFailures: 0,
  };
}
