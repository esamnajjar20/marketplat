import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StoreDetailClient } from '@/components/stores/StoreDetailClient';
import { useStore } from '@/hooks/queries/useStores';

vi.mock('@/hooks/queries/useStores', () => ({
  useStore: vi.fn(),
}));

vi.mock('@/components/stores/StoreHeader', () => ({
  StoreHeader: (props: { isFollowing?: boolean; isFavorited?: boolean; badges?: unknown[] }) => (
    <div data-testid="store-header" data-following={String(props.isFollowing)} data-favorited={String(props.isFavorited)} data-badges={String(props.badges?.length ?? 0)} />
  ),
}));

vi.mock('@/components/stores/StoreStorefront', () => ({
  StoreStorefront: () => <div data-testid="store-storefront" />,
}));

vi.mock('@/components/recommendations/StoreRecommendations', () => ({
  StoreRecommendations: () => <div data-testid="store-recommendations" />,
}));

const store = {
  id: 'store-1',
  name: 'متجر تجريبي',
  phone: '',
  sellerProfile: { userId: 'user-1' },
};

describe('StoreDetailClient fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useStore).mockReturnValue({
      data: { store, badges: [], viewer: { isFollowing: true, isFavorited: false } },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);
  });

  it('renders the same focused header/storefront as the SSR page without unsolicited recommendations', () => {
    render(<StoreDetailClient id="store-1" />);

    expect(screen.getByTestId('store-header')).toHaveAttribute('data-following', 'true');
    expect(screen.getByTestId('store-header')).toHaveAttribute('data-favorited', 'false');
    expect(screen.getByTestId('store-header')).toHaveAttribute('data-badges', '0');
    expect(screen.getByTestId('store-storefront')).toBeInTheDocument();
    expect(screen.queryByTestId('store-recommendations')).not.toBeInTheDocument();
  });
});
