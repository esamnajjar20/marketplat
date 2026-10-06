/**
 * __tests__/components/MyServiceListingsList.test.tsx
 *
 * Previously uncovered (0%). Provider-side "my services" list at
 * /my-services — mirrors MyAdsList/MyProductsList's shape via the
 * shared useOwnedListPage/useOutOfRangeRedirect hooks, but with a
 * services-specific status enum (ACTIVE/PAUSED/DELETED) and a
 * pause/resume toggle action in addition to edit/delete.
 *
 * Coverage targets:
 *  - Loading state renders skeleton rows (AdListItemSkeleton), not a spinner
 *  - Error state shows a retry option that calls refetch
 *  - Empty state shown when there are no listings, with a "نشر خدمة" CTA
 *  - Renders each listing's title, status badge, and formatted price for
 *    all three pricingType variants (, STARTING_FROM, NEGOTIABLE/null)
 *  - Status filter tabs reflect the current ?status= param
 *  - Pause/resume toggle (EPIC 1.3 fix):
 *      * shown for ACTIVE and PAUSED listings
 *      * hidden for DELETED listings
 *      * clicking calls toggleStatus.mutate with the flipped status
 *      * disabled only when the pending toggle mutation targets that
 *        specific listing's id
 *  - Delete flow via ConfirmDialog:
 *      * clicking the trash icon opens the dialog without deleting yet
 *      * confirming calls deleteListing.mutate with the correct id
 *      * cancelling does not call deleteListing.mutate
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { MyServiceListingsList } from '@/components/services/MyServiceListingsList';
import { useMyServiceListings } from '@/hooks/queries/useServiceListings';
import { useDeleteServiceListing, useToggleServiceListingStatus } from '@/hooks/mutations/useServiceListingMutations';
import type { ServiceListingStatus, ServicePricingType } from '@/types/service.types';

vi.mock('@/hooks/queries/useServiceListings', () => ({
  useMyServiceListings: vi.fn(),
}));

// The component also reads useMyServiceProvider() to decide whether to
// show the list vs. a "become a provider" prompt — default to "has a
// provider" so the existing list/status/pause-resume/delete coverage
// below exercises the list itself, not the gate.
vi.mock('@/hooks/queries/useServiceProviders', () => ({
  useMyServiceProvider: vi.fn(() => ({ data: { id: 'provider-1' }, isSuccess: true })),
}));

vi.mock('@/hooks/mutations/useServiceListingMutations', () => ({
  useDeleteServiceListing: vi.fn(),
  useToggleServiceListingStatus: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

function makeListing(overrides: Partial<{
  id: string;
  title: string;
  status: ServiceListingStatus;
  pricingType: ServicePricingType;
  price: string | null;
  views: number;
  createdAt: string;
  images: string[];
}> = {}) {
  return {
    id: 'listing-1',
    title: 'صيانة مكيفات',
    status: 'ACTIVE' as ServiceListingStatus,
    pricingType: 'FIXED' as ServicePricingType,
    price: '150.00',
    views: 5,
    createdAt: new Date().toISOString(),
    images: [],
    ...overrides,
  };
}

const mockDeleteMutate = vi.fn();
const mockToggleMutate = vi.fn();

function mockListingsState(overrides: Partial<ReturnType<typeof useMyServiceListings>>) {
  vi.mocked(useMyServiceListings).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useDeleteServiceListing).mockReturnValue({
    mutate: mockDeleteMutate,
    isPending: false,
  } as never);
  vi.mocked(useToggleServiceListingStatus).mockReturnValue({
    mutate: mockToggleMutate,
    isPending: false,
    variables: undefined,
  } as never);
});

describe('MyServiceListingsList', () => {
  it('shows skeleton rows while loading', () => {
    mockListingsState({ isLoading: true });
    const { container } = render(<MyServiceListingsList />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows an error state with a retry option that calls refetch', async () => {
    const refetch = vi.fn();
    mockListingsState({ isError: true, refetch });
    const user = setupUser();
    render(<MyServiceListingsList />);

    expect(screen.getByText('حدث خطأ أثناء تحميل خدماتك')).toBeInTheDocument();
    await user.click(screen.getByText('إعادة المحاولة'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state with a publish CTA when there are no listings', () => {
    mockListingsState({ data: { items: [], meta: { totalPages: 1 } } });
    render(<MyServiceListingsList />);
    expect(screen.getByText('لا توجد خدمات')).toBeInTheDocument();
    expect(screen.getByText('إضافة خدمة')).toBeInTheDocument();
  });

  describe('rendering listings', () => {
    it('renders the title and status badge', () => {
      mockListingsState({
        data: { items: [makeListing({ title: 'تصليح كهرباء', status: 'PAUSED' })], meta: { totalPages: 1 } },
      });
      render(<MyServiceListingsList />);
      expect(screen.getByText('تصليح كهرباء')).toBeInTheDocument();
      // "متوقفة" also appears as a filter-tab button; scope to the
      // status badge (a DIV, not a filter BUTTON) to avoid a
      // multi-match false failure.
      const badge = screen.getAllByText('متوقفة').find((el) => el.tagName === 'DIV');
      expect(badge).toBeInTheDocument();
    });

    it('formats a FIXED price plainly', () => {
      mockListingsState({
        data: { items: [makeListing({ pricingType: 'FIXED', price: '200.00' })], meta: { totalPages: 1 } },
      });
      render(<MyServiceListingsList />);
      expect(screen.getByText(/200/)).toBeInTheDocument();
    });

    it('formats a STARTING_FROM price with "يبدأ من"', () => {
      mockListingsState({
        data: { items: [makeListing({ pricingType: 'STARTING_FROM', price: '80.00' })], meta: { totalPages: 1 } },
      });
      render(<MyServiceListingsList />);
      expect(screen.getByText(/^يبدأ من/)).toBeInTheDocument();
    });

    it('shows "حسب الاتفاق" for NEGOTIABLE pricing', () => {
      mockListingsState({
        data: { items: [makeListing({ pricingType: 'NEGOTIABLE', price: null })], meta: { totalPages: 1 } },
      });
      render(<MyServiceListingsList />);
      expect(screen.getByText('حسب الاتفاق')).toBeInTheDocument();
    });

    it('shows "حسب الاتفاق" when price is null regardless of pricingType', () => {
      mockListingsState({
        data: { items: [makeListing({ pricingType: 'FIXED', price: null })], meta: { totalPages: 1 } },
      });
      render(<MyServiceListingsList />);
      expect(screen.getByText('حسب الاتفاق')).toBeInTheDocument();
    });
  });

  describe('pause/resume toggle', () => {
    it('shows the pause action for an ACTIVE listing', () => {
      mockListingsState({
        data: { items: [makeListing({ id: 'l-1', title: 'خدمة أولى', status: 'ACTIVE' })], meta: { totalPages: 1 } },
      });
      render(<MyServiceListingsList />);
      expect(screen.getByRole('button', { name: 'إيقاف خدمة أولى مؤقتاً' })).toBeInTheDocument();
    });

    it('shows the resume action for a PAUSED listing', () => {
      mockListingsState({
        data: { items: [makeListing({ id: 'l-1', title: 'خدمة أولى', status: 'PAUSED' })], meta: { totalPages: 1 } },
      });
      render(<MyServiceListingsList />);
      expect(screen.getByRole('button', { name: 'إعادة تفعيل خدمة أولى' })).toBeInTheDocument();
    });

    it('hides the pause/resume action for a DELETED listing', () => {
      mockListingsState({
        data: { items: [makeListing({ id: 'l-1', title: 'خدمة أولى', status: 'DELETED' })], meta: { totalPages: 1 } },
      });
      render(<MyServiceListingsList />);
      expect(screen.queryByRole('button', { name: /إيقاف|إعادة تفعيل/ })).not.toBeInTheDocument();
    });

    it('clicking pause calls toggleStatus.mutate with PAUSED', async () => {
      const user = setupUser();
      mockListingsState({
        data: { items: [makeListing({ id: 'l-9', title: 'خدمة أولى', status: 'ACTIVE' })], meta: { totalPages: 1 } },
      });
      render(<MyServiceListingsList />);

      await user.click(screen.getByRole('button', { name: 'إيقاف خدمة أولى مؤقتاً' }));
      expect(mockToggleMutate).toHaveBeenCalledWith({ id: 'l-9', status: 'PAUSED' });
    });

    it('clicking resume calls toggleStatus.mutate with ACTIVE', async () => {
      const user = setupUser();
      mockListingsState({
        data: { items: [makeListing({ id: 'l-9', title: 'خدمة أولى', status: 'PAUSED' })], meta: { totalPages: 1 } },
      });
      render(<MyServiceListingsList />);

      await user.click(screen.getByRole('button', { name: 'إعادة تفعيل خدمة أولى' }));
      expect(mockToggleMutate).toHaveBeenCalledWith({ id: 'l-9', status: 'ACTIVE' });
    });

    it('disables the toggle only for the row matching the pending mutation', () => {
      vi.mocked(useToggleServiceListingStatus).mockReturnValue({
        mutate: mockToggleMutate,
        isPending: true,
        variables: { id: 'l-1', status: 'PAUSED' },
      } as never);
      mockListingsState({
        data: {
          items: [
            makeListing({ id: 'l-1', title: 'الأولى', status: 'ACTIVE' }),
            makeListing({ id: 'l-2', title: 'الثانية', status: 'ACTIVE' }),
          ],
          meta: { totalPages: 1 },
        },
      });
      render(<MyServiceListingsList />);

      expect(screen.getByRole('button', { name: 'إيقاف الأولى مؤقتاً' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'إيقاف الثانية مؤقتاً' })).not.toBeDisabled();
    });
  });

  describe('delete flow via ConfirmDialog', () => {
    it('does not show the confirm dialog initially', () => {
      mockListingsState({ data: { items: [makeListing()], meta: { totalPages: 1 } } });
      render(<MyServiceListingsList />);
      expect(screen.queryByText('حذف الخدمة؟')).not.toBeInTheDocument();
    });

    it('clicking the delete icon opens the dialog without deleting yet', async () => {
      const user = setupUser();
      mockListingsState({
        data: { items: [makeListing({ id: 'l-7', title: 'خدمة سبعة' })], meta: { totalPages: 1 } },
      });
      render(<MyServiceListingsList />);

      await user.click(screen.getByRole('button', { name: 'حذف خدمة سبعة' }));
      expect(screen.getByText('حذف الخدمة؟')).toBeInTheDocument();
      expect(mockDeleteMutate).not.toHaveBeenCalled();
    });

    it('confirming the dialog calls deleteListing.mutate with the correct id', async () => {
      const user = setupUser();
      mockListingsState({
        data: { items: [makeListing({ id: 'l-7', title: 'خدمة سبعة' })], meta: { totalPages: 1 } },
      });
      render(<MyServiceListingsList />);

      await user.click(screen.getByRole('button', { name: 'حذف خدمة سبعة' }));
      await user.click(screen.getByRole('button', { name: 'حذف' }));

      expect(mockDeleteMutate).toHaveBeenCalledWith('l-7', expect.objectContaining({
        onSuccess: expect.any(Function),
      }));
    });

    it('cancelling the dialog does not call deleteListing.mutate', async () => {
      const user = setupUser();
      mockListingsState({
        data: { items: [makeListing({ id: 'l-7', title: 'خدمة سبعة' })], meta: { totalPages: 1 } },
      });
      render(<MyServiceListingsList />);

      await user.click(screen.getByRole('button', { name: 'حذف خدمة سبعة' }));
      await user.click(screen.getByRole('button', { name: 'إلغاء' }));

      expect(mockDeleteMutate).not.toHaveBeenCalled();
      expect(screen.queryByText('حذف الخدمة؟')).not.toBeInTheDocument();
    });
  });

  describe('status filter tabs', () => {
    it('marks "الكل" as pressed when no status filter is active', () => {
      mockListingsState({ data: { items: [], meta: { totalPages: 1 } } });
      render(<MyServiceListingsList />);
      expect(screen.getByRole('button', { name: 'الكل' })).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
