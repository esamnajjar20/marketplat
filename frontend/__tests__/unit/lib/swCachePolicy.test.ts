/**
 * Source-level guards for the cache/warming (sw.js is a classic
 * script and cannot be imported under vitest — same approach as
 * cacheVersionSync.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), 'utf-8');
const sw = read('../../../public/sw.js');
const userData = read('../../../lib/offlineWarmingUserData.ts');
const authCleanup = read('../../../lib/authCleanup.ts');
const activityHook = read('../../../hooks/queries/useActivity.ts');
const savedSearchesHook = read('../../../hooks/queries/useSavedSearches.ts');
const adsHook = read('../../../hooks/queries/useAds.ts');
const selfWarm = read('../../../lib/offlineSelfWarm.ts');

function fnBody(src: string, name: string): string {
  const asyncStart = src.indexOf(`async function ${name}(`);
  const plainStart = src.indexOf(`function ${name}(`);
  const candidates = [asyncStart, plainStart].filter((n) => n > -1);
  const start = candidates.length ? Math.min(...candidates) : -1;
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const next = src.indexOf('\nasync function ', start + 10);
  const nextPlain = src.indexOf('\nfunction ', start + 10);
  const ends = [next, nextPlain].filter((n) => n > -1);
  return src.slice(start, ends.length ? Math.min(...ends) : undefined);
}

describe('service worker cache policy', () => {
  it('protects the legacy ad-edit route from shared page caching', () => {
    expect(sw).toMatch(/PROTECTED_AD_EDIT_RE/);
    expect(sw).toMatch(/PROTECTED_AD_EDIT_RE\.test\(url\.pathname\)/);
  });

  it('does not bypass the image cache (no TEMP DEBUG)', () => {
    expect(sw).not.toMatch(/TEMP DEBUG/);
    expect(sw).toMatch(/respondWith\(cacheFirstImage\(event, request, url\)\)/);
  });

  it('classifies RSC from transport headers and _rsc URL token, not only RSC: 1', () => {
    const body = fnBody(sw, 'isRscShellRequest');
    expect(body).toMatch(/Next-Router-State-Tree/);
    expect(body).toMatch(/Next-Router-Prefetch/);
    expect(body).toMatch(/text\/x-component/);
    expect(body).toMatch(/searchParams\.has\('_rsc'\)/);
  });

  it('rejects HTML and partial responses from the RSC transport path', () => {
    const body = fnBody(sw, 'networkOnlyRscRequest');
    expect(body).toMatch(/response\.status === 206/);
    expect(body).toMatch(/!hasRscContentType\(response\)/);
    expect(body).toMatch(/cache\.match\(rscShellKey\(url\)\)/);
  });

  it('keeps the compatibility page strategy network-first and verifies cached HTML chunks', () => {
    const body = fnBody(sw, 'staleWhileRevalidatePage');
    expect(body).toMatch(/return networkFirstPage\(event, request\)/);
    const page = fnBody(sw, 'networkFirstPage');
    expect(page).toMatch(/verifyCachedChunks\(cachedResponse, cache\)/);
    const verifier = fnBody(sw, 'verifyCachedChunks');
    expect(verifier).toMatch(/isUsableStaticAssetResponse\(url, hit\)/);
    const writer = fnBody(sw, 'cacheVisitedDocumentShell');
    expect(writer).toMatch(/if \(!isUsableStaticAssetResponse\(url, committedAsset\)\) \{[\s\S]{0,100}await htmlCache\.delete\(cacheKey\)/);
  });

  it('networkFirstApi gates shared API_CACHE writes on !hadAuth', () => {
    const body = fnBody(sw, 'networkFirstApi');
    expect(body).toMatch(/const hadAuth = request\.headers\.get\('authorization'\) != null/);
    // storeIfAllowed: shared API_CACHE only when !hadAuth; authed → userDataCache
    expect(body).toMatch(/if \(!hadAuth\)/);
    expect(body).toMatch(/putTimestamped\(cache, request/);
    expect(body).toMatch(/putTimestamped\(userDataCache, request/);
    expect(body).toMatch(/fetchPromise\.then\(\(late\) => storeIfAllowed\(late\.clone\(\)\)\)/);
  });

  it('networkFirstApi matches cached entries with ignoreVary and continues the real fetch on timeout', () => {
    const body = fnBody(sw, 'networkFirstApi');
    expect(body).toMatch(/cache\.match\(request, \{ ignoreVary: true \}\)/);
    expect(body).toMatch(/userDataCache\.match\(request, \{ ignoreVary: true \}\)/);
    expect(body).toMatch(/if \(timedOut\) return fetchPromise\.catch/);
  });

  it('rejects stale or un-timestamped API snapshots after their offline hard TTL', () => {
    expect(sw).toMatch(/function apiSnapshotMaxAgeMs\(url\)/);
    expect(sw).toMatch(/policy\.reference\?\.offline\?\.hardAfterMs/);
    expect(sw).toMatch(/function isFreshCachedApiSnapshot\(url, response, now = Date\.now\(\)\)/);
    expect(sw).toMatch(/cachedAt > now \+ 60_000/);
    expect(sw).toMatch(/now - cachedAt <= maxAge/);
    expect(sw).toMatch(/function apiSnapshotStaleGraceMs\(url\)/);
    expect(sw).toMatch(/policy\[domain\]\?\.offline\?\.staleGraceMs/);
    expect(sw).toMatch(/age - apiSnapshotMaxAgeMs\(url\) > graceMs/);
    const body = fnBody(sw, 'networkFirstApi');
    expect(body.match(/isFreshCachedApiSnapshot\(url, cachedApi\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(body).toMatch(/isFreshCachedApiSnapshot\(url, cachedUserData\)/);
    expect(body).toMatch(/isFreshCachedApiSnapshot\(url, cachedCore\)/);
  });
});

describe('user-data warming', () => {
  it('authenticates with a Bearer token and counts only real successes', () => {
    expect(userData).toMatch(/Authorization: `Bearer \$\{token\}`/);
    expect(userData).toMatch(/if \(r\.ok\) completed \+= 1;/);
    expect(userData).toMatch(/usedSession && !useAuthStore\.getState\(\)\.isAuthenticated/);
  });
});


describe('offline identity and cleanup hardening', () => {
  it('keeps owner-scoped offline lists tied to the current user', () => {
    expect(activityHook).toMatch(/getOfflineList<UserActivity>\(OFFLINE_LIST_KEYS\.activity, userId\)/);
    expect(activityHook).toMatch(/OFFLINE_LIST_LIMITS\.activity,\s*userId/);
    expect(savedSearchesHook).toMatch(/getOfflineList<SavedSearch>\(OFFLINE_LIST_KEYS\.savedSearches, userId\)/);
    expect(savedSearchesHook).toMatch(/OFFLINE_LIST_LIMITS\.savedSearches,\s*userId/);
    expect(adsHook).toMatch(/getOfflineList<AdListItem>\(OFFLINE_LIST_KEYS\.myAds, userId\)/);
    expect(adsHook).toMatch(/OFFLINE_LIST_LIMITS\.myAds,\s*userId/);
  });

  it('passes the authenticated user id into self-profile warming', () => {
    // Function signature takes (queryClient, userId) — types may sit between params
    expect(selfWarm).toMatch(/function warmSelfDataForOffline\(/);
    expect(selfWarm).toMatch(/userId:\s*string/);
    expect(selfWarm).toMatch(/saveOfflineJson\(OFFLINE_JSON_KEYS\.sellerProfileSelf, data, userId\)/);
    expect(selfWarm).toMatch(/saveOfflineJson\(OFFLINE_JSON_KEYS\.storeSelf, data, userId\)/);
    expect(selfWarm).toMatch(/saveOfflineJson\(OFFLINE_JSON_KEYS\.serviceProviderSelf, data, userId\)/);
  });

  it('clears offline activity during session cleanup', () => {
    expect(authCleanup).toMatch(/import \{ clearOfflineActivity \} from '@\/lib\/offlineActivityLog'/);
    expect(authCleanup).toMatch(/clearOfflineActivity\(\)/);
  });

  it('waits for the service worker queue-clear acknowledgement', () => {
    const queue = read('../../../lib/offlineQueue.ts');
    expect(queue).toMatch(/QUEUE_CLEARED/);
    expect(queue).toMatch(/QUEUE_CLEAR_FAILED/);
    expect(queue).toMatch(/5_000/);
    expect(queue).toMatch(/clearQueueDirectly/);
  });

});

describe('logout cleanup', () => {
  it('wipes Cache Storage directly and awaits it', () => {
    expect(authCleanup).toMatch(/caches\.keys\(\)/);
    expect(authCleanup).toMatch(/await clearServiceWorkerApiCache\(\)/);
    expect(authCleanup).toMatch(/caches\.delete\('market-saved-ads'\)/);
  });
});
