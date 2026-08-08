'use client';

import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/api/reports.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import type { PaginationParams } from '@/types/api.types';

/**
 * GET /reports/me — "بلاغاتي": the reports & their current status that
 * the signed-in user has personally filed (any target type: ad, user,
 * or store). FEAT-REPORT-USER-STORE — previously a reporter submitted a
 * report and had no way to check what happened to it afterward.
 * Mirrors useActivity.ts's useMyActivity exactly. Returns the unwrapped
 * { items, meta } shape (see lib/apiPagination.ts).
 */
export function useMyReports(params?: PaginationParams) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: queryKeys.myReports.all(params),
    queryFn: () => reportsApi.getMyReports(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.activity,
    enabled: isAuthenticated,
  });
}
