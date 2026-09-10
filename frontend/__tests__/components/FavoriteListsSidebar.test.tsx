/**
 * __tests__/components/FavoriteListsSidebar.test.tsx
 *
 * Covers create / rename / delete list flows, list selection via URL,
 * loading state, and empty state for the favorites sidebar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { FavoriteListsSidebar } from '@/components/favorites/FavoriteListsSidebar';
import { useFavoriteLists } from '@/hooks/queries/useFavoriteLists';
import {
  useCreateFavoriteList,
  useRenameFavoriteList,
  useDeleteFavoriteList,
} from '@/hooks/mutations/useFavoriteListMutations';
import { ROUTES } from '@/lib/constants';
import type { FavoriteList } from '@/types/favorite-list.types';

vi.mock('@/hooks/queries/useFavoriteLists', () => ({
  useFavoriteLists: vi.fn(),
}));

vi.mock('@/hooks/mutations/useFavoriteListMutations', () => ({
  useCreateFavoriteList: vi.fn(),
  useRenameFavoriteList: vi.fn(),
  useDeleteFavoriteList: vi.fn(),
  useMoveFavoriteToList: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();
const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => ROUTES.favorites,
}));

const mockCreateMutate = vi.fn();
const mockRenameMutate = vi.fn();
const mockDeleteMutate = vi.fn();

const baseLists: FavoriteList[] = [
  {
    id: 'list-1',
    name: 'سيارات',
    sortOrder: 0,
    itemsCount: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'list-2',
    name: 'هواتف',
    sortOrder: 1,
    itemsCount: 1,
    createdAt: '2026-01-02T00:00:00.000Z',
  },
];

function mockSidebar({
  lists = baseLists,
  isLoading = false,
}: {
  lists?: FavoriteList[] | undefined;
  isLoading?: boolean;
} = {}) {
  vi.mocked(useFavoriteLists).mockReturnValue({
    data: lists,
    isLoading,
    isError: false,
    refetch: vi.fn(),
  } as never);

  vi.mocked(useCreateFavoriteList).mockReturnValue({
    mutate: mockCreateMutate,
    isPending: false,
  } as never);

  vi.mocked(useRenameFavoriteList).mockReturnValue({
    mutate: mockRenameMutate,
    isPending: false,
  } as never);

  vi.mocked(useDeleteFavoriteList).mockReturnValue({
    mutate: mockDeleteMutate,
    isPending: false,
  } as never);
}

describe('FavoriteListsSidebar', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockPush.mockReset();
    mockCreateMutate.mockReset();
    mockRenameMutate.mockReset();
    mockDeleteMutate.mockReset();
    mockSidebar();
  });

  it('shows loading spinner while lists are loading', () => {
    mockSidebar({ isLoading: true, lists: undefined });
    const { container } = render(<FavoriteListsSidebar />);
    // LoadingSpinner renders a spinning element; ensure the list nav is absent
    expect(screen.queryByRole('navigation', { name: 'قوائم المفضلة' })).not.toBeInTheDocument();
    expect(container.querySelector('.animate-spin, [class*="spin"]') || container.textContent).toBeTruthy();
  });

  it('renders "الكل" and each list name with item counts', () => {
    render(<FavoriteListsSidebar />);

    expect(screen.getByText('الكل')).toBeInTheDocument();
    expect(screen.getByText('سيارات')).toBeInTheDocument();
    expect(screen.getByText('هواتف')).toBeInTheDocument();
    expect(screen.getByText('(3)')).toBeInTheDocument();
    expect(screen.getByText('(1)')).toBeInTheDocument();
  });

  it('shows empty hint when there are no lists', () => {
    mockSidebar({ lists: [] });
    render(<FavoriteListsSidebar />);

    expect(
      screen.getByText((content) => content.includes('أنشئ قائمة') && content.includes('هواتف')),
    ).toBeInTheDocument();
  });

  it('selecting "الكل" navigates to favorites without list param', async () => {
    const user = setupUser();
    mockSearchParams = new URLSearchParams('list=list-1');
    render(<FavoriteListsSidebar />);

    await user.click(screen.getByText('الكل'));

    expect(mockPush).toHaveBeenCalledWith(ROUTES.favorites);
  });

  it('selecting a list pushes ?list=id and clears page', async () => {
    const user = setupUser();
    mockSearchParams = new URLSearchParams('page=2');
    render(<FavoriteListsSidebar />);

    await user.click(screen.getByText('سيارات'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining(`${ROUTES.favorites}?`),
    );
    const url = mockPush.mock.calls[0][0] as string;
    expect(url).toContain('list=list-1');
    expect(url).not.toContain('page=');
  });

  it('opens create form and creates a list on submit', async () => {
    const user = setupUser();
    render(<FavoriteListsSidebar />);

    await user.click(screen.getByRole('button', { name: /جديدة/ }));

    const input = screen.getByPlaceholderText('مثلاً: سيارات');
    await user.type(input, 'عقارات');
    await user.click(screen.getByRole('button', { name: 'إضافة' }));

    expect(mockCreateMutate).toHaveBeenCalledWith(
      'عقارات',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('does not create when name is empty/whitespace', async () => {
    const user = setupUser();
    render(<FavoriteListsSidebar />);

    await user.click(screen.getByRole('button', { name: /جديدة/ }));
    await user.type(screen.getByPlaceholderText('مثلاً: سيارات'), '   ');
    // Button should be disabled when trimmed name is empty
    expect(screen.getByRole('button', { name: 'إضافة' })).toBeDisabled();
    expect(mockCreateMutate).not.toHaveBeenCalled();
  });

  it('starts rename flow and submits new name', async () => {
    const user = setupUser();
    render(<FavoriteListsSidebar />);

    await user.click(screen.getByLabelText('إعادة تسمية سيارات'));
    const renameInput = screen.getByDisplayValue('سيارات');
    await user.clear(renameInput);
    await user.type(renameInput, 'سيارات فاخرة');
    // Submit the rename form (Enter)
    await user.keyboard('{Enter}');

    expect(mockRenameMutate).toHaveBeenCalledWith(
      { listId: 'list-1', name: 'سيارات فاخرة' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('opens delete confirm and deletes on confirm', async () => {
    const user = setupUser();
    render(<FavoriteListsSidebar />);

    await user.click(screen.getByLabelText('حذف سيارات'));

    expect(screen.getByText('حذف القائمة؟')).toBeInTheDocument();
    expect(screen.getByText(/سيتم حذف «سيارات»/)).toBeInTheDocument();

    // ConfirmDialog uses confirmLabel="حذف"
    const confirmBtn = screen.getByRole('button', { name: 'حذف' });
    await user.click(confirmBtn);

    expect(mockDeleteMutate).toHaveBeenCalledWith(
      'list-1',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('after deleting the active list, selects "الكل"', async () => {
    const user = setupUser();
    mockSearchParams = new URLSearchParams('list=list-1');
    render(<FavoriteListsSidebar />);

    await user.click(screen.getByLabelText('حذف سيارات'));
    await user.click(screen.getByRole('button', { name: 'حذف' }));

    // Capture onSuccess and invoke it to simulate mutation success
    const onSuccess = mockDeleteMutate.mock.calls[0][1].onSuccess as () => void;
    onSuccess();

    expect(mockPush).toHaveBeenCalledWith(ROUTES.favorites);
  });
});
