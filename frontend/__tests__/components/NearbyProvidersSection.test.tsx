/**
 * __tests__/components/NearbyProvidersSection.test.tsx
 *
 * Plan §6: this section must render nothing at all (not even a
 * heading/skeleton) unless permission is already granted AND data
 * has resolved with at least one provider. Coverage:
 *  - available=false → renders null
 *  - available=true but isChecking → renders null
 *  - available=true, loading → renders null (no visible skeleton)
 *  - available=true, isError → renders null (no error UI)
 *  - available=true, resolved but empty → renders null
 *  - available=true, resolved with items → renders heading + cards + CTA
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NearbyProvidersSection } from '@/components/home/NearbyProvidersSection';
import { useNearbyServiceProvidersIfGranted } from '@/hooks/queries/useNearbyServiceProvidersIfGranted';

vi.mock('@/hooks/queries/useNearbyServiceProvidersIfGranted', () => ({
  useNearbyServiceProvidersIfGranted: vi.fn(),
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

function mockHook(overrides: Record<string, unknown> = {}) {
  (useNearbyServiceProvidersIfGranted as ReturnType<typeof vi.fn>).mockReturnValue({
    available: false,
    isChecking: false,
    data: undefined,
    isLoading: false,
    isError: false,
    ...overrides,
  });
}

describe('NearbyProvidersSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when permission is not available', () => {
    mockHook({ available: false });
    const { container } = render(<NearbyProvidersSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while still checking permission (no flash before layout settles)', () => {
    mockHook({ available: true, isChecking: true });
    const { container } = render(<NearbyProvidersSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while loading — no visible skeleton for this section', () => {
    mockHook({ available: true, isChecking: false, isLoading: true });
    const { container } = render(<NearbyProvidersSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on error — no error UI for this section', () => {
    mockHook({ available: true, isChecking: false, isError: true });
    const { container } = render(<NearbyProvidersSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when resolved with zero nearby providers', () => {
    mockHook({ available: true, isChecking: false, data: { items: [] } });
    const { container } = render(<NearbyProvidersSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders heading, cards, and a "عرض الكل" CTA when providers resolve', () => {
    mockHook({
      available: true,
      isChecking: false,
      data: { items: [{ id: 'p1', businessName: 'كهربائي سريع' }] },
    });
    render(<NearbyProvidersSection />);

    expect(screen.getByText('مقدمو الخدمات القريبون')).toBeInTheDocument();
    expect(screen.getByTestId('provider-p1')).toBeInTheDocument();
    expect(screen.getByText('عرض الكل ←')).toBeInTheDocument();
  });

  it('links the CTA to /service-providers', () => {
    mockHook({
      available: true,
      isChecking: false,
      data: { items: [{ id: 'p1', businessName: 'كهربائي سريع' }] },
    });
    render(<NearbyProvidersSection />);

    expect(screen.getByText('عرض الكل ←').closest('a')).toHaveAttribute('href', '/service-providers');
  });
});
