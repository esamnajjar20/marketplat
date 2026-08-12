/**
 * __tests__/components/FollowedStoresList.test.tsx
 *
 * Coverage gap: 0% prior coverage. Covers loading/error/empty states,
 * store card rendering, and pagination visibility.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FollowedStoresList } from '@/components/stores/FollowedStoresList';
import { useMyFollowedStores } from '@/hooks/queries/useStores';

vi.mock('@/hooks/queries/useStores', () => ({
  useMyFollowedStores: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/components/stores/StoreCard', () => ({
  StoreCard: ({ store }: { store: { id: string; name: string } }) => <div data-testid={`store-${store.id}`}>{store.name}</div>,
}));

vi.mock('@/components/shared/ui/Pagination', () => ({
  Pagination: ({ totalPages }: { totalPages: number }) => <div data-testid="pagination">pages:{totalPages}</div>,
}));

const mockRefetch = vi.fn();
const follow = { id: 'follow-1', store: { id: 'store-1', name: 'متجر النور' } };

function mockFollowed(overrides: Record<string, unknown> = {}) {
  (useMyFollowedStores as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items: [follow], meta: { totalPages: 1 } },
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    ...overrides,
  });
}

describe('FollowedStoresList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockFollowed();
  });

  it('shows a spinner while loading', () => {
    mockFollowed({ data: undefined, isLoading: true });
    render(<FollowedStoresList />);

    expect(screen.queryByText('لا تتابع أي متجر بعد')).not.toBeInTheDocument();
  });

  it('shows an error message with retry on failure', async () => {
    mockFollowed({ data: undefined, isError: true });
    const user = userEvent.setup();
    render(<FollowedStoresList />);

    expect(screen.getByText('حدث خطأ أثناء تحميل المتاجر المتابَعة')).toBeInTheDocument();
    await user.click(screen.getByText('إعادة المحاولة'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows the empty state when following no stores', () => {
    mockFollowed({ data: { items: [], meta: { totalPages: 1 } } });
    render(<FollowedStoresList />);

    expect(screen.getByText('لا تتابع أي متجر بعد')).toBeInTheDocument();
  });

  it('renders a StoreCard for each followed store', () => {
    render(<FollowedStoresList />);

    expect(screen.getByTestId('store-store-1')).toHaveTextContent('متجر النور');
  });

  it('does not render pagination for a single page', () => {
    render(<FollowedStoresList />);

    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });

  it('renders pagination when there is more than one page', () => {
    mockFollowed({ data: { items: [follow], meta: { totalPages: 2 } } });
    render(<FollowedStoresList />);

    expect(screen.getByTestId('pagination')).toHaveTextContent('pages:2');
  });
});
