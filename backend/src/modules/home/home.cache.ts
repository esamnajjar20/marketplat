import { redis } from '../../config/redis';
import { logger } from '../../shared/utils/logger';
import { homeService, isHomepageDegraded, type HomepageResult } from './home.service';
import type { GetHomepageQuery } from './home.validation';

/**
 * Short-lived cache for the assembled GET /home payload.
 *
 * Why: /home is public and identical for every viewer, but each miss ran
 * 11+ queries (stores, products, services and providers have no cache of
 * their own — only ads and categories do). The payload only varies by the
 * allow-listed `city` (≤ 11 distinct keys), so caching the whole thing
 * bounds DB work to ~11 assemblies per TTL window regardless of traffic or
 * CDN behaviour.
 *
 * - Only complete (non-degraded) payloads are cached, so a partial failure
 *   heals on the next request instead of being pinned.
 * - Concurrent misses in one process share a single in-flight assembly.
 * - Redis being down is never fatal: it just falls through to the service.
 */
export const HOME_CACHE_TTL_SECONDS = 30;
// FIX HOME-CACHE-JITTER-01: all ≤11 city keys used to expire in lockstep
// (fixed TTL, written by the same first requests), so the 11+ query
// assembly for every city re-ran at the same instant each window.
// 0..HOME_CACHE_TTL_JITTER_SECONDS extra seconds spreads them out.
export const HOME_CACHE_TTL_JITTER_SECONDS = 10;
const ttlWithJitter = (): number =>
  HOME_CACHE_TTL_SECONDS + Math.floor(Math.random() * (HOME_CACHE_TTL_JITTER_SECONDS + 1));
const KEY_PREFIX = 'home:v2:';

const inflight = new Map<string, Promise<HomepageResult>>();

export const homeCacheKey = (query: GetHomepageQuery): string =>
  `${KEY_PREFIX}${query.city ?? 'general'}`;

async function readCache(key: string): Promise<HomepageResult | null> {
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as HomepageResult) : null;
  } catch (error) {
    logger.warn('[home] cache read failed, falling back to DB', error);
    return null;
  }
}

async function writeCache(key: string, payload: HomepageResult): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(payload), 'EX', ttlWithJitter());
  } catch (error) {
    logger.warn('[home] cache write failed', error);
  }
}

export async function getCachedHomepage(query: GetHomepageQuery): Promise<HomepageResult> {
  const key = homeCacheKey(query);

  const cached = await readCache(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const payload = await homeService.getHomepage(query);
    if (!isHomepageDegraded(payload)) await writeCache(key, payload);
    return payload;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}
