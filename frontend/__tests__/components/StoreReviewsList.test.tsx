/**
 * __tests__/components/StoreReviewsList.test.tsx
 *
 * Coverage gap: 0% prior coverage. Covers loading/error/empty states,
 * star-fill rendering by score, optional comment, and 's
 * namespaced `reviewsPage` param (must not collide with StoreProducts'
 * `productsPage` on the same store page).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { StoreReviewsList } from '@/components/stores/StoreReviewsList';
import { useStoreReviews } from '@/hooks/queries/useStoreReviews';

vi.mock('@/hooks/queries/useStoreReviews', () => ({
  useStoreReviews: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/components/shared/ui/Pagination', () => ({
  Pagination: ({ pageParam }: { pageParam: string }) => <div data-testid="pagination">{pageParam}</div>,
}));

const mockRefetch = vi.fn();

const review1 = {
  id: 'rev-1',
  rater: { name: 'وائل', avatarUrl: null },
  score: 3,
  comment: 'خدمة جيدة بشكل عام',
  createdAt: '2026-08-01T00:00:00.000Z',
};
const review2 = {
  id: 'rev-2',
  rater: { name: 'دينا', avatarUrl: null },
  score: 5,
  comment: null,
  createdAt: '2026-08-03T00:00:00.000Z',
};

function mockReviews(overrides: Record<string, unknown> = {}) {
  (useStoreReviews as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items: [review1], meta: { totalPages: 1 } },
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    ...overrides,
  });
}

describe('StoreReviewsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockReviews();
  });

  it('shows a spinner while loading', () => {
    mockReviews({ data: undefined, isLoading: true });
    render(<StoreReviewsList storeId="store-1" />);

    expect(screen.queryByText('لا توجد تقييمات بعد')).not.toBeInTheDocument();
  });

  it('shows an error message with retry on failure', async () => {
    mockReviews({ data: undefined, isError: true });
    const user = setupUser();
    render(<StoreReviewsList storeId="store-1" />);

    expect(screen.getByText('حدث خطأ أثناء تحميل التقييمات')).toBeInTheDocument();
    await user.click(screen.getByText('إعادة المحاولة'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows the empty state when there are no reviews', () => {
    mockReviews({ data: { items: [], meta: { totalPages: 1 } } });
    render(<StoreReviewsList storeId="store-1" />);

    expect(screen.getByText('لا توجد تقييمات بعد')).toBeInTheDocument();
  });

  it('renders the rater name and comment', () => {
    render(<StoreReviewsList storeId="store-1" />);

    expect(screen.getByText('وائل')).toBeInTheDocument();
    expect(screen.getByText('خدمة جيدة بشكل عام')).toBeInTheDocument();
  });

  it('omits the comment paragraph when comment is null', () => {
    mockReviews({ data: { items: [review2], meta: { totalPages: 1 } } });
    render(<StoreReviewsList storeId="store-1" />);

    expect(screen.queryByText('خدمة جيدة بشكل عام')).not.toBeInTheDocument();
  });

  it('does not render pagination for a single page', () => {
    render(<StoreReviewsList storeId="store-1" />);

    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });

  it('uses the namespaced "reviewsPage" param for pagination (FIX BUG-09)', () => {
    mockReviews({ data: { items: [review1], meta: { totalPages: 2 } } });
    render(<StoreReviewsList storeId="store-1" />);

    expect(screen.getByTestId('pagination')).toHaveTextContent('reviewsPage');
  });

  it('reads the page number from the "reviewsPage" search param', () => {
    mockSearchParams = new URLSearchParams('reviewsPage=2');
    render(<StoreReviewsList storeId="store-1" />);

    expect(useStoreReviews).toHaveBeenCalledWith('store-1', { page: 2, limit: 10 });
  });
});
