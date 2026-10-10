'use client';
import { useQuery } from '@tanstack/react-query';
import { salesApi } from '@/api/sales.api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore, selectIsAuthenticated, selectHasAccessToken, selectIsAuthResolving } from '@/store/auth.store';

/** Private sales data must not be requested before the server-verified session is ready. */
export function useDebts(options?: { enabled?: boolean }) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasAccessToken = useAuthStore(selectHasAccessToken);
  const isAuthResolving = useAuthStore(selectIsAuthResolving);

  return useQuery({
    queryKey: queryKeys.sales.debts(),
    queryFn: ({ signal }) => salesApi.debts({ signal }).then((r) => r.data.data ?? []),
    enabled: (options?.enabled ?? true) && isAuthenticated && hasAccessToken && !isAuthResolving,
  });
}
