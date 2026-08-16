/**
 * __tests__/components/MyServiceProviderCard.test.tsx
 *
 * Previously uncovered (0%), ~165 lines. Post-creation settings view for
 * a service provider — availability Select (fires mutate immediately on
 * change), an embedded WorkingHoursEditor with local staged state + an
 * explicit save button that only appears once changed, open<close
 * per-day validation, and two profile links.
 *
 * Coverage targets:
 *  - Renders businessName, businessType badge (فرد / عمل صغير),
 *    description, stats (completedRequestsCount, fulfillmentRate
 *    formatted to 0 decimals or "—" when null)
 *  - Availability Select: shows current value, changing it calls
 *    updateProvider.mutate with { availabilityStatus }
 *  - Working hours: save button hidden until changed; appears once
 *    WorkingHoursEditor's onChange fires with a different value;
 *    clicking save calls mutate with { workingHours }; validation
 *    error (open >= close) blocks the mutate call and shows the
 *    day-specific message instead
 *  - isSavingHours only disables the hours save button when the
 *    in-flight mutation's variables contain workingHours (not when
 *    it's the availability mutation that's pending)
 *  - Public profile / manage-services links point to the right routes
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { MyServiceProviderCard } from '@/components/services/MyServiceProviderCard';
import { useUpdateServiceProvider } from '@/hooks/mutations/useServiceProviderMutations';
import { useAuthStore } from '@/store/auth.store';
import type { ServiceProviderDetails, WorkingHours } from '@/types/service.types';

vi.mock('@/hooks/mutations/useServiceProviderMutations', () => ({
  useUpdateServiceProvider: vi.fn(),
}));

// UNIFIED-PROFILE: the "عرض صفحتي العامة" link now reads the current
// user's own id from useAuthStore (see MyServiceProviderCard.tsx's own
// comment on why — ServiceProviderDetails has no userId field, only
// sellerProfileId), so this needs a mock the same way SellerCard.test.tsx
// already mocks the same store.
vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const FULL_HOURS: WorkingHours = {
  sat: { open: '09:00', close: '17:00' },
  sun: { open: '09:00', close: '17:00' },
  mon: { open: '09:00', close: '17:00' },
  tue: { open: '09:00', close: '17:00' },
  wed: { open: '09:00', close: '17:00' },
  thu: { open: '09:00', close: '17:00' },
  fri: null,
};

function makeProvider(overrides: Partial<ServiceProviderDetails> = {}): ServiceProviderDetails {
  return {
    id: 'provider-1',
    sellerProfileId: 'seller-1',
    businessName: 'شركة الصيانة الشاملة',
    businessType: 'INDIVIDUAL',
    logoUrl: null,
    description: 'خدمات صيانة عامة',
    serviceAreaCities: ['غزة'],
    workingHours: FULL_HOURS,
    contactPhone: '+970591234567',
    availabilityStatus: 'AVAILABLE',
    completedRequestsCount: 8,
    fulfillmentRate: '92.5',
    latitude: null,
    longitude: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const mockMutate = vi.fn();

function mockUpdateState(overrides: Partial<ReturnType<typeof useUpdateServiceProvider>> = {}) {
  vi.mocked(useUpdateServiceProvider).mockReturnValue({
    mutate: mockMutate,
    isPending: false,
    variables: undefined,
    ...overrides,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateState();
  vi.mocked(useAuthStore).mockImplementation(
    (selector: (s: { user: unknown }) => unknown) => selector({ user: { id: 'user-1' } }),
  );
});

describe('MyServiceProviderCard', () => {
  it('renders businessName, description, and the individual businessType badge', () => {
    render(<MyServiceProviderCard provider={makeProvider({ businessType: 'INDIVIDUAL' })} />);
    expect(screen.getByText('شركة الصيانة الشاملة')).toBeInTheDocument();
    expect(screen.getByText('خدمات صيانة عامة')).toBeInTheDocument();
    expect(screen.getByText('فرد')).toBeInTheDocument();
  });

  it('shows "عمل صغير" for SMALL_BUSINESS type', () => {
    render(<MyServiceProviderCard provider={makeProvider({ businessType: 'SMALL_BUSINESS' })} />);
    expect(screen.getByText('عمل صغير')).toBeInTheDocument();
  });

  it('renders completedRequestsCount and fulfillmentRate rounded to 0 decimals', () => {
    render(<MyServiceProviderCard provider={makeProvider({ completedRequestsCount: 8, fulfillmentRate: '92.5' })} />);
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('93%')).toBeInTheDocument();
  });

  it('shows "—" for fulfillmentRate when null', () => {
    render(<MyServiceProviderCard provider={makeProvider({ fulfillmentRate: null })} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  describe('availability select', () => {
    it('changing the availability select calls mutate with availabilityStatus', async () => {
      const user = setupUser();
      render(<MyServiceProviderCard provider={makeProvider({ availabilityStatus: 'AVAILABLE' })} />);

      await user.click(screen.getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: 'مشغول' }));

      expect(mockMutate).toHaveBeenCalledWith({ availabilityStatus: 'BUSY' });
    });
  });

  describe('working hours', () => {
    it('does not show a save button when hours have not changed', () => {
      render(<MyServiceProviderCard provider={makeProvider({ workingHours: FULL_HOURS })} />);
      expect(screen.queryByText('حفظ ساعات العمل')).not.toBeInTheDocument();
    });

    it('shows the save button once a day is toggled', async () => {
      const user = setupUser();
      render(<MyServiceProviderCard provider={makeProvider({ workingHours: FULL_HOURS })} />);

      // fri is currently null/closed — toggling it on changes local state.
      const friCheckbox = screen.getAllByRole('checkbox')[6];
      await user.click(friCheckbox);

      expect(screen.getByText('حفظ ساعات العمل')).toBeInTheDocument();
    });

    it('clicking save calls mutate with the updated workingHours', async () => {
      const user = setupUser();
      render(<MyServiceProviderCard provider={makeProvider({ workingHours: FULL_HOURS })} />);

      const friCheckbox = screen.getAllByRole('checkbox')[6];
      await user.click(friCheckbox);
      await user.click(screen.getByText('حفظ ساعات العمل'));

      expect(mockMutate).toHaveBeenCalledWith(
        { workingHours: { ...FULL_HOURS, fri: { open: '09:00', close: '17:00' } } },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('blocks save and shows a day-specific error when open >= close', async () => {
      const user = setupUser();
      render(<MyServiceProviderCard provider={makeProvider({ workingHours: FULL_HOURS })} />);

      // Change sat's open time to something >= its close time (17:00).
      const satOpenInput = screen.getByLabelText('السبت — وقت الفتح');
      const { fireEvent } = await import('@testing-library/react');
      fireEvent.change(satOpenInput, { target: { value: '18:00' } });

      await user.click(screen.getByText('حفظ ساعات العمل'));

      expect(screen.getByRole('alert')).toHaveTextContent('السبت: وقت الإغلاق يجب أن يكون بعد وقت الفتح');
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('disables the save button (label "جارٍ الحفظ…") only when the pending mutation is for workingHours', async () => {
      // The save button (and its pending label) only renders once local
      // workingHours state has diverged from the provider prop — that
      // divergence comes from a user edit, not from the initial prop, since
      // local state is seeded from provider.workingHours on mount. Toggle a
      // day first to reach the state under test.
      mockUpdateState({ isPending: true, variables: { workingHours: FULL_HOURS } });
      const user = setupUser();
      render(<MyServiceProviderCard provider={makeProvider({ workingHours: FULL_HOURS })} />);

      const friCheckbox = screen.getAllByRole('checkbox')[6];
      await user.click(friCheckbox);

      expect(screen.getByText('جارٍ الحفظ…')).toBeInTheDocument();
    });

    it('does not show "جارٍ الحفظ…" when the pending mutation is for availabilityStatus, not workingHours', async () => {
      mockUpdateState({ isPending: true, variables: { availabilityStatus: 'BUSY' } });
      const user = setupUser();
      render(<MyServiceProviderCard provider={makeProvider({ workingHours: FULL_HOURS })} />);

      const friCheckbox = screen.getAllByRole('checkbox')[6];
      await user.click(friCheckbox);

      expect(screen.getByText('حفظ ساعات العمل')).toBeInTheDocument();
      expect(screen.queryByText('جارٍ الحفظ…')).not.toBeInTheDocument();
    });
  });

  describe('links', () => {
    it('links to the current user\'s unified profile page', () => {
      // UNIFIED-PROFILE: /service-providers/[id] is now just a redirect
      // back to /profile/[userId] — this links straight to the logged-in
      // user's own profile instead (see the component's own comment).
      render(<MyServiceProviderCard provider={makeProvider({ id: 'provider-77' })} />);
      expect(screen.getByText('عرض صفحتي العامة')).toHaveAttribute(
        'href', expect.stringContaining('user-1'),
      );
    });

    it('links to the manage-services page', () => {
      render(<MyServiceProviderCard provider={makeProvider()} />);
      expect(screen.getByText('إدارة خدماتي')).toHaveAttribute('href', '/my-services');
    });
  });
});
