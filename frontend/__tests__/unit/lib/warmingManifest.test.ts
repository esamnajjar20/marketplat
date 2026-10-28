import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/warmingManifest', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/warmingManifest')>('../../../lib/warmingManifest');
  return actual;
});

describe('warming manifest module', () => {
  it('exports a stable async asset lookup API', async () => {
    const { getExpectedRouteAssets } = await import('../../../lib/warmingManifest');
    expect(await getExpectedRouteAssets('/route-that-does-not-exist')).toEqual([]);
  });
});
