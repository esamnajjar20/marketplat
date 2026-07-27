import { redis } from '../../config/redis';
import { logger } from './logger';

const STATS_CACHE_KEY = 'admin_stats_cache';
const CACHE_TTL_SECONDS = 30;

export interface AdminStats {
  totalAds: number;
  activeAds: number;
  totalUsers: number;
  activeUsers: number;
  openReports: number;
  viewsToday: number;
}

/**
 * FIX PERF-02: GET /admin/stats previously ran 6 unconditional
 * count()/aggregate() queries on every single request, with no
 * caching at all. Each query is individually cheap (indexed columns),
 * but the endpoint is exactly the kind that gets hit repeatedly —
 * dashboard auto-refresh, an admin leaving the tab open, multiple
 * admins viewing it simultaneously — so the redundant DB round trips
 * add up for no benefit, since these numbers don't need to be
 * millisecond-fresh.
 *
 * Uses Redis rather than an in-memory/module-level cache (contrast
 * with healthCache.ts) because this backend runs under PM2 cluster
 * mode (see ecosystem.config.js) — an in-process cache would be
 * duplicated per worker and wouldn't actually cut duplicate queries
 * across the cluster. A 30s TTL keeps the dashboard close to live
 * while absorbing rapid repeat requests.
 */
export const adminStatsCache = {
  get: async (): Promise<AdminStats | null> => {
    try {
      const cached = await redis.get(STATS_CACHE_KEY);
      return cached ? (JSON.parse(cached) as AdminStats) : null;
    } catch (err) {
      logger.error('adminStatsCache.get failed', err);
      return null;
    }
  },

  set: async (stats: AdminStats): Promise<void> => {
    try {
      await redis.setex(STATS_CACHE_KEY, CACHE_TTL_SECONDS, JSON.stringify(stats));
    } catch (err) {
      // Cache write failing must never break the response — the
      // caller already has fresh stats to return regardless.
      logger.error('adminStatsCache.set failed', err);
    }
  },

  /**
   * Invalidated by nothing explicitly — stats are allowed to be up to
   * 30s stale by design (see TTL above). Exposed mainly so tests can
   * force a clean slate between cases.
   */
  invalidate: async (): Promise<void> => {
    try {
      await redis.del(STATS_CACHE_KEY);
    } catch (err) {
      logger.error('adminStatsCache.invalidate failed', err);
    }
  },
};
