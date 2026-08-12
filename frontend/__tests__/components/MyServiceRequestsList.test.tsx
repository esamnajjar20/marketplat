/**
 * __tests__/components/MyServiceRequestsList.test.tsx
 *
 * Previously uncovered (0%), ~219 lines. Customer-side /my-requests
 * list — same pagination/filter-tab/out-of-range-page-recovery shape
 * as MyProductsList (already tested), but with two request-specific
 * flows layered on: a cancel action gated by status, and a review
 * action gated by status + review===null.
 *
 * Coverage targets:
 *  - Loading state shows a spinner (LoadingSpinner, not skeleton rows
 *    — different from MyProductsList/MyAdsList's animate-pulse)
 *  - Error state shows a retry button that calls refetch
 *  - Empty state shown when there are no requests
 *  - Renders request title, provider name, status badge, price
 *  - Status filter tabs: aria-pressed reflects ?status=, clicking
 *    pushes the new status and clears ?page=
 *  - Cancel button: shown only for PENDING/ACCEPTED/IN_PROGRESS,
 *    hidden for COMPLETED/REJECTED/CANCELLED; opens ConfirmDialog
 *    (not window.confirm), confirming calls respond.mutate with
 *    action: 'CANCELLED'
 *  - Review flow: "قيّم الخدمة" shown only when COMPLETED && review
 *    is null; "تم إرسال تقييمك" shown when COMPLETED && already
 *    reviewed; clicking the button opens ReviewServiceRequestDialog
 *  - Out-of-range page recovery: spinner (not empty state) when page
 *    exceeds totalPages
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyServiceRequestsList } from '@/components/services/MyServiceRequestsList';
import { useMyServiceRequests } from '@/hooks/queries/useServiceRequests';
import { useRespondToServiceRequest } from '@/hooks/mutations/useServiceRequestMutations';
import type { ServiceRequestStatus } from '@/types/service.types';

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/hooks/queries/useServiceRequests', () => ({
  useMyServiceRequests: vi.fn(),
}));

vi.mock('@/hooks/mutations/useServiceRequestMutations', () => ({
  useRespondToServiceRequest: vi.fn(),
}));

vi.mock('@/components/services/ReviewServiceRequestDialog', () => ({
  ReviewServiceRequestDialog: ({ open, listingTitle }: { open: boolean; listingTitle: string }) =>
    open ? <div data-testid="review-dialog">Review: {listingTitle}</div> : null,
}));

function makeRequest(overrides: Partial<{
  id: string;
  status: ServiceRequestStatus;
  details: string;
  agreedPrice: string | null;
  quotedPrice: string | null;
  createdAt: string;
  review: { id: string } | null;
  listing: { id: string; title: string; images: string[]; provider: { businessName: string } };
}> = {}) {
  return {
    id: 'req-1',
    status: 'PENDING' as ServiceRequestStatus,
    details: 'تفاصيل الطلب التجريبي',
    agreedPrice: null,
    quotedPrice: null,
    createdAt: new Date().toISOString(),
    review: null,
    listing: {
      id: 'listing-1',
      title: 'خدمة تجريبية',
      images: [],
      provider: { businessName: 'مزود الخدمة' },
    },
    ...overrides,
  };
}

const mockRespondMutate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams = new URLSearchParams();
  (useRespondToServiceRequest as ReturnType<typeof vi.fn>).mockReturnValue({
    mutate: mockRespondMutate, isPending: false,
  });
});

describe('MyServiceRequestsList', () => {
  // ── Loading / error / empty states ──────────────────────────────

  it('shows a loading spinner while fetching', () => {
    (useMyServiceRequests as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined, isLoading: true, isError: false,
    });
    render(<MyServiceRequestsList />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state with a retry option that calls refetch', async () => {
    const refetch = vi.fn();
    (useMyServiceRequests as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined, isLoading: false, isError: true, refetch,
    });
    const user = userEvent.setup();
    render(<MyServiceRequestsList />);

    expect(screen.getByText('حدث خطأ أثناء تحميل طلباتك')).toBeInTheDocument();
    await user.click(screen.getByText('إعادة المحاولة'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there are no requests', () => {
    (useMyServiceRequests as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [], meta: { totalPages: 1 } }, isLoading: false, isError: false,
    });
    render(<MyServiceRequestsList />);
    expect(screen.getByText('لا توجد طلبات')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'تصفّح الخدمات' })).toHaveAttribute('href', '/services');
  });

  // ── Rendering request rows ────────────────────────────────────────

  it('renders the request title, provider name, status badge, and details', () => {
    (useMyServiceRequests as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeRequest({ status: 'PENDING' })], meta: { totalPages: 1 } },
      isLoading: false, isError: false,
    });
    render(<MyServiceRequestsList />);
    expect(screen.getByText('خدمة تجريبية')).toBeInTheDocument();
    expect(screen.getByText('إلى مزود الخدمة')).toBeInTheDocument();
    // The status filter tab and the row's status badge both render this
    // text — the tab is a <button>, so excluding that role isolates the badge.
    const pendingMatches = screen.getAllByText('قيد الانتظار');
    expect(pendingMatches.some((el) => el.tagName !== 'BUTTON')).toBe(true);
    expect(screen.getByText('تفاصيل الطلب التجريبي')).toBeInTheDocument();
  });

  it('shows the agreed price without "(سعر مبدئي)" when set', () => {
    (useMyServiceRequests as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeRequest({ agreedPrice: '200', quotedPrice: '150' })], meta: { totalPages: 1 } },
      isLoading: false, isError: false,
    });
    render(<MyServiceRequestsList />);
    expect(screen.queryByText(/سعر مبدئي/)).not.toBeInTheDocument();
  });

  it('shows the quoted price with "(سعر مبدئي)" when no agreed price is set yet', () => {
    (useMyServiceRequests as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeRequest({ agreedPrice: null, quotedPrice: '150' })], meta: { totalPages: 1 } },
      isLoading: false, isError: false,
    });
    render(<MyServiceRequestsList />);
    expect(screen.getByText(/سعر مبدئي/)).toBeInTheDocument();
  });

  it('links to the request detail page', () => {
    (useMyServiceRequests as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeRequest({ id: 'req-42' })], meta: { totalPages: 1 } },
      isLoading: false, isError: false,
    });
    render(<MyServiceRequestsList />);
    expect(screen.getByText('عرض التفاصيل الكاملة')).toHaveAttribute(
      'href', expect.stringContaining('req-42'),
    );
  });

  // ── Status filter tabs ────────────────────────────────────────────

  it('marks "الكل" as pressed when no status filter is active', () => {
    (useMyServiceRequests as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [], meta: { totalPages: 1 } }, isLoading: false, isError: false,
    });
    render(<MyServiceRequestsList />);
    expect(screen.getByRole('button', { name: 'الكل' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks the matching status tab as pressed when ?status= is set', () => {
    mockSearchParams = new URLSearchParams('status=ACCEPTED');
    (useMyServiceRequests as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [], meta: { totalPages: 1 } }, isLoading: false, isError: false,
    });
    render(<MyServiceRequestsList />);
    expect(screen.getByRole('button', { name: 'مقبول' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'الكل' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('navigates with the new status (and clears the page param) when a status tab is clicked', async () => {
    mockSearchParams = new URLSearchParams('page=2');
    (useMyServiceRequests as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [], meta: { totalPages: 3 } }, isLoading: false, isError: false,
    });
    const user = userEvent.setup();
    render(<MyServiceRequestsList />);

    await user.click(screen.getByRole('button', { name: 'مكتمل' }));

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('status=COMPLETED'));
    expect(mockPush).toHaveBeenCalledWith(expect.not.stringContaining('page='));
  });

  // ── Cancel flow (status-gated, via ConfirmDialog) ──────────────────

  it.each(['PENDING', 'ACCEPTED', 'IN_PROGRESS'] as ServiceRequestStatus[])(
    'shows the cancel button for a %s request',
    (status) => {
      (useMyServiceRequests as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { items: [makeRequest({ status })], meta: { totalPages: 1 } },
        isLoading: false, isError: false,
      });
      render(<MyServiceRequestsList />);
      expect(screen.getByTitle('إلغاء الطلب')).toBeInTheDocument();
    },
  );

  it.each(['COMPLETED', 'REJECTED', 'CANCELLED'] as ServiceRequestStatus[])(
    'hides the cancel button for a %s request',
    (status) => {
      (useMyServiceRequests as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { items: [makeRequest({ status })], meta: { totalPages: 1 } },
        isLoading: false, isError: false,
      });
      render(<MyServiceRequestsList />);
      expect(screen.queryByTitle('إلغاء الطلب')).not.toBeInTheDocument();
    },
  );

  it('clicking cancel opens the confirm dialog without cancelling yet', async () => {
    (useMyServiceRequests as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeRequest({ status: 'PENDING' })], meta: { totalPages: 1 } },
      isLoading: false, isError: false,
    });
    const user = userEvent.setup();
    render(<MyServiceRequestsList />);

    await user.click(screen.getByTitle('إلغاء الطلب'));

    expect(screen.getByText('إلغاء الطلب؟')).toBeInTheDocument();
    expect(mockRespondMutate).not.toHaveBeenCalled();
  });

  it('confirming the cancel dialog calls respond.mutate with action CANCELLED', async () => {
    (useMyServiceRequests as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeRequest({ status: 'PENDING' })], meta: { totalPages: 1 } },
      isLoading: false, isError: false,
    });
    const user = userEvent.setup();
    render(<MyServiceRequestsList />);

    await user.click(screen.getByTitle('إلغاء الطلب'));
    await user.click(screen.getByRole('button', { name: 'إلغاء الطلب' }));

    expect(mockRespondMutate).toHaveBeenCalledWith(
      { action: 'CANCELLED' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  // ── Review flow (status + review-null gated) ───────────────────────

  it('shows "قيّم الخدمة" when COMPLETED and not yet reviewed', () => {
    (useMyServiceRequests as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeRequest({ status: 'COMPLETED', review: null })], meta: { totalPages: 1 } },
      isLoading: false, isError: false,
    });
    render(<MyServiceRequestsList />);
    expect(screen.getByText('قيّم الخدمة')).toBeInTheDocument();
    expect(screen.queryByText('تم إرسال تقييمك')).not.toBeInTheDocument();
  });

  it('shows "تم إرسال تقييمك" when COMPLETED and already reviewed', () => {
    (useMyServiceRequests as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeRequest({ status: 'COMPLETED', review: { id: 'rev-1' } })], meta: { totalPages: 1 } },
      isLoading: false, isError: false,
    });
    render(<MyServiceRequestsList />);
    expect(screen.getByText('تم إرسال تقييمك')).toBeInTheDocument();
    expect(screen.queryByText('قيّم الخدمة')).not.toBeInTheDocument();
  });

  it('shows neither review affordance for a non-COMPLETED request', () => {
    (useMyServiceRequests as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeRequest({ status: 'PENDING', review: null })], meta: { totalPages: 1 } },
      isLoading: false, isError: false,
    });
    render(<MyServiceRequestsList />);
    expect(screen.queryByText('قيّم الخدمة')).not.toBeInTheDocument();
    expect(screen.queryByText('تم إرسال تقييمك')).not.toBeInTheDocument();
  });

  it('opens ReviewServiceRequestDialog with the listing title when "قيّم الخدمة" is clicked', async () => {
    (useMyServiceRequests as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        items: [makeRequest({
          status: 'COMPLETED', review: null,
          listing: { id: 'listing-9', title: 'خدمة قابلة للتقييم', images: [], provider: { businessName: 'مزود' } },
        })],
        meta: { totalPages: 1 },
      },
      isLoading: false, isError: false,
    });
    const user = userEvent.setup();
    render(<MyServiceRequestsList />);

    await user.click(screen.getByText('قيّم الخدمة'));

    expect(screen.getByTestId('review-dialog')).toHaveTextContent('خدمة قابلة للتقييم');
  });

  // ── Out-of-range page recovery ────────────────────────────────────

  it('shows a spinner (not the empty state) when the current page exceeds totalPages', () => {
    mockSearchParams = new URLSearchParams('page=5');
    (useMyServiceRequests as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [], meta: { totalPages: 2 } }, isLoading: false, isError: false,
    });
    render(<MyServiceRequestsList />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('لا توجد طلبات')).not.toBeInTheDocument();
  });
});
