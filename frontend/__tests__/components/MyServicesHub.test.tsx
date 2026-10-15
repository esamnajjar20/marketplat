/**
 * __tests__/components/MyServicesHub.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders as render } from '@/test-support/render';
import { screen } from '@testing-library/react';
import { MyServicesHub } from '@/components/services/MyServicesHub';
import {
  useMyServiceProvider,
  useMyServiceProviderAnalytics,
} from '@/hooks/queries/useServiceProviders';

vi.mock('@/hooks/queries/useServiceProviders', () => ({
  useMyServiceProvider: vi.fn(),
  useMyServiceProviderAnalytics: vi.fn(() => ({ data: null })),
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

describe('MyServicesHub', () => {
  beforeEach(() => {
    vi.mocked(useMyServiceProviderAnalytics).mockReturnValue({ data: null } as never);
    vi.mocked(useMyServiceProvider).mockReturnValue({
      data: provider,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);
  });

  it('shows loading spinner', () => {
    vi.mocked(useMyServiceProvider).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<MyServicesHub />);
    expect(screen.getByLabelText(/جارٍ التحميل/)).toBeInTheDocument();
  });

  it('renders provider hub with business name and availability', () => {
    render(<MyServicesHub />);
    expect(screen.getByText('خدمات النور')).toBeInTheDocument();
    expect(screen.getAllByText('متاح')[0]).toBeInTheDocument();
    expect(screen.getByText(/غزة/)).toBeInTheDocument();
    expect(screen.getByText('خدمة جديدة')).toBeInTheDocument();
  });

  it('shows become-provider card when no provider (404)', () => {
    vi.mocked(useMyServiceProvider).mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: { statusCode: 404 },
      refetch: vi.fn(),
    } as never);
    render(<MyServicesHub />);
    expect(screen.getByTestId('become-provider')).toBeInTheDocument();
  });

  it('shows error with retry for non-404 errors', () => {
    const refetch = vi.fn();
    vi.mocked(useMyServiceProvider).mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: { statusCode: 500 },
      refetch,
    } as never);
    render(<MyServicesHub />);
    expect(screen.getByText(/تعذّر تحميل/)).toBeInTheDocument();
    expect(screen.getByText('إعادة المحاولة')).toBeInTheDocument();
  });

  it('shows pending requests banner from analytics', () => {
    vi.mocked(useMyServiceProviderAnalytics).mockReturnValue({
      data: { pendingRequests: 3, upcomingAppointments: 0 },
    } as never);
    render(<MyServicesHub />);
    expect(screen.getByText(/لديك 3 عنصراً يحتاج إلى متابعة/)).toBeInTheDocument();
    expect(screen.getByText('طلبات بانتظار ردك')).toBeInTheDocument();
  });
});
