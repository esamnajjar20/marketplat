/**
 * Blocked users API — maps to backend /api/v1/blocked-users/* endpoints.
 * Verified against blocked-users.routes.ts / blocked-users.controller.ts
 * directly:
 *   - All routes require auth — blocking is always caller-scoped, never
 *     publicly listable (same posture as favorites/conversations).
 *   - block/unblock is a single POST /:userId toggle endpoint, not
 *     separate block/unblock routes — the response's `action` field
 *     tells the caller which way it went (same shape as stores' follow
 *     toggle).
 */
import { apiClient } from './client';
import { unwrapPaginated } from '@/lib/apiPagination';
import type { ApiResponse } from '@/types/api.types';
import type {
  UserBlockWithBlockedUser,
  ToggleUserBlockResult,
  BlockedUsersQuery,
} from '@/types/blocked-user.types';

export const blockedUsersApi = {
  /** GET /blocked-users — the caller's blocked users, paginated. */
  getMine: (params?: BlockedUsersQuery) =>
    apiClient
      .get<ApiResponse<UserBlockWithBlockedUser[]>>('/blocked-users', { params })
      .then((r) => unwrapPaginated<UserBlockWithBlockedUser>(r)),

  /** POST /blocked-users/:userId — toggles block/unblock. */
  toggleBlock: (userId: string) =>
    apiClient.post<ApiResponse<ToggleUserBlockResult>>(`/blocked-users/${userId}`),
};
