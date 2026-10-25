/**
 * __tests__/integration/queryKeys.test.ts
 *
 * Coverage targets:
 *  - Every queryKey factory produces a readonly tuple
 *  - Key uniqueness: different params → different keys (no accidental collisions)
 *  - Prefix invalidation: sharing a common prefix
 *  - Type safety: undefined params produce stable empty-param keys
 *  - admin keys are parameterised ()
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

// ── Admin — parameterised keys ──────────────────────────

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
    queryKeys.recommendations.list(),
    queryKeys.recommendations.products(),
    queryKeys.recommendations.services(),
    queryKeys.recommendations.stores(),
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

// ── Recommendations (PR4C — product/service/store keys) ────────────

describe('queryKeys.recommendations', () => {
  it('list() (ads) keeps its original two-segment shape — no type segment', () => {
    expect(queryKeys.recommendations.list()).toEqual(['recommendations', {}]);
    expect(queryKeys.recommendations.list({ excludeAdId: 'ad-1' })).toEqual([
      'recommendations',
      { excludeAdId: 'ad-1' },
    ]);
  });

  it('products()/services()/stores() each get their own type segment', () => {
    expect(queryKeys.recommendations.products()).toEqual(['recommendations', 'product', {}]);
    expect(queryKeys.recommendations.services()).toEqual(['recommendations', 'service', {}]);
    expect(queryKeys.recommendations.stores()).toEqual(['recommendations', 'store', {}]);
  });

  it('an ad key and a product key with the same params never collide', () => {
    const adKey = JSON.stringify(queryKeys.recommendations.list({ limit: 8 }));
    const productKey = JSON.stringify(
      queryKeys.recommendations.products({ limit: 8 } as never)
    );
    expect(adKey).not.toBe(productKey);
  });

  it('stores() includes lat/lng/excludeStoreId when provided', () => {
    expect(
      queryKeys.recommendations.stores({ limit: 6, excludeStoreId: 'store-1', lat: 31.5, lng: 34.4 })
    ).toEqual(['recommendations', 'store', { limit: 6, excludeStoreId: 'store-1', lat: 31.5, lng: 34.4 }]);
  });


  it('service recommendations include serviceTypeId in cache identity', () => {
    expect(queryKeys.recommendations.services({ serviceTypeId: 'plumbing', city: 'غزة' })).toEqual([
      'recommendations', 'service', { serviceTypeId: 'plumbing', city: 'غزة' },
    ]);
  });

  it('provider recommendation params are canonical when omitted', () => {
    expect(queryKeys.recommendations.providers()).toEqual(['recommendations', 'providers', {}]);
  });

  it('different excludeProductId values produce different product keys', () => {
    const a = JSON.stringify(queryKeys.recommendations.products({ excludeProductId: 'p1' }));
    const b = JSON.stringify(queryKeys.recommendations.products({ excludeProductId: 'p2' }));
    expect(a).not.toBe(b);
  });
});

// ── Centralized infinite-query and legacy key families ─────────────

describe('sales query key parameter contracts', () => {
  it('preserves only supported sales list parameters in the cache identity', () => {
    expect(queryKeys.sales.list({ page: 2, limit: 12, status: 'PAID', entityType: 'PRODUCT' })).toEqual([
      'sales', 'list', { page: 2, limit: 12, status: 'PAID', entityType: 'PRODUCT' },
    ]);
  });

  it('includes report filters in the report cache identity', () => {
    expect(queryKeys.sales.report({ from: '2026-10-01', to: '2026-10-09', status: 'UNPAID' })).toEqual([
      'sales', 'report', { from: '2026-10-01', to: '2026-10-09', status: 'UNPAID' },
    ]);
  });
});

describe('queryKeys centralized query families', () => {
  it('preserves established infinite-query key shapes', () => {
    expect(queryKeys.ads.infinite('browse', { city: 'غزة', pageSize: 12 })).toEqual([
      'ads', 'infinite', 'browse', { city: 'غزة', pageSize: 12 },
    ]);
    expect(queryKeys.stores.infinite({ city: 'رفح', pageSize: 12 })).toEqual([
      'stores', 'infinite', { city: 'رفح', pageSize: 12 },
    ]);
    expect(queryKeys.products.infinite({ hasPromotion: true, pageSize: 12 })).toEqual([
      'products', 'infinite', { hasPromotion: true, pageSize: 12 },
    ]);
    expect(queryKeys.serviceListings.infinite({ serviceTypeId: 'repair', pageSize: 12 })).toEqual([
      'service-listings', 'infinite', { serviceTypeId: 'repair', pageSize: 12 },
    ]);
    expect(queryKeys.search.infinite({ q: 'حاسوب', pageSize: 12 })).toEqual([
      'search', 'infinite', { q: 'حاسوب', pageSize: 12 },
    ]);
  });

  it('keeps message-prefix keys compatible with parameterized message queries', () => {
    const prefix = queryKeys.conversations.messagesRoot('conversation-1');
    const exact = queryKeys.conversations.messages('conversation-1', { limit: 50 });
    expect(prefix).toEqual(['conversations', 'detail', 'conversation-1', 'messages']);
    expect(exact.slice(0, prefix.length)).toEqual(prefix);
  });

  it('provides centralized keys for previously inline query families', () => {
    expect(queryKeys.recommendations.providers({ city: 'غزة' }, 'user')).toEqual([
      'recommendations', 'providers', { city: 'غزة' }, 'user',
    ]);
    expect(queryKeys.admin.serviceRequestDisputes({ page: 2, limit: 20 })).toEqual([
      'admin', 'service-request-disputes', { page: 2, limit: 20 },
    ]);
    expect(queryKeys.sales.receipt('sale-1')).toEqual(['sales', 'receipt', 'sale-1']);
    expect(queryKeys.serviceListingMatches('listing-1')).toEqual(['service-listing-matches', 'listing-1']);
    expect(queryKeys.publicStoreSalesStats('store-slug')).toEqual(['public-store-sales-stats', 'store-slug']);
    expect(queryKeys.serviceProviders.myServiceTypes()).toEqual(['my-service-provider-service-types']);
  });

  it('provides root prefixes without changing parameterized admin keys', () => {
    expect(queryKeys.admin.adsRoot()).toEqual(['admin', 'ads']);
    expect(queryKeys.admin.ads({ page: 1 }).slice(0, 2)).toEqual(queryKeys.admin.adsRoot());
    expect(queryKeys.admin.usersRoot()).toEqual(['admin', 'users']);
    expect(queryKeys.admin.sellersRoot()).toEqual(['admin', 'sellers']);
    expect(queryKeys.admin.storesRoot()).toEqual(['admin', 'stores']);
  });
});

// ── Keys migrated from helper modules into the central factory ────

describe('queryKeys home and favorites', () => {
  it('home.feed isolates city, explicit-all mode, and user identity', () => {
    expect(queryKeys.home.feed(undefined, null, false)).toEqual(['home', 'feed', null, 'guest']);
    expect(queryKeys.home.feed('غزة', 'user-1', false)).toEqual(['home', 'feed', 'غزة', 'user-1']);
    expect(queryKeys.home.feed(undefined, 'user-1', true)).toEqual(['home', 'feed', '__ALL__', 'user-1']);
    expect(queryKeys.home.feed(undefined, 'user-1', false)).not.toEqual(queryKeys.home.feed(undefined, 'user-2', false));
  });

  it('favorites.lists is distinct from the favorites item list and ids set', () => {
    expect(queryKeys.favorites.lists()).toEqual(['favorites', 'lists']);
    expect(queryKeys.favorites.lists()).not.toEqual(queryKeys.favorites.all());
    expect(queryKeys.favorites.lists()).not.toEqual(queryKeys.favorites.ids());
  });
});


// ── Canonical invalidation prefixes (Phase 3) ─────────────────────
describe('canonical invalidation prefixes', () => {
  it('exposes roots that cover every query variant in a domain', () => {
    expect(queryKeys.ads.mineRoot()).toEqual(['ads', 'me']);
    expect(queryKeys.conversations.mineRoot()).toEqual(['conversations', 'me']);
    expect(queryKeys.conversations.mine()).toEqual(['conversations', 'me', {}]);
    expect(queryKeys.appointments.mineRoot()).toEqual(['appointments', 'me']);
    expect(queryKeys.appointments.mine()).toEqual(['appointments', 'me', {}]);
    expect(queryKeys.notifications.mineRoot()).toEqual(['notifications', 'me']);
    expect(queryKeys.notifications.mine()).toEqual(['notifications', 'me', {}]);
    expect(queryKeys.serviceReviews.all()).toEqual(['service-reviews']);
  });

  it('exposes stable roots for admin and stock history invalidation', () => {
    expect(queryKeys.admin.reportsRoot()).toEqual(['admin', 'reports']);
    expect(queryKeys.admin.reports()).toEqual(['admin', 'reports', {}]);
    expect(queryKeys.admin.fraudRoot()).toEqual(['admin', 'fraud']);
    expect(queryKeys.admin.productsRoot()).toEqual(['admin', 'products']);
    expect(queryKeys.admin.serviceListingsRoot()).toEqual(['admin', 'service-listings']);
    expect(queryKeys.admin.openRequestsRoot()).toEqual(['admin', 'open-requests']);
    expect(queryKeys.admin.serviceRequestDisputesRoot()).toEqual(['admin', 'service-request-disputes']);
    expect(queryKeys.products.stockHistoryRoot()).toEqual(['products', 'stock', 'history']);
  });

  it('keeps favorite list and entity list prefixes separate', () => {
    expect(queryKeys.favorites.listRoot()).toEqual(['favorites', 'list']);
    expect(queryKeys.favorites.entityListRoot('PRODUCT')).toEqual(['favorites', 'entity-list', 'product']);
    expect(queryKeys.favorites.listRoot()).not.toEqual(queryKeys.favorites.entityListRoot('PRODUCT'));
  });
});


// ── Invalidation prefixes (Phase 3) ───────────────────────────────

describe('queryKeys invalidation roots', () => {
  it('conversation root helpers cover every parameterized list/message variant', () => {
    const root = queryKeys.conversations.mineRoot();
    const list = queryKeys.conversations.mine({ page: 2 });
    expect(list.slice(0, root.length)).toEqual(root);
    expect(queryKeys.conversations.messages('c-1', { limit: 50 }).slice(0, queryKeys.conversations.messagesRoot('c-1').length))
      .toEqual(queryKeys.conversations.messagesRoot('c-1'));
  });

  it('domain roots are stable prefixes, not parameterized cache entries', () => {
    expect(queryKeys.notifications.mineRoot()).toEqual(['notifications', 'me']);
    expect(queryKeys.serviceReviews.all()).toEqual(['service-reviews']);
    expect(queryKeys.appointments.mineRoot()).toEqual(['appointments', 'me']);
    expect(queryKeys.products.stockHistoryRoot()).toEqual(['products', 'stock', 'history']);
  });

  it('admin mutation roots cover all filtered query variants', () => {
    const cases = [
      [queryKeys.admin.reportsRoot(), queryKeys.admin.reports({ status: 'OPEN', page: 2 })],
      [queryKeys.admin.fraudRoot(), queryKeys.admin.fraudAds({ page: 2 })],
      [queryKeys.admin.productsRoot(), queryKeys.admin.products({ page: 2 })],
      [queryKeys.admin.serviceListingsRoot(), queryKeys.admin.serviceListings({ page: 2 })],
      [queryKeys.admin.openRequestsRoot(), queryKeys.admin.openRequests({ page: 2 })],
      [queryKeys.admin.serviceRequestDisputesRoot(), queryKeys.admin.serviceRequestDisputes({ page: 2 })],
    ] as const;

    for (const [root, key] of cases) {
      expect(key.slice(0, root.length)).toEqual(root);
    }
  });
});
