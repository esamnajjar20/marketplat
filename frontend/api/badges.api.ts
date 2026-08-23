/**
 * Store badges API — maps to backend /api/v1/badges/* endpoints.
 * Verified against badges.routes.ts / badges.controller.ts: a single
 * public GET, no owner-facing CRUD (badges are entirely derived from
 * data other modules already own — see badges.service.ts's doc comment).
 */
import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type { StoreBadge } from '@/types/badge.types';

export const badgesApi = {
  /** GET /badges/store/:storeId — public, no auth. */
  getStoreBadges: (storeId: string) =>
    apiClient.get<ApiResponse<StoreBadge[]>>(`/badges/store/${storeId}`),
};
