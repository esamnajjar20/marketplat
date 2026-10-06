import { createHash } from 'crypto';
import { resolveOptionalUserId } from '../recommendations/recommendations.service';
import { RECS_GEN_KEY } from '../recommendations/recommendations.cache';
import { swrGetWithStatus, type SwrStatus } from '../../shared/utils/swrCache';
import { homeFeedService, type HomeFeedResult } from './home-feed.service';
import { HOME_GEN_KEY } from './home.cache.keys';
import type { GetHomepageQuery } from './home.validation';

export const HOME_FEED_KEY_PREFIX = 'home:feed:v1:';
export const HOME_FEED_HARD_TTL_SECONDS = 1800;
export const HOME_FEED_SOFT_TTL_SECONDS = 300;
export const HOME_FEED_LOCK_TTL_MS = 15_000;

const keyFor = (query: GetHomepageQuery, userId: string | null): string => {
  const body = `${userId ?? 'guest'}|${query.city ?? ''}`;
  const digest = createHash('sha1').update(body).digest('hex');
  return `${HOME_FEED_KEY_PREFIX}${digest}`;
};

export function getCachedHomeFeedWithStatus(
  query: GetHomepageQuery,
  authHeader: string | undefined,
): Promise<{ value: HomeFeedResult; status: SwrStatus }> {
  const userId = resolveOptionalUserId(authHeader);
  return swrGetWithStatus<HomeFeedResult>({
    name: 'home:feed',
    key: keyFor(query, userId),
    hardGenKey: HOME_GEN_KEY,
    softGenKey: RECS_GEN_KEY,
    softTtlMs: () => HOME_FEED_SOFT_TTL_SECONDS * 1000,
    hardTtlSec: HOME_FEED_HARD_TTL_SECONDS,
    lockTtlMs: HOME_FEED_LOCK_TTL_MS,
    build: () => homeFeedService.getHomeFeed(query, authHeader, userId),
    /**
     * settle() turns a thrown section into
     * null (vs an empty [] / {} for a successful-but-empty query). Writing
     * a degraded payload would pin that failure for HOME_FEED_HARD_TTL_SECONDS
     * (300s) — an entire rail silently empty for every visitor until the
     * next hard-TTL expiry. Skipping the write here means the next request
     * retries the failing section immediately.
     */
    shouldCache: (value) => {
      const c = value.bootstrap?.categories;
      const car = value.featured?.carousel;
      return Boolean(
        c && c.ads !== null && c.products !== null && c.services !== null
          && car && car.ads !== null && car.products !== null && car.stores !== null,
      );
    },
  });
}
