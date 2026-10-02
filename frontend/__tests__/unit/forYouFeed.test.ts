import { describe, it, expect } from 'vitest';
import { buildForYouFeed, type ForYouSources } from '@/lib/forYouFeed';

const mk = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }));
const src = (a: unknown, p: unknown, s: unknown) => ({ ad: a, product: p, service: s }) as ForYouSources;
const kinds = (r: { kind: string }[]) => r.map((x) => x.kind[0]).join('');
const ids = (r: { data: { id: string } }[]) => r.map((x) => x.data.id);

describe('buildForYouFeed', () => {
  it('fills the limit and starts with one card of each type', () => {
    const r = buildForYouFeed(
      src({ ranked: mk('a', 12) }, { ranked: mk('p', 12) }, { ranked: mk('s', 12) }),
      { limit: 24 },
    );
    expect(r).toHaveLength(24);
    expect(new Set(r.slice(0, 3).map((x) => x.kind)).size).toBe(3);
  });

  it('never lets one type take over while others have content', () => {
    const r = buildForYouFeed(
      src({ ranked: mk('a', 24) }, { ranked: mk('p', 3) }, { ranked: mk('s', 3) }),
      { limit: 24 },
    );
    expect(r.filter((x) => x.kind === 'ad').length).toBeLessThanOrEqual(12);
    expect(kinds(r)).not.toMatch(/(.)\1\1/);
  });

  it('puts every ranked card before any fallback card', () => {
    const r = buildForYouFeed(
      src(
        { ranked: mk('a', 2), fallback: mk('fa', 10) },
        { ranked: mk('p', 4) },
        { ranked: mk('s', 4) },
      ),
      { limit: 16 },
    );
    const order = ids(r);
    const lastRanked = Math.max(...['a0', 'a1', 'p3', 's3'].map((i) => order.indexOf(i)));
    const firstFallback = order.findIndex((i) => i.startsWith('fa'));
    expect(firstFallback === -1 || firstFallback > lastRanked - 3).toBe(true);
    expect(order.slice(0, 10)).not.toContain('fa5');
  });

  it('keeps each type in its own priority order', () => {
    const r = buildForYouFeed(
      src({ ranked: mk('a', 5) }, { ranked: mk('p', 5) }, { ranked: mk('s', 5) }),
      { limit: 15 },
    );
    const ads = ids(r).filter((i) => i.startsWith('a'));
    expect(ads).toEqual(['a0', 'a1', 'a2', 'a3', 'a4']);
  });

  it('dedupes within a type and tolerates null / non-array input', () => {
    const r = buildForYouFeed(
      src({ ranked: [{ id: 'x' }, { id: 'x' }], fallback: [{ id: 'x' }] }, null, { ranked: 'oops' }),
      { limit: 10 },
    );
    expect(ids(r)).toEqual(['x']);
    expect(buildForYouFeed(src({}, {}, {}), { limit: 10 })).toEqual([]);
    expect(buildForYouFeed(src({ ranked: mk('a', 3) }, {}, {}), { limit: 0 })).toEqual([]);
  });

  it('shows all it can when only one type exists', () => {
    const r = buildForYouFeed(src({ ranked: mk('a', 20) }, {}, {}), { limit: 24 });
    expect(r).toHaveLength(20);
  });
});
