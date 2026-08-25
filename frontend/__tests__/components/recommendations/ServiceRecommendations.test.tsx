/**
 * __tests__/components/recommendations/ServiceRecommendations.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServiceRecommendations } from '@/components/recommendations/ServiceRecommendations';
import { useServiceRecommendations } from '@/hooks/queries/useRecommendations';

vi.mock('@/hooks/queries/useRecommendations', () => ({
  useServiceRecommendations: vi.fn(),
}));

vi.mock('@/components/services/ServiceListingCard', () => ({
  ServiceListingCard: ({ listing }: { listing: { id: string; title: string } }) => (
    <div data-testid={`listing-${listing.id}`}>{listing.title}</div>
  ),
}));

const mockRefetch = vi.fn();

function mockHook(overrides: Record<string, unknown> = {}) {
  (useServiceRecommendations as ReturnType<typeof vi.fn>).mockReturnValue({
    data: [{ id: 'svc-1', title: 'خدمة 1' }],
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    ...overrides,
  });
}

describe('ServiceRecommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('always passes excludeServiceListingId through to the hook', () => {
    mockHook();
    render(<ServiceRecommendations excludeServiceListingId="svc-1" />);
    expect(useServiceRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({ excludeServiceListingId: 'svc-1' })
    );
  });

  it('renders service listing cards on success', () => {
    mockHook();
    render(<ServiceRecommendations excludeServiceListingId="svc-1" />);
    expect(screen.getByTestId('listing-svc-1')).toHaveTextContent('خدمة 1');
    expect(screen.getByText('خدمات قد تعجبك')).toBeInTheDocument();
  });

  it('renders loading skeletons', () => {
    mockHook({ data: undefined, isLoading: true });
    render(<ServiceRecommendations excludeServiceListingId="svc-1" />);
    expect(screen.getByText('خدمات قد تعجبك')).toBeInTheDocument();
  });

  it('renders the error/retry state and never breaks the parent page', () => {
    mockHook({ data: undefined, isError: true });
    render(<ServiceRecommendations excludeServiceListingId="svc-1" />);
    expect(screen.getByText('حدث خطأ أثناء تحميل التوصيات')).toBeInTheDocument();
  });

  it('renders nothing when the result is empty', () => {
    mockHook({ data: [] });
    const { container } = render(<ServiceRecommendations excludeServiceListingId="svc-1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
