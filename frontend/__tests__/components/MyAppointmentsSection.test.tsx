/**
 * __tests__/components/MyAppointmentsSection.test.tsx
 *
 * Previously uncovered (0%), ~40 lines. Thin wrapper that resolves the
 * caller's own provider profile before handing providerId to
 * AppointmentsList — a missing profile (404/error) is treated as
 * "not a provider yet", not a genuine error state.
 *
 * Coverage targets:
 *  - Loading state shows a spinner
 *  - No provider (isError, or data undefined with no error) shows the
 *    "لست مقدم خدمة بعد" empty state, not AppointmentsList
 *  - A resolved provider renders AppointmentsList with providerId set
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyAppointmentsSection } from '@/components/services/MyAppointmentsSection';
import { useMyServiceProvider } from '@/hooks/queries/useServiceProviders';

vi.mock('@/hooks/queries/useServiceProviders', () => ({
  useMyServiceProvider: vi.fn(),
}));

vi.mock('@/components/services/AppointmentsList', () => ({
  AppointmentsList: ({ providerId }: { providerId: string }) => (
    <div data-testid="appointments-list">{providerId}</div>
  ),
}));

function mockProviderState(overrides: Partial<ReturnType<typeof useMyServiceProvider>>) {
  vi.mocked(useMyServiceProvider).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...overrides,
  } as never);
}

describe('MyAppointmentsSection', () => {
  it('shows a spinner while loading', () => {
    mockProviderState({ isLoading: true });
    render(<MyAppointmentsSection />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the "not a provider yet" empty state when isError is true', () => {
    mockProviderState({ isError: true });
    render(<MyAppointmentsSection />);
    expect(screen.getByText('لست مقدم خدمة بعد')).toBeInTheDocument();
    expect(screen.queryByTestId('appointments-list')).not.toBeInTheDocument();
  });

  it('shows the "not a provider yet" empty state when data is undefined without an error', () => {
    mockProviderState({ isError: false, data: undefined });
    render(<MyAppointmentsSection />);
    expect(screen.getByText('لست مقدم خدمة بعد')).toBeInTheDocument();
  });

  it('renders AppointmentsList with the resolved providerId', () => {
    mockProviderState({ data: { id: 'provider-42' } as never });
    render(<MyAppointmentsSection />);
    expect(screen.getByTestId('appointments-list')).toHaveTextContent('provider-42');
  });
});
