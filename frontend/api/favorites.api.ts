/**
 * Favorites API — maps to backend /api/v1/favorites/* endpoints.
 *
 * (superseded — see check() below): favoritesApi.check() was
 *           removed because GET /favorites/:adId/check didn't exist yet;
 *           favorite state was derived from the favorites list cache
 *           instead. UX-FIX (frontend audit P2-03) adds the real
 *           endpoint backend-side and restores check() against it,
 *           replacing the limit:100 list-fetch workaround that filled
 *           the gap in the meantime (see useFavorites.ts's
 *           useIsFavorited for that workaround's removal).
 *
 * FavoriteToggleResponse corrected to match backend:
 *           { action: 'added' | 'removed' } (not { favorited: boolean }).
 *
 * getAll's `items` was typed as AdListItem[], but the backend
 *   (favorites.service.ts's getMyFavorites, backed by
 *   Prisma.FavoriteGetPayload<{ include: { ad: {...} } }>) actually returns
 *   full Favorite records — { id, userId, adId, createdAt, ad: {...} } —
 *   with the ad nested under `.ad`, not the ad itself. FavoritesList.tsx
 *   already worked around this with a local inline type reading `fav.ad`;
 *   this the type at the source instead of leaving every caller to
 *   redeclare it. See useFavorites.ts's the real bug this caused:
 *   the favorited-ids Set was built from the wrong id field entirely.
 *
 * getAll now also unwraps the backend's real response
 *   shape (data: FavoriteRecord[] directly, meta.pagination for paging)
 *   via unwrapPaginated — see lib/apiPagination.ts.
 *
 * FEAT-FAVORITE-POLYMORPHIC PR3: getAllByType/toggleEntity/checkEntity
 *   below are the generic counterparts of getAll/toggle/check, backed
 *   by PR2's /favorites/:entityType/:entityId routes. They're
 *   additions, not replacements — getAll/toggle/check keep calling the
 *   routes exactly as before, so every existing AD
 *   consumer (FavoritesList.tsx, AdCard.tsx, useFavorites.ts) is
 *   untouched.
 */
import type { AxiosRequestConfig } from 'axios';
import { apiClient } from './client';
import { unwrapPaginated } from '@/lib/apiPagination';
import type { AdListItem } from '@/types/ad.types';
import type { ApiResponse } from '@/types/api.types';
import type { FavoriteEntityKind, FavoriteEntityRecord } from '@/types/favorite.types';
import { FAVORITE_ROUTE_SEGMENT, FAVORITE_QUERY_TYPE } from '@/types/favorite.types';

/**
 * Backend favorites.service.ts returns { action: 'added' | 'removed' }.
 */
export interface FavoriteToggleResponse {
  action: 'added' | 'removed';
}

/** shape of one item in GET /favorites — a Favorite record with its ad nested. */
export interface FavoriteRecord {
  id:        string;
  userId:    string;
  adId:      string;
  createdAt: string;
  ad:        AdListItem;
}

export const favoritesApi = {
  /**
   * GET /favorites — paginated list of favorited ads.
   *
   * accepts an AxiosRequestConfig (signal, etc.) so callers
   * that need the request to be abortable can pass one through — notably
   * AuthHydrationProvider's post-login favorites prefetch, which previously
   * called this with no config at all. That left it as the one call in that
   * component's 8s-abort flow that couldn't actually be aborted: the
   * component's own AbortController fired on timeout/unmount, but this
   * request kept running to completion regardless, holding the outer
   * try/finally (and therefore setAuthResolved()) open for however long
   * the request took — up to its own unrelated axios-level timeout.
   */
  getAll: (params?: { page?: number; limit?: number; listId?: string }, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<FavoriteRecord[]>>('/favorites', { ...config, params })
      .then((r) => unwrapPaginated<FavoriteRecord>(r)),

  /**
   * POST /favorites/:adId — toggle favorite state.
   * Returns { action: 'added' | 'removed' } to indicate what happened.
   */
  toggle: (adId: string) =>
    apiClient.post<ApiResponse<FavoriteToggleResponse>>(`/favorites/${adId}`),

  /**
   * GET /favorites/:adId/check — is this one ad favorited by the current
   * user? UX-FIX (frontend audit P2-03): replaces the previous
   * limit:100 favorites-list fetch that AdDetailSection.tsx used just to
   * derive this one boolean — and was silently wrong past 100 favorites.
   */
  check: (adId: string, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<{ isFavorited: boolean }>>(`/favorites/${adId}/check`, config)
      .then((r) => r.data.data?.isFavorited ?? false),

  /**
   * GET /favorites?type=product|store|service — paginated list of
   * favorited entities of one type. See favorites.validation.ts's
   * getFavoritesSchema comment: there is no "all types mixed
   * together" option, so a caller wanting more than one type makes
   * one call per type.
   */
  getAllByType: <T>(
    type: FavoriteEntityKind,
    params?: { page?: number; limit?: number; listId?: string },
    config?: AxiosRequestConfig
  ) =>
    apiClient
      .get<ApiResponse<FavoriteEntityRecord<T>[]>>('/favorites', {
        ...config,
        params: { ...params, type: FAVORITE_QUERY_TYPE[type] },
      })
      .then((r) => unwrapPaginated<FavoriteEntityRecord<T>>(r)),

  /**
   * POST /favorites/:segment/:entityId — toggle favorite state for a
   * product/store/service listing. Same { action } response shape as
   * the () above (favorites.service.ts's performToggle
   * is shared for both).
   */
  toggleEntity: (type: FavoriteEntityKind, entityId: string) =>
    apiClient.post<ApiResponse<FavoriteToggleResponse>>(
      `/favorites/${FAVORITE_ROUTE_SEGMENT[type]}/${entityId}`
    ),

  /**
   * GET /favorites/:segment/:entityId/check — is this one
   * product/store/service listing favorited by the current user?
   * Generic counterpart of check() above.
   */
  checkEntity: (type: FavoriteEntityKind, entityId: string, config?: AxiosRequestConfig) =>
    apiClient
      .get<ApiResponse<{ isFavorited: boolean }>>(
        `/favorites/${FAVORITE_ROUTE_SEGMENT[type]}/${entityId}/check`,
        config
      )
      .then((r) => r.data.data?.isFavorited ?? false),
};
