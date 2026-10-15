/** Tests for RelatedServices backed by the recommendations query. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RelatedServices } from '@/components/services/RelatedServices';
import { useServiceRecommendations } from '@/hooks/queries/useRecommendations';

vi.mock('@/hooks/queries/useRecommendations', () => ({ useServiceRecommendations: vi.fn() }));
vi.mock('@/components/services/ServiceListingCard', () => ({
  ServiceListingCard: ({ listing }: { listing: { title?: string; id: string } }) => <div data-testid={`svc-${listing.id}`}>{listing.title}</div>,
}));
vi.mock('@/components/shared/skeletons', () => ({ ServiceListingCardSkeleton: () => <div data-testid="skeleton" /> }));

const mockRecommendations = vi.mocked(useServiceRecommendations);
const listing = (id: string, title: string) => ({ id, title });

describe('RelatedServices', () => {
  beforeEach(() => mockRecommendations.mockReturnValue({ data: [], isLoading: false } as never));

  it('returns null when neither category nor service type is provided', () => {
    const { container } = render(<RelatedServices serviceListingId="s1" categoryId={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(mockRecommendations).toHaveBeenCalledWith(undefined);
  });

  it('loads recommendations when a category is provided', () => {
    mockRecommendations.mockReturnValue({ data: undefined, isLoading: true } as never);
    render(<RelatedServices serviceListingId="s1" categoryId="cat-1" />);
    expect(screen.getByText('خدمات مشابهة')).toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton')).toHaveLength(4);
    expect(mockRecommendations).toHaveBeenCalledWith({ excludeServiceListingId: 's1', serviceTypeId: undefined, limit: 8 });
  });

  it('can enable recommendations by serviceTypeId without a category', () => {
    render(<RelatedServices serviceListingId="s1" categoryId={null} serviceTypeId="type-1" />);
    expect(mockRecommendations).toHaveBeenCalledWith({ excludeServiceListingId: 's1', serviceTypeId: 'type-1', limit: 8 });
  });

  it('renders related items but excludes the current listing', () => {
    mockRecommendations.mockReturnValue({ data: [listing('s1', 'الحالي'), listing('s2', 'سباكة'), listing('s3', 'كهرباء')], isLoading: false } as never);
    render(<RelatedServices serviceListingId="s1" categoryId="cat-1" />);
    expect(screen.getByTestId('svc-s2')).toHaveTextContent('سباكة');
    expect(screen.getByTestId('svc-s3')).toHaveTextContent('كهرباء');
    expect(screen.queryByText('الحالي')).not.toBeInTheDocument();
  });

  it('returns null when recommendations contain only the current listing', () => {
    mockRecommendations.mockReturnValue({ data: [listing('s1', 'الحالي')], isLoading: false } as never);
    const { container } = render(<RelatedServices serviceListingId="s1" categoryId="cat-1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
