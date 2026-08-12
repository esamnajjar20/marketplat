/**
 * __tests__/components/CreateServiceListingGate.test.tsx
 *
 * Previously uncovered. Gates service-listing creation behind having a
 * ServiceProvider profile (useMyServiceProvider) — mirrors
 * CreateAdGate/CreateProductGate. Branching logic lives in the shared
 * RequireProfileGate (separately covered); this test confirms the
 * wiring only: correct query hook, correct setup/from/copy props, and
 * ServiceListingForm mounts once a provider profile exists.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CreateServiceListingGate } from '@/components/services/CreateServiceListingGate';
import { useMyServiceProvider } from '@/hooks/queries/useServiceProviders';

vi.mock('@/hooks/queries/useServiceProviders', () => ({
  useMyServiceProvider: vi.fn(),
}));

vi.mock('@/components/services/ServiceListingForm', () => ({
  ServiceListingForm: ({ mode }: { mode: string }) => <div>ServiceListingForm:{mode}</div>,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function mockProvider(state: { data?: unknown; isLoading?: boolean; isError?: boolean }) {
  (useMyServiceProvider as ReturnType<typeof vi.fn>).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...state,
  });
}

describe('CreateServiceListingGate', () => {
  it('calls useMyServiceProvider to determine access', () => {
    mockProvider({ isLoading: true });
    render(<CreateServiceListingGate />);

    expect(useMyServiceProvider).toHaveBeenCalled();
  });

  it('shows the "activate provider profile" CTA when there is no profile yet', () => {
    mockProvider({ data: undefined, isError: false });
    render(<CreateServiceListingGate />);

    expect(screen.getByText('فعّل ملف مقدم الخدمة أولاً')).toBeInTheDocument();
    expect(screen.queryByText('ServiceListingForm:create')).not.toBeInTheDocument();
  });

  it('CTA links to /settings/service-provider with ?from=/my-services/new', () => {
    mockProvider({ isError: true });
    render(<CreateServiceListingGate />);

    const link = screen.getByRole('link', { name: 'تفعيل ملف مقدم خدمة' });
    expect(link.getAttribute('href')).toBe(
      `/settings/service-provider?from=${encodeURIComponent('/my-services/new')}`,
    );
  });

  it('renders ServiceListingForm in create mode once a provider profile exists', () => {
    mockProvider({ data: { id: 'sp-1' } });
    render(<CreateServiceListingGate />);

    expect(screen.getByText('ServiceListingForm:create')).toBeInTheDocument();
    expect(screen.queryByText('فعّل ملف مقدم الخدمة أولاً')).not.toBeInTheDocument();
  });
});
