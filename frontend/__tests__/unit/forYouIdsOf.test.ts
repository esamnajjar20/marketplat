import { describe, it, expect } from 'vitest';
import { forYouIdsOf } from '@/hooks/queries/useForYouItems';
import { collectIds, dedupeKeepingMin } from '@/lib/homeDedupe';
import type { ForYouItem } from '@/lib/forYouFeed';

const item = (kind: ForYouItem['kind'], id: string) => ({ kind, data: { id } }) as unknown as ForYouItem;

describe('forYouIdsOf', () => {
  const shelf = [item('ad', 'a1'), item('product', 'p1'), item('ad', 'a2'), item('service', 's1')];

  it('collects only the ids of the requested kind', () => {
    expect([...forYouIdsOf(shelf, 'ad')]).toEqual(['a1', 'a2']);
    expect([...forYouIdsOf(shelf, 'service')]).toEqual(['s1']);
  });

  it('lets a per-type rail drop what the shelf shows, while keeping a full rail', () => {
    const rail = ['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => ({ id }));
    expect(dedupeKeepingMin(rail, forYouIdsOf(shelf, 'ad')).map((x) => x.id)).toEqual(['a3', 'a4', 'a5']);
  });

  it('keeps the original rail when dedupe would leave it nearly empty (small catalog)', () => {
    const rail = ['a1', 'a2'].map((id) => ({ id }));
    expect(dedupeKeepingMin(rail, collectIds(rail))).toHaveLength(2);
  });
});
