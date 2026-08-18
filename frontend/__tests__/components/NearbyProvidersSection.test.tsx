/**
 * __tests__/components/NearbyProvidersSection.test.tsx
 *
 * Phase 4 rewrite: the section now reads useNearbyProvidersForHome
 * (gps → nearby search, city → city directory, general → unfiltered
 * fallback/cascade target) instead of the old GPS-only
 * useNearbyServiceProvidersIfGranted, and additionally reads
 * useLocationResolver directly for the "استخدام موقعي" CTA's
 * visibility + click handler. Coverage:
 *  - loading (isChecking or isLoading) → skeleton, no cards
 *  - error → renders null
 *  - resolved but empty → renders null
 *  - resolved with items (gps/city/general) → heading + cards + CTA link
 *  - location badge reflects the *actual* source of the shown data
 *  - "استخدام موقعي" CTA shown unless already gps-current/gps-saved
 *  - CTA calls requestLocation() on click
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NearbyProvidersSection } from '@/components/home/NearbyProvidersSection';
import { useNearbyProvidersForHome } from '@/hooks/queries/useNearbyProvidersForHome';
import { useLocationResolver } from '@/hooks/useLocationResolver';

vi.mock('@/hooks/queries/useNearbyProvidersForHome', () => ({
  useNearbyProvidersForHome: vi.fn(),
}));

vi.mock('@/hooks/useLocationResolver', () => ({
  useLocationResolver: vi.fn(),
}));

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

function mockProvidersHook(overrides: Record<string, unknown> = {}) {
  (useNearbyProvidersForHome as ReturnType<typeof vi.fn>).mockReturnValue({
    isChecking: false,
    data: undefined,
    isLoading: false,
    isError: false,
    source: 'general',
    ...overrides,
  });
}

const requestLocation = vi.fn();

function mockLocation(overrides: Record<string, unknown> = {}) {
  (useLocationResolver as ReturnType<typeof vi.fn>).mockReturnValue({
    source: 'fallback',
    isLoading: false,
    requestLocation,
    ...overrides,
  });
}

describe('NearbyProvidersSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation();
  });

  it('renders a skeleton (no cards) while the resolver is still checking', () => {
    mockProvidersHook({ isChecking: true });
    render(<NearbyProvidersSection />);
    expect(screen.queryByTestId(/provider-/)).not.toBeInTheDocument();
    expect(screen.getByText('مقدمو خدمات قريبون منك')).toBeInTheDocument();
  });

  it('renders a skeleton (no cards) while the query is loading', () => {
    mockProvidersHook({ isLoading: true });
    render(<NearbyProvidersSection />);
    expect(screen.queryByTestId(/provider-/)).not.toBeInTheDocument();
  });

  it('renders nothing on error — no error UI for this secondary section', () => {
    mockProvidersHook({ isError: true });
    const { container } = render(<NearbyProvidersSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when resolved with zero providers (even after cascade)', () => {
    mockProvidersHook({ data: { items: [] } });
    const { container } = render(<NearbyProvidersSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders heading, cards, and a "عرض الكل" CTA when providers resolve', () => {
    mockProvidersHook({ data: { items: [{ id: 'p1', businessName: 'كهربائي سريع' }] } });
    render(<NearbyProvidersSection />);

    expect(screen.getByText('مقدمو خدمات قريبون منك')).toBeInTheDocument();
    expect(screen.getByTestId('provider-p1')).toBeInTheDocument();
    expect(screen.getByText('عرض الكل ←')).toBeInTheDocument();
  });

  it('links the "عرض الكل" CTA to /service-providers', () => {
    mockProvidersHook({ data: { items: [{ id: 'p1', businessName: 'كهربائي سريع' }] } });
    render(<NearbyProvidersSection />);
    expect(screen.getByText('عرض الكل ←').closest('a')).toHaveAttribute('href', '/service-providers');
  });

  it('shows "قريب منك" badge when the section source is gps', () => {
    mockProvidersHook({ source: 'gps', data: { items: [{ id: 'p1', businessName: 'كهربائي' }] } });
    mockLocation({ source: 'gps-current' });
    render(<NearbyProvidersSection />);
    expect(screen.getByText('قريب منك')).toBeInTheDocument();
  });

  it('shows city badge when the section source is city', () => {
    mockProvidersHook({ source: 'city', data: { items: [{ id: 'p1', businessName: 'كهربائي' }] } });
    mockLocation({ source: 'city', city: 'غزة' });
    render(<NearbyProvidersSection />);
    expect(screen.getByText('نتائج في غزة')).toBeInTheDocument();
  });

  it('shows the generic "نتائج مقترحة" badge when the section source is general, even if the resolver itself resolved gps (cascade case)', () => {
    mockProvidersHook({ source: 'general', data: { items: [{ id: 'p1', businessName: 'كهربائي' }] } });
    mockLocation({ source: 'gps-current' });
    render(<NearbyProvidersSection />);
    expect(screen.getByText('نتائج مقترحة')).toBeInTheDocument();
  });

  it('shows the "استخدام موقعي" CTA when the resolver has not resolved GPS yet', () => {
    mockProvidersHook({ data: { items: [{ id: 'p1', businessName: 'كهربائي' }] } });
    mockLocation({ source: 'fallback' });
    render(<NearbyProvidersSection />);
    expect(screen.getByText('استخدام موقعي')).toBeInTheDocument();
  });

  it('hides the "استخدام موقعي" CTA once the resolver already has gps-current', () => {
    mockProvidersHook({ source: 'gps', data: { items: [{ id: 'p1', businessName: 'كهربائي' }] } });
    mockLocation({ source: 'gps-current' });
    render(<NearbyProvidersSection />);
    expect(screen.queryByText('استخدام موقعي')).not.toBeInTheDocument();
  });

  it('hides the "استخدام موقعي" CTA when the resolver already has a valid saved GPS', () => {
    mockProvidersHook({ source: 'gps', data: { items: [{ id: 'p1', businessName: 'كهربائي' }] } });
    mockLocation({ source: 'gps-saved' });
    render(<NearbyProvidersSection />);
    expect(screen.queryByText('استخدام موقعي')).not.toBeInTheDocument();
  });

  it('calls requestLocation() when the CTA is clicked', async () => {
    mockProvidersHook({ data: { items: [{ id: 'p1', businessName: 'كهربائي' }] } });
    mockLocation({ source: 'fallback' });
    render(<NearbyProvidersSection />);

    await userEvent.click(screen.getByText('استخدام موقعي'));
    expect(requestLocation).toHaveBeenCalledTimes(1);
  });
});
