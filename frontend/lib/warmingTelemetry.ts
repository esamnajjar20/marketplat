'use client';

/**
 * W8 — privacy-friendly warming ROI telemetry.
 *
 * Stored locally only. No URLs, payloads, tokens or response bodies are
 * recorded. Metrics answer three operational questions:
 *   1. what warming actually ran;
 *   2. how much estimated/observed transfer it consumed;
 *   3. did a warmed route get used afterwards?
 */

const KEY = 'marketplat:warming-telemetry:v1';
const MAX_EVENTS = 120;
const USEFUL_WINDOW_MS = 24 * 60 * 60 * 1000;

export type WarmingTelemetryEvent = {
  ts: number;
  kind: 'job' | 'transfer' | 'route-warm' | 'route-use';
  id: string;
  ok?: boolean;
  requests?: number;
  bytes?: number;
  durationMs?: number;
  source?: 'estimated' | 'observed';
};

function read(): WarmingTelemetryEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.slice(-MAX_EVENTS) : [];
  } catch {
    return [];
  }
}

function append(event: WarmingTelemetryEvent): void {
  try {
    const next = [...read(), event].slice(-MAX_EVENTS);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Telemetry must never affect warming.
  }
}

export function recordWarmingJob(input: Omit<WarmingTelemetryEvent, 'ts' | 'kind'>): void {
  append({ ...input, ts: Date.now(), kind: 'job' });
}

export function recordWarmingTransfer(id: string, bytes: number): void {
  if (!Number.isFinite(bytes) || bytes <= 0) return;
  append({ ts: Date.now(), kind: 'transfer', id, bytes: Math.round(bytes), source: 'observed' });
}

export function recordWarmedRoute(route: string, bytes = 0): void {
  append({
    ts: Date.now(), kind: 'route-warm', id: route,
    ...(bytes > 0 ? { bytes: Math.round(bytes), source: 'observed' as const } : {}),
  });
}

export function recordRouteUse(route: string): void {
  append({ ts: Date.now(), kind: 'route-use', id: route });
}

export function getWarmingTelemetrySnapshot(): {
  events: readonly WarmingTelemetryEvent[];
  usefulRoutes: number;
  warmedRoutes: number;
  observedBytes: number;
  estimatedBytes: number;
  failedJobs: number;
} {
  const events = read();
  const warmed = new Map<string, number>();
  const used = new Set<string>();
  let observedBytes = 0;
  let estimatedBytes = 0;
  let failedJobs = 0;

  for (const event of events) {
    if (event.kind === 'route-warm') warmed.set(event.id, event.ts);
    if (event.kind === 'route-use') {
      const warmedAt = warmed.get(event.id);
      if (warmedAt && event.ts >= warmedAt && event.ts - warmedAt <= USEFUL_WINDOW_MS) used.add(event.id);
    }
    if (event.kind === 'transfer' && event.source === 'observed') observedBytes += event.bytes ?? 0;
    if (event.kind === 'job' && event.source === 'estimated') estimatedBytes += event.bytes ?? 0;
    if (event.kind === 'job' && event.ok === false) failedJobs += 1;
  }

  return {
    events,
    usefulRoutes: used.size,
    warmedRoutes: warmed.size,
    observedBytes,
    estimatedBytes,
    failedJobs,
  };
}

export function clearWarmingTelemetry(): void {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}
