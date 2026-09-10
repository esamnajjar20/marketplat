/**
 * __tests__/components/StoreStorefront.test.tsx
import type { ReactElement } from 'react';
 */
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

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
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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

  it('renders product tab content by default', () => {
    renderWithQueryClient(<StoreStorefront {...base} />);
    expect(screen.getByTestId('products-grid')).toBeInTheDocument();
    expect(screen.getByTestId('reviews')).toBeInTheDocument();
  });

  it('renders tab buttons', () => {
    renderWithQueryClient(<StoreStorefront {...base} />);
    // Tabs labeled in Arabic
    expect(document.body.textContent).toMatch(/منتج|إعلان|مجموعة|عرض/i);
  });
});
