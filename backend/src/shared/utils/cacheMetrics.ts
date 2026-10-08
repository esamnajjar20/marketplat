import client from 'prom-client';
import { register } from './metricsRegistry';

export type CacheEvent = 'hit' | 'stale' | 'miss' | 'bypass' | 'refresh_ok' | 'refresh_fail' | 'lock_skip';
const EVENTS: readonly CacheEvent[] = ['hit','stale','miss','bypass','refresh_ok','refresh_fail','lock_skip'];
type Counters = Record<CacheEvent, number>;
const counters = new Map<string, Counters>();
const empty = (): Counters => Object.fromEntries(EVENTS.map(e => [e, 0])) as Counters;

const eventsTotal = new client.Counter({ name: 'app_cache_events_total', help: 'Cache events by logical cache name and outcome', labelNames: ['cache', 'event'] as const, registers: [register] });
const operationDuration = new client.Histogram({
  name: 'app_cache_operation_duration_seconds',
  help: 'Cache operation duration by logical cache name and outcome',
  labelNames: ['cache', 'event'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

export const cacheMetrics = {
  record(name: string, event: CacheEvent): void {
    let c = counters.get(name); if (!c) { c = empty(); counters.set(name, c); }
    c[event] += 1; eventsTotal.inc({ cache: name, event });
  },
  observeDuration(name: string, event: CacheEvent, seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    operationDuration.observe({ cache: name, event }, seconds);
  },
  snapshot(): Record<string, Counters & { servedFromCache: number }> {
    const out: Record<string, Counters & { servedFromCache: number }> = {};
    for (const [name, c] of counters) { const reads = c.hit+c.stale+c.miss+c.bypass; out[name] = { ...c, servedFromCache: reads===0 ? 0 : Number(((c.hit+c.stale)/reads).toFixed(3)) }; }
    return out;
  },
  reset(): void { counters.clear(); },
};
