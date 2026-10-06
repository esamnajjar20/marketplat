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
  const start = src.indexOf(`async function ${name}(`);
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

  it('networkFirstApi gates ALL API_CACHE writes on !hadAuth', () => {
    const body = fnBody(sw, 'networkFirstApi');
    expect(body).toMatch(/const hadAuth = request\.headers\.get\('authorization'\) != null/);
    // the single write site lives inside storeIfPublic, which checks hadAuth first
    expect(body.match(/putTimestamped\(/g)?.length).toBe(1);
    expect(body).toMatch(/if \(hadAuth \|\| !response\) return;/);
    // the late (post-timeout) path reuses the same gated helper
    expect(body).toMatch(/fetchPromise\.then\(storeIfPublic\)/);
  });

  it('networkFirstApi matches cached entries with ignoreVary and awaits the real fetch on timeout', () => {
    const body = fnBody(sw, 'networkFirstApi');
    expect(body).toMatch(/cache\.match\(request, \{ ignoreVary: true \}\)/);
    expect(body).toMatch(/userDataCache\.match\(request, \{ ignoreVary: true \}\)/);
    expect(body).toMatch(/if \(timedOut\) \{\s*return fetchPromise/);
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
    expect(selfWarm).toMatch(/warmSelfDataForOffline\(\s*queryClient,\s*userId/);
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
