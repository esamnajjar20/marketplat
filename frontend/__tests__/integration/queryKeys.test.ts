/**
 * __tests__/integration/queryKeys.test.ts
 *
 * Coverage targets:
 *  - Every queryKey factory produces a readonly tuple
 *  - Key uniqueness: different params → different keys (no accidental collisions)
 *  - Prefix invalidation: sharing a common prefix
 *  - Type safety: undefined params produce stable empty-param keys
 *  - admin keys are parameterised (FIX Q-04)
 *  - All factories return arrays (not objects/primitives)
 */
import { describe, it, expect } from 'vitest';
import { queryKeys } from '@/lib/queryKeys';

// ── Ads ───────────────────────────────────────────────────────────

describe('queryKeys.ads', () => {
  it('ads.all() returns ["ads"]', () => {
    expect(queryKeys.ads.all()).toEqual(['ads']);
  });

  it('ads.list() with no params returns stable key', () => {
    expect(queryKeys.ads.list()).toEqual(['ads', 'list', {}]);
  });

  it('ads.list() with params includes them', () => {
    const key = queryKeys.ads.list({ page: 1, status: 'ACTIVE' });
    expect(key).toEqual(['ads', 'list', { page: 1, status: 'ACTIVE' }]);
  });

  it('ads.list() with different params produces different keys', () => {
    const a = JSON.stringify(queryKeys.ads.list({ page: 1 }));
    const b = JSON.stringify(queryKeys.ads.list({ page: 2 }));
    expect(a).not.toBe(b);
  });

  it('ads.detail() includes the id', () => {
    expect(queryKeys.ads.detail('abc')).toEqual(['ads', 'detail', 'abc']);
  });

  it('ads.detail() different ids produce different keys', () => {
    expect(queryKeys.ads.detail('a')).not.toEqual(queryKeys.ads.detail('b'));
  });

  it('ads.search() includes params', () => {
    const params = { q: 'laptop', city: 'غزة' };
    expect(queryKeys.ads.search(params)).toEqual(['ads', 'search', params]);
  });

  it('ads.related() includes the id', () => {
    expect(queryKeys.ads.related('xyz')).toEqual(['ads', 'related', 'xyz']);
  });

  it('ads.mine() with no params returns stable key', () => {
    expect(queryKeys.ads.mine()).toEqual(['ads', 'me', {}]);
  });

  it('all ad keys start with "ads" prefix (for prefix invalidation)', () => {
    const keys = [
      queryKeys.ads.all(),
      queryKeys.ads.list(),
      queryKeys.ads.detail('x'),
      queryKeys.ads.search({ q: '' }),
      queryKeys.ads.related('x'),
      queryKeys.ads.mine(),
    ];
    keys.forEach((k) => expect(k[0]).toBe('ads'));
  });
});

// ── Categories ────────────────────────────────────────────────────

describe('queryKeys.categories', () => {
  it('categories.all() returns ["categories"]', () => {
    expect(queryKeys.categories.all()).toEqual(['categories']);
  });

  it('categories.slug() returns key with slug segment', () => {
    expect(queryKeys.categories.slug('electronics')).toEqual([
      'categories',
      'slug',
      'electronics',
    ]);
  });

  it('categories.id() returns key with id segment', () => {
    expect(queryKeys.categories.id('cat-1')).toEqual(['categories', 'id', 'cat-1']);
  });

  it('categories.slug and categories.id produce different keys for same value', () => {
    const a = JSON.stringify(queryKeys.categories.slug('x'));
    const b = JSON.stringify(queryKeys.categories.id('x'));
    expect(a).not.toBe(b);
  });

  it('all category keys start with "categories" prefix', () => {
    [queryKeys.categories.all(), queryKeys.categories.slug('x'), queryKeys.categories.id('x')]
      .forEach((k) => expect(k[0]).toBe('categories'));
  });
});

// ── Auth ──────────────────────────────────────────────────────────

describe('queryKeys.auth', () => {
  it('auth.me() returns ["auth", "me"]', () => {
    expect(queryKeys.auth.me()).toEqual(['auth', 'me']);
  });

  it('auth.sessions() returns ["auth", "sessions"]', () => {
    expect(queryKeys.auth.sessions()).toEqual(['auth', 'sessions']);
  });

  it('me and sessions do not collide', () => {
    expect(queryKeys.auth.me()).not.toEqual(queryKeys.auth.sessions());
  });
});

// ── Users ─────────────────────────────────────────────────────────

