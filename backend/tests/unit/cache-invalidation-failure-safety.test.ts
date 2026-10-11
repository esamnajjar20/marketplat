import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('cache invalidation failure safety', () => {
  const adsKeysSource = readFileSync(
    join(__dirname, '../../src/modules/ads/ads.cache.keys.ts'),
    'utf8',
  );
  const publicListSource = readFileSync(
    join(__dirname, '../../src/shared/utils/publicListCache.ts'),
    'utf8',
  );

  it('does not invalidate/rewarm homepage if ad-list hard invalidation fails', () => {
    expect(adsKeysSource).toContain('export async function bumpAdsCacheHard(): Promise<boolean>');
    expect(adsKeysSource).toContain('const adsInvalidated = await bumpAdsCacheHard()');
    expect(adsKeysSource).toContain('if (!adsInvalidated)');
    expect(adsKeysSource.indexOf('if (!adsInvalidated)')).toBeLessThan(
      adsKeysSource.indexOf('await invalidateHomeCache()', adsKeysSource.indexOf('export async function bumpAdsCacheVersionAndHome')),
    );
  });

  it('does not invalidate/rewarm homepage when any public list hard bump fails', () => {
    expect(publicListSource).toContain('const failed = results.filter(result => !result.ok)');
    expect(publicListSource).toContain('if (failed.length > 0)');
    expect(publicListSource.indexOf('if (failed.length > 0)')).toBeLessThan(
      publicListSource.indexOf('await invalidateHomeCache()', publicListSource.indexOf('export async function hidePublicEntities')),
    );
    expect(publicListSource).toContain('return;');
  });
});
