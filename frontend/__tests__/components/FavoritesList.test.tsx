/**
 * __tests__/components/FavoritesList.test.tsx
 *
 * Coverage gap: 0% prior coverage. Covers the loading skeleton, the
 * UX-FIX P1-8 error-before-empty ordering (a failed fetch must never
 * render as "no favorites"), the empty state with its CTA link,
 * pagination visibility, and EPIC 1.4's DeletedFavoriteCard branch
 * (a favorited ad whose owner deleted it renders a disabled
 * placeholder with a remove action instead of a live AdCard link).
 * AdCard/Pagination are mocked to isolate FavoritesList's own branching.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { FavoritesList } from '@/components/profile/FavoritesList';
import { useFavorites } from '@/hooks/queries/useFavorites';
import { useToggleFavorite } from '@/hooks/mutations/useFavoriteMutations';
import { useSearchParams } from 'next/navigation';

vi.mock('@/hooks/queries/useFavorites', () => ({
  useFavorites: vi.fn(),
}));

vi.mock('@/hooks/mutations/useFavoriteMutations', () => ({
  useToggleFavorite: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/components/ads/AdCard', () => ({
  AdCard: ({ ad }: { ad: { id: string; title: string } }) => <div data-testid={`adcard-${ad.id}`}>{ad.title}</div>,
}));

vi.mock('@/components/shared/ui/Pagination', () => ({
  Pagination: ({ totalPages }: { totalPages: number }) => <div data-testid="pagination">pages:{totalPages}</div>,
}));

const mockRefetch = vi.fn();
const mockToggleMutate = vi.fn();

const activeAd = { id: 'ad-1', title: 'دراجة هوائية', status: 'ACTIVE' };
const deletedAd = { id: 'ad-2', title: 'كرسي مكتب', status: 'DELETED' };

function mockFavorites(overrides: Record<string, unknown> = {}) {
  (useFavorites as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items: [{ ad: activeAd }], meta: { totalPages: 1 } },
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    ...overrides,
  });
}

describe('FavoritesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockFavorites();
    (useToggleFavorite as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: mockToggleMutate, isPending: false });
  });

  it('renders skeleton cards while loading, not the empty state', () => {
    mockFavorites({ data: undefined, isLoading: true });
    const { container } = render(<FavoritesList />);

    expect(screen.queryByText('لا توجد إعلانات محفوظة')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[class*="grid"]').length).toBeGreaterThan(0);
  });

  it('shows an error message with retry, not the empty state, on fetch failure (UX-FIX P1-8)', async () => {
    mockFavorites({ data: undefined, isError: true });
    const user = setupUser();
    render(<FavoritesList />);

    expect(screen.getByText('حدث خطأ أثناء تحميل المفضلة')).toBeInTheDocument();
    expect(screen.queryByText('لا توجد إعلانات محفوظة')).not.toBeInTheDocument();

    await user.click(screen.getByText('إعادة المحاولة'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows the empty state with a browse-ads CTA when there are no favorites', () => {
    mockFavorites({ data: { items: [], meta: { totalPages: 1 } } });
    render(<FavoritesList />);

    expect(screen.getByText('لا توجد إعلانات محفوظة')).toBeInTheDocument();
    expect(screen.getByText('تصفح الإعلانات')).toBeInTheDocument();
  });

  it('renders an AdCard for each active favorited ad', () => {
    render(<FavoritesList />);

    expect(screen.getByTestId('adcard-ad-1')).toBeInTheDocument();
    expect(screen.getByText('دراجة هوائية')).toBeInTheDocument();
  });

  it('renders a DeletedFavoriteCard (not an AdCard) for a DELETED favorited ad (EPIC 1.4)', () => {
    mockFavorites({ data: { items: [{ ad: deletedAd }], meta: { totalPages: 1 } } });
    render(<FavoritesList />);

    expect(screen.queryByTestId('adcard-ad-2')).not.toBeInTheDocument();
    expect(screen.getByText('تم حذف الإعلان')).toBeInTheDocument();
    expect(screen.getByText('كرسي مكتب')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إزالة من المفضلة' })).toBeInTheDocument();
  });

  it('calls toggleFavorite.mutate with the ad id when removing a deleted favorite', async () => {
    mockFavorites({ data: { items: [{ ad: deletedAd }], meta: { totalPages: 1 } } });
    const user = setupUser();
    render(<FavoritesList />);

    await user.click(screen.getByRole('button', { name: 'إزالة من المفضلة' }));

    expect(mockToggleMutate).toHaveBeenCalledWith('ad-2');
  });

  it('shows a pending label and disables the button while removing', () => {
    mockFavorites({ data: { items: [{ ad: deletedAd }], meta: { totalPages: 1 } } });
    (useToggleFavorite as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: mockToggleMutate, isPending: true });
    render(<FavoritesList />);

    expect(screen.getByRole('button', { name: 'جارٍ الإزالة…' })).toBeDisabled();
  });

  it('does not render pagination when there is only one page', () => {
    render(<FavoritesList />);

    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });

  it('renders pagination when there is more than one page', () => {
    mockFavorites({ data: { items: [{ ad: activeAd }], meta: { totalPages: 3 } } });
    render(<FavoritesList />);

    expect(screen.getByTestId('pagination')).toHaveTextContent('pages:3');
  });

  it('reads the page number from the URL search params', () => {
    mockSearchParams = new URLSearchParams('page=2');
    render(<FavoritesList />);

    expect(useFavorites).toHaveBeenCalledWith({ page: 2 });
  });
});
