import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductsSection } from '@/components/home/ProductsSection';
import { StoresSection } from '@/components/home/StoresSection';
import { useProducts } from '@/hooks/queries/useProducts';
import { useStores } from '@/hooks/queries/useStores';
vi.mock('@/hooks/queries/useProducts', () => ({ useProducts: vi.fn() }));
vi.mock('@/hooks/queries/useStores', () => ({ useStores: vi.fn() }));
vi.mock('@/components/home/RecentProducts', () => ({ RecentProducts: () => <div data-testid="recent-products" /> }));
vi.mock('@/components/home/RecentStores', () => ({ RecentStores: () => <div data-testid="recent-stores" /> }));
beforeEach(() => vi.clearAllMocks());
describe('ProductsSection', () => {
  it('hides when empty', () => {
    vi.mocked(useProducts).mockReturnValue({ data: { items: [] }, isLoading: false } as any);
    expect(render(<ProductsSection />).container.firstChild).toBeNull();
  });
  it('shows when products exist', () => {
    vi.mocked(useProducts).mockReturnValue({ data: { items: [{ id: 'p1' }] }, isLoading: false } as any);
    render(<ProductsSection />);
    expect(screen.getByText('أحدث المنتجات')).toBeInTheDocument();
  });
});
describe('StoresSection', () => {
  it('hides when empty', () => {
    vi.mocked(useStores).mockReturnValue({ data: { items: [] }, isLoading: false } as any);
    expect(render(<StoresSection />).container.firstChild).toBeNull();
  });
  it('shows when stores exist', () => {
    vi.mocked(useStores).mockReturnValue({ data: { items: [{ id: 's1' }] }, isLoading: false } as any);
    render(<StoresSection />);
    expect(screen.getByText('المتاجر')).toBeInTheDocument();
  });
});
