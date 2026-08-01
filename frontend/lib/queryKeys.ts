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
import type { AdminGetAdsParams, AdminGetUsersParams, AdminGetSellersParams } from '@/types/admin.types';

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
  },

  // ── Users ──────────────────────────────────────────────────────
  users: {
    detail: (id: string)           => ['users', id]              as const,
    ads:    (id: string, params?: object) =>
                                      ['users', id, 'ads', params ?? {}] as const,
  },

  // ── Sellers ────────────────────────────────────────────────────
  sellers: {
    detail: (id: string) => ['sellers', id]        as const,
    me:     ()            => ['sellers', 'me']      as const,
  },

  // ── Service providers ─────────────────────────────────────────
  serviceProviders: {
    detail: (id: string) => ['service-providers', id] as const,
    me:     ()            => ['service-providers', 'me'] as const,
    nearby: (params?: object) => ['service-providers', 'nearby', params ?? {}] as const,
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
    messages: (id: string, params?: object) =>
      ['conversations', 'detail', id, 'messages', params ?? {}] as const,
  },

  // ── Notifications (Epic 6) ────────────────────────────────────
  notifications: {
    mine:        (params?: object) => ['notifications', 'me', params ?? {}] as const,
    unreadCount: ()                => ['notifications', 'unread-count'] as const,
  },

  // ── Auth / current user ────────────────────────────────────────
  auth: {
    me:       ()               => ['auth', 'me']        as const,
    sessions: ()               => ['auth', 'sessions']  as const,
  },

  // ── Categories ─────────────────────────────────────────────────
  categories: {
    all:  ()             => ['categories']           as const,
    slug: (slug: string) => ['categories', 'slug', slug] as const,
    id:   (id: string)   => ['categories', 'id', id]    as const,
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
  },

  // ── Admin ──────────────────────────────────────────────────────
  admin: {
    /** FIX Q-04: parameterised so prefix invalidation matches these entries */
    stats:        ()                              => ['admin', 'stats'] as const,
    ads:          (params?: AdminGetAdsParams)   => ['admin', 'ads',     params ?? {}] as const,
    users:        (params?: AdminGetUsersParams) => ['admin', 'users',   params ?? {}] as const,
    sellers:      (params?: AdminGetSellersParams) => ['admin', 'sellers', params ?? {}] as const,
    reports:      (params?: object)              => ['admin', 'reports', params ?? {}] as const,
    reportDetail: (id: string)                   => ['admin', 'reports', 'detail', id] as const,
  },
} as const;
