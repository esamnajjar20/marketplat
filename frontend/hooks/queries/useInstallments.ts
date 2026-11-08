'use client';
import { useQuery } from '@tanstack/react-query';
import { installmentsApi } from '@/api/installments.api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore, selectIsAuthenticated, selectHasAccessToken, selectIsAuthResolving } from '@/store/auth.store';

export interface InstallmentQueryOptions {
  /** Set false when the containing tab/section is not active. */
  enabled?: boolean;
}

/** One authenticated request supplies both lists; the API keeps their limits and ordering independent. */
export function useInstallmentsOverview(options?: InstallmentQueryOptions) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasAccessToken = useAuthStore(selectHasAccessToken);
  const isAuthResolving = useAuthStore(selectIsAuthResolving);

  return useQuery({
    queryKey: queryKeys.installments.overview(),
    queryFn: ({ signal }) => installmentsApi.overview({ signal }).then((response) => {
      const result = response.data.data;
      if (!result) throw new Error('Installments overview response is empty');
      return result;
    }),
    enabled: (options?.enabled ?? true) && isAuthenticated && hasAccessToken && !isAuthResolving,
    staleTime: 30_000,
  });
}
