/**
 * in-process counters for the SWR caches.
 *
 * Why: until now nobody could answer "is the cache actually working?" —
 * hit ratio, how often a visitor pays a synchronous rebuild, how often Redis
 * is bypassed. Counters are cheap (one Map lookup per request), per-process,
 * and reset on restart; the keep-warm loop logs a snapshot periodically so the
 * numbers show up in Railway logs without any new infrastructure.
 */
export type CacheEvent =
  | 'hit' // fresh entry served
  | 'stale' // stale entry served, background refresh triggered
  | 'miss' // nothing usable: the caller paid a synchronous build
  | 'bypass' // Redis skipped (down / breaker open / uncacheable query)
  | 'refresh_ok'
  | 'refresh_fail'
  | 'lock_skip'; // another process is already refreshing

const EVENTS: readonly CacheEvent[] = [
  'hit',
  'stale',
  'miss',
  'bypass',
  'refresh_ok',
  'refresh_fail',
  'lock_skip',
];

type Counters = Record<CacheEvent, number>;
const counters = new Map<string, Counters>();

const empty = (): Counters =>
  Object.fromEntries(EVENTS.map(e => [e, 0])) as Counters;

export const cacheMetrics = {
  record(name: string, event: CacheEvent): void {
    let c = counters.get(name);
    if (!c) {
      c = empty();
      counters.set(name, c);
    }
    c[event] += 1;
  },

  /** Plain-object snapshot with a derived `servedFromCache` ratio (hit + stale over all reads). */
  snapshot(): Record<string, Counters & { servedFromCache: number }> {
    const out: Record<string, Counters & { servedFromCache: number }> = {};
    for (const [name, c] of counters) {
      const reads = c.hit + c.stale + c.miss + c.bypass;
      out[name] = {
        ...c,
        servedFromCache: reads === 0 ? 0 : Number(((c.hit + c.stale) / reads).toFixed(3)),
      };
    }
    return out;
  },

  reset(): void {
    counters.clear();
  },
};
