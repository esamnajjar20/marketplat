/**
 * __tests__/components/AssignFavoriteToListDialog.test.tsx
 *
 * Dialog shown after favoriting an ad — resolve favoriteId from API,
 * assign to list / "الكل", create new list, skip, and loading states.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { AssignFavoriteToListDialog } from '@/components/favorites/AssignFavoriteToListDialog';
import { useFavoriteLists } from '@/hooks/queries/useFavoriteLists';
import {
  useCreateFavoriteList,
  useMoveFavoriteToList,
} from '@/hooks/mutations/useFavoriteListMutations';
import { favoritesApi } from '@/api/favorites.api';
import { toast } from 'sonner';
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

vi.mock('@/api/favorites.api', () => ({
  favoritesApi: {
    getAll: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    message: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockMoveMutate = vi.fn();
const mockCreateMutate = vi.fn();
const mockOnOpenChange = vi.fn();

const lists: FavoriteList[] = [
  {
    id: 'list-1',
    name: 'سيارات',
    sortOrder: 0,
    itemsCount: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

function setupMocks({
  isLoading = false,
  favoriteRow = { id: 'fav-1', adId: 'ad-1', ad: { id: 'ad-1' } },
}: {
  isLoading?: boolean;
  favoriteRow?: { id: string; adId?: string; ad?: { id: string } } | null;
} = {}) {
  vi.mocked(useFavoriteLists).mockReturnValue({
    data: lists,
    isLoading,
  } as never);

  vi.mocked(useMoveFavoriteToList).mockReturnValue({
    mutate: mockMoveMutate,
    isPending: false,
  } as never);

  vi.mocked(useCreateFavoriteList).mockReturnValue({
    mutate: mockCreateMutate,
    isPending: false,
  } as never);

  vi.mocked(favoritesApi.getAll).mockResolvedValue({
    items: favoriteRow ? [favoriteRow] : [],
    meta: { totalPages: 1, hasNextPage: false },
  } as never);
}

describe('AssignFavoriteToListDialog', () => {
  beforeEach(() => {
    mockMoveMutate.mockReset();
    mockCreateMutate.mockReset();
    mockOnOpenChange.mockReset();
    setupMocks();
  });

  it('renders nothing when open is false', () => {
    const { container } = render(
      <AssignFavoriteToListDialog adId="ad-1" open={false} onOpenChange={mockOnOpenChange} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows title and list options when open', async () => {
    render(
      <AssignFavoriteToListDialog adId="ad-1" open onOpenChange={mockOnOpenChange} />,
    );

    expect(screen.getByText('إضافة إلى قائمة؟')).toBeInTheDocument();

    // Wait until resolving favoriteId + lists finish loading
    await waitFor(() => {
      expect(screen.getByText('الكل (بدون قائمة)')).toBeInTheDocument();
    });
    expect(screen.getByText('سيارات')).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });

  it('assigns to a list after resolving favoriteId', async () => {
    const user = setupUser();
    render(
      <AssignFavoriteToListDialog adId="ad-1" open onOpenChange={mockOnOpenChange} />,
    );

    await waitFor(() => expect(favoritesApi.getAll).toHaveBeenCalled());

    await user.click(screen.getByText('سيارات'));

    expect(mockMoveMutate).toHaveBeenCalledWith(
      { favoriteId: 'fav-1', listId: 'list-1' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('assigns to null (الكل) and closes on success', async () => {
    const user = setupUser();
    render(
      <AssignFavoriteToListDialog adId="ad-1" open onOpenChange={mockOnOpenChange} />,
    );

    await waitFor(() => expect(favoritesApi.getAll).toHaveBeenCalled());
    await user.click(screen.getByText('الكل (بدون قائمة)'));

    expect(mockMoveMutate).toHaveBeenCalledWith(
      { favoriteId: 'fav-1', listId: null },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    const onSuccess = mockMoveMutate.mock.calls[0][1].onSuccess as () => void;
    onSuccess();
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows toast and closes when favoriteId cannot be resolved', async () => {
    setupMocks({ favoriteRow: null });
    const user = setupUser();
    render(
      <AssignFavoriteToListDialog adId="ad-missing" open onOpenChange={mockOnOpenChange} />,
    );

    await waitFor(() => expect(favoritesApi.getAll).toHaveBeenCalled());
    await user.click(screen.getByText('الكل (بدون قائمة)'));

    expect(toast.message).toHaveBeenCalledWith(
      'تم الحفظ في المفضلة',
      expect.objectContaining({ description: expect.any(String) }),
    );
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    expect(mockMoveMutate).not.toHaveBeenCalled();
  });

  it('skip button closes the dialog', async () => {
    const user = setupUser();
    render(
      <AssignFavoriteToListDialog adId="ad-1" open onOpenChange={mockOnOpenChange} />,
    );

    await user.click(screen.getByRole('button', { name: 'تخطي' }));
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('can create a new list then assign to it', async () => {
    const user = setupUser();
    render(
      <AssignFavoriteToListDialog adId="ad-1" open onOpenChange={mockOnOpenChange} />,
    );

    await waitFor(() => expect(favoritesApi.getAll).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /قائمة جديدة/ }));
    await user.type(screen.getByPlaceholderText('اسم القائمة'), 'عقارات');
    await user.click(screen.getByRole('button', { name: 'إنشاء' }));

    expect(mockCreateMutate).toHaveBeenCalledWith(
      'عقارات',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    // Simulate create success with a new list id → should trigger assign
    const onSuccess = mockCreateMutate.mock.calls[0][1].onSuccess as (list: { id: string }) => void;
    onSuccess({ id: 'list-new' });

    expect(mockMoveMutate).toHaveBeenCalledWith(
      { favoriteId: 'fav-1', listId: 'list-new' },
      expect.any(Object),
    );
  });
});
