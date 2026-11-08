/**
 * __tests__/components/MyServicesHub.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders as render } from '@/test-support/render';
import { screen } from '@testing-library/react';
import { MyServicesHub } from '@/components/services/MyServicesHub';
import { useMyServiceProvider, useMyServiceProviderDashboard } from '@/hooks/queries/useServiceProviders';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/my-services',
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock('@/hooks/queries/useServiceProviders', () => ({
  useMyServiceProvider: vi.fn(),
  useMyServiceProviderDashboard: vi.fn(),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn((sel: (s: { user: { id: string } | null }) => unknown) =>
    sel({ user: { id: 'u1' } }),
  ),
  selectUser: (s: { user: unknown }) => s.user,
  selectHasAccessToken: (s: any) => Boolean(s?.accessToken ?? s?.hasAccessToken),
  selectHydratedUser: (s: any) => (s?.isHydrated ? s.user : null),
  selectHydratedIsAuthenticated: (s: any) => (s?.isHydrated ? Boolean(s?.isAuthenticated ?? s?.user) : false),
  selectIsAuthResolving: (s: any) => Boolean(s?.isAuthResolving),
  selectIsHydrated: (s: any) => Boolean(s?.isHydrated),
  selectAccessToken: (s: any) => s?.accessToken,
  selectIsAuthenticated: (s: any) => Boolean(s?.isAuthenticated ?? s?.user),
  selectIsAdmin: (s: any) => Boolean(s?.isAdmin ?? (s?.user?.role === 'ADMIN' || s?.user?.role === 'MODERATOR')),
}));

vi.mock('@/components/services/BecomeServiceProviderCard', () => ({
  BecomeServiceProviderCard: () => <div data-testid="become-provider">Become</div>,
}));

const provider = {
  id: 'sp1',
  businessName: 'خدمات النور',
  availabilityStatus: 'AVAILABLE',
  serviceAreaCities: ['غزة', 'رفح'],
};

// TODO(2026-10-16): un-skip after updating loading-state assertions to match unified loading system (1f2c898a)
describe('MyServicesHub', () => {
  beforeEach(() => {
    vi.mocked(useMyServiceProvider).mockReturnValue({ data: provider, isLoading: false, isError: false, error: null, refetch: vi.fn() } as never);
    vi.mocked(useMyServiceProviderDashboard).mockReturnValue({
      data: { analytics: null, listings: { items: [], meta: {} } },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);
  });

  it('shows loading spinner', () => {
    vi.mocked(useMyServiceProviderDashboard).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<MyServicesHub />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders provider hub with business name and availability', () => {
    render(<MyServicesHub />);
    expect(screen.getByText('خدمات النور')).toBeInTheDocument();
    expect(screen.getByText('متاح الآن')).toBeInTheDocument();
    expect(screen.getByText(/غزة/)).toBeInTheDocument();
    expect(screen.getByText('خدمة جديدة')).toBeInTheDocument();
  });

  it('shows become-provider card when no provider (404)', () => {
    vi.mocked(useMyServiceProvider).mockReturnValue({
      data: undefined, isLoading: false, isError: true, error: { statusCode: 404 }, refetch: vi.fn(),
    } as never);
    render(<MyServicesHub />);
    expect(screen.getByTestId('become-provider')).toBeInTheDocument();
  });

  it('shows error with retry for non-404 errors', () => {
    const refetch = vi.fn();
    vi.mocked(useMyServiceProviderDashboard).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { statusCode: 500 },
      refetch,
    } as never);
    render(<MyServicesHub />);
    expect(screen.getByText(/تعذّر تحميل/)).toBeInTheDocument();
    expect(screen.getByText('إعادة المحاولة')).toBeInTheDocument();
  });

  it('does not render a second compact service list above the management list', () => {
    render(<MyServicesHub />);
    expect(screen.queryByText('قائمة الخدمات')).not.toBeInTheDocument();
  });

  it('does not present offline-missing analytics as confirmed zero counts', () => {
    render(<MyServicesHub />);
    expect(screen.getAllByText('—')).toHaveLength(4);
    expect(screen.queryByText('يحتاج إلى إجراء')).not.toBeInTheDocument();
  });

  it('shows pending requests banner from analytics', () => {
    vi.mocked(useMyServiceProviderDashboard).mockReturnValue({
      data: { analytics: {
        totalViews: 0, activeListings: 0, pendingRequests: 3, completedRequests: 0,
        fulfillmentRate: null, upcomingAppointments: 0, averageRating: null, reviewCount: 0,
        revenue: 0, topListings: [], period: 'all',
      }, listings: { items: [], meta: {} } },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    } as never);
    render(<MyServicesHub />);
    expect(screen.getByText('يحتاج إلى إجراء')).toBeInTheDocument();
    expect(screen.getAllByText(/[٣3]/).length).toBeGreaterThan(0);
    expect(screen.getByText('طلبات بانتظار ردك')).toBeInTheDocument();
  });
});
