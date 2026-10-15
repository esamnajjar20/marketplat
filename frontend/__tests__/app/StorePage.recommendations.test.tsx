/**
 * __tests__/app/StorePage.recommendations.test.tsx
 *
 * Public store page keeps the requested store focused: header and storefront only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders as render } from '@/test-support/render';
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

const store = {
  id: 'store-1',
  name: 'متجر تجريبي',
  sellerProfile: { userId: 'user-1' },
};

describe('StorePage — focused store layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the store header and storefront without unsolicited recommendations', async () => {
    (storesApi.getById as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: store } });

    const jsx = await StorePage({ params: Promise.resolve({ id: 'store-1' }) });
    render(jsx);

    expect(screen.getByTestId('store-header')).toHaveTextContent('store-1');
    expect(screen.getByTestId('store-storefront')).toHaveTextContent('store-1');
    expect(screen.queryByTestId('store-recommendations')).not.toBeInTheDocument();
  });

  it('renders the 404 empty state without store content', async () => {
    (storesApi.getById as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('404'));

    const jsx = await StorePage({ params: Promise.resolve({ id: 'missing' }) });
    render(jsx);

    expect(screen.queryByTestId('store-recommendations')).not.toBeInTheDocument();
    expect(screen.queryByTestId('store-header')).not.toBeInTheDocument();
  });
});
