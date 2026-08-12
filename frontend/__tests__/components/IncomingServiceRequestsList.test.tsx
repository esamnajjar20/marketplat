/**
 * __tests__/components/IncomingServiceRequestsList.test.tsx
 *
 * Previously uncovered (0%), ~245 lines. Provider-side inbox at
 * /my-services/requests — mirrors MyServiceRequestsList's shape
 * (loading/error/empty, status filter tabs, out-of-range page
 * recovery), but with provider-facing status-gated actions (accept/
 * reject/start/complete) instead of cancel/review, plus a
 * "حجز موعد" action that opens CreateAppointmentDialog.
 *
 * Coverage targets:
 *  - Loading state shows a spinner
 *  - Error state shows a retry button that calls refetch
 *  - Empty state shown when there are no requests
 *  - Renders listing title, customer name, status badge, details,
 *    relative time, and a link to the request detail page
 *  - Status filter tabs: aria-pressed reflects ?status=, clicking
 *    pushes the new status and clears ?page=
 *  - RequestActions per status:
 *      PENDING      -> رفض / قبول buttons, calling respond.mutate
 *                       with REJECTED / ACCEPTED
 *      ACCEPTED     -> حجز موعد + بدء التنفيذ (IN_PROGRESS)
 *      IN_PROGRESS  -> حجز موعد + إنهاء (COMPLETED)
 *      COMPLETED/REJECTED/CANCELLED -> no action buttons
 *  - Clicking "حجز موعد" opens CreateAppointmentDialog with the
 *    correct providerId/requestId/contextLabel
 *  - Out-of-range page recovery: spinner (not empty state) when page
 *    exceeds totalPages
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IncomingServiceRequestsList } from '@/components/services/IncomingServiceRequestsList';
import { useIncomingServiceRequests } from '@/hooks/queries/useServiceRequests';
import { useRespondToServiceRequest } from '@/hooks/mutations/useServiceRequestMutations';
import type { ServiceRequest, ServiceRequestStatus } from '@/types/service.types';

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
  useIncomingServiceRequests: vi.fn(),
}));

vi.mock('@/hooks/mutations/useServiceRequestMutations', () => ({
  useRespondToServiceRequest: vi.fn(),
}));

vi.mock('@/components/services/CreateAppointmentDialog', () => ({
  CreateAppointmentDialog: ({
    open, providerId, requestId, contextLabel,
  }: { open: boolean; providerId: string; requestId?: string; contextLabel?: string }) =>
    open ? (
      <div data-testid="appointment-dialog">
        {providerId}:{requestId}:{contextLabel}
      </div>
    ) : null,
}));

function makeRequest(overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id: 'req-1',
    listingId: 'listing-1',
    customerId: 'customer-1',
    status: 'PENDING',
    details: 'أحتاج صيانة عاجلة',
    attachedImages: [],
    quotedPrice: null,
    agreedPrice: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    respondedAt: null,
    listing: {
      id: 'listing-1',
      title: 'تصليح كهرباء',
      images: [],
      providerId: 'provider-1',
      provider: {
        id: 'provider-1',
        businessName: 'شركة الكهرباء',
        sellerProfile: { userId: 'user-1', displayName: 'زياد' },
      },
    },
    customer: { id: 'customer-1', name: 'ليلى', avatarUrl: null },
    review: null,
    ...overrides,
  };
}

const mockRespondMutate = vi.fn();

function mockIncomingState(overrides: Partial<ReturnType<typeof useIncomingServiceRequests>>) {
  vi.mocked(useIncomingServiceRequests).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams = new URLSearchParams();
  vi.mocked(useRespondToServiceRequest).mockReturnValue({
    mutate: mockRespondMutate,
    isPending: false,
  } as never);
});

describe('IncomingServiceRequestsList', () => {
  it('shows a loading spinner while fetching', () => {
    mockIncomingState({ isLoading: true });
    render(<IncomingServiceRequestsList />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state with a retry option that calls refetch', async () => {
    const refetch = vi.fn();
    mockIncomingState({ isError: true, refetch });
    const user = userEvent.setup();
    render(<IncomingServiceRequestsList />);

    expect(screen.getByText('حدث خطأ أثناء تحميل الطلبات الواردة')).toBeInTheDocument();
    await user.click(screen.getByText('إعادة المحاولة'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there are no incoming requests', () => {
    mockIncomingState({ data: { items: [], meta: { totalPages: 1 } } });
    render(<IncomingServiceRequestsList />);
    expect(screen.getByText('لا توجد طلبات واردة')).toBeInTheDocument();
  });

  it('renders the listing title, customer name, status badge, and details', () => {
    mockIncomingState({
      data: { items: [makeRequest({ status: 'PENDING' })], meta: { totalPages: 1 } },
    });
    render(<IncomingServiceRequestsList />);
    expect(screen.getByText('تصليح كهرباء')).toBeInTheDocument();
    expect(screen.getByText('من ليلى')).toBeInTheDocument();
    // "قيد الانتظار" also appears as a filter-tab button; scope to the
    // status badge specifically to avoid a multi-match false failure.
    expect(screen.getAllByText('قيد الانتظار').length).toBeGreaterThanOrEqual(1);
    const badge = screen.getAllByText('قيد الانتظار').find((el) => el.tagName === 'DIV');
    expect(badge).toBeInTheDocument();
    expect(screen.getByText('أحتاج صيانة عاجلة')).toBeInTheDocument();
  });

  it('links to the request detail page', () => {
    mockIncomingState({
      data: { items: [makeRequest({ id: 'req-77' })], meta: { totalPages: 1 } },
    });
    render(<IncomingServiceRequestsList />);
    expect(screen.getByText('عرض التفاصيل الكاملة')).toHaveAttribute(
      'href', expect.stringContaining('req-77'),
    );
  });

  describe('status filter tabs', () => {
    it('marks "الكل" as pressed when no status filter is active', () => {
      mockIncomingState({ data: { items: [], meta: { totalPages: 1 } } });
      render(<IncomingServiceRequestsList />);
      expect(screen.getByRole('button', { name: 'الكل' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('marks the matching status tab as pressed when ?status= is set', () => {
      mockSearchParams = new URLSearchParams('status=ACCEPTED');
      mockIncomingState({ data: { items: [], meta: { totalPages: 1 } } });
      render(<IncomingServiceRequestsList />);
      expect(screen.getByRole('button', { name: 'مقبول' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'الكل' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('navigates with the new status and clears the page param when a tab is clicked', async () => {
      mockSearchParams = new URLSearchParams('page=2');
      mockIncomingState({ data: { items: [], meta: { totalPages: 3 } } });
      const user = userEvent.setup();
      render(<IncomingServiceRequestsList />);

      await user.click(screen.getByRole('button', { name: 'مكتمل' }));

      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('status=COMPLETED'));
      expect(mockPush).toHaveBeenCalledWith(expect.not.stringContaining('page='));
    });
  });

  describe('request actions by status', () => {
    it('shows رفض / قبول for a PENDING request, calling respond.mutate with the right action', async () => {
      mockIncomingState({
        data: { items: [makeRequest({ status: 'PENDING' })], meta: { totalPages: 1 } },
      });
      const user = userEvent.setup();
      render(<IncomingServiceRequestsList />);

      // "قبول" as a substring also matches the "مقبول" filter tab, and
      // exact match still collides with the tab's full label being
      // different text nodes — scope to buttons with an accessible name
      // that is exactly "قبول" (the row action), not a tab.
      const acceptButtons = screen.getAllByRole('button', { name: /قبول/ });
      const acceptButton = acceptButtons.find((btn) => btn.textContent?.trim() === 'قبول');
      expect(acceptButton).toBeDefined();
      await user.click(acceptButton!);
      expect(mockRespondMutate).toHaveBeenCalledWith({ action: 'ACCEPTED' });

      await user.click(screen.getByRole('button', { name: /رفض/ }));
      expect(mockRespondMutate).toHaveBeenCalledWith({ action: 'REJECTED' });
    });

    it('shows حجز موعد + بدء التنفيذ for an ACCEPTED request', async () => {
      mockIncomingState({
        data: { items: [makeRequest({ status: 'ACCEPTED' })], meta: { totalPages: 1 } },
      });
      const user = userEvent.setup();
      render(<IncomingServiceRequestsList />);

      expect(screen.getByRole('button', { name: /حجز موعد/ })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /بدء التنفيذ/ }));
      expect(mockRespondMutate).toHaveBeenCalledWith({ action: 'IN_PROGRESS' });
    });

    it('shows حجز موعد + إنهاء for an IN_PROGRESS request', async () => {
      mockIncomingState({
        data: { items: [makeRequest({ status: 'IN_PROGRESS' })], meta: { totalPages: 1 } },
      });
      const user = userEvent.setup();
      render(<IncomingServiceRequestsList />);

      expect(screen.getByRole('button', { name: /حجز موعد/ })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /إنهاء/ }));
      expect(mockRespondMutate).toHaveBeenCalledWith({ action: 'COMPLETED' });
    });

    it.each(['COMPLETED', 'REJECTED', 'CANCELLED'] as ServiceRequestStatus[])(
      'shows no action buttons for a %s request',
      (status) => {
        mockIncomingState({
          data: { items: [makeRequest({ status })], meta: { totalPages: 1 } },
        });
        render(<IncomingServiceRequestsList />);
        // Filter tabs "مقبول"/"مرفوض" contain "قبول"/"رفض" as substrings,
        // so a loose regex over the whole document false-matches them.
        // Assert on exact row-action labels instead.
        const actionButtons = screen
          .queryAllByRole('button')
          .filter((btn) =>
            ['قبول', 'رفض', 'بدء التنفيذ', 'إنهاء', 'حجز موعد'].includes(btn.textContent?.trim() ?? ''),
          );
        expect(actionButtons).toHaveLength(0);
      },
    );
  });

  describe('booking an appointment', () => {
    it('opens CreateAppointmentDialog with providerId/requestId/contextLabel when حجز موعد is clicked', async () => {
      mockIncomingState({
        data: {
          items: [makeRequest({
            id: 'req-55',
            status: 'ACCEPTED',
            listing: {
              id: 'listing-9', title: 'خدمة قابلة للحجز', images: [], providerId: 'provider-9',
              provider: { id: 'provider-9', businessName: 'مزود', sellerProfile: { userId: 'u1', displayName: 'x' } },
            },
          })],
          meta: { totalPages: 1 },
        },
      });
      const user = userEvent.setup();
      render(<IncomingServiceRequestsList />);

      await user.click(screen.getByRole('button', { name: /حجز موعد/ }));

      expect(screen.getByTestId('appointment-dialog')).toHaveTextContent('provider-9:req-55:خدمة قابلة للحجز');
    });

    it('does not render the dialog before حجز موعد is clicked', () => {
      mockIncomingState({
        data: { items: [makeRequest({ status: 'ACCEPTED' })], meta: { totalPages: 1 } },
      });
      render(<IncomingServiceRequestsList />);
      expect(screen.queryByTestId('appointment-dialog')).not.toBeInTheDocument();
    });
  });

  it('shows a spinner (not the empty state) when the current page exceeds totalPages', () => {
    mockSearchParams = new URLSearchParams('page=5');
    mockIncomingState({ data: { items: [], meta: { totalPages: 2 } } });
    render(<IncomingServiceRequestsList />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('لا توجد طلبات واردة')).not.toBeInTheDocument();
  });
});
