/**
 * __tests__/components/SellerRatingsList.test.tsx
 *
 * Coverage gap: 0% prior coverage. Covers loading/error/empty states,
 * star-fill rendering by score, optional comment, the ad-scoped-
 * rating link (TRACK-AD-RATINGS-LIST) shown only when rating.ad is
 * present, and the namespaced `adRatingsPage` query param (BUG-09
 * regression: must not collide with ServiceReviewsList's bare `page`
 * param on the same seller profile page).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { SellerRatingsList } from '@/components/sellers/SellerRatingsList';
import { useSellerRatings } from '@/hooks/queries/useSellerRatings';

vi.mock('@/hooks/queries/useSellerRatings', () => ({
  useSellerRatings: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/components/shared/ui/Pagination', () => ({
  Pagination: ({ pageParam }: { pageParam: string }) => <div data-testid="pagination">{pageParam}</div>,
}));

const mockRefetch = vi.fn();

const ratingWithAd = {
  id: 'rating-1',
  rater: { name: 'سامي', avatarUrl: null },
  score: 4,
  comment: 'تعامل ممتاز وسريع',
  ad: { id: 'ad-1', title: 'دراجة نارية' },
  createdAt: '2026-08-01T00:00:00.000Z',
};
const ratingNoAd = {
  id: 'rating-2',
  rater: { name: 'هبة', avatarUrl: null },
  score: 5,
  comment: null,
  ad: null,
  createdAt: '2026-08-02T00:00:00.000Z',
};

function mockRatings(overrides: Record<string, unknown> = {}) {
  (useSellerRatings as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items: [ratingWithAd], meta: { totalPages: 1 } },
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    ...overrides,
  });
}

describe('SellerRatingsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockRatings();
  });

  it('shows a spinner while loading', () => {
    mockRatings({ data: undefined, isLoading: true });
    render(<SellerRatingsList sellerProfileId="seller-1" />);

    expect(screen.queryByText('لا توجد تقييمات بعد')).not.toBeInTheDocument();
  });

  it('shows an error message with retry on failure', async () => {
    mockRatings({ data: undefined, isError: true });
    const user = setupUser();
    render(<SellerRatingsList sellerProfileId="seller-1" />);

    expect(screen.getByText('حدث خطأ أثناء تحميل التقييمات')).toBeInTheDocument();
    await user.click(screen.getByText('إعادة المحاولة'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows the empty state when there are no ratings', () => {
    mockRatings({ data: { items: [], meta: { totalPages: 1 } } });
    render(<SellerRatingsList sellerProfileId="seller-1" />);

    expect(screen.getByText('لا توجد تقييمات بعد')).toBeInTheDocument();
  });

  it('renders the rater name and comment', () => {
    render(<SellerRatingsList sellerProfileId="seller-1" />);

    expect(screen.getByText('سامي')).toBeInTheDocument();
    expect(screen.getByText('تعامل ممتاز وسريع')).toBeInTheDocument();
  });

  it('omits the comment paragraph when comment is null', () => {
    mockRatings({ data: { items: [ratingNoAd], meta: { totalPages: 1 } } });
    render(<SellerRatingsList sellerProfileId="seller-1" />);

    expect(screen.queryByText('تعامل ممتاز وسريع')).not.toBeInTheDocument();
  });

  it('shows the ad-scoped link when the rating references an ad', () => {
    render(<SellerRatingsList sellerProfileId="seller-1" />);

    expect(screen.getByText(/عن إعلان: دراجة نارية/)).toBeInTheDocument();
  });

  it('omits the ad-scoped link when the rating has no ad', () => {
    mockRatings({ data: { items: [ratingNoAd], meta: { totalPages: 1 } } });
    render(<SellerRatingsList sellerProfileId="seller-1" />);

    expect(screen.queryByText(/عن إعلان:/)).not.toBeInTheDocument();
  });

  it('does not render pagination for a single page', () => {
    render(<SellerRatingsList sellerProfileId="seller-1" />);

    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });

  it('uses the namespaced "adRatingsPage" param for pagination, not the bare "page" param', () => {
    mockRatings({ data: { items: [ratingWithAd], meta: { totalPages: 2 } } });
    render(<SellerRatingsList sellerProfileId="seller-1" />);

    expect(screen.getByTestId('pagination')).toHaveTextContent('adRatingsPage');
  });

  it('reads the page number from the "adRatingsPage" search param', () => {
    mockSearchParams = new URLSearchParams('adRatingsPage=3');
    render(<SellerRatingsList sellerProfileId="seller-1" />);

    expect(useSellerRatings).toHaveBeenCalledWith('seller-1', { page: 3, limit: 10 });
  });
});
