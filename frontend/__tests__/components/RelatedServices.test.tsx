/**
 * __tests__/components/RelatedServices.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RelatedServices } from '@/components/services/RelatedServices';
import { useServiceListings } from '@/hooks/queries/useServiceListings';

vi.mock('@/hooks/queries/useServiceListings', () => ({
  useServiceListings: vi.fn(),
}));

vi.mock('@/components/services/ServiceListingCard', () => ({
  ServiceListingCard: ({ listing }: { listing: { title?: string; id: string } }) => (
    <div data-testid={`svc-${listing.id}`}>{listing.title}</div>
  ),
}));

vi.mock('@/components/shared/skeletons', () => ({
  ServiceListingCardSkeleton: () => <div data-testid="skeleton" />,
}));

describe('RelatedServices', () => {
  beforeEach(() => {
    vi.mocked(useServiceListings).mockReturnValue({
      data: { items: [] },
      isLoading: false,
    } as never);
  });

  it('returns null without categoryId', () => {
    const { container } = render(
      <RelatedServices serviceListingId="s1" categoryId={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows loading skeletons', () => {
    vi.mocked(useServiceListings).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as never);
    render(<RelatedServices serviceListingId="s1" categoryId="cat-1" />);
    expect(screen.getByText('خدمات مشابهة')).toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('renders related items excluding current', () => {
    vi.mocked(useServiceListings).mockReturnValue({
      data: {
        items: [
          { id: 's1', title: 'الحالي' },
          { id: 's2', title: 'سباكة' },
          { id: 's3', title: 'كهرباء' },
        ],
      },
      isLoading: false,
    } as never);
    render(<RelatedServices serviceListingId="s1" categoryId="cat-1" />);
    expect(screen.getAllByText('سباكة').length).toBeGreaterThan(0);
    expect(screen.getAllByText('كهرباء').length).toBeGreaterThan(0);
    expect(screen.queryByText('الحالي')).not.toBeInTheDocument();
  });

  it('returns null when no related items', () => {
    vi.mocked(useServiceListings).mockReturnValue({
      data: { items: [{ id: 's1', title: 'الحالي' }] },
      isLoading: false,
    } as never);
    const { container } = render(
      <RelatedServices serviceListingId="s1" categoryId="cat-1" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
