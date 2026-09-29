import { getCachedHomepage } from '../../modules/home/home.cache';
import { categoriesService } from '../../modules/categories/categories.service';
import { productCategoriesService } from '../../modules/product-categories/product-categories.service';
import { serviceCategoriesService } from '../../modules/service-categories/service-categories.service';
import { logger } from './logger';

/**
 * FIX CACHE-WARMUP-01: warm the public, viewer-independent Redis caches once
 * after the server starts listening.
 *
 * Why: every deploy/restart (Railway redeploys, crash-loop recovery) leaves
 * these keys cold OR expired (home is only 30-40 s). The first visitor of each
 * key then pays the whole cost — the /home assembly runs 11+ queries — right
 * when traffic is highest (users reopening the app after a deploy). Doing it
 * ourselves moves that cost to a moment nobody is waiting.
 *
 * Deliberately small and safe:
 *  - Only keys that are identical for every viewer (no per-user data).
 *  - Sequential, so a cold start never fans out a burst of queries.
 *  - Reuses the real read paths (`getCachedHomepage`, `get*Categories`), so it
 *    exercises the same cache-aside + singleflight logic real requests use and
 *    can never write a shape the readers don't expect.
 *  - Failures are logged and swallowed: warming is an optimisation, never a
 *    startup dependency.
 *
 * Only the "general" home key is warmed — the 10 per-city variants are
 * requested far less often and would multiply the startup DB load by 10.
 */
export const WARMUP_TASKS: ReadonlyArray<{ name: string; run: () => Promise<unknown> }> = [
  { name: 'home:general', run: () => getCachedHomepage({ city: undefined }) },
  { name: 'categories', run: () => categoriesService.getCategories() },
  { name: 'product-categories', run: () => productCategoriesService.getProductCategories() },
  { name: 'service-categories', run: () => serviceCategoriesService.getServiceCategories() },
];

export async function warmPublicCaches(
  tasks: ReadonlyArray<{ name: string; run: () => Promise<unknown> }> = WARMUP_TASKS,
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  const startedAt = Date.now();

  for (const task of tasks) {
    try {
      await task.run();
      ok += 1;
    } catch (error) {
      failed += 1;
      logger.warn(`[cache-warmup] ${task.name} failed`, error);
    }
  }

  logger.info('[cache-warmup] done', { ok, failed, ms: Date.now() - startedAt });
  return { ok, failed };
}

/**
 * Fire-and-forget entry point for server.ts. The delay lets the process finish
 * its own startup work first; `unref()` so a pending warmup never delays a
 * graceful shutdown.
 */
export function scheduleCacheWarmup(delayMs = 2_000): void {
  const timer = setTimeout(() => {
    void warmPublicCaches().catch((error) => {
      logger.warn('[cache-warmup] unexpected failure', error);
    });
  }, delayMs);
  timer.unref();
}
