/**
 * Centralised TanStack Query key factory.
 *
 * Rules:
 *  1. Every key is a readonly tuple — TypeScript-safe.
 *  2. Prefix invalidation works by passing the first N segments:
 *       queryClient.invalidateQueries({ queryKey: queryKeys.admin.adsRoot() })
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
import type { ProductsQuery } from '@/types/product.types';
import type { StoresQuery } from '@/types/store.types';
import type { ServiceListingsQuery } from '@/types/service.types';
import type { ConversationsQuery, MessagesQuery } from '@/types/conversation.types';
import type { NotificationsQuery } from '@/types/notification.types';
import type { SaleEntityType, SalePaymentStatus } from '@/types/sale.types';
import type { SearchQuery } from '@/types/search.types';
import type { AdminGetAdsParams, AdminGetUsersParams, AdminGetSellersParams, AdminGetStoresParams, AdminGetAuditLogsParams, AdminGetFlaggedAdsParams, AdminGetFraudSignalsParams } from '@/types/admin.types';
import type { salesApi } from '@/api/sales.api';
import type { followsApi } from '@/api/follows.api';
import type { sellersApi } from '@/api/sellers.api';
import type { serviceProvidersApi } from '@/api/service-providers.api';
import type { storesApi } from '@/api/stores.api';
import type { storeMembersApi } from '@/api/store-members.api';
import type { requestsApi } from '@/api/requests.api';
import type { serviceRequestsApi } from '@/api/service-requests.api';
import type { serviceReviewsApi } from '@/api/service-reviews.api';
import type { appointmentsApi } from '@/api/appointments.api';
import type { blockedUsersApi } from '@/api/blocked-users.api';
import type { favoritesApi } from '@/api/favorites.api';
import type { activityApi } from '@/api/activity.api';
import type { reportsApi } from '@/api/reports.api';
import type { searchApi } from '@/api/search.api';
import type { adminApi } from '@/api/admin.api';
import type {
  GetRecommendationsParams,
  GetProductRecommendationsParams,
  GetServiceRecommendationsParams,
  GetStoreRecommendationsParams,
  GetProviderRecommendationsParams,
  GetMixedRecommendationsParams,
} from '@/api/recommendations.api';

/** Parameters accepted by GET /sales. Keep these aligned with sales.validation.ts. */
export interface SalesListQueryParams {
  page?: number;
  limit?: number;
  status?: SalePaymentStatus;
  entityType?: SaleEntityType;
  customerId?: string;
  storeId?: string;
  from?: string;
  to?: string;
}

/** Parameters accepted by GET /customers. */
export interface CustomerListQueryParams {
  page?: number;
  limit?: number;
  q?: string;
  dueOnly?: boolean;
}

