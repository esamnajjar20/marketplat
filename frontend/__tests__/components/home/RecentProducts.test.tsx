import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecentProducts } from '@/components/home/RecentProducts';
import { useProducts } from '@/hooks/queries/useProducts';
vi.mock('@/hooks/queries/useProducts', () => ({ useProducts: vi.fn() }));
vi.mock('@/components/stores/ProductCard', () => ({ ProductCard: ({ product }: any) => <div data-testid={`product-${product.id}`}>{product.name}</div> }));
vi.mock('@/components/shared/skeletons', () => ({ ProductCardSkeleton: () => <div data-testid="product-skeleton" /> }));
vi.mock('@/components/shared/feedback/EmptyState', () => ({ EmptyState: ({ title }: any) => <div data-testid="empty">{title}</div> }));
vi.mock('@/components/shared/ui/Button', () => ({ Button: ({ children }: any) => <button>{children}</button> }));
vi.mock('next/link', () => ({ default: ({ children }: any) => <div>{children}</div> }));
beforeEach(() => vi.clearAllMocks());
describe('RecentProducts', () => {
  it('skeletons', () => {
    vi.mocked(useProducts).mockReturnValue({ data: undefined, isLoading: true } as any);
    render(<RecentProducts />);
    expect(screen.getAllByTestId('product-skeleton').length).toBeGreaterThan(0);
  });
  it('empty state', () => {
    vi.mocked(useProducts).mockReturnValue({ data: { items: [] }, isLoading: false } as any);
    render(<RecentProducts />);
    expect(screen.getByTestId('empty')).toBeInTheDocument();
  });
  it('renders cards', () => {
    vi.mocked(useProducts).mockReturnValue({ data: { items: [{ id: 'p1', name: 'منتج', storeId: 's1' }] }, isLoading: false } as any);
    render(<RecentProducts />);
    expect(screen.getByTestId('product-p1')).toBeInTheDocument();
  });
});
