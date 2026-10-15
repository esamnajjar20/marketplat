/**
 * __tests__/unit/lib/cacheVersionSync.test.ts
 *
 * public/sw.js is a raw service-worker script (not an ES module), so it
 * can't `import` lib/cacheVersion.ts. TypeScript modules share
 * SW_CACHE_VERSION from lib/cacheVersion.ts; sw.js keeps a hand-copied
 * `const CACHE_VERSION = 'vNN'`. This test fails CI if they drift.
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
  const cacheVersion = readFile('../../../lib/cacheVersion.ts');
  const coreBundle = readFile('../../../lib/offlineCoreBundle.ts');
  const routeShells = readFile('../../../lib/offlineRouteShells.ts');
  const userData = readFile('../../../lib/offlineWarmingUserData.ts');
  const cachePolicy = readFile('../../../lib/offlineCachePolicy.ts');

  it('keeps SW_CACHE_VERSION in cacheVersion.ts identical to sw.js CACHE_VERSION', () => {
    const swVersion = extractOne(sw, /const CACHE_VERSION = '(v\d+)';/, 'sw.js CACHE_VERSION');
    const libVersion = extractOne(
      cacheVersion,
      /export const SW_CACHE_VERSION = '(v\d+)'/,
      'cacheVersion.ts SW_CACHE_VERSION',
    );
    expect(libVersion).toBe(swVersion);
  });

  it('routes CORE/STATIC/PERSONAL/USER_DATA through cacheVersion.ts (or matching suffix)', () => {
    const libVersion = extractOne(
      cacheVersion,
      /export const SW_CACHE_VERSION = '(v\d+)'/,
      'cacheVersion.ts SW_CACHE_VERSION',
    );
    // Modules must import the shared names (not hard-code a different version).
    expect(coreBundle).toMatch(/CORE_CACHE_NAME/);
    expect(coreBundle).toMatch(/export const CORE_CACHE = CORE_CACHE_NAME/);
    expect(routeShells).toMatch(/STATIC_CACHE_NAME/);
    expect(routeShells).toMatch(/PERSONAL_SHELL_CACHE_NAME/);
    expect(userData).toMatch(/userDataCacheName/);
    expect(userData).toMatch(/USER_DATA_CACHE_PREFIX/);

    // cacheVersion name helpers embed the version via SW_CACHE_VERSION template.
    // Source keeps the template literal — it does not expand to market-core-vNN.
    expect(cacheVersion).toMatch(/market-core-\$\{SW_CACHE_VERSION\}/);
    expect(cacheVersion).toMatch(/market-static-\$\{SW_CACHE_VERSION\}/);
    expect(cacheVersion).toMatch(/market-user-data-\$\{SW_CACHE_VERSION\}-/);
    expect(cacheVersion).toMatch(/market-personal-shell-\$\{SW_CACHE_VERSION\}/);
    void libVersion; // still validated above that it parses cleanly
  });

  it('keeps SAVED_ENTITIES_CACHE (deliberately unversioned) spelled identically in sw.js and lib/offlineSavedEntities.ts', () => {
    const savedEntities = readFile('../../../lib/offlineSavedEntities.ts');
    const swName = extractOne(sw, /const SAVED_ADS_CACHE = '([^']+)';/, 'sw.js SAVED_ADS_CACHE');
    const libName = extractOne(
      savedEntities,
      /export const SAVED_ENTITIES_CACHE = '([^']+)';/,
      'offlineSavedEntities.ts SAVED_ENTITIES_CACHE',
    );
    expect(libName).toBe(swName);
  });

  it('keeps sw.js MAX_API_ENTRIES/MAX_IMAGE_ENTRIES in sync with offlineCachePolicy.ts (informational mirror)', () => {
    const swApiLimit = extractOne(sw, /const MAX_API_ENTRIES = (?:MARKET_STORAGE_POLICY\.apiEntries \?\? )?(\d+);/, 'sw.js MAX_API_ENTRIES');
    const swImageLimit = extractOne(sw, /const MAX_IMAGE_ENTRIES = (?:MARKET_STORAGE_POLICY\.imageEntries \?\? )?(\d+);/, 'sw.js MAX_IMAGE_ENTRIES');
    const policyApiLimit = extractOne(cachePolicy, /apiEntries: (\d+),/, 'offlineCachePolicy.ts apiEntries');
    const policyImageLimit = extractOne(
      cachePolicy,
      /imageEntries: (\d+),/,
      'offlineCachePolicy.ts imageEntries',
    );
    expect(policyApiLimit).toBe(swApiLimit);
    expect(policyImageLimit).toBe(swImageLimit);
  });
});