describe('queryKeys.users', () => {
  it('users.detail() returns key with id', () => {
    expect(queryKeys.users.detail('u-1')).toEqual(['users', 'u-1']);
  });

  it('users.ads() returns key with id + ads segment', () => {
    expect(queryKeys.users.ads('u-1')).toEqual(['users', 'u-1', 'ads', {}]);
  });

  it('users.ads() with params includes them', () => {
    expect(queryKeys.users.ads('u-1', { page: 2 })).toEqual(['users', 'u-1', 'ads', { page: 2 }]);
  });
});

// ── Favorites ─────────────────────────────────────────────────────

describe('queryKeys.favorites', () => {
  it('favorites.all() returns key with list segment', () => {
    expect(queryKeys.favorites.all()).toEqual(['favorites', 'list', {}]);
  });

  it('favorites.ids() returns ["favorites", "ids"]', () => {
    expect(queryKeys.favorites.ids()).toEqual(['favorites', 'ids']);
  });

  it('all and ids do not collide', () => {
    expect(queryKeys.favorites.all()).not.toEqual(queryKeys.favorites.ids());
  });
});

// ── Admin — FIX Q-04: parameterised keys ──────────────────────────

describe('queryKeys.admin (FIX Q-04)', () => {
  it('admin.ads() with no params returns stable key', () => {
    expect(queryKeys.admin.ads()).toEqual(['admin', 'ads', {}]);
  });

  it('admin.ads() with params produces different keys', () => {
    const a = JSON.stringify(queryKeys.admin.ads({ page: 1 }));
    const b = JSON.stringify(queryKeys.admin.ads({ page: 2 }));
    expect(a).not.toBe(b);
  });

  it('admin.users() with no params returns stable key', () => {
    expect(queryKeys.admin.users()).toEqual(['admin', 'users', {}]);
  });

  it('admin.reports() with no params returns stable key', () => {
    expect(queryKeys.admin.reports()).toEqual(['admin', 'reports', {}]);
  });

  it('admin.reportDetail() includes the report id', () => {
    expect(queryKeys.admin.reportDetail('r-1')).toEqual([
      'admin',
      'reports',
      'detail',
      'r-1',
    ]);
  });

  it('admin.ads and admin.users share ["admin"] prefix for broad invalidation', () => {
    expect(queryKeys.admin.ads()[0]).toBe('admin');
    expect(queryKeys.admin.users()[0]).toBe('admin');
  });

  it('admin.ads and admin.users do not collide', () => {
    expect(queryKeys.admin.ads()).not.toEqual(queryKeys.admin.users());
  });
});

// ── Cross-domain key uniqueness ────────────────────────────────────

describe('cross-domain key uniqueness', () => {
  it('ads.detail("x") does not equal users.detail("x")', () => {
    expect(queryKeys.ads.detail('x')).not.toEqual(queryKeys.users.detail('x'));
  });

  it('auth.me() does not collide with any other key', () => {
    const me = JSON.stringify(queryKeys.auth.me());
    const others = [
      queryKeys.ads.all(),
      queryKeys.categories.all(),
      queryKeys.favorites.all(),
      queryKeys.admin.ads(),
    ].map((k) => JSON.stringify(k));
    others.forEach((k) => expect(me).not.toBe(k));
  });
});

// ── All factories return arrays ────────────────────────────────────

describe('all queryKey factories return arrays', () => {
  const allKeys = [
    queryKeys.ads.all(),
    queryKeys.ads.list(),
    queryKeys.ads.detail('x'),
    queryKeys.ads.search({ q: '' }),
    queryKeys.ads.related('x'),
    queryKeys.ads.mine(),
    queryKeys.categories.all(),
    queryKeys.categories.slug('x'),
    queryKeys.categories.id('x'),
    queryKeys.auth.me(),
    queryKeys.auth.sessions(),
    queryKeys.users.detail('x'),
    queryKeys.users.ads('x'),
    queryKeys.favorites.all(),
    queryKeys.favorites.ids(),
    queryKeys.admin.ads(),
    queryKeys.admin.users(),
    queryKeys.admin.reports(),
    queryKeys.admin.reportDetail('x'),
  ];

  allKeys.forEach((key, i) => {
    it(`key[${i}] is an array`, () => {
      expect(Array.isArray(key)).toBe(true);
    });

    it(`key[${i}] has length >= 1`, () => {
      expect(key.length).toBeGreaterThanOrEqual(1);
    });
  });
});
