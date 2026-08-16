/**
 * __tests__/components/ServiceProviderSettingsSection.test.tsx
 *
 * Previously uncovered (0%). Gate component at the settings page that
 * decides between "become a provider" (BecomeServiceProviderCard) and
 * the provider's own settings card (MyServiceProviderCard), based on
 * useMyServiceProvider's loading/error/data state.
 *
 * Coverage targets:
 *  - Loading state renders a spinner
 *  - A real 404 (statusCode 404) is treated as "not yet a provider" ->
 *    renders BecomeServiceProviderCard, not an error message
 *  - Any other error (network/5xx, or a missing statusCode) shows a
 *    retry message distinct from the 404 case, with a retry button
 *    that calls refetch (UX-FIX P1-5)
 *  - No error but no provider data either -> also falls back to
 *    BecomeServiceProviderCard
 *  - Success with provider data -> renders MyServiceProviderCard with
 *    the provider passed through
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { ServiceProviderSettingsSection } from '@/components/services/ServiceProviderSettingsSection';
import { useMyServiceProvider } from '@/hooks/queries/useServiceProviders';

vi.mock('@/hooks/queries/useServiceProviders', () => ({
  useMyServiceProvider: vi.fn(),
}));

vi.mock('@/components/services/BecomeServiceProviderCard', () => ({
  BecomeServiceProviderCard: () => <div data-testid="become-provider-card" />,
}));

vi.mock('@/components/services/MyServiceProviderCard', () => ({
  MyServiceProviderCard: ({ provider }: { provider: { businessName: string } }) => (
    <div data-testid="my-provider-card">{provider.businessName}</div>
  ),
}));

function mockProviderState(overrides: Partial<ReturnType<typeof useMyServiceProvider>>) {
  vi.mocked(useMyServiceProvider).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ServiceProviderSettingsSection', () => {
  it('shows a loading spinner while fetching', () => {
    mockProviderState({ isLoading: true });
    render(<ServiceProviderSettingsSection />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders BecomeServiceProviderCard on a real 404 (not yet a provider)', () => {
    mockProviderState({ isError: true, error: { statusCode: 404 } });
    render(<ServiceProviderSettingsSection />);
    expect(screen.getByTestId('become-provider-card')).toBeInTheDocument();
    expect(screen.queryByText('تعذّر تحميل بيانات مزود الخدمة. يرجى المحاولة مرة أخرى.')).not.toBeInTheDocument();
  });

  it('shows a retry message (not the become-provider card) for a non-404 error, and calls refetch', async () => {
    const refetch = vi.fn();
    mockProviderState({ isError: true, error: { statusCode: 500 }, refetch });
    const user = setupUser();
    render(<ServiceProviderSettingsSection />);

    expect(screen.getByText('تعذّر تحميل بيانات مزود الخدمة. يرجى المحاولة مرة أخرى.')).toBeInTheDocument();
    expect(screen.queryByTestId('become-provider-card')).not.toBeInTheDocument();

    await user.click(screen.getByText('إعادة المحاولة'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('treats an error with no statusCode as a genuine failure, not a 404', () => {
    mockProviderState({ isError: true, error: {} });
    render(<ServiceProviderSettingsSection />);
    expect(screen.getByText('تعذّر تحميل بيانات مزود الخدمة. يرجى المحاولة مرة أخرى.')).toBeInTheDocument();
  });

  it('falls back to BecomeServiceProviderCard when there is no error but also no provider data', () => {
    mockProviderState({ isError: false, data: undefined });
    render(<ServiceProviderSettingsSection />);
    expect(screen.getByTestId('become-provider-card')).toBeInTheDocument();
  });

  it('renders MyServiceProviderCard with the provider once data resolves', () => {
    mockProviderState({ data: { businessName: 'شركة الصيانة' } });
    render(<ServiceProviderSettingsSection />);
    expect(screen.getByTestId('my-provider-card')).toHaveTextContent('شركة الصيانة');
  });
});
