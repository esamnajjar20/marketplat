/**
 * RecentStores — home rail of newest stores.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecentStores } from '@/components/home/RecentStores';
import { useStores } from '@/hooks/queries/useStores';

vi.mock('@/hooks/queries/useStores', () => ({
  useStores: vi.fn(),
}));

vi.mock('@/components/stores/StoreCard', () => ({
  StoreCard: ({ store }: { store: { name: string } }) => <div>{store.name}</div>,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('RecentStores', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows empty state when there are no stores', () => {
    vi.mocked(useStores).mockReturnValue({
      data: { items: [] },
      isLoading: false,
    } as never);
    render(<RecentStores />);
    expect(screen.getByText('لا توجد متاجر بعد')).toBeInTheDocument();
  });

  it('renders store cards and a link to all stores', () => {
    vi.mocked(useStores).mockReturnValue({
      data: {
        items: [
          { id: 's1', name: 'متجر أ' },
          { id: 's2', name: 'متجر ب' },
        ],
      },
      isLoading: false,
    } as never);
    render(<RecentStores />);
    expect(screen.getByText('متجر أ')).toBeInTheDocument();
    expect(screen.getByText('متجر ب')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /عرض جميع المتاجر/ })).toBeInTheDocument();
  });

  it('requests newest-first with limit 6', () => {
    vi.mocked(useStores).mockReturnValue({
      data: { items: [] },
      isLoading: false,
    } as never);
    render(<RecentStores />);
    expect(useStores).toHaveBeenCalledWith({
      limit: 6,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });
});
