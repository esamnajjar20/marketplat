/**
 * __tests__/components/StoreStorefront.test.tsx
 */
import type { ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderWithProviders as render } from '@/test-support/render';
import { screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';

import { StoreStorefront } from '@/components/stores/StoreStorefront';


function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}
// The active tab is URL-driven (?tab=…). Tab-only changes use the native
// History API so Next.js can sync useSearchParams without requesting a new RSC payload.
let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/components/stores/StoreProducts', () => ({
  StoreProducts: () => <div data-testid="products-grid" />,
}));
vi.mock('@/components/stores/StoreCollections', () => ({
  StoreCollections: () => <div data-testid="collections" />,
}));
vi.mock('@/components/stores/StoreAds', () => ({
  StoreAds: () => <div data-testid="store-ads" />,
}));
vi.mock('@/components/stores/StoreReviewsList', () => ({
  StoreReviewsList: () => <div data-testid="reviews" />,
}));
vi.mock('@/components/stores/StoreReviewButton', () => ({
  StoreReviewButton: () => <button type="button">تقييم</button>,
}));
// may import other grids
vi.mock('@/components/stores/StorePromotions', () => ({
  StorePromotions: () => <div data-testid="promos" />,
}));

describe('StoreStorefront', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  const base = {
    storeId: 's1',
    storeName: 'متجر الأمل',
    ownerUserId: 'u1',
  };

  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    window.history.replaceState({}, '', '/stores/s1');
  });

  it('renders product tab content by default and mounts reviews only when selected', async () => {
    const first = renderWithQueryClient(<StoreStorefront {...base} />);
    expect(screen.getByTestId('products-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('reviews')).not.toBeInTheDocument();

    // A tab-only update should modify the URL using native history, not router.push.
    const pushState = vi.spyOn(window.history, 'pushState');
    const user = setupUser();
    await user.click(screen.getByRole('tab', { name: /التقييمات/ }));
    expect(pushState).toHaveBeenCalledWith(window.history.state, '', '/stores/s1?tab=reviews');
    expect(window.location.search).toBe('?tab=reviews');

    // Once the URL carries ?tab=reviews, the URL-driven tab content mounts.
    first.unmount();
    mockSearchParams = new URLSearchParams('tab=reviews');
    renderWithQueryClient(<StoreStorefront {...base} />);
    expect(await screen.findByTestId('reviews')).toBeInTheDocument();
    expect(screen.queryByTestId('products-grid')).not.toBeInTheDocument();
  });

  it('renders tab buttons', () => {
    renderWithQueryClient(<StoreStorefront {...base} />);
    // Tabs labeled in Arabic
    expect(document.body.textContent).toMatch(/منتج|إعلان|مجموعة|عرض/i);
  });
});
