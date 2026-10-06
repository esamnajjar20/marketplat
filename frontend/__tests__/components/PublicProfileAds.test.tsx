/**
 * __tests__/components/PublicProfileAds.test.tsx
 *
 * Coverage gap: 0% prior coverage. Covers loading skeleton,
 * 's error-before-empty ordering (must not tell a visitor
 * "no ads" on a failed fetch), empty state, ad list rendering, and
 * pagination visibility/baseUrl.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { PublicProfileAds } from '@/components/profile/PublicProfileAds';
import { useUserAds } from '@/hooks/queries/useAds';

vi.mock('@/hooks/queries/useAds', () => ({
  useUserAds: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/components/ads/AdCard', () => ({
  AdCard: ({ ad }: { ad: { id: string; title: string } }) => <div data-testid={`adcard-${ad.id}`}>{ad.title}</div>,
}));

vi.mock('@/components/shared/ui/Pagination', () => ({
  Pagination: ({ totalPages, baseUrl }: { totalPages: number; baseUrl: string }) => (
    <div data-testid="pagination">{baseUrl}:{totalPages}</div>
  ),
}));

const mockRefetch = vi.fn();
const ad = { id: 'ad-1', title: 'طاولة طعام خشبية' };

function mockUserAds(overrides: Record<string, unknown> = {}) {
  (useUserAds as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items: [ad], meta: { totalPages: 1 } },
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    ...overrides,
  });
}

describe('PublicProfileAds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockUserAds();
  });

  it('shows skeletons while loading', () => {
    mockUserAds({ data: undefined, isLoading: true });
    render(<PublicProfileAds userId="user-1" />);

    expect(screen.queryByText('لا توجد إعلانات')).not.toBeInTheDocument();
  });

  it('shows an error message with retry, not the empty state, on failure', async () => {
    mockUserAds({ data: undefined, isError: true });
    const user = setupUser();
    render(<PublicProfileAds userId="user-1" />);

    expect(screen.getByText('حدث خطأ أثناء تحميل الإعلانات')).toBeInTheDocument();
    expect(screen.queryByText('لا توجد إعلانات')).not.toBeInTheDocument();

    await user.click(screen.getByText('إعادة المحاولة'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows the empty state when the user has no ads', () => {
    mockUserAds({ data: { items: [], meta: { totalPages: 1 } } });
    render(<PublicProfileAds userId="user-1" />);

    expect(screen.getByText('لا توجد إعلانات')).toBeInTheDocument();
  });

  it('renders each ad', () => {
    render(<PublicProfileAds userId="user-1" />);

    expect(screen.getByTestId('adcard-ad-1')).toBeInTheDocument();
  });

  it('does not render pagination for a single page', () => {
    render(<PublicProfileAds userId="user-1" />);

    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });

  it('renders pagination scoped to the profile baseUrl when there is more than one page', () => {
    mockUserAds({ data: { items: [ad], meta: { totalPages: 2 } } });
    render(<PublicProfileAds userId="user-42" />);

    expect(screen.getByTestId('pagination')).toHaveTextContent('/profile/user-42:2');
  });

  it('passes the userId and page from the URL to the query hook', () => {
    mockSearchParams = new URLSearchParams('page=3');
    render(<PublicProfileAds userId="user-9" />);

    expect(useUserAds).toHaveBeenCalledWith('user-9', { page: 3 });
  });
});
