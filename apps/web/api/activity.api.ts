/**
 * Activity API — maps to backend /api/v1/activity/*.
 * Verified against activity.routes.ts: the only route is the caller's
 * own timeline — no id-scoped GET, no admin/public read path (same
 * "one route, always private" shape as notifications.routes.ts).
 */
import { apiClient } from './client';
import { unwrapPaginated } from '@/lib/apiPagination';
import type { ApiResponse } from '@/types/api.types';
import type { UserActivity, ActivityQuery } from '@/types/activity.types';

export const activityApi = {
  /** GET /activity */
  getMine: (params?: ActivityQuery) =>
    apiClient
      .get<ApiResponse<UserActivity[]>>('/activity', { params })
      .then((r) => unwrapPaginated<UserActivity>(r)),
};
