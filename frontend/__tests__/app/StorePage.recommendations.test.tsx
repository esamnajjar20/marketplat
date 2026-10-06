/**
 * __tests__/app/StorePage.recommendations.test.tsx
 *
 * PR4C + public store page mounts StoreRecommendations with
 * excludeStoreId, StoreHeader, and StoreStorefront (tabs).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import StorePage from '@/app/(public)/stores/[id]/page';
import { storesApi } from '@/api/stores.api';

vi.mock('@/api/stores.api', () => ({
  storesApi: { getById: vi.fn() },
}));

vi.mock('@/components/stores/StoreHeader', () => ({
  StoreHeader: ({ store }: { store: { id: string } }) => (
    <div data-testid="store-header">{store.id}</div>
  ),
}));

vi.mock('@/components/stores/StoreStorefront', () => ({
  StoreStorefront: ({ storeId }: { storeId: string }) => (
    <div data-testid="store-storefront">{storeId}</div>
  ),
}));

vi.mock('@/components/recommendations/StoreRecommendations', () => ({
  StoreRecommendations: ({ excludeStoreId }: { excludeStoreId: string }) => (
    <div data-testid="store-recommendations">{excludeStoreId}</div>
  ),
}));

const store = {
  id: 'store-1',
  name: 'متجر تجريبي',
  sellerProfile: { userId: 'user-1' },
};

describe('StorePage — recommendations integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders StoreRecommendations excluding the store being viewed', async () => {
    (storesApi.getById as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: store } });

    const jsx = await StorePage({ params: Promise.resolve({ id: 'store-1' }) });
    render(jsx);

    expect(screen.getByTestId('store-header')).toHaveTextContent('store-1');
    expect(screen.getByTestId('store-storefront')).toHaveTextContent('store-1');
    expect(screen.getByTestId('store-recommendations')).toHaveTextContent('store-1');
  });

  it('does not render recommendations on the 404 empty state', async () => {
    (storesApi.getById as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('404'));

    const jsx = await StorePage({ params: Promise.resolve({ id: 'missing' }) });
    render(jsx);

    expect(screen.queryByTestId('store-recommendations')).not.toBeInTheDocument();
    expect(screen.queryByTestId('store-header')).not.toBeInTheDocument();
  });
});
