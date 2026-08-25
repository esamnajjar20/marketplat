/**
 * __tests__/components/EntityFavoritesList.test.tsx
 *
 * FEAT-FAVORITE-POLYMORPHIC PR3: generic counterpart of
 * FavoritesList.test.tsx for PRODUCT/STORE/SERVICE_LISTING — same
 * coverage shape (loading skeleton, UX-FIX P1-8 error-before-empty
 * ordering, empty state with a type-specific CTA, pagination
 * visibility/page-from-URL, the correct card component per type), but
 * with three entity kinds sharing one component instead of one fixed
 * AD shape. ProductCard/StoreCard/ServiceListingCard/skeletons/
 * Pagination are mocked to isolate EntityFavoritesList's own branching
 * — each one's own rendering is covered by its own test file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { EntityFavoritesList } from '@/components/profile/EntityFavoritesList';
import { useFavoritesByType } from '@/hooks/queries/useFavorites';

vi.mock('@/hooks/queries/useFavorites', () => ({
  useFavoritesByType: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/components/stores/ProductCard', () => ({
  ProductCard: ({ product }: { product: { id: string; name: string } }) => (
    <div data-testid={`product-${product.id}`}>{product.name}</div>
  ),
}));

vi.mock('@/components/stores/StoreCard', () => ({
  StoreCard: ({ store }: { store: { id: string; name: string } }) => (
    <div data-testid={`store-${store.id}`}>{store.name}</div>
  ),
}));

vi.mock('@/components/services/ServiceListingCard', () => ({
  ServiceListingCard: ({ listing }: { listing: { id: string; title: string } }) => (
    <div data-testid={`service-${listing.id}`}>{listing.title}</div>
  ),
}));

vi.mock('@/components/shared/skeletons', () => ({
  ProductCardSkeleton: () => <div data-testid="skeleton-product" />,
  StoreCardSkeleton: () => <div data-testid="skeleton-store" />,
  ServiceListingCardSkeleton: () => <div data-testid="skeleton-service" />,
}));

vi.mock('@/components/shared/ui/Pagination', () => ({
  Pagination: ({ totalPages }: { totalPages: number }) => <div data-testid="pagination">pages:{totalPages}</div>,
}));

const mockRefetch = vi.fn();

const favoritedProduct = { id: 'prod-1', name: 'خلاط كهربائي', store: { id: 'store-1' } };
const favoritedStore = { id: 'store-9', name: 'متجر السلام' };
const favoritedService = { id: 'svc-1', title: 'تصليح مكيفات' };

function mockFavorites(overrides: Record<string, unknown> = {}) {
  (useFavoritesByType as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items: [], meta: { totalPages: 1 } },
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    ...overrides,
  });
}

describe('EntityFavoritesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockFavorites();
  });

  it('renders skeleton cards matching the type while loading, not the empty state', () => {
    mockFavorites({ data: undefined, isLoading: true });
    render(<EntityFavoritesList type="PRODUCT" />);

    expect(screen.queryByText('لا توجد منتجات محفوظة')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton-product').length).toBeGreaterThan(0);
  });

  it('shows an error message with retry, not the empty state, on fetch failure (same P1-8 ordering as FavoritesList)', async () => {
    mockFavorites({ data: undefined, isError: true });
    const user = setupUser();
    render(<EntityFavoritesList type="STORE" />);

    expect(screen.getByText('حدث خطأ أثناء تحميل المفضلة')).toBeInTheDocument();
    expect(screen.queryByText('لا توجد متاجر محفوظة')).not.toBeInTheDocument();

    await user.click(screen.getByText('إعادة المحاولة'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  describe('empty state — type-specific copy and CTA', () => {
    it('PRODUCT', () => {
      render(<EntityFavoritesList type="PRODUCT" />);
      expect(screen.getByText('لا توجد منتجات محفوظة')).toBeInTheDocument();
      expect(screen.getByText('تصفح المنتجات')).toBeInTheDocument();
    });

    it('STORE', () => {
      render(<EntityFavoritesList type="STORE" />);
      expect(screen.getByText('لا توجد متاجر محفوظة')).toBeInTheDocument();
      expect(screen.getByText('تصفح المتاجر')).toBeInTheDocument();
    });

    it('SERVICE_LISTING', () => {
      render(<EntityFavoritesList type="SERVICE_LISTING" />);
      expect(screen.getByText('لا توجد خدمات محفوظة')).toBeInTheDocument();
      expect(screen.getByText('تصفح الخدمات')).toBeInTheDocument();
    });
  });

  it('renders a ProductCard for each favorited product entity', () => {
    mockFavorites({ data: { items: [{ entityId: 'prod-1', entity: favoritedProduct }], meta: { totalPages: 1 } } });
    render(<EntityFavoritesList type="PRODUCT" />);

    expect(screen.getByTestId('product-prod-1')).toBeInTheDocument();
    expect(screen.getByText('خلاط كهربائي')).toBeInTheDocument();
  });

  it('renders a StoreCard for each favorited store entity', () => {
    mockFavorites({ data: { items: [{ entityId: 'store-9', entity: favoritedStore }], meta: { totalPages: 1 } } });
    render(<EntityFavoritesList type="STORE" />);

    expect(screen.getByTestId('store-store-9')).toBeInTheDocument();
    expect(screen.getByText('متجر السلام')).toBeInTheDocument();
  });

  it('renders a ServiceListingCard for each favorited service entity', () => {
    mockFavorites({ data: { items: [{ entityId: 'svc-1', entity: favoritedService }], meta: { totalPages: 1 } } });
    render(<EntityFavoritesList type="SERVICE_LISTING" />);

    expect(screen.getByTestId('service-svc-1')).toBeInTheDocument();
    expect(screen.getByText('تصليح مكيفات')).toBeInTheDocument();
  });

  it('does not render pagination when there is only one page', () => {
    render(<EntityFavoritesList type="PRODUCT" />);
    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });

  it('renders pagination when there is more than one page', () => {
    mockFavorites({
      data: { items: [{ entityId: 'prod-1', entity: favoritedProduct }], meta: { totalPages: 3 } },
    });
    render(<EntityFavoritesList type="PRODUCT" />);
    expect(screen.getByTestId('pagination')).toHaveTextContent('pages:3');
  });

  it('reads the page number from the URL search params and passes it to useFavoritesByType', () => {
    mockSearchParams = new URLSearchParams('page=2');
    render(<EntityFavoritesList type="STORE" />);
    expect(useFavoritesByType).toHaveBeenCalledWith('STORE', { page: 2 });
  });
});
