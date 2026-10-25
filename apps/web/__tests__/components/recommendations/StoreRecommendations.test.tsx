/**
 * __tests__/components/recommendations/StoreRecommendations.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StoreRecommendations } from '@/components/recommendations/StoreRecommendations';
import { useStoreRecommendations } from '@/hooks/queries/useRecommendations';
import { useSilentCoordinates } from '@/hooks/useSilentCoordinates';

vi.mock('@/hooks/queries/useRecommendations', () => ({
  useStoreRecommendations: vi.fn(),
}));

vi.mock('@/hooks/useSilentCoordinates', () => ({
  useSilentCoordinates: vi.fn(),
}));

vi.mock('@/components/stores/StoreCard', () => ({
  StoreCard: ({ store }: { store: { id: string; name: string } }) => (
    <div data-testid={`store-${store.id}`}>{store.name}</div>
  ),
}));

const mockRefetch = vi.fn();

function mockHook(overrides: Record<string, unknown> = {}) {
  (useStoreRecommendations as ReturnType<typeof vi.fn>).mockReturnValue({
    data: [{ id: 'store-2', name: 'متجر 2' }],
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    ...overrides,
  });
}

describe('StoreRecommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSilentCoordinates as ReturnType<typeof vi.fn>).mockReturnValue(null);
  });

  it('always passes excludeStoreId through to the hook', () => {
    mockHook();
    render(<StoreRecommendations excludeStoreId="store-1" />);
    expect(useStoreRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({ excludeStoreId: 'store-1' })
    );
  });

  it('requests without coordinates when none are available (never mandatory)', () => {
    mockHook();
    (useSilentCoordinates as ReturnType<typeof vi.fn>).mockReturnValue(null);
    render(<StoreRecommendations excludeStoreId="store-1" />);
    expect(useStoreRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({ lat: undefined, lng: undefined })
    );
  });

  it('passes lat/lng through when coordinates are available', () => {
    mockHook();
    (useSilentCoordinates as ReturnType<typeof vi.fn>).mockReturnValue({ lat: 31.5, lng: 34.4 });
    render(<StoreRecommendations excludeStoreId="store-1" />);
    expect(useStoreRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 31.5, lng: 34.4 })
    );
  });

  it('renders store cards on success', () => {
    mockHook();
    render(<StoreRecommendations excludeStoreId="store-1" />);
    expect(screen.getByTestId('store-store-2')).toHaveTextContent('متجر 2');
    expect(screen.getByText('متاجر قد تعجبك')).toBeInTheDocument();
  });

  it('renders the error/retry state and never breaks the parent page', () => {
    mockHook({ data: undefined, isError: true });
    render(<StoreRecommendations excludeStoreId="store-1" />);
    expect(screen.getByText('حدث خطأ أثناء تحميل التوصيات')).toBeInTheDocument();
  });

  it('renders nothing when the result is empty', () => {
    mockHook({ data: [] });
    const { container } = render(<StoreRecommendations excludeStoreId="store-1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
