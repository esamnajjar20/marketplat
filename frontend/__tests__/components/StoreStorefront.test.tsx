/**
 * __tests__/components/StoreStorefront.test.tsx
import type { ReactElement } from 'react';
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderWithProviders as render } from '@/test-support/render';
import { screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';

import { StoreStorefront } from '@/components/stores/StoreStorefront';

const push = vi.fn();

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
// The active tab is URL-driven (?tab=…) — StoreStorefront.setTab() only calls
// router.push(), it never holds tab state itself. The mock therefore has to be
// mutable so a test can model "the navigation happened".
let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
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
  const base = {
    storeId: 's1',
    storeName: 'متجر الأمل',
    ownerUserId: 'u1',
  };

  beforeEach(() => {
    push.mockClear();
    mockSearchParams = new URLSearchParams();
  });

  it('renders product tab content by default and mounts reviews only when selected', async () => {
    const first = renderWithQueryClient(<StoreStorefront {...base} />);
    expect(screen.getByTestId('products-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('reviews')).not.toBeInTheDocument();

    // Clicking the tab navigates (URL is the source of truth for the active tab)…
    const user = setupUser();
    await user.click(screen.getByRole('tab', { name: /التقييمات/ }));
    expect(push).toHaveBeenCalledWith('/stores/s1?tab=reviews', { scroll: false });

    // …and once the URL carries ?tab=reviews the reviews panel mounts.
    first.unmount();
    mockSearchParams = new URLSearchParams('tab=reviews');
    renderWithQueryClient(<StoreStorefront {...base} />);
    expect(screen.getByTestId('reviews')).toBeInTheDocument();
    expect(screen.queryByTestId('products-grid')).not.toBeInTheDocument();
  });

  it('renders tab buttons', () => {
    renderWithQueryClient(<StoreStorefront {...base} />);
    // Tabs labeled in Arabic
    expect(document.body.textContent).toMatch(/منتج|إعلان|مجموعة|عرض/i);
  });
});
