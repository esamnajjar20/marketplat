/**
 * __tests__/components/NearbyProvidersSection.test.tsx
 *
 * The section reads useNearbyProvidersForHome (city → city directory,
 * general → unfiltered fallback). No GPS / "use my location" CTA anymore.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NearbyProvidersSection } from '@/components/home/NearbyProvidersSection';
import { useNearbyProvidersForHome } from '@/hooks/queries/useNearbyProvidersForHome';
import { useBrowseCity } from '@/hooks/useBrowseCity';

vi.mock('@/hooks/queries/useNearbyProvidersForHome', () => ({
  useNearbyProvidersForHome: vi.fn(),
}));
vi.mock('@/hooks/useBrowseCity', () => ({ useBrowseCity: vi.fn() }));
vi.mock('@/lib/useDataSaver', () => ({ useDataSaver: () => false }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/components/services/ServiceProviderCard', () => ({
  ServiceProviderCard: ({ provider }: { provider: { id: string; businessName: string } }) => (
    <div data-testid={`provider-${provider.id}`}>{provider.businessName}</div>
  ),
}));

const refetch = vi.fn();

function mockHook(overrides: Record<string, unknown> = {}) {
  vi.mocked(useNearbyProvidersForHome).mockReturnValue({
    isChecking: false,
    data: undefined,
    isLoading: false,
    isError: false,
    source: 'general',
    refetch,
    ...overrides,
  } as never);
}

const ONE = { items: [{ id: 'p1', businessName: 'كهربائي سريع' }] };

describe('NearbyProvidersSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useBrowseCity).mockReturnValue({ city: undefined } as never);
  });

  it('renders a skeleton (no cards) while checking or loading', () => {
    mockHook({ isChecking: true });
    const { rerender } = render(<NearbyProvidersSection />);
    expect(screen.queryByTestId(/provider-/)).not.toBeInTheDocument();
    expect(screen.getByText('مقدمو خدمات')).toBeInTheDocument();

    mockHook({ isLoading: true });
    rerender(<NearbyProvidersSection />);
    expect(screen.queryByTestId(/provider-/)).not.toBeInTheDocument();
  });

  it('shows an error message with a working retry', async () => {
    mockHook({ isError: true });
    render(<NearbyProvidersSection />);
    expect(screen.getByText('تعذّر تحميل مقدمي الخدمات')).toBeInTheDocument();
    await userEvent.click(screen.getByText('إعادة المحاولة'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state when there are no providers', () => {
    mockHook({ data: { items: [] } });
    render(<NearbyProvidersSection />);
    expect(screen.getByText('لا يوجد مقدمو خدمات بعد')).toBeInTheDocument();
  });

  it('general results: neutral eyebrow (not "قريبون منك"), generic title and badge', () => {
    mockHook({ source: 'general', data: ONE });
    render(<NearbyProvidersSection />);
    expect(screen.getByTestId('provider-p1')).toBeInTheDocument();
    expect(screen.getByText('اكتشف')).toBeInTheDocument();
    expect(screen.queryByText('قريبون منك')).not.toBeInTheDocument();
    expect(screen.getByText('مقدمو خدمات')).toBeInTheDocument();
    expect(screen.getByText('نتائج مقترحة')).toBeInTheDocument();
  });

  it('city results: "قريبون منك" eyebrow, city title and city badge', () => {
    vi.mocked(useBrowseCity).mockReturnValue({ city: 'غزة' } as never);
    mockHook({ source: 'city', data: ONE });
    render(<NearbyProvidersSection />);
    expect(screen.getByText('قريبون منك')).toBeInTheDocument();
    expect(screen.getByText('مقدمو خدمات في مدينتك')).toBeInTheDocument();
    expect(screen.getByText('نتائج في غزة')).toBeInTheDocument();
  });

  it('links "view all" to /service-providers', () => {
    mockHook({ data: ONE });
    render(<NearbyProvidersSection />);
    expect(screen.getByText('الكل').closest('a')).toHaveAttribute('href', '/service-providers');
  });
});
