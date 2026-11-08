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
import type { SellerAttention } from '@/types/seller.types';
import type { ApiRequestConfig } from './requestConfig';

export interface ActivityDashboardOverview {
  activity: { items: UserActivity[]; meta: unknown } | null;
  attention: SellerAttention | null;
  failures: { activity: boolean; attention: boolean };
}

export const activityApi = {
  /** GET /activity/dashboard — one request for the dashboard's two co-rendered panels. */
  getDashboardOverview: (config?: ApiRequestConfig) =>
    apiClient.get<ApiResponse<ActivityDashboardOverview>>('/activity/dashboard', config),
  /** GET /activity */
  getMine: (params?: ActivityQuery, config?: ApiRequestConfig) =>
    apiClient
      .get<ApiResponse<UserActivity[]>>('/activity', { ...config, params })
      .then((r) => unwrapPaginated<UserActivity>(r)),
};
