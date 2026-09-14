/**
 * __tests__/unit/lib/cacheVersionSync.test.ts
 *
 * public/sw.js is a raw service-worker script (not an ES module), so it
 * can't `import` lib/offlineCoreBundle.ts / lib/offlineRouteShells.ts /
 * lib/offlineCachePolicy.ts — their cache-name and trim-limit constants
 * are copy-pasted by hand and must stay byte-for-byte in sync with
 * sw.js's own CACHE_VERSION and MAX_*_ENTRIES.
 *
 * This has already drifted silently in production at least three times
 * (see sw.js's own comments): FIX PWA-VER-01 (offlineRouteShells.ts's
 * STATIC_CACHE and offlineCoreBundle.ts's CORE_CACHE stuck on 'v4' while
 * sw.js moved to 'v5' — both warm-up features were silently no-ops), and
 * a third instance found during this audit: offlineRouteShells.ts's
 * PERSONAL_SHELL_CACHE stuck on 'v18' while STATIC_CACHE in the very
 * same file had already moved to 'v20' (FIX SW-TRIM-ORDER-01). Each time
 * the failure mode was identical and silent: a cache is written under a
 * name 'activate' doesn't recognize, so it's deleted the moment the new
 * SW activates, and the feature it backed (route-shell warm-up, core
 * bundle warm-up, or personal-shell caching) quietly stops working with
 * no error anywhere.
 *
 * This test turns that class of bug into a CI failure at the exact
 * moment someone bumps one copy and forgets another, instead of it
 * surfacing only for a real user offline in production.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

function readFile(rel: string) {
  return readFileSync(path.resolve(__dirname, rel), 'utf-8');
}

function extractOne(source: string, pattern: RegExp, label: string): string {
  const match = source.match(pattern);
  if (!match) {
    throw new Error(
      `cacheVersionSync guard: could not find ${label} in its source file — ` +
        `did the surrounding code change shape? Update this test's regex to match.`,
    );
  }
  return match[1];
}

describe('sw.js hand-copied constants stay in sync with their sources', () => {
  const sw = readFile('../../../public/sw.js');
  const coreBundle = readFile('../../../lib/offlineCoreBundle.ts');
  const routeShells = readFile('../../../lib/offlineRouteShells.ts');
  const cachePolicy = readFile('../../../lib/offlineCachePolicy.ts');

  it('keeps CACHE_VERSION identical across sw.js, offlineCoreBundle.ts (CORE_CACHE), and offlineRouteShells.ts (STATIC_CACHE + PERSONAL_SHELL_CACHE)', () => {
    const swVersion = extractOne(sw, /const CACHE_VERSION = '(v\d+)';/, 'sw.js CACHE_VERSION');
    const coreVersion = extractOne(
      coreBundle,
      /export const CORE_CACHE = 'market-core-(v\d+)';/,
      'offlineCoreBundle.ts CORE_CACHE',
    );
    const staticVersion = extractOne(
      routeShells,
      /const STATIC_CACHE = 'market-static-(v\d+)';/,
      'offlineRouteShells.ts STATIC_CACHE',
    );
    const personalShellVersion = extractOne(
      routeShells,
      /const PERSONAL_SHELL_CACHE = 'market-personal-shell-(v\d+)';/,
      'offlineRouteShells.ts PERSONAL_SHELL_CACHE',
    );

    expect(coreVersion, 'offlineCoreBundle.ts CORE_CACHE vs sw.js CACHE_VERSION').toBe(swVersion);
    expect(staticVersion, 'offlineRouteShells.ts STATIC_CACHE vs sw.js CACHE_VERSION').toBe(swVersion);
    expect(
      personalShellVersion,
      'offlineRouteShells.ts PERSONAL_SHELL_CACHE vs sw.js CACHE_VERSION',
    ).toBe(swVersion);
  });

  it('keeps SAVED_ADS_CACHE (deliberately unversioned) spelled identically in sw.js and lib/offlineSavedAds.ts', () => {
    const savedAds = readFile('../../../lib/offlineSavedAds.ts');
    const swName = extractOne(sw, /const SAVED_ADS_CACHE = '([^']+)';/, 'sw.js SAVED_ADS_CACHE');
    const libName = extractOne(
      savedAds,
      /export const SAVED_ADS_CACHE = '([^']+)';/,
      'offlineSavedAds.ts SAVED_ADS_CACHE',
    );
    expect(libName).toBe(swName);
  });

  it('keeps sw.js MAX_API_ENTRIES/MAX_IMAGE_ENTRIES in sync with offlineCachePolicy.ts (informational mirror)', () => {
    const swApiLimit = extractOne(sw, /const MAX_API_ENTRIES = (\d+);/, 'sw.js MAX_API_ENTRIES');
    const swImageLimit = extractOne(sw, /const MAX_IMAGE_ENTRIES = (\d+);/, 'sw.js MAX_IMAGE_ENTRIES');
    const policyApiLimit = extractOne(cachePolicy, /apiEntries: (\d+),/, 'offlineCachePolicy.ts apiEntries');
    const policyImageLimit = extractOne(
      cachePolicy,
      /imageEntries: (\d+),/,
      'offlineCachePolicy.ts imageEntries',
    );

    expect(policyApiLimit, 'offlineCachePolicy.ts apiEntries vs sw.js MAX_API_ENTRIES').toBe(swApiLimit);
    expect(
      policyImageLimit,
      'offlineCachePolicy.ts imageEntries vs sw.js MAX_IMAGE_ENTRIES',
    ).toBe(swImageLimit);
  });
});
