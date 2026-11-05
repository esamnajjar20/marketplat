import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useProduct } from '@/hooks/queries/useProducts';
import { queryKeys } from '@/lib/queryKeys';
import { productsApi } from '@/api/products.api';
import { saveVisitedProduct } from '@/lib/offlineVisitedProducts';

vi.mock('@/api/products.api', () => ({
  productsApi: {
    getById: vi.fn(),
    getAll: vi.fn(),
    getMine: vi.fn(),
  },
}));

vi.mock('@/lib/offlineVisitedProducts', () => ({
  getVisitedProduct: vi.fn(),
  saveVisitedProduct: vi.fn(),
}));

vi.mock('@/lib/useOfflineListSeed', () => ({ useOfflineListSeed: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useProduct SSR hydration', () => {
  it('does not repeat the product detail GET and persists hydrated data for offline revisits', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const product = {
      id: 'product-1',
      name: 'هاتف',
      costPrice: null,
      storeId: 'store-1',
    };
    client.setQueryData(queryKeys.products.detail('product-1'), product);

    const { result } = renderHook(() => useProduct('product-1'), {
      wrapper: wrapperFor(client),
    });

    expect(result.current.data).toEqual(product);
    expect(productsApi.getById).not.toHaveBeenCalled();
    await waitFor(() => expect(saveVisitedProduct).toHaveBeenCalledWith(product));
    client.clear();
  });

  it('does not refresh the offline snapshot timestamp when using an old snapshot fallback', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const snapshot = { id: 'product-2', name: 'طاولة', storeId: 'store-1' };
    vi.mocked(productsApi.getById).mockRejectedValue({ response: { status: 503 } });
    const { getVisitedProduct } = await import('@/lib/offlineVisitedProducts');
    vi.mocked(getVisitedProduct).mockReturnValue(snapshot as never);

    const { result } = renderHook(() => useProduct('product-2'), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(result.current.data).toEqual(snapshot));
    expect(saveVisitedProduct).not.toHaveBeenCalled();
    client.clear();
  });
});
