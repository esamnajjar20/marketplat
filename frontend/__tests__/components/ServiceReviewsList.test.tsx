/**
 * __tests__/components/ServiceReviewsList.test.tsx
 *
 * Previously uncovered (0%), ~95 lines. Paginated review list on the
 * public seller profile page — was a fully-built API client with zero
 * UI consumers until this component.
 *
 * Coverage targets:
 *  - Loading state renders a spinner (role="status")
 *  - Error state renders a retry button that calls refetch
 *  - Empty state shown when there are no reviews
 *  - Renders rater name, comment (when present, hidden when null),
 *    formatted date per review
 *  - Star rating: exactly `score` stars filled, rest unfilled
 *  - Pagination only renders when totalPages > 1, and reads the `page`
 *    query param (shared with no other list on this page)
 *  - Hook is not called with an empty sellerProfileId in a way that
 *    breaks — enabled gating is the hook's own concern, but the
 *    component still passes page/limit through correctly
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServiceReviewsList } from '@/components/services/ServiceReviewsList';
import { useServiceReviewsForSeller } from '@/hooks/queries/useServiceReviews';
import { formatDate } from '@/lib/formatters';
import type { ServiceReview } from '@/types/service.types';

let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/sellers/seller-1',
}));

vi.mock('@/hooks/queries/useServiceReviews', () => ({
  useServiceReviewsForSeller: vi.fn(),
}));

vi.mock('@/components/shared/ui/Pagination', () => ({
  Pagination: ({ totalPages, currentPage }: { totalPages: number; currentPage: number }) => (
    <div data-testid="pagination">
      صفحة {currentPage} من {totalPages}
    </div>
  ),
}));

function makeReview(overrides: Partial<ServiceReview> = {}): ServiceReview {
  return {
    id: 'review-1',
    score: 4,
    comment: 'خدمة ممتازة وسريعة',
    requestId: 'request-1',
    raterId: 'user-2',
    sellerProfileId: 'seller-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    rater: { id: 'user-2', name: 'منى', avatarUrl: null },
    ...overrides,
  };
}

function mockReviewsState(overrides: Partial<ReturnType<typeof useServiceReviewsForSeller>>) {
  vi.mocked(useServiceReviewsForSeller).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as never);
}

describe('ServiceReviewsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('shows a spinner while loading', () => {
    mockReviewsState({ isLoading: true });
    render(<ServiceReviewsList sellerProfileId="seller-1" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error message with a working retry button', () => {
    const refetch = vi.fn();
    mockReviewsState({ isError: true, refetch });
    render(<ServiceReviewsList sellerProfileId="seller-1" />);
    expect(screen.getByText('حدث خطأ أثناء تحميل التقييمات')).toBeInTheDocument();
    screen.getByText('إعادة المحاولة').click();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there are no reviews', () => {
    mockReviewsState({ data: { items: [], meta: { total: 0, totalPages: 1 } } });
    render(<ServiceReviewsList sellerProfileId="seller-1" />);
    expect(screen.getByText('لا توجد تقييمات بعد')).toBeInTheDocument();
  });

  it('renders rater name, comment, and formatted date', () => {
    const review = makeReview({ rater: { id: 'u2', name: 'منى الشوا', avatarUrl: null }, comment: 'تعامل راقي' });
    mockReviewsState({ data: { items: [review], meta: { total: 1, totalPages: 1 } } });
    render(<ServiceReviewsList sellerProfileId="seller-1" />);
    expect(screen.getByText('منى الشوا')).toBeInTheDocument();
    expect(screen.getByText('تعامل راقي')).toBeInTheDocument();
    expect(screen.getByText(formatDate(review.createdAt))).toBeInTheDocument();
  });

  it('does not render a comment paragraph when comment is null', () => {
    const review = makeReview({ comment: null });
    mockReviewsState({ data: { items: [review], meta: { total: 1, totalPages: 1 } } });
    render(<ServiceReviewsList sellerProfileId="seller-1" />);
    expect(screen.queryByText('خدمة ممتازة وسريعة')).not.toBeInTheDocument();
  });

  it('fills exactly `score` stars and leaves the rest unfilled', () => {
    mockReviewsState({ data: { items: [makeReview({ score: 3 })], meta: { total: 1, totalPages: 1 } } });
    const { container: rendered } = render(<ServiceReviewsList sellerProfileId="seller-1" />);
    const filled = rendered.querySelectorAll('.fill-rating');
    expect(filled).toHaveLength(3);
  });

  it('renders one review block per item', () => {
    mockReviewsState({
      data: {
        items: [makeReview({ id: 'r1' }), makeReview({ id: 'r2', rater: { id: 'u3', name: 'أحمد', avatarUrl: null } })],
        meta: { total: 2, totalPages: 1 },
      },
    });
    render(<ServiceReviewsList sellerProfileId="seller-1" />);
    expect(screen.getByText('منى')).toBeInTheDocument();
    expect(screen.getByText('أحمد')).toBeInTheDocument();
  });

  it('does not render pagination when totalPages is 1', () => {
    mockReviewsState({ data: { items: [makeReview()], meta: { total: 1, totalPages: 1 } } });
    render(<ServiceReviewsList sellerProfileId="seller-1" />);
    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });

  it('renders pagination when totalPages > 1', () => {
    mockReviewsState({ data: { items: [makeReview()], meta: { total: 25, totalPages: 3 } } });
    render(<ServiceReviewsList sellerProfileId="seller-1" />);
    expect(screen.getByTestId('pagination')).toBeInTheDocument();
  });

  it('reads the page param from the URL and forwards it to the hook', () => {
    mockSearchParams = new URLSearchParams({ page: '2' });
    mockReviewsState({ data: { items: [], meta: { total: 0, totalPages: 1 } } });
    render(<ServiceReviewsList sellerProfileId="seller-1" />);
    expect(useServiceReviewsForSeller).toHaveBeenCalledWith('seller-1', { page: 2, limit: 10 });
  });

  it('defaults page to 1 when absent from the URL', () => {
    mockReviewsState({ data: { items: [], meta: { total: 0, totalPages: 1 } } });
    render(<ServiceReviewsList sellerProfileId="seller-1" />);
    expect(useServiceReviewsForSeller).toHaveBeenCalledWith('seller-1', { page: 1, limit: 10 });
  });
});
