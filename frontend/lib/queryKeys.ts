/**
 * Centralised TanStack Query key factory.
 *
 * Rules:
 *  1. Every key is a readonly tuple — TypeScript-safe.
 *  2. Prefix invalidation works by passing the first N segments:
 *       queryClient.invalidateQueries({ queryKey: ['admin', 'ads'] })
 *       invalidates ['admin','ads',{page:1}], ['admin','ads',{page:2}], etc.
 *  3. The factory functions accept undefined params so callers don't need
 *     optional chaining: queryKeys.ads.list() === queryKeys.ads.list(undefined).
 *
 * FIX Q-04: admin keys are now parameterised so invalidation by prefix works.
 * Added:   favorites.ids() — the Set<string> lookup key (no API, in-memory only).
 *          admin.reportDetail() — for individual report cache entries.
 *          auth.me() + auth.sessions() — moved here from scattered inline keys.
 */

import type { AdSearchParams, AdSearchQuery } from '@/types/ad.types';
import type { FavoriteEntityKind } from '@/types/favorite.types';
import type { AdminGetAdsParams, AdminGetUsersParams, AdminGetSellersParams, AdminGetStoresParams, AdminGetAuditLogsParams, AdminGetFlaggedAdsParams, AdminGetFraudSignalsParams } from '@/types/admin.types';

