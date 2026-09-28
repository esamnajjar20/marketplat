import { describe, it, expect } from 'vitest';
import { collectIds, dedupeKeepingMin } from '@/lib/homeDedupe';

const items = (...ids: string[]) => ids.map((id) => ({ id }));

describe('collectIds', () => {
  it('merges lists and ignores null/undefined', () => {
    expect([...collectIds(items('a', 'b'), null, undefined, items('b', 'c'))].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('dedupeKeepingMin', () => {
  it('removes excluded items when enough remain', () => {
    const out = dedupeKeepingMin(items('a', 'b', 'c', 'd', 'e'), new Set(['a', 'b']));
    expect(out.map((i) => i.id)).toEqual(['c', 'd', 'e']);
  });

  it('keeps the original list when dedupe would leave too few (no false empty state)', () => {
    const out = dedupeKeepingMin(items('a', 'b', 'c', 'd'), new Set(['a', 'b', 'c']));
    expect(out.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps everything when the list itself is shorter than the minimum', () => {
    const out = dedupeKeepingMin(items('a', 'b'), new Set(['a']));
    expect(out.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('is a no-op with an empty exclude set', () => {
    expect(dedupeKeepingMin(items('a'), new Set())).toEqual(items('a'));
  });
});