export const queryKeys = {
  // ── Ads ────────────────────────────────────────────────────────
  ads: {
    /** Prefix for all ad queries — use for broad invalidation only */
    all:     ()                    => ['ads']                    as const,
    listRoot: ()                   => ['ads', 'list']             as const,
    searchRoot: ()                 => ['ads', 'search']           as const,
    infiniteRoot: ()               => ['ads', 'infinite']         as const,
    relatedRoot: ()                => ['ads', 'related']          as const,
    list:    (params?: AdSearchParams) => ['ads', 'list', params ?? {}] as const,
    search:  (params: AdSearchQuery)   => ['ads', 'search', params]     as const,
    detail:  (id: string)          => ['ads', 'detail', id]     as const,
    related: (id: string)          => ['ads', 'related', id]    as const,
    /** Infinite browse/search feed; preserves its established cache shape. */
    infinite: (mode: 'search' | 'browse', params?: Omit<AdSearchParams, 'search' | 'page' | 'limit' | 'status' | 'userId' | 'storeId' | 'isFeatured'> & { q?: string; pageSize?: number }) => ['ads', 'infinite', mode, params ?? {}] as const,
    mineRoot: () => ['ads', 'me'] as const,
    mine:    (params?: Pick<AdSearchParams, 'page' | 'limit' | 'status'>) => ['ads', 'me', params ?? {}] as const,
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
      params?: GetRecommendationsParams,
      scope?: 'guest' | 'user',
    ) => ['recommendations', params ?? {}, ...(scope ? [scope] : [])] as const,
    products: (
      params?: GetProductRecommendationsParams,
      scope?: 'guest' | 'user',
    ) => ['recommendations', 'product', params ?? {}, ...(scope ? [scope] : [])] as const,
    services: (
      params?: GetServiceRecommendationsParams,
      scope?: 'guest' | 'user',
    ) => ['recommendations', 'service', params ?? {}, ...(scope ? [scope] : [])] as const,
    stores: (params?: GetStoreRecommendationsParams, scope?: 'guest' | 'user') =>
      ['recommendations', 'store', params ?? {}, ...(scope ? [scope] : [])] as const,
    providers: (params?: GetProviderRecommendationsParams, scope?: 'guest' | 'user') =>
      ['recommendations', 'providers', params ?? {}, ...(scope ? [scope] : [])] as const,
    // RECS-MIXED-01: ads + products + services in one response (home shelf).
    mixed: (params?: GetMixedRecommendationsParams, scope?: 'guest' | 'user') =>
      ['recommendations', 'mixed', params ?? {}, ...(scope ? [scope] : [])] as const,
  },

  // ── Sales log ─────────────────────────────────────────────────
  sales: {
    all: () => ['sales'] as const,
    list: (params?: SalesListQueryParams) => ['sales', 'list', params ?? {}] as const,
    detail: (id: string) => ['sales', 'detail', id] as const,
    summary: (period?: string) => ['sales', 'summary', period ?? 'month'] as const,
    chart: (period?: string) => period === undefined ? ['sales', 'chart'] as const : ['sales', 'chart', period] as const,
    debts: () => ['sales', 'debts'] as const,
    debtSummary: () => ['sales', 'debts', 'summary'] as const,
    compare: (period: string) => ['sales', 'compare', period] as const,
    costSettings: () => ['sales', 'cost-settings'] as const,
    costProducts: () => ['sales', 'cost-products'] as const,
    dashboard: () => ['sales', 'dashboard'] as const,
    report: (params?: Parameters<typeof salesApi.report>[0]) => ['sales', 'report', params ?? {}] as const,
    smartInsights: () => ['sales', 'smart-insights'] as const,
    receipt: (id: string) => ['sales', 'receipt', id] as const,
  },

  customers: {
    all: () => ['customers'] as const,
    listRoot: () => ['customers', 'list'] as const,
    searchRoot: () => ['customers', 'search'] as const,
    detailRoot: () => ['customers', 'detail'] as const,
    summary: () => ['customers', 'summary'] as const,
    list: (params?: CustomerListQueryParams) => ['customers', 'list', params ?? {}] as const,
    detail: (id: string) => ['customers', 'detail', id] as const,
    search: (q: string) => ['customers', 'search', q] as const,
  },
  installments: {
    upcoming: () => ['installments', 'upcoming'] as const,
    overdue: () => ['installments', 'overdue'] as const,
  },

  // ── Users ──────────────────────────────────────────────────────
  users: {
    detail: (id: string)           => ['users', id]              as const,
    ads:    (id: string, params?: AdSearchParams) =>
                                      ['users', id, 'ads', params ?? {}] as const,
  },

  // ── Social follows ─────────────────────────────────────────────
  follows: {
    all: () => ['follows'] as const,
    myRoot: () => ['follows', 'me'] as const,
    feedRoot: () => ['follows', 'feed'] as const,
    followersRoot: (type: string, id: string) => ['follows', 'followers', type, id] as const,
    status: (type: string, id: string) => ['follows', 'status', type, id] as const,
    my: (params?: Parameters<typeof followsApi.myFollowing>[0]) => ['follows', 'me', params ?? {}] as const,
    followers: (type: string, id: string, params?: Parameters<typeof followsApi.userFollowers>[1]) => ['follows', 'followers', type, id, params ?? {}] as const,
    following: (type: string, id: string, params?: Parameters<typeof followsApi.userFollowing>[1]) => ['follows', 'following', type, id, params ?? {}] as const,
    feed: (params?: Parameters<typeof followsApi.feed>[0]) => ['follows', 'feed', params ?? {}] as const,
  },

  // ── Stories ─────────────────────────────────────────────────────
  stories: {
    all: () => ['stories'] as const,
    feed: () => ['stories', 'feed'] as const,
    user: (id: string) => ['stories', 'user', id] as const,
    viewers: (id: string) => ['stories', 'viewers', id] as const,
  },

  // ── Sellers ────────────────────────────────────────────────────
  sellers: {
    detail:  (id: string) => ['sellers', id]        as const,
    me:      ()            => ['sellers', 'me']      as const,
    attention: ()          => ['sellers', 'me', 'attention'] as const,
    // TRACK-AD-RATINGS-LIST: mirrors storeReviews.forStore below —
    // same (id, params) key shape.
    ratings: (sellerProfileId: string, params?: Parameters<typeof sellersApi.getRatings>[1]) =>
      ['sellers', sellerProfileId, 'ratings', params ?? {}] as const,
  },

  // ── Service providers ─────────────────────────────────────────
  serviceProviders: {
    // Phase 3: public city/browse directory — GET /service-providers?city=.
    // Same ['x','list',params] shape as ads.list/stores.list, so cache
    // isolation between city/general params happens automatically.
    list:   (params?: Parameters<typeof serviceProvidersApi.getAll>[0]) => ['service-providers', 'list', params ?? {}] as const,
    detail: (id: string) => ['service-providers', id] as const,
    me:     ()            => ['service-providers', 'me'] as const,
    nearby: (params?: Parameters<typeof serviceProvidersApi.getNearby>[0]) => ['service-providers', 'nearby', params ?? {}] as const,
    // Mirrors stores.analytics() below.
    analytics: ()          => ['service-providers', 'me', 'analytics'] as const,
    analyticsForPeriod: (period: string) => ['service-providers', 'me', 'analytics', period] as const,
    myServiceTypes: () => ['my-service-provider-service-types'] as const,
  },

  // ── Stores ───────────────────────────────────────────────────────
  storeTypes: {
    all: () => ['store-types'] as const,
    fields: (id: string) => ['store-types', 'fields', id] as const,
  },

  stores: {
    all:      ()                => ['stores'] as const,
    list:     (params?: StoresQuery) => ['stores', 'list', params ?? {}] as const,
    detail:   (id: string)      => ['stores', 'detail', id] as const,
    me:       ()                => ['stores', 'me'] as const,
    followed: (params?: Parameters<typeof storesApi.getMyFollowedStores>[0]) => ['stores', 'followed', params ?? {}] as const,
    infinite: (params?: Omit<StoresQuery, 'page' | 'limit' | 'type'> & { pageSize?: number }) => ['stores', 'infinite', params ?? {}] as const,
    // FIX BUG-03: mirrors queryKeys.favorites.ids() — a single cached
    // Set<string> of followed store ids, populated by useMyFollowedStores
    // and read reactively by useIsFollowingStore(). See hooks/queries/useStores.ts.
    followedIds: ()              => ['stores', 'followed-ids'] as const,
    // STORE-ANALYTICS (Foundation v1)
    analytics: ()                => ['stores', 'me', 'analytics'] as const,
    members: (storeId: string, params?: Parameters<typeof storeMembersApi.list>[1]) => ['stores', 'members', storeId, params ?? {}] as const,
    memberInvites: () => ['stores', 'member-invites'] as const,
  },

  // ── Store reviews ──────────────────────────────────────────────
  storeReviews: {
    forStore: (storeId: string, params?: Parameters<typeof storesApi.getReviews>[1]) =>
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
    listRoot: ()              => ['products', 'list'] as const,
    infiniteRoot: ()          => ['products', 'infinite'] as const,
    promotedRoot: ()          => ['products', 'promoted'] as const,
    mineRoot: ()              => ['products', 'me'] as const,
    list:   (params?: ProductsQuery) => ['products', 'list', params ?? {}] as const,
    infinite: (params?: Omit<ProductsQuery, 'page' | 'limit' | 'storeId' | 'status'> & { pageSize?: number }) => ['products', 'infinite', params ?? {}] as const,
    promotedInfinite: (pageSize: number) => ['products', 'promoted', 'infinite', pageSize] as const,
    detailRoot: () => ['products', 'detail'] as const,
    detail: (id: string)      => ['products', 'detail', id] as const,
    mine:   (params?: ProductsQuery) => ['products', 'me', params ?? {}] as const,
    stockSummary: () => ['products', 'stock', 'summary'] as const,
    stockHistoryRoot: () => ['products', 'stock', 'history'] as const,
    stockHistory: (params?: Readonly<Record<string, unknown>>) => ['products', 'stock', 'history', params ?? {}] as const,
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
  serviceTypes: {
    all: () => ['service-types'] as const,
    adminAll: () => ['service-types', 'admin', 'all'] as const,
  },

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
    listRoot: () => ['service-listings', 'list'] as const,
    infiniteRoot: () => ['service-listings', 'infinite'] as const,
    mineRoot: () => ['service-listings', 'me'] as const,
    list:   (params?: ServiceListingsQuery)  => ['service-listings', 'list', params ?? {}] as const,
    detail: (id: string)                    => ['service-listings', 'detail', id] as const,
    mine:   (params?: ServiceListingsQuery)  => ['service-listings', 'me', params ?? {}] as const,
    infinite: (params?: Omit<ServiceListingsQuery, 'page' | 'limit' | 'status' | 'attributeFilters'> & { pageSize?: number }) => ['service-listings', 'infinite', params ?? {}] as const,
  },

  // ── Open Requests marketplace (SERVICE | PRODUCT | RENTAL) ─────
  requests: {
    all:      ()                 => ['requests'] as const,
    openRoot: ()                 => ['requests', 'open'] as const,
    mineRoot: ()                 => ['requests', 'me'] as const,
    myOffersRoot: ()              => ['requests', 'my-offers'] as const,
    open:     (params?: Parameters<typeof requestsApi.getOpenFeed>[0])  => ['requests', 'open', params ?? {}] as const,
    mine:     (params?: Parameters<typeof requestsApi.getMyRequests>[0])  => ['requests', 'me', params ?? {}] as const,
    myOffers: (params?: Parameters<typeof requestsApi.getMyOffers>[0])  => ['requests', 'my-offers', params ?? {}] as const,
    detail:   (id: string)       => ['requests', 'detail', id] as const,
  },

  // ── Service requests (مرحلة 3) ────────────────────────────────
  serviceRequests: {
    all:       ()                => ['service-requests'] as const,
    mineRoot:  ()                => ['service-requests', 'me'] as const,
    incomingRoot: ()             => ['service-requests', 'incoming'] as const,
    detail:   (id: string)      => ['service-requests', 'detail', id] as const,
    mine:     (params?: Parameters<typeof serviceRequestsApi.getMineAsCustomer>[0]) => ['service-requests', 'me', params ?? {}] as const,
    incoming: (params?: Parameters<typeof serviceRequestsApi.getIncomingAsProvider>[0]) => ['service-requests', 'incoming', params ?? {}] as const,
  },

  // ── Service reviews (مرحلة 3.2/3.3) ───────────────────────────
  serviceReviews: {
    all: () => ['service-reviews'] as const,
    forSeller: (sellerProfileId: string, params?: Parameters<typeof serviceReviewsApi.getForSeller>[1]) =>
      ['service-reviews', 'seller', sellerProfileId, params ?? {}] as const,
  },

  // ── Appointments (Epic 4) ────────────────────────────────────────
  appointments: {
    all: () => ['appointments'] as const,
    mineRoot: () => ['appointments', 'me'] as const,
    availabilityRoot: () => ['appointments', 'availability'] as const,
    mine:        (params?: Parameters<typeof appointmentsApi.getMine>[0])                => ['appointments', 'me', params ?? {}] as const,
    availability: (providerId: string, date: string) =>
      ['appointments', 'availability', providerId, date] as const,
  },

  // ── Conversations / Messages (Epic 5) ────────────────────────────
  conversations: {
    all: () => ['conversations'] as const,
    mineRoot: () => ['conversations', 'me'] as const,
    mine:     (params?: ConversationsQuery) => ['conversations', 'me', params ?? {}] as const,
    detail:   (id: string)      => ['conversations', 'detail', id] as const,
    unreadCount: ()             => ['conversations', 'unreadCount'] as const,
    messagesRoot: (id: string) => ['conversations', 'detail', id, 'messages'] as const,
    messages: (id: string, params?: MessagesQuery) =>
      ['conversations', 'detail', id, 'messages', params ?? {}] as const,
    media: (id: string) => ['conversations', 'detail', id, 'media'] as const,
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
    all: () => ['notifications'] as const,
    mineRoot: () => ['notifications', 'me'] as const,
    mine:        (params?: NotificationsQuery) => ['notifications', 'me', params ?? {}] as const,
    unreadCount: ()                => ['notifications', 'unread-count'] as const,
    devices:     ()                => ['notifications', 'devices'] as const,
  },

  // ── Blocked users ──────────────────────────────────────────────
  blockedUsers: {
    all:  (params?: Parameters<typeof blockedUsersApi.getMine>[0]) => ['blocked-users', 'list', params ?? {}] as const,
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
    feed: (city: string | undefined, userId: string | null, explicitAll: boolean) =>
      ['home', 'feed', explicitAll ? '__ALL__' : (city ?? null), userId ?? 'guest'] as const,
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
    /** Prefix for every favorite-related query. */
    root: () => ['favorites'] as const,
    /** Prefix for paginated favorited-ad list variants. */
    listRoot: () => ['favorites', 'list'] as const,
    /** Prefix for polymorphic entity-list variants. */
    entityListRoot: (type: FavoriteEntityKind) => ['favorites', 'entity-list', type] as const,
    /** Saved named favorite lists (separate from the favorite-ad list). */
    lists: () => ['favorites', 'lists'] as const,
    /** Paginated list of favorited ads */
    all:  (params?: Parameters<typeof favoritesApi.getAll>[0])  => ['favorites', 'list', params ?? {}] as const,
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
    entityList:  (type: FavoriteEntityKind, params?: Parameters<typeof favoritesApi.getAllByType>[1]) =>
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
    mine: (params?: Parameters<typeof activityApi.getMine>[0]) => ['activity', 'me', params ?? {}] as const,
  },

  // ── My Reports ("بلاغاتي") ──────────────────────────────────────
  // FEAT-REPORT-USER-STORE: separate from admin.reports below — that key
  // is the admin moderation queue (every user's reports, admin-gated);
  // this one is a single reporter checking their own filed reports.
  myReports: {
    all: (params?: Parameters<typeof reportsApi.getMyReports>[0]) => ['reports', 'me', params ?? {}] as const,
  },

  // ── Unified search ────────────────────────────────────────────
  search: {
    unified:     (params?: Parameters<typeof searchApi.search>[0]) => ['search', 'unified', params ?? {}] as const,
    infinite: (params?: Omit<SearchQuery, 'page' | 'limit'> & { pageSize?: number }) => ['search', 'infinite', params ?? {}] as const,
    suggestions: (q: string)       => ['search', 'suggestions', q]        as const,
  },

  // ── Query families without a broader public domain prefix ───────
  serviceListingMatches: (listingId: string) => ['service-listing-matches', listingId] as const,
  publicStoreSalesStats: (slug: string) => ['public-store-sales-stats', slug] as const,

  // ── Admin ──────────────────────────────────────────────────────
  admin: {
    opsQueue: () => ['admin', 'ops-queue'] as const,
    /** FIX Q-04: parameterised so prefix invalidation matches these entries */
    stats:        ()                              => ['admin', 'stats'] as const,
    adsRoot:      () => ['admin', 'ads'] as const,
    ads:          (params?: AdminGetAdsParams)   => ['admin', 'ads',     params ?? {}] as const,
    usersRoot:    () => ['admin', 'users'] as const,
    users:        (params?: AdminGetUsersParams) => ['admin', 'users',   params ?? {}] as const,
    sellersRoot:  () => ['admin', 'sellers'] as const,
    sellers:      (params?: AdminGetSellersParams) => ['admin', 'sellers', params ?? {}] as const,
    // AUDIT-FIX (issue #1): parameterised by status/q/page like sellers,
    // so approving a store (invalidating with a narrower key) doesn't
    // also blow away unrelated cached pages.
    storesRoot:   () => ['admin', 'stores'] as const,
    stores:       (params?: AdminGetStoresParams) => ['admin', 'stores', params ?? {}] as const,
    storeTypes:   () => ['admin', 'store-types'] as const,
    reportsRoot:  ()                              => ['admin', 'reports'] as const,
    reports:      (params?: Parameters<typeof adminApi.getReports>[0])              => ['admin', 'reports', params ?? {}] as const,
    fraudRoot:    ()                              => ['admin', 'fraud'] as const,
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
    productsRoot:      ()                => ['admin', 'products'] as const,
    products:          (params?: Parameters<typeof adminApi.getAdminProducts>[0]) => ['admin', 'products',           params ?? {}] as const,
    serviceListingsRoot: ()               => ['admin', 'service-listings'] as const,
    serviceListings:   (params?: Parameters<typeof adminApi.getAdminServiceListings>[0]) => ['admin', 'service-listings',   params ?? {}] as const,
    serviceRequestDisputesRoot: () => ['admin', 'service-request-disputes'] as const,
    serviceRequestDisputes: (params?: { page?: number; limit?: number }) => ['admin', 'service-request-disputes', params ?? {}] as const,
    openRequestsRoot:  ()                => ['admin', 'open-requests'] as const,
    openRequests:      (params?: Parameters<typeof adminApi.getAdminOpenRequests>[0]) => ['admin', 'open-requests',      params ?? {}] as const,
    trends:            (days: number)    => ['admin', 'trends',             days]         as const,
    systemHealth:      ()                => ['admin', 'system-health']                     as const,
  },
} as const;
