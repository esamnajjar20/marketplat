/**
 * __tests__/components/StoresGrid.test.tsx
 *
 * Coverage gap: 0% prior coverage. Covers FIX UX-04's skeleton (not a
 * spinner) loading state, error+retry, the total-count summary line
 * with the quoted search-term suffix, the empty state's search-aware
 * vs generic description branch, grid rendering, and pagination.
 * Confirms filter params from the URL are all passed through to
 * useStores with correct defaults.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoresGrid } from '@/components/stores/StoresGrid';
import { useStores } from '@/hooks/queries/useStores';

vi.mock('@/hooks/queries/useStores', () => ({
  useStores: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/components/stores/StoreCard', () => ({
  StoreCard: ({ store }: { store: { id: string; name: string } }) => <div data-testid={`store-${store.id}`}>{store.name}</div>,
}));

vi.mock('@/components/shared/skeletons', () => ({
  StoreCardSkeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('@/components/shared/ui/Pagination', () => ({
  Pagination: ({ totalPages }: { totalPages: number }) => <div data-testid="pagination">pages:{totalPages}</div>,
}));

const mockRefetch = vi.fn();
const store = { id: 'store-1', name: 'متجر البركة' };

function mockStores(overrides: Record<string, unknown> = {}) {
  (useStores as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items: [store], meta: { totalPages: 1, total: 1 } },
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    ...overrides,
  });
}

describe('StoresGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockStores();
  });

  it('renders skeleton cards (not a spinner) while loading (FIX UX-04)', () => {
    mockStores({ data: undefined, isLoading: true });
    render(<StoresGrid />);

    expect(screen.getAllByTestId('skeleton')).toHaveLength(6);
  });

  it('shows an error message with retry on failure', async () => {
    mockStores({ data: undefined, isError: true });
    const user = userEvent.setup();
    render(<StoresGrid />);

    expect(screen.getByText('حدث خطأ أثناء تحميل المتاجر')).toBeInTheDocument();
    await user.click(screen.getByText('إعادة المحاولة'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows the total store count', () => {
    mockStores({ data: { items: [store], meta: { totalPages: 1, total: 42 } } });
    render(<StoresGrid />);

    expect(screen.getByText(/42 متجر/)).toBeInTheDocument();
  });

  it('shows "لا توجد نتائج" when total is 0', () => {
    mockStores({ data: { items: [], meta: { totalPages: 1, total: 0 } } });
    render(<StoresGrid />);

    expect(screen.getByText('لا توجد نتائج')).toBeInTheDocument();
  });

  it('appends the quoted search term to the summary line when searching', () => {
    mockSearchParams = new URLSearchParams('search=أثاث');
    mockStores({ data: { items: [store], meta: { totalPages: 1, total: 5 } } });
    render(<StoresGrid />);

    expect(screen.getByText('أثاث')).toBeInTheDocument();
  });

  it('renders a StoreCard for each store', () => {
    render(<StoresGrid />);

    expect(screen.getByTestId('store-store-1')).toBeInTheDocument();
  });

  it('shows the generic empty description with no active search', () => {
    mockStores({ data: { items: [], meta: { totalPages: 1, total: 0 } } });
    render(<StoresGrid />);

    expect(screen.getByText('لا توجد متاجر مطابقة لهذه الفلاتر')).toBeInTheDocument();
  });

  it('shows a search-aware empty description when a search term is active', () => {
    mockSearchParams = new URLSearchParams('search=نجارة');
    mockStores({ data: { items: [], meta: { totalPages: 1, total: 0 } } });
    render(<StoresGrid />);

    expect(screen.getByText(/لم نجد نتائج لـ "نجارة"/)).toBeInTheDocument();
  });

  it('passes URL filter params (with defaults) through to useStores', () => {
    mockSearchParams = new URLSearchParams('city=غزة&sortBy=name&sortOrder=asc&page=2');
    render(<StoresGrid />);

    expect(useStores).toHaveBeenCalledWith({
      search: undefined,
      page: 2,
      city: 'غزة',
      sortBy: 'name',
      sortOrder: 'asc',
    });
  });

  it('defaults sortBy to createdAt and sortOrder to desc when absent from the URL', () => {
    render(<StoresGrid />);

    expect(useStores).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'createdAt', sortOrder: 'desc' }),
    );
  });

  it('does not render pagination for a single page', () => {
    render(<StoresGrid />);

    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });

  it('renders pagination when there is more than one page', () => {
    mockStores({ data: { items: [store], meta: { totalPages: 4, total: 40 } } });
    render(<StoresGrid />);

    expect(screen.getByTestId('pagination')).toHaveTextContent('pages:4');
  });
});
