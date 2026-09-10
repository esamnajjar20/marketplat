/**
 * __tests__/components/StoreAds.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
});
