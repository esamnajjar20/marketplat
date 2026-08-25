/**
 * __tests__/components/FavoritesTabs.test.tsx
 *
 * FEAT-FAVORITE-POLYMORPHIC PR3: the favorites page's type-aware tab
 * strip. GET /favorites has no mixed-type response (see
 * favorites.validation.ts's getFavoritesSchema comment), so this
 * picks exactly one type at a time via the URL and swaps which list
 * component renders — FavoritesList (AD, untouched) or
 * EntityFavoritesList (PRODUCT/STORE/SERVICE_LISTING). Both child
 * list components are mocked out here (their own rendering/fetching
 * behavior is covered by FavoritesList.test.tsx and
 * EntityFavoritesList.test.tsx respectively) — this file only
 * verifies: which tab is active for a given ?type=, which child
 * renders for each tab, and that clicking a tab pushes the right URL
 * (type set/cleared, page always dropped).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { FavoritesTabs } from '@/components/profile/FavoritesTabs';
import { ROUTES } from '@/lib/constants';

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/components/profile/FavoritesList', () => ({
  FavoritesList: () => <div data-testid="favorites-list-ad" />,
}));

vi.mock('@/components/profile/EntityFavoritesList', () => ({
  EntityFavoritesList: ({ type }: { type: string }) => <div data-testid={`entity-favorites-${type}`} />,
}));

describe('FavoritesTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('defaults to the "ad" tab (FavoritesList) with no ?type= param — preserves the pre-PR3 page exactly', () => {
    render(<FavoritesTabs />);
    expect(screen.getByRole('tab', { name: 'الإعلانات' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('favorites-list-ad')).toBeInTheDocument();
  });

  it('renders EntityFavoritesList type="PRODUCT" for ?type=product', () => {
    mockSearchParams = new URLSearchParams('type=product');
    render(<FavoritesTabs />);
    expect(screen.getByRole('tab', { name: 'المنتجات' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('entity-favorites-PRODUCT')).toBeInTheDocument();
  });

  it('renders EntityFavoritesList type="STORE" for ?type=store', () => {
    mockSearchParams = new URLSearchParams('type=store');
    render(<FavoritesTabs />);
    expect(screen.getByTestId('entity-favorites-STORE')).toBeInTheDocument();
  });

  it('renders EntityFavoritesList type="SERVICE_LISTING" for ?type=service', () => {
    mockSearchParams = new URLSearchParams('type=service');
    render(<FavoritesTabs />);
    expect(screen.getByTestId('entity-favorites-SERVICE_LISTING')).toBeInTheDocument();
  });

  it('pushes to the favorites page with no ?type= when switching back to "ad"', async () => {
    mockSearchParams = new URLSearchParams('type=product');
    const user = setupUser();
    render(<FavoritesTabs />);
    await user.click(screen.getByRole('tab', { name: 'الإعلانات' }));
    expect(mockPush).toHaveBeenCalledWith(ROUTES.favorites);
  });

  it('pushes ?type=store when switching to the "store" tab', async () => {
    const user = setupUser();
    render(<FavoritesTabs />);
    await user.click(screen.getByRole('tab', { name: 'المتاجر' }));
    expect(mockPush).toHaveBeenCalledWith(`${ROUTES.favorites}?type=store`);
  });

  it('drops an existing ?page= param when switching tabs', async () => {
    mockSearchParams = new URLSearchParams('type=product&page=3');
    const user = setupUser();
    render(<FavoritesTabs />);
    await user.click(screen.getByRole('tab', { name: 'الخدمات' }));
    const pushedUrl = mockPush.mock.calls[0][0] as string;
    expect(pushedUrl).not.toContain('page=');
  });
});
