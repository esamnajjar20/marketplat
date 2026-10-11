import { bumpGeneration } from '../../shared/utils/swrCache';
import { HOME_GEN_KEY, invalidateHomeCache } from '../home/home.cache.keys';
import { logger } from '../../shared/utils/logger';

/**
 * Generation keys + invalidation helpers for the GET /ads list cache.
 *
 * Kept dependency-light (SWR engine + home keys only) so sellers / users /
 * admin services can invalidate the ads cache without importing ads.service
 * (ads.service already imports sellers.service — importing back would be an
 * import cycle). ads.service.ts re-exports these for existing call sites.
 * See the long comment above getAds in ads.service.ts for the model.
 */
export const ADS_GEN_HARD_KEY = 'ads:gen:hard';
export const ADS_GEN_SOFT_KEY = 'ads:gen:soft';

/**
 * Soft invalidation: the ad changed (created, edited, images, featured/pinned)
 * but is still legitimately visible. Stale-while-revalidate handles it.
 * Name kept for the existing call sites in ads / admin / republish services.
 */
export async function bumpAdsCacheVersion(): Promise<void> {
  await bumpGeneration(ADS_GEN_SOFT_KEY);
}

/**
 * Hard invalidation: an ad must stop appearing NOW. Every cached list entry
 * becomes unusable and the next read rebuilds synchronously from the DB.
 */
export async function bumpAdsCacheHard(): Promise<boolean> {
  const ok = await bumpGeneration(ADS_GEN_HARD_KEY, { retryDependentGenKeys: [HOME_GEN_KEY] });
  if (!ok) {
    logger.error('Ads hard cache invalidation failed; removed or unavailable ads may remain in cached lists until hard TTL');
  }
  return ok;
}

/**
 * the GET /home payload embeds ads too, so a
 * deleted / sold / admin-removed ad must also leave the homepage. Call this for
 * the mutations that must HIDE an ad. Order matters: ads first, then home — the
 * homepage rebuild reads ads through the list cache.
 *
 * Deliberately not folded into the soft bump: create/edit/image changes would
 * otherwise invalidate the homepage on every edit. A newly created ad
 * appearing on the homepage within the soft TTL is fine; a removed ad
 * lingering is not.
 */
export async function bumpAdsCacheVersionAndHome(): Promise<void> {
  const adsInvalidated = await bumpAdsCacheHard();
  if (!adsInvalidated) {
    // Do not trigger homepage listeners/re-warming from a potentially stale ad-list
    // cache. Keeping the old homepage until TTL is safer than republishing removed ads
    // under a new homepage generation while Redis invalidation is failing.
    logger.error('Homepage invalidation skipped because ad-list hard invalidation failed; avoid rewarming homepage from stale ad cache');
    return;
  }
  await invalidateHomeCache();
}
