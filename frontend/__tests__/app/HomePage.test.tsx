/**
 * __tests__/app/HomePage.test.tsx
 *
 * Plan §21 test checklist for Home:
 *  - shows the Products section
 *  - shows the Stores section
 *  - Provider section renders only when permission is granted
 *  - Provider section does not render on 'prompt' (available=false)
 *  - Provider section does not render on 'denied' (available=false)
 * (Ads/Categories coverage already lives in HomeAboveFold's own tests —
 * not duplicated here.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomePage from '@/app/(public)/page';
import { useProducts } from '@/hooks/queries/useProducts';
import { useStores } from '@/hooks/queries/useStores';
import { useNearbyServiceProvidersIfGranted } from '@/hooks/queries/useNearbyServiceProvidersIfGranted';

vi.mock('@/components/home/HeroBanner', () => ({ HeroBanner: () => <div data-testid="hero" /> }));
vi.mock('@/components/home/HomeAboveFold', () => ({ HomeAboveFold: () => <div data-testid="above-fold" /> }));
vi.mock('@/components/home/RecommendedAds', () => ({ RecommendedAds: () => null }));

vi.mock('@/hooks/queries/useProducts', () => ({ useProducts: vi.fn() }));
vi.mock('@/hooks/queries/useStores', () => ({ useStores: vi.fn() }));
vi.mock('@/hooks/queries/useNearbyServiceProvidersIfGranted', () => ({
  useNearbyServiceProvidersIfGranted: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
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
vi.mock('@/components/services/ServiceProviderCard', () => ({
  ServiceProviderCard: ({ provider }: { provider: { id: string; businessName: string } }) => (
    <div data-testid={`provider-${provider.id}`}>{provider.businessName}</div>
  ),
}));

function mockProducts(overrides: Record<string, unknown> = {}) {
  (useProducts as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items: [{ id: 'prod-1', name: 'منتج تجريبي', storeId: 'store-1' }] },
    isLoading: false,
    ...overrides,
  });
}

function mockStores(overrides: Record<string, unknown> = {}) {
  (useStores as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items: [{ id: 'store-1', name: 'متجر تجريبي' }] },
    isLoading: false,
    ...overrides,
  });
}

function mockNearby(overrides: Record<string, unknown> = {}) {
  (useNearbyServiceProvidersIfGranted as ReturnType<typeof vi.fn>).mockReturnValue({
    available: false,
    isChecking: false,
    data: undefined,
    isLoading: false,
    isError: false,
    ...overrides,
  });
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProducts();
    mockStores();
    mockNearby();
  });

  it('shows the Products section with its own heading', () => {
    render(<HomePage />);

    expect(screen.getByText('أحدث المنتجات')).toBeInTheDocument();
    expect(screen.getByTestId('product-prod-1')).toBeInTheDocument();
  });

  it('shows the Stores section with its own heading', () => {
    render(<HomePage />);

    expect(screen.getByText('المتاجر')).toBeInTheDocument();
    expect(screen.getByTestId('store-store-1')).toBeInTheDocument();
  });

  it('shows the nearby-providers section when permission is granted and results resolve', () => {
    mockNearby({
      available: true,
      isChecking: false,
      data: { items: [{ id: 'prov-1', businessName: 'مزود خدمة قريب' }] },
    });
    render(<HomePage />);

    expect(screen.getByText('مقدمو الخدمات القريبون')).toBeInTheDocument();
    expect(screen.getByTestId('provider-prov-1')).toBeInTheDocument();
  });

  it('does not show the nearby-providers section when permission is "prompt" (available=false)', () => {
    mockNearby({ available: false });
    render(<HomePage />);

    expect(screen.queryByText('مقدمو الخدمات القريبون')).not.toBeInTheDocument();
  });

  it('does not show the nearby-providers section when permission is "denied" (available=false)', () => {
    mockNearby({ available: false });
    render(<HomePage />);

    expect(screen.queryByText('مقدمو الخدمات القريبون')).not.toBeInTheDocument();
  });

  it('hides the Products section entirely when there are zero products', () => {
    mockProducts({ data: { items: [] } });
    render(<HomePage />);

    expect(screen.queryByText('أحدث المنتجات')).not.toBeInTheDocument();
  });

  it('hides the Stores section entirely when there are zero stores', () => {
    mockStores({ data: { items: [] } });
    render(<HomePage />);

    expect(screen.queryByText('المتاجر')).not.toBeInTheDocument();
  });

  it('keeps the Stores section visible when only Products fails to have data yet (section independence)', () => {
    mockProducts({ data: undefined, isLoading: true });
    render(<HomePage />);

    expect(screen.getByText('المتاجر')).toBeInTheDocument();
  });
});