export const queryKeys = {
  // ── Ads ────────────────────────────────────────────────────────
  ads: {
    /** Prefix for all ad queries — use for broad invalidation only */
    all:     ()                    => ['ads']                    as const,
    list:    (params?: AdSearchParams) => ['ads', 'list', params ?? {}] as const,
    search:  (params: AdSearchQuery)   => ['ads', 'search', params]     as const,
    detail:  (id: string)          => ['ads', 'detail', id]     as const,
    related: (id: string)          => ['ads', 'related', id]    as const,
    mine:    (params?: object)     => ['ads', 'me', params ?? {}] as const,
    myStats: ()                    => ['ads', 'me', 'stats']       as const,
  },

  // ── Recommendations (Gap #9, generalized PR4B/PR4C) ─────────────
  // Personalized per caller (varies with the Bearer token), so params
  // alone don't fully identify a cache entry the way ads.list's do —
  // that's fine here since the cache is per-browser-session anyway
  // (no shared HTTP cache; see recommendations.routes.ts's CACHE.NONE).
  // list() keeps its exact original key shape (ads mode, no `type`
  // segment) so this is not a breaking change for existing callers;
  // products/services/stores get their own sibling keys with a `type`
  // segment so an ad rail and a product rail can never collide on the
  // same cache entry even if both happened to be called with `{}`.
  recommendations: {
    // `scope` ('guest' | 'user') keeps a guest's trending rail and a
    // logged-in user's personalized rail in separate cache entries — the
    // request params are identical for both, so without it a fresh login
    // could keep showing the guest results under a "for you" heading.
    list: (
      params?: { limit?: number; excludeAdId?: string; city?: string },
      scope?: 'guest' | 'user',
    ) => ['recommendations', params ?? {}, ...(scope ? [scope] : [])] as const,
    products: (
      params?: { limit?: number; excludeProductId?: string; city?: string },
      scope?: 'guest' | 'user',
    ) => ['recommendations', 'product', params ?? {}, ...(scope ? [scope] : [])] as const,
    services: (
      params?: { limit?: number; excludeServiceListingId?: string; city?: string },
      scope?: 'guest' | 'user',
    ) => ['recommendations', 'service', params ?? {}, ...(scope ? [scope] : [])] as const,
    stores: (params?: { limit?: number; excludeStoreId?: string; lat?: number; lng?: number }) =>
      ['recommendations', 'store', params ?? {}] as const,
    // RECS-MIXED-01: ads + products + services in one response (home shelf).
    mixed: (params?: { limit?: number; city?: string }, scope?: 'guest' | 'user') =>
      ['recommendations', 'mixed', params ?? {}, ...(scope ? [scope] : [])] as const,
  },

  // ── Users ──────────────────────────────────────────────────────
  users: {
    detail: (id: string)           => ['users', id]              as const,
    ads:    (id: string, params?: object) =>
                                      ['users', id, 'ads', params ?? {}] as const,
  },

  // ── Sellers ────────────────────────────────────────────────────
  sellers: {
    detail:  (id: string) => ['sellers', id]        as const,
    me:      ()            => ['sellers', 'me']      as const,
    attention: ()          => ['sellers', 'me', 'attention'] as const,
    // TRACK-AD-RATINGS-LIST: mirrors storeReviews.forStore below —
    // same (id, params) key shape.
    ratings: (sellerProfileId: string, params?: object) =>
      ['sellers', sellerProfileId, 'ratings', params ?? {}] as const,
  },

  // ── Service providers ─────────────────────────────────────────
  serviceProviders: {
    // Phase 3: public city/browse directory — GET /service-providers?city=.
    // Same ['x','list',params] shape as ads.list/stores.list, so cache
    // isolation between city/general params happens automatically.
    list:   (params?: object) => ['service-providers', 'list', params ?? {}] as const,
    detail: (id: string) => ['service-providers', id] as const,
    me:     ()            => ['service-providers', 'me'] as const,
    nearby: (params?: object) => ['service-providers', 'nearby', params ?? {}] as const,
    // Mirrors stores.analytics() below.
    analytics: ()          => ['service-providers', 'me', 'analytics'] as const,
  },

  // ── Stores ───────────────────────────────────────────────────────
  storeTypes: {
    all: () => ['store-types'] as const,
    fields: (id: string) => ['store-types', 'fields', id] as const,
  },

  stores: {
    all:      ()                => ['stores'] as const,
    list:     (params?: object) => ['stores', 'list', params ?? {}] as const,
    detail:   (id: string)      => ['stores', 'detail', id] as const,
    me:       ()                => ['stores', 'me'] as const,
    followed: (params?: object) => ['stores', 'followed', params ?? {}] as const,
    // FIX BUG-03: mirrors queryKeys.favorites.ids() — a single cached
    // Set<string> of followed store ids, populated by useMyFollowedStores
    // and read reactively by useIsFollowingStore(). See hooks/queries/useStores.ts.
    followedIds: ()              => ['stores', 'followed-ids'] as const,
    // STORE-ANALYTICS (Foundation v1)
    analytics: ()                => ['stores', 'me', 'analytics'] as const,
    members: (storeId: string, params?: object) => ['stores', 'members', storeId, params ?? {}] as const,
    memberInvites: () => ['stores', 'member-invites'] as const,
  },

  // ── Store reviews ──────────────────────────────────────────────
  storeReviews: {
    forStore: (storeId: string, params?: object) =>
      ['store-reviews', storeId, params ?? {}] as const,
  },

  // ── Store collections (P1) ────────────────────────────────────
  collections: {
    all:      ()                => ['collections'] as const,
    mine:     ()                => ['collections', 'me'] as const,
    detail:   (id: string)      => ['collections', 'detail', id] as const,
    // Public storefront reads — keyed separately from the owner-only
    // mine()/detail() above since they hit different endpoints
    // (/store/:storeId vs /me, /:id) and must not share a cache entry.
    forStore: (storeId: string) => ['collections', 'store', storeId] as const,
    products: (id: string)      => ['collections', id, 'products'] as const,
  },

  // ── Store / provider badges (P1) ────────────────────────────────
  badges: {
    forStore: (storeId: string) => ['badges', 'store', storeId] as const,
    forProvider: (providerId: string) => ['badges', 'provider', providerId] as const,
  },

  // ── Products ───────────────────────────────────────────────────
  products: {
    all:    ()                => ['products'] as const,
    list:   (params?: object) => ['products', 'list', params ?? {}] as const,
    detail: (id: string)      => ['products', 'detail', id] as const,
    mine:   (params?: object) => ['products', 'me', params ?? {}] as const,
    stockSummary: () => ['products', 'stock', 'summary'] as const,
    stockHistory: (params?: object) => ['products', 'stock', 'history', params ?? {}] as const,
  },

  // ── Promotions ─────────────────────────────────────────────────
  promotions: {
    all:    ()           => ['promotions'] as const,
    mine:   ()            => ['promotions', 'me'] as const,
    detail: (id: string) => ['promotions', 'detail', id] as const,
  },

  // ── Product categories ─────────────────────────────────────────
  productCategories: {
    all:      ()             => ['product-categories'] as const,
    slug:     (slug: string) => ['product-categories', 'slug', slug] as const,
    adminAll: ()             => ['product-categories', 'admin', 'all'] as const,
  },

  // ── Service categories ────────────────────────────────────────
  serviceCategories: {
    all:      ()             => ['service-categories'] as const,
    slug:     (slug: string) => ['service-categories', 'slug', slug] as const,
    // EPIC 1.2: separate key from `all` above — admin.all() includes
    // inactive categories and is never cached server-side (see
    // service-categories.service.ts's getServiceCategoriesForAdmin),
    // so it must never share a cache entry with the public tree.
    adminAll: ()             => ['service-categories', 'admin', 'all'] as const,
  },

  // ── Service listings ──────────────────────────────────────────
  serviceListings: {
    all:    ()                              => ['service-listings'] as const,
    list:   (params?: object)               => ['service-listings', 'list', params ?? {}] as const,
    detail: (id: string)                    => ['service-listings', 'detail', id] as const,
    mine:   (params?: object)               => ['service-listings', 'me', params ?? {}] as const,
  },

  // ── Open Requests marketplace (SERVICE | PRODUCT | RENTAL) ─────
  requests: {
    all:      ()                 => ['requests'] as const,
    open:     (params?: object)  => ['requests', 'open', params ?? {}] as const,
    mine:     (params?: object)  => ['requests', 'me', params ?? {}] as const,
    myOffers: (params?: object)  => ['requests', 'my-offers', params ?? {}] as const,
    detail:   (id: string)       => ['requests', 'detail', id] as const,
  },

  // ── Service requests (مرحلة 3) ────────────────────────────────
  serviceRequests: {
    detail:   (id: string)      => ['service-requests', 'detail', id] as const,
    mine:     (params?: object) => ['service-requests', 'me', params ?? {}] as const,
    incoming: (params?: object) => ['service-requests', 'incoming', params ?? {}] as const,
  },

  // ── Service reviews (مرحلة 3.2/3.3) ───────────────────────────
  serviceReviews: {
    forSeller: (sellerProfileId: string, params?: object) =>
      ['service-reviews', 'seller', sellerProfileId, params ?? {}] as const,
  },

  // ── Appointments (Epic 4) ────────────────────────────────────────
  appointments: {
    mine:        (params?: object)                => ['appointments', 'me', params ?? {}] as const,
    availability: (providerId: string, date: string) =>
      ['appointments', 'availability', providerId, date] as const,
  },

  // ── Conversations / Messages (Epic 5) ────────────────────────────
  conversations: {
    mine:     (params?: object) => ['conversations', 'me', params ?? {}] as const,
    detail:   (id: string)      => ['conversations', 'detail', id] as const,
    unreadCount: ()             => ['conversations', 'unreadCount'] as const,
    messages: (id: string, params?: object) =>
      ['conversations', 'detail', id, 'messages', params ?? {}] as const,
  },

  // ── Presence — online/offline dots on chat, heartbeat-based ────────
  presence: {
    // Sorted+joined ids as the key's own identity, same "stable string
    // from a set of ids" idea as favorites/blockedUsers' id-set keys —
    // two calls with the same parties (regardless of array order)
    // resolve to the same cache entry instead of duplicating it.
    bulk: (userIds: string[]) => ['presence', 'bulk', [...userIds].sort().join(',')] as const,
  },

  // ── Notifications (Epic 6) ────────────────────────────────────
  notifications: {
    mine:        (params?: object) => ['notifications', 'me', params ?? {}] as const,
    unreadCount: ()                => ['notifications', 'unread-count'] as const,
    devices:     ()                => ['notifications', 'devices'] as const,
  },

  // ── Blocked users ──────────────────────────────────────────────
  blockedUsers: {
    all:  (params?: object) => ['blocked-users', 'list', params ?? {}] as const,
    /**
     * In-memory Set<string> of blocked user IDs — mirrors
     * favorites.ids()/stores.followedIds(). Populated from the list
     * query, read reactively by useIsUserBlocked() for O(1) lookup in
     * ChatWindow without a per-user network call (there's no single
     * GET /blocked-users/:userId/status endpoint).
     */
    ids:  ()                => ['blocked-users', 'ids']               as const,
  },

  // ── Auth / current user ────────────────────────────────────────
  auth: {
    me:       ()               => ['auth', 'me']        as const,
    sessions: ()               => ['auth', 'sessions']  as const,
  },

  // ── Home (aggregated above-the-fold homepage payload) ────────────
  home: {
    page: (city?: string) => ['home', 'page', city ?? null] as const,
  },

  // ── Categories ─────────────────────────────────────────────────
  categories: {
    all:  ()             => ['categories']           as const,
    slug: (slug: string) => ['categories', 'slug', slug] as const,
    id:   (id: string)   => ['categories', 'id', id]    as const,
    // FIX ADMIN-CATEGORIES-FRESH-01: separate key from `all` above
    // — admin.all() includes _count.ads and is never cached
    // server-side (see categories.service.ts's
    // getCategoriesForAdmin). Same convention as
    // serviceCategories.adminAll / productCategories.adminAll.
    adminAll: ()         => ['categories', 'admin-all'] as const,
  },

  // ── Favorites ──────────────────────────────────────────────────
  favorites: {
    /** Paginated list of favorited ads */
    all:  (params?: object)  => ['favorites', 'list', params ?? {}] as const,
    /**
     * In-memory Set<string> of favorited ad IDs.
     * Populated from the list query — no API call.
     * Used by useIsFavorited() for O(1) lookup per AdCard.
     */
    ids:  ()                 => ['favorites', 'ids']               as const,
    /**
     * GET /favorites/:adId/check — single-ad favorite status.
     * UX-FIX (frontend audit P2-03): used by useFavoriteCheck() for
     * single-ad views (ad detail page) instead of paging through the
     * whole favorites list just to check one ad.
     */
    check: (adId: string)    => ['favorites', 'check', adId]        as const,

    // FEAT-FAVORITE-POLYMORPHIC PR3: generic counterparts of
    // all()/ids()/check() above, for products/stores/service
    // listings. Kept as separate keys (not folded into the AD ones)
    // since they're backed by a different wire shape and — for
    // ids()/check() — a different cache Set per entity type, so a
    // product and a store can never collide on the same id.
    entityList:  (type: FavoriteEntityKind, params?: object) =>
      ['favorites', 'entity-list', type, params ?? {}] as const,
    entityIds:   (type: FavoriteEntityKind) =>
      ['favorites', 'entity-ids', type]               as const,
    entityCheck: (type: FavoriteEntityKind, entityId: string) =>
      ['favorites', 'entity-check', type, entityId]   as const,
  },

  // ── Saved Searches ─────────────────────────────────────────────
  savedSearches: {
    /** The current user's full list — capped at 20 server-side, no pagination. */
    all: () => ['savedSearches', 'list'] as const,
  },

  // ── Activity ("نشاطي") ───────────────────────────────────────
  activity: {
    /** The current user's own activity timeline, paginated + filterable
     * by group/type/q — see types/activity.types.ts's ActivityQuery. */
    mine: (params?: object) => ['activity', 'me', params ?? {}] as const,
  },

  // ── My Reports ("بلاغاتي") ──────────────────────────────────────
  // FEAT-REPORT-USER-STORE: separate from admin.reports below — that key
  // is the admin moderation queue (every user's reports, admin-gated);
  // this one is a single reporter checking their own filed reports.
  myReports: {
    all: (params?: object) => ['reports', 'me', params ?? {}] as const,
  },

  // ── Unified search ────────────────────────────────────────────
  search: {
    unified:     (params?: object) => ['search', 'unified', params ?? {}] as const,
    suggestions: (q: string)       => ['search', 'suggestions', q]        as const,
  },

  // ── Admin ──────────────────────────────────────────────────────
  admin: {
    opsQueue: () => ['admin', 'ops-queue'] as const,
    /** FIX Q-04: parameterised so prefix invalidation matches these entries */
    stats:        ()                              => ['admin', 'stats'] as const,
    ads:          (params?: AdminGetAdsParams)   => ['admin', 'ads',     params ?? {}] as const,
    users:        (params?: AdminGetUsersParams) => ['admin', 'users',   params ?? {}] as const,
    sellers:      (params?: AdminGetSellersParams) => ['admin', 'sellers', params ?? {}] as const,
    // AUDIT-FIX (issue #1): parameterised by status/q/page like sellers,
    // so approving a store (invalidating with a narrower key) doesn't
    // also blow away unrelated cached pages.
    stores:       (params?: AdminGetStoresParams) => ['admin', 'stores', params ?? {}] as const,
    storeTypes:   () => ['admin', 'store-types'] as const,
    reports:      (params?: object)              => ['admin', 'reports', params ?? {}] as const,
    reportDetail: (id: string)                   => ['admin', 'reports', 'detail', id] as const,
    auditLogs:    (params?: AdminGetAuditLogsParams) => ['admin', 'audit-logs', params ?? {}] as const,
    // Gap #7 (product analytics): matches GetAnalyticsSummaryParams shape.
    analyticsSummary: (params?: { from?: string; to?: string; bucket?: 'day' | 'week' }) =>
      ['admin', 'analytics', 'summary', params ?? {}] as const,
    // FRAUD-UI: /admin/fraud/* had a fully working backend module
    // (service/repository/routes/tests) with no frontend query hook at
    // all — see AdminFraudTable.tsx.
    fraudAds:     (params?: AdminGetFlaggedAdsParams)    => ['admin', 'fraud', 'ads',     params ?? {}] as const,
    fraudSignals: (params?: AdminGetFraudSignalsParams)  => ['admin', 'fraud', 'signals', params ?? {}] as const,
    // FIX ADMIN-KEYS-COMPLETE-01: six admin keys were built as inline raw
    // array literals in useAdmin.ts, bypassing this file. Prefix
    // invalidation from admin mutations targeted queryKeys.admin.* and
    // never matched those literals, so the cache went stale after every
    // action. Consolidated here so every admin key lives in one place.
    products:          (params?: object) => ['admin', 'products',           params ?? {}] as const,
    serviceListings:   (params?: object) => ['admin', 'service-listings',   params ?? {}] as const,
    openRequests:      (params?: object) => ['admin', 'open-requests',      params ?? {}] as const,
    trends:            (days: number)    => ['admin', 'trends',             days]         as const,
    systemHealth:      ()                => ['admin', 'system-health']                     as const,
  },
} as const;
