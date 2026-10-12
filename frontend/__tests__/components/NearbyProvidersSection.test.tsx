/**
 * __tests__/components/NearbyProvidersSection.test.tsx
 *
 * The section consumes the shared useHomeFeed cache for homepage rails.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NearbyProvidersSection } from '@/components/home/NearbyProvidersSection';
import { useHomeFeed } from '@/hooks/queries/useHomeFeed';
import { useBrowseCity } from '@/hooks/useBrowseCity';

vi.mock('@/hooks/queries/useHomeFeed', () => ({ useHomeFeed: vi.fn() }));
vi.mock('@/hooks/useBrowseCity', () => ({ useBrowseCity: vi.fn() }));
vi.mock('@/lib/useDataSaver', () => ({ useDataSaver: () => false }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/components/home/LocationSourceBadge', () => ({ LocationSourceBadge: ({ source, city }: { source: string; city?: string }) => <span>{source === 'city' && city ? `نتائج في ${city}` : 'نتائج مقترحة'}</span> }));
vi.mock('@/components/services/ServiceProviderCard', () => ({
  ServiceProviderCard: ({ provider }: { provider: { id: string; businessName: string } }) => (
    <div data-testid={`provider-${provider.id}`}>{provider.businessName}</div>
  ),
}));

const refetch = vi.fn();

function mockHook(overrides: Record<string, unknown> = {}) {
  vi.mocked(useHomeFeed).mockReturnValue({
    isPending: false,
    isFetching: false,
    data: { rails: { providers: { items: [], source: 'general' } } },
    isError: false,
    refetch,
    ...overrides,
  } as never);
}

const ONE = { items: [{ id: 'p1', businessName: 'كهربائي سريع' }], source: 'general' };

describe('NearbyProvidersSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useBrowseCity).mockReturnValue({ city: undefined } as never);
  });

  it('renders a skeleton (no cards) while checking or loading', () => {
    mockHook({ isPending: true });
    const { rerender } = render(<NearbyProvidersSection />);
    expect(screen.queryByTestId(/provider-/)).not.toBeInTheDocument();
    expect(screen.getByText('مقدمو خدمات')).toBeInTheDocument();

    mockHook({ isPending: true });
    rerender(<NearbyProvidersSection />);
    expect(screen.queryByTestId(/provider-/)).not.toBeInTheDocument();
  });

  it('shows an error message with a working retry', async () => {
    mockHook({ isError: true, error: new Error('network') });
    render(<NearbyProvidersSection />);
    expect(screen.getByText('تعذّر تحميل مقدمي الخدمات')).toBeInTheDocument();
    await userEvent.click(screen.getByText('إعادة المحاولة'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('disables retry and announces progress while a retry is in flight', () => {
    mockHook({ isError: true, isFetching: true, error: new Error('network') });
    render(<NearbyProvidersSection />);
    const retry = screen.getByRole('button', { name: 'جارٍ إعادة المحاولة…' });
    expect(retry).toBeDisabled();
    expect(retry.closest('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('تعذّر تحميل مقدمي الخدمات');
  });

  it('shows an empty state when there are no providers', () => {
    mockHook({ data: { rails: { providers: { items: [], source: 'general' } } } });
    render(<NearbyProvidersSection />);
    expect(screen.getByText('لا يوجد مقدمو خدمات بعد')).toBeInTheDocument();
  });

  it('general results: neutral eyebrow (not "قريبون منك"), generic title and badge', () => {
    mockHook({ data: { rails: { providers: ONE } } });
    render(<NearbyProvidersSection />);
    expect(screen.getByTestId('provider-p1')).toBeInTheDocument();
    expect(screen.getByText('اكتشف')).toBeInTheDocument();
    expect(screen.queryByText('قريبون منك')).not.toBeInTheDocument();
    expect(screen.getByText('مقدمو خدمات')).toBeInTheDocument();
    expect(screen.getByText('نتائج مقترحة')).toBeInTheDocument();
  });

  it('city results: "قريبون منك" eyebrow, city title and city badge', () => {
    vi.mocked(useBrowseCity).mockReturnValue({ city: 'غزة' } as never);
    mockHook({ data: { rails: { providers: { ...ONE, source: 'city' } } } });
    render(<NearbyProvidersSection />);
    expect(screen.getByText('قريبون منك')).toBeInTheDocument();
    expect(screen.getByText('مقدمو خدمات في مدينتك')).toBeInTheDocument();
    expect(screen.getByText('نتائج في غزة')).toBeInTheDocument();
  });

  it('links "view all" to /service-providers', () => {
    mockHook({ data: { rails: { providers: ONE } } });
    render(<NearbyProvidersSection />);
    expect(screen.getByText('الكل').closest('a')).toHaveAttribute('href', '/service-providers');
  });
});
