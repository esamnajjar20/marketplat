/**
 * __tests__/integration/queryKeys.stores.test.ts
 *
 * Same coverage shape as queryKeys.test.ts, scoped to the stores
 * module's key factories (stores, storeReviews, products,
 * productCategories) added alongside the stores frontend module:
 *  - every factory returns a readonly tuple/array
 *  - different params → different keys (no accidental collisions)
 *  - stable empty-param keys when no params are passed
 *  - every key in a domain shares that domain's string as key[0], so
 *    a single invalidateQueries({queryKey: ['stores']}) can broadly
 *    invalidate every stores.* query at once
 *  - cross-domain uniqueness (stores vs products vs existing ads/etc.)
 */
import { describe, it, expect } from 'vitest';
import { queryKeys } from '@/lib/queryKeys';

// ── Stores ────────────────────────────────────────────────────────

describe('queryKeys.stores', () => {
  it('all() returns ["stores"]', () => {
    expect(queryKeys.stores.all()).toEqual(['stores']);
  });

  it('list() with no params returns a stable key', () => {
    expect(queryKeys.stores.list()).toEqual(['stores', 'list', {}]);
  });

  it('list() with different params produces different keys', () => {
    const a = JSON.stringify(queryKeys.stores.list({ city: 'غزة' }));
    const b = JSON.stringify(queryKeys.stores.list({ city: 'رفح' }));
    expect(a).not.toBe(b);
  });

  it('detail() includes the id, and different ids produce different keys', () => {
    expect(queryKeys.stores.detail('s-1')).toEqual(['stores', 'detail', 's-1']);
    expect(queryKeys.stores.detail('s-1')).not.toEqual(queryKeys.stores.detail('s-2'));
  });

  it('me() returns ["stores", "me"]', () => {
    expect(queryKeys.stores.me()).toEqual(['stores', 'me']);
  });

  it('followed() with no params returns a stable key', () => {
    expect(queryKeys.stores.followed()).toEqual(['stores', 'followed', {}]);
  });

  it('followed() with different params produces different keys', () => {
    const a = JSON.stringify(queryKeys.stores.followed({ page: 1 }));
    const b = JSON.stringify(queryKeys.stores.followed({ page: 2 }));
    expect(a).not.toBe(b);
  });

  it('every stores.* key starts with "stores" (broad-prefix invalidation)', () => {
    const keys = [
      queryKeys.stores.all(),
      queryKeys.stores.list(),
      queryKeys.stores.detail('x'),
      queryKeys.stores.me(),
      queryKeys.stores.followed(),
    ];
    keys.forEach((k) => expect(k[0]).toBe('stores'));
  });

  it('me() and detail("me") do not accidentally collide', () => {
    expect(queryKeys.stores.me()).not.toEqual(queryKeys.stores.detail('me'));
  });
});

// ── Store reviews ─────────────────────────────────────────────────

describe('queryKeys.storeReviews', () => {
  it('forStore() includes the store id', () => {
    expect(queryKeys.storeReviews.forStore('s-1')).toEqual(['store-reviews', 's-1', {}]);
  });

  it('forStore() with different store ids produces different keys', () => {
    expect(queryKeys.storeReviews.forStore('s-1')).not.toEqual(queryKeys.storeReviews.forStore('s-2'));
  });

  it('forStore() with different params (same store) produces different keys', () => {
    const a = JSON.stringify(queryKeys.storeReviews.forStore('s-1', { page: 1 }));
    const b = JSON.stringify(queryKeys.storeReviews.forStore('s-1', { page: 2 }));
    expect(a).not.toBe(b);
  });

  it('does not collide with queryKeys.stores.detail() for the same id', () => {
    expect(queryKeys.storeReviews.forStore('s-1')).not.toEqual(queryKeys.stores.detail('s-1'));
  });
});

// ── Products ──────────────────────────────────────────────────────

