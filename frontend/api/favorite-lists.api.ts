import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type {
  FavoriteList,
  CreateFavoriteListPayload,
  RenameFavoriteListPayload,
  MoveFavoritePayload,
} from '@/types/favorite-list.types';
// FIX MOVE-FAVORITE-TYPING: backend returns the moved Favorite record
// (favorites.service.ts's moveToList resolves with the updated row),
// same shape as GET /favorites' items — declared here rather than
// retyped so a future field on FavoriteRecord propagates.
import type { FavoriteRecord } from './favorites.api';

export const favoriteListsApi = {
  /** GET /favorites/lists */
  list: () =>
    apiClient
      .get<ApiResponse<FavoriteList[]>>('/favorites/lists')
      .then((r) => r.data.data ?? []),

  /** POST /favorites/lists */
  create: (payload: CreateFavoriteListPayload) =>
    apiClient
      .post<ApiResponse<FavoriteList>>('/favorites/lists', payload)
      .then((r) => r.data.data),

  /** PATCH /favorites/lists/:listId */
  rename: (listId: string, payload: RenameFavoriteListPayload) =>
    apiClient
      .patch<ApiResponse<FavoriteList>>(`/favorites/lists/${listId}`, payload)
      .then((r) => r.data.data),

  /** DELETE /favorites/lists/:listId */
  remove: (listId: string) =>
    apiClient.delete<ApiResponse<null>>(`/favorites/lists/${listId}`),

  /** PATCH /favorites/items/:favoriteId/list */
  moveFavorite: (favoriteId: string, payload: MoveFavoritePayload) =>
    apiClient
      .patch<ApiResponse<FavoriteRecord>>(`/favorites/items/${favoriteId}/list`, payload)
      .then((r) => r.data.data),
};
