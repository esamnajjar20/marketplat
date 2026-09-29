/**
 * Source-level guards for the cache/warming fixes (sw.js is a classic
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

function fnBody(src: string, name: string): string {
  const start = src.indexOf(`async function ${name}(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const next = src.indexOf('\nasync function ', start + 10);
  const nextPlain = src.indexOf('\nfunction ', start + 10);
  const ends = [next, nextPlain].filter((n) => n > -1);
  return src.slice(start, ends.length ? Math.min(...ends) : undefined);
}

describe('service worker cache policy', () => {
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

describe('logout cleanup', () => {
  it('wipes Cache Storage directly and awaits it', () => {
    expect(authCleanup).toMatch(/caches\.keys\(\)/);
    expect(authCleanup).toMatch(/await clearServiceWorkerApiCache\(\)/);
    expect(authCleanup).toMatch(/caches\.delete\('market-saved-ads'\)/);
  });
});
