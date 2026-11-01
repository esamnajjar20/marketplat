import { describe, expect, it } from 'vitest';
import { mergeRefreshedAdsPage, type ManagedAd } from '../manage-ads.api';

const ad = (id: string) => ({ id, title: id } as ManagedAd);

describe('my ads page-one refresh', () => {
  it('updates page one and preserves loaded later pages without duplicates', () => {
    const merged = mergeRefreshedAdsPage(
      [ad('a'), ad('b'), ad('c'), ad('d')],
      [{ ...ad('a'), title: 'updated title' }, ad('b')],
      2,
      2,
    );

    expect(merged.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(merged[0]?.title).toBe('updated title');
    expect(new Set(merged.map((item) => item.id)).size).toBe(merged.length);
  });

  it('clears stale pages when the server reports no remaining ads', () => {
    expect(mergeRefreshedAdsPage([ad('a'), ad('b')], [], 0, 2)).toEqual([]);
  });

  it('drops pages beyond the new server page count', () => {
    const merged = mergeRefreshedAdsPage(
      [ad('a'), ad('b'), ad('c'), ad('d'), ad('e')],
      [ad('a')],
      2,
      2,
    );

    expect(merged.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