describe('queryKeys.products', () => {
  it('all() returns ["products"]', () => {
    expect(queryKeys.products.all()).toEqual(['products']);
  });

  it('list() with no params returns a stable key', () => {
    expect(queryKeys.products.list()).toEqual(['products', 'list', {}]);
  });

  it('list() with different params produces different keys', () => {
    const a = JSON.stringify(queryKeys.products.list({ storeId: 's-1' }));
    const b = JSON.stringify(queryKeys.products.list({ storeId: 's-2' }));
    expect(a).not.toBe(b);
  });

  it('detail() includes the id, and different ids produce different keys', () => {
    expect(queryKeys.products.detail('p-1')).toEqual(['products', 'detail', 'p-1']);
    expect(queryKeys.products.detail('p-1')).not.toEqual(queryKeys.products.detail('p-2'));
  });

  it('mine() returns ["products", "me", {}] with no params (uses "me" segment, matching the /products/me endpoint)', () => {
    expect(queryKeys.products.mine()).toEqual(['products', 'me', {}]);
  });

  it('mine() with different params produces different keys', () => {
    const a = JSON.stringify(queryKeys.products.mine({ status: 'ACTIVE' }));
    const b = JSON.stringify(queryKeys.products.mine({ status: 'PAUSED' }));
    expect(a).not.toBe(b);
  });

  it('every products.* key starts with "products" (broad-prefix invalidation — required by useToggleProductStatus)', () => {
    const keys = [
      queryKeys.products.all(),
      queryKeys.products.list(),
      queryKeys.products.detail('x'),
      queryKeys.products.mine(),
    ];
    keys.forEach((k) => expect(k[0]).toBe('products'));
  });

  it('mine() and list() do not collide even with identical extra params', () => {
    expect(queryKeys.products.mine({ page: 1 })).not.toEqual(queryKeys.products.list({ page: 1 }));
  });
});

// ── Product categories ────────────────────────────────────────────

describe('queryKeys.productCategories', () => {
  it('all() returns ["product-categories"]', () => {
    expect(queryKeys.productCategories.all()).toEqual(['product-categories']);
  });

  it('slug() includes the slug segment', () => {
    expect(queryKeys.productCategories.slug('electronics')).toEqual([
      'product-categories', 'slug', 'electronics',
    ]);
  });

  it('adminAll() returns a distinct key from all()', () => {
    expect(queryKeys.productCategories.adminAll()).toEqual(['product-categories', 'admin', 'all']);
    expect(queryKeys.productCategories.adminAll()).not.toEqual(queryKeys.productCategories.all());
  });

  it('all product-categories keys start with "product-categories"', () => {
    [
      queryKeys.productCategories.all(),
      queryKeys.productCategories.slug('x'),
      queryKeys.productCategories.adminAll(),
    ].forEach((k) => expect(k[0]).toBe('product-categories'));
  });

  it('does not collide with the existing categories.* domain', () => {
    expect(queryKeys.productCategories.all()).not.toEqual(queryKeys.categories.all());
    expect(queryKeys.productCategories.slug('x')).not.toEqual(queryKeys.categories.slug('x'));
  });
});

// ── Cross-domain uniqueness ───────────────────────────────────────

describe('cross-domain key uniqueness (stores module vs rest of the app)', () => {
  it('stores.detail("x") does not equal products.detail("x")', () => {
    expect(queryKeys.stores.detail('x')).not.toEqual(queryKeys.products.detail('x'));
  });

  it('stores.detail("x") does not equal ads.detail("x") or users.detail("x")', () => {
    expect(queryKeys.stores.detail('x')).not.toEqual(queryKeys.ads.detail('x'));
    expect(queryKeys.stores.detail('x')).not.toEqual(queryKeys.users.detail('x'));
  });

  it('stores.me() does not collide with any other domain key', () => {
    const me = JSON.stringify(queryKeys.stores.me());
    const others = [
      queryKeys.ads.all(), queryKeys.categories.all(), queryKeys.favorites.all(),
      queryKeys.admin.ads(), queryKeys.products.all(), queryKeys.productCategories.all(),
      queryKeys.auth.me(),
    ].map((k) => JSON.stringify(k));
    others.forEach((k) => expect(me).not.toBe(k));
  });
});

// ── All factories return arrays ────────────────────────────────────

describe('all stores-module queryKey factories return arrays', () => {
  const allKeys = [
    queryKeys.stores.all(),
    queryKeys.stores.list(),
    queryKeys.stores.detail('x'),
    queryKeys.stores.me(),
    queryKeys.stores.followed(),
    queryKeys.storeReviews.forStore('x'),
    queryKeys.products.all(),
    queryKeys.products.list(),
    queryKeys.products.detail('x'),
    queryKeys.products.mine(),
    queryKeys.productCategories.all(),
    queryKeys.productCategories.slug('x'),
    queryKeys.productCategories.adminAll(),
  ];

  allKeys.forEach((key, i) => {
    it(`key[${i}] is an array with length >= 1`, () => {
      expect(Array.isArray(key)).toBe(true);
      expect(key.length).toBeGreaterThanOrEqual(1);
    });
  });
});
