/**
 * Saved Searches API — maps to backend /api/v1/saved-searches/* endpoints.
 *
 * No pagination on getAll: capped at 20 per user server-side
 * (saved-searches.service.ts's MAX_SAVED_SEARCHES_PER_USER), so a
 * user's full list is always a small, single response — same reasoning
 * as why GET /favorites needed pagination but this doesn't need it yet.
 */
import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type { SavedSearch, CreateSavedSearchInput } from '@/types/savedSearch.types';

export const savedSearchesApi = {
  /** GET /saved-searches — the current user's saved searches, newest first. */
  getAll: () =>
    apiClient
      .get<ApiResponse<SavedSearch[]>>('/saved-searches')
      .then((r) => r.data.data as SavedSearch[]),

  /** POST /saved-searches — create a new saved search. */
  create: (input: CreateSavedSearchInput) =>
    apiClient
      .post<ApiResponse<SavedSearch>>('/saved-searches', input)
      .then((r) => r.data.data as SavedSearch),

  /** DELETE /saved-searches/:id */
  delete: (id: string) => apiClient.delete<ApiResponse<null>>(`/saved-searches/${id}`),
};
