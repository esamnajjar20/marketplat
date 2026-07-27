/**
 * Favorites API — maps to backend /api/v1/favorites/* endpoints.
 *
 * FIX H-05: Removed favoritesApi.check() — GET /favorites/:adId/check does NOT exist.
 *           Favorite state is now derived from the favorites list cache.
 *
 * FIX T-06: FavoriteToggleResponse corrected to match backend:
 *           { action: 'added' | 'removed' } (not { favorited: boolean }).
 *
 * FIX TYPE-01: getAll's `items` was typed as AdListItem[], but the backend
 *   (favorites.service.ts's getMyFavorites, backed by
 *   Prisma.FavoriteGetPayload<{ include: { ad: {...} } }>) actually returns
 *   full Favorite records — { id, userId, adId, createdAt, ad: {...} } —
 *   with the ad nested under `.ad`, not the ad itself. FavoritesList.tsx
 *   already worked around this with a local inline type reading `fav.ad`;
 *   this fixes the type at the source instead of leaving every caller to
 *   redeclare it. See useFavorites.ts's fix for the real bug this caused:
 *   the favorited-ids Set was built from the wrong id field entirely.
 *
 * FIX API-SHAPE-01: getAll now also unwraps the backend's real response
 *   shape (data: FavoriteRecord[] directly, meta.pagination for paging)
 *   via unwrapPaginated — see lib/apiPagination.ts.
 */
import { apiClient } from './client';
import { unwrapPaginated } from '@/lib/apiPagination';
import type { AdListItem } from '@/types/ad.types';
import type { ApiResponse } from '@/types/api.types';

/**
 * FIX T-06: Backend favorites.service.ts returns { action: 'added' | 'removed' }.
 */
export interface FavoriteToggleResponse {
  action: 'added' | 'removed';
}

/** FIX TYPE-01: shape of one item in GET /favorites — a Favorite record with its ad nested. */
export interface FavoriteRecord {
  id:        string;
  userId:    string;
  adId:      string;
  createdAt: string;
  ad:        AdListItem;
}

export const favoritesApi = {
  /** GET /favorites — paginated list of favorited ads */
  getAll: (params?: { page?: number; limit?: number }) =>
    apiClient
      .get<ApiResponse<FavoriteRecord[]>>('/favorites', { params })
      .then((r) => unwrapPaginated<FavoriteRecord>(r)),

  /**
   * POST /favorites/:adId — toggle favorite state.
   * Returns { action: 'added' | 'removed' } to indicate what happened.
   */
  toggle: (adId: string) =>
    apiClient.post<ApiResponse<FavoriteToggleResponse>>(`/favorites/${adId}`),
};
