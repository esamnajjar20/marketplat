import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { salesApi } from '@/api/sales.api';
import { installmentsApi } from '@/api/installments.api';
import { collectionsApi } from '@/api/collections.api';
import { useDebts } from '@/hooks/queries/useDebts';
import { useInstallmentsOverview } from '@/hooks/queries/useInstallments';
import { useMyCollections } from '@/hooks/queries/useCollections';

vi.mock('@/api/sales.api', () => ({ salesApi: { debts: vi.fn() } }));
vi.mock('@/api/installments.api', () => ({ installmentsApi: { overview: vi.fn() } }));
vi.mock('@/api/collections.api', () => ({ collectionsApi: { getMine: vi.fn() } }));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ isAuthenticated: false, accessToken: null, isAuthResolving: true });
  vi.mocked(salesApi.debts).mockResolvedValue({ data: { data: [] } } as never);
  vi.mocked(installmentsApi.overview).mockResolvedValue({ data: { data: { upcoming: [], overdue: [] } } } as never);
  vi.mocked(collectionsApi.getMine).mockResolvedValue({ data: { data: [] } } as never);
});

describe('demand-driven private queries', () => {
  it('does not request private sales data while auth is unresolved or unauthenticated', async () => {
    const { result } = renderHook(() => useDebts(), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
    expect(salesApi.debts).not.toHaveBeenCalled();

    useAuthStore.setState({ isAuthenticated: true, accessToken: 'verified-token', isAuthResolving: false });
    await waitFor(() => expect(salesApi.debts).toHaveBeenCalledTimes(1));
  });

  it('does not request the combined installment overview before auth is ready', () => {
    renderHook(() => useInstallmentsOverview(), { wrapper: createWrapper() });
    expect(installmentsApi.overview).not.toHaveBeenCalled();
  });

  it('loads upcoming and overdue installments with one request after auth is ready', async () => {
    useAuthStore.setState({ isAuthenticated: true, accessToken: 'verified-token', isAuthResolving: false });
    const wrapper = createWrapper();
    renderHook(() => useInstallmentsOverview(), { wrapper });
    renderHook(() => useInstallmentsOverview(), { wrapper });
    await waitFor(() => expect(installmentsApi.overview).toHaveBeenCalledTimes(1));
  });

  it('does not request private collections before auth is ready', () => {
    renderHook(() => useMyCollections(), { wrapper: createWrapper() });
    expect(collectionsApi.getMine).not.toHaveBeenCalled();
  });

  it('allows a caller to suppress a query even with a verified session', () => {
    useAuthStore.setState({ isAuthenticated: true, accessToken: 'verified-token', isAuthResolving: false });
    renderHook(() => useDebts({ enabled: false }), { wrapper: createWrapper() });
    renderHook(() => useInstallmentsOverview({ enabled: false }), { wrapper: createWrapper() });
    renderHook(() => useMyCollections({ enabled: false }), { wrapper: createWrapper() });
    expect(salesApi.debts).not.toHaveBeenCalled();
    expect(installmentsApi.overview).not.toHaveBeenCalled();
    expect(collectionsApi.getMine).not.toHaveBeenCalled();
  });
});
