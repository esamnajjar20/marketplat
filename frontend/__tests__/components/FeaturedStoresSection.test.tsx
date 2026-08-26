/**
 * FeaturedStoresSection — home featured stores.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeaturedStoresSection } from '@/components/home/FeaturedStoresSection';
import { useStores } from '@/hooks/queries/useStores';
import { useLocationResolver } from '@/hooks/useLocationResolver';

vi.mock('@/hooks/queries/useStores', () => ({
  useStores: vi.fn(),
}));

vi.mock('@/hooks/useLocationResolver', () => ({
  useLocationResolver: vi.fn(),
}));

vi.mock('@/components/stores/StoreCard', () => ({
  StoreCard: ({ store }: { store: { name: string } }) => <div>{store.name}</div>,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('FeaturedStoresSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useLocationResolver).mockReturnValue({ source: 'none' } as never);
  });

  it('returns null when there are no stores', () => {
    vi.mocked(useStores).mockReturnValue({
      data: { items: [] },
      isLoading: false,
    } as never);
    const { container } = render(<FeaturedStoresSection />);
    expect(container.firstChild).toBeNull();
  });

  it('renders heading and store cards', () => {
    vi.mocked(useStores).mockReturnValue({
      data: { items: [{ id: 's1', name: 'متجر مميز' }] },
      isLoading: false,
    } as never);
    render(<FeaturedStoresSection />);
    expect(screen.getByText('متاجر مميزة')).toBeInTheDocument();
    expect(screen.getByText('متجر مميز')).toBeInTheDocument();
  });

  it('passes city filter when location source is city', () => {
    vi.mocked(useLocationResolver).mockReturnValue({
      source: 'city',
      city: 'غزة',
    } as never);
    vi.mocked(useStores).mockReturnValue({
      data: { items: [] },
      isLoading: false,
    } as never);
    render(<FeaturedStoresSection />);
    expect(useStores).toHaveBeenCalledWith({ limit: 6, city: 'غزة' });
  });
});
