/**
 * __tests__/components/NearbyServiceProviders.test.tsx
 *
 * ARCH-this used to be a GPS-only "near me" trigger
 * (own useState location machine + useNearbyServiceProviders directly).
 * It's now the full /service-providers directory, reading
 * useServiceProvidersDirectory's gps → city → general cascade —
 * mocked here the same way NearbyProvidersSection.test.tsx mocks
 * useNearbyProvidersForHome, since these two components now share
 * the identical composition-hook pattern by design.
 *
 * Coverage targets:
 *  - loading (isChecking or isLoading) → skeleton, no cards, no error
 *  - error → retry option that calls refetch
 *  - resolved but empty → EmptyState, wording depends on source
 *  - resolved with items (gps/city/general) → cards render
 *  - LocationSourceBadge reflects the actual source of the shown data
 *  - "استخدام موقعي" CTA hidden only when source is already gps
 *  - CTA calls requestLocation() on click
 *  - pagination: Prev/Next disabled at bounds, calls setPage
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NearbyServiceProviders } from '@/components/services/NearbyServiceProviders';
import { useServiceProvidersDirectory } from '@/hooks/useServiceProvidersDirectory';
import type { NearbyServiceProviderRow } from '@/types/service.types';

vi.mock('@/hooks/useServiceProvidersDirectory', () => ({
  useServiceProvidersDirectory: vi.fn(),
  SERVICE_PROVIDERS_DIRECTORY_RADIUS_KM: 10,
}));

function makeProvider(overrides: Partial<NearbyServiceProviderRow> = {}): NearbyServiceProviderRow {
  return {
    id: 'provider-1',
    sellerProfileId: 'seller-1',
    businessName: 'خدمات السباكة السريعة',
    businessType: 'INDIVIDUAL',
    logoUrl: null,
    description: 'خدمات سباكة منزلية سريعة وموثوقة',
    serviceAreaCities: ['غزة'],
    workingHours: {} as NearbyServiceProviderRow['workingHours'],
    contactPhone: '+970591234567',
    availabilityStatus: 'AVAILABLE',
    completedRequestsCount: 10,
    fulfillmentRate: null,
    latitude: null,
    longitude: null,
    distanceKm: 2.345,
    ...overrides,
  };
}

const requestLocation = vi.fn();
const setPage = vi.fn();
const refetch = vi.fn();

function mockDirectory(overrides: Record<string, unknown> = {}) {
  (useServiceProvidersDirectory as ReturnType<typeof vi.fn>).mockReturnValue({
    isChecking: false,
    isLoading: false,
    isError: false,
    source: 'general',
    data: undefined,
    page: 1,
    setPage,
    city: undefined,
    requestLocation,
    refetch,
    ...overrides,
  });
}

describe('NearbyServiceProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDirectory();
  });

  it('renders a skeleton (no cards) while the resolver is still checking', () => {
    mockDirectory({ isChecking: true });
    render(<NearbyServiceProviders />);
    expect(screen.queryByText(/السباكة/)).not.toBeInTheDocument();
  });

  it('renders a skeleton (no cards) while the query is loading', () => {
    mockDirectory({ isLoading: true });
    render(<NearbyServiceProviders />);
    expect(screen.queryByText(/السباكة/)).not.toBeInTheDocument();
  });

  it('shows an error state with a retry option that calls refetch', async () => {
    mockDirectory({ isError: true });
    const user = userEvent.setup();
    render(<NearbyServiceProviders />);

    expect(screen.getByText('حدث خطأ أثناء تحميل مقدمي الخدمة')).toBeInTheDocument();
    await user.click(screen.getByText('إعادة المحاولة'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows a GPS-specific empty message when the resolved source is gps', () => {
    mockDirectory({ source: 'gps', data: { items: [], meta: { totalPages: 1 } } });
    render(<NearbyServiceProviders />);
    expect(screen.getByText('لا يوجد مقدمو خدمة حالياً')).toBeInTheDocument();
    expect(screen.getByText(/ضمن 10 كم من موقعك/)).toBeInTheDocument();
  });

  it('shows a neutral empty message when the resolved source is general (no dead end)', () => {
    mockDirectory({ source: 'general', data: { items: [], meta: { totalPages: 1 } } });
    render(<NearbyServiceProviders />);
    expect(screen.getByText('لا يوجد مقدمو خدمة حالياً')).toBeInTheDocument();
    expect(screen.getByText('لم نجد مقدمي خدمة لعرضهم في الوقت الحالي')).toBeInTheDocument();
  });

  it('renders a card per provider once results resolve', () => {
    mockDirectory({
      data: { items: [makeProvider({ businessName: 'مزود قريب' })], meta: { totalPages: 1 } },
    });
    render(<NearbyServiceProviders />);
    expect(screen.getByText('مزود قريب')).toBeInTheDocument();
  });

  it('shows "قريب منك" badge when the resolved source is gps', () => {
    mockDirectory({
      source: 'gps',
      data: { items: [makeProvider()], meta: { totalPages: 1 } },
    });
    render(<NearbyServiceProviders />);
    expect(screen.getByText('قريب منك')).toBeInTheDocument();
  });

  it('shows the city badge when the resolved source is city', () => {
    mockDirectory({
      source: 'city',
      city: 'غزة',
      data: { items: [makeProvider()], meta: { totalPages: 1 } },
    });
    render(<NearbyServiceProviders />);
    expect(screen.getByText('نتائج في غزة')).toBeInTheDocument();
  });

  it('shows the generic "نتائج مقترحة" badge when the resolved source is general', () => {
    mockDirectory({
      source: 'general',
      data: { items: [makeProvider()], meta: { totalPages: 1 } },
    });
    render(<NearbyServiceProviders />);
    expect(screen.getByText('نتائج مقترحة')).toBeInTheDocument();
  });

  it('shows the "استخدام موقعي" CTA whenever the resolved source is not gps', () => {
    mockDirectory({
      source: 'general',
      data: { items: [makeProvider()], meta: { totalPages: 1 } },
    });
    render(<NearbyServiceProviders />);
    expect(screen.getByText('استخدام موقعي')).toBeInTheDocument();
  });

  it('hides the "استخدام موقعي" CTA once the resolved source is gps', () => {
    mockDirectory({
      source: 'gps',
      data: { items: [makeProvider()], meta: { totalPages: 1 } },
    });
    render(<NearbyServiceProviders />);
    expect(screen.queryByText('استخدام موقعي')).not.toBeInTheDocument();
  });

  it('calls requestLocation() when the CTA is clicked', async () => {
    mockDirectory({ data: { items: [makeProvider()], meta: { totalPages: 1 } } });
    const user = userEvent.setup();
    render(<NearbyServiceProviders />);

    await user.click(screen.getByText('استخدام موقعي'));
    expect(requestLocation).toHaveBeenCalledTimes(1);
  });

  describe('pagination', () => {
    it('disables "السابق" on the first page and enables "التالي" when more pages exist', () => {
      mockDirectory({
        page: 1,
        data: { items: [makeProvider()], meta: { totalPages: 3 } },
      });
      render(<NearbyServiceProviders />);

      expect(screen.getByRole('button', { name: 'السابق' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'التالي' })).not.toBeDisabled();
      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });

    it('does not render pagination controls when there is only one page', () => {
      mockDirectory({
        page: 1,
        data: { items: [makeProvider()], meta: { totalPages: 1 } },
      });
      render(<NearbyServiceProviders />);
      expect(screen.queryByRole('button', { name: 'التالي' })).not.toBeInTheDocument();
    });

    it('calls setPage when "التالي" is clicked', async () => {
      mockDirectory({
        page: 1,
        data: { items: [makeProvider()], meta: { totalPages: 2 } },
      });
      const user = userEvent.setup();
      render(<NearbyServiceProviders />);

      await user.click(screen.getByRole('button', { name: 'التالي' }));
      expect(setPage).toHaveBeenCalledTimes(1);
    });
  });
});
