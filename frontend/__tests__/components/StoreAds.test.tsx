/**
 * __tests__/components/StoreAds.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { createElement, type ReactNode } from 'react';
import { StoreAds } from '@/components/stores/StoreAds';
import { adsApi } from '@/api/ads.api';

vi.mock('@/api/ads.api', () => ({
  adsApi: { getAll: vi.fn() },
}));
vi.mock('@/components/ads/AdCard', () => ({
  AdCard: ({ ad }: { ad: { title: string } }) => <div>{ad.title}</div>,
}));
vi.mock('@/components/shared/skeletons/AdCardSkeleton', () => ({
  AdCardSkeleton: () => <div data-testid="skeleton" />,
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('StoreAds', () => {
  beforeEach(() => {
    vi.mocked(adsApi.getAll).mockReset();
  });

  it('shows empty state when no ads', async () => {
    vi.mocked(adsApi.getAll).mockResolvedValue({
      data: { data: { items: [] } },
    } as never);
    render(<StoreAds storeId="s1" storeName="متجر الأمل" />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/لا إعلانات لهذا المتجر/)).toBeInTheDocument();
    });
  });

  it('renders ad cards', async () => {
    vi.mocked(adsApi.getAll).mockResolvedValue({
      data: {
        data: {
          items: [{ id: 'a1', title: 'إعلان تجريبي' }],
        },
      },
    } as never);
    render(<StoreAds storeId="s1" storeName="متجر" />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('إعلان تجريبي')).toBeInTheDocument();
    });
  });
  it('keeps cached store ads visible when an offline refresh fails', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
    qc.setQueryData(queryKeys.ads.list({ storeId: 's1', limit: 24 }), { items: [{ id: 'cached-1', title: 'إعلان محفوظ' }] });
    vi.mocked(adsApi.getAll).mockRejectedValue(new Error('offline'));
    render(
      <QueryClientProvider client={qc}>
        <StoreAds storeId="s1" storeName="متجر" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('إعلان محفوظ')).toBeInTheDocument();
    expect(await screen.findByText(/تُعرض آخر نسخة محفوظة/)).toBeInTheDocument();
  });

});
