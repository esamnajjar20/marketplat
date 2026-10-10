'use client';
import { useQuery } from '@tanstack/react-query';
import { installmentsApi } from '@/api/installments.api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore, selectIsAuthenticated, selectHasAccessToken, selectIsAuthResolving } from '@/store/auth.store';

export interface InstallmentQueryOptions {
  /** Set false when the containing tab/section is not active. */
  enabled?: boolean;
}

function usePrivateInstallmentQuery<T>(
  queryKey: readonly unknown[],
  queryFn: (ctx: { signal: AbortSignal }) => Promise<T>,
  options?: InstallmentQueryOptions,
) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasAccessToken = useAuthStore(selectHasAccessToken);
  const isAuthResolving = useAuthStore(selectIsAuthResolving);

  return useQuery({
    queryKey,
    queryFn,
    enabled: (options?.enabled ?? true) && isAuthenticated && hasAccessToken && !isAuthResolving,
  });
}

/** Private financial data only loads after auth is verified and while requested. */
export function useUpcomingInstallments(options?: InstallmentQueryOptions) {
  return usePrivateInstallmentQuery(
    queryKeys.installments.upcoming(),
    ({ signal }) => installmentsApi.upcoming({ signal }).then((r) => r.data.data ?? []),
    options,
  );
}

export function useOverdueInstallments(options?: InstallmentQueryOptions) {
  return usePrivateInstallmentQuery(
    queryKeys.installments.overdue(),
    ({ signal }) => installmentsApi.overdue({ signal }).then((r) => r.data.data ?? []),
    options,
  );
}
