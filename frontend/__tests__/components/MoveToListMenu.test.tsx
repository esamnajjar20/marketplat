/**
 * __tests__/components/MoveToListMenu.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { MoveToListMenu } from '@/components/favorites/MoveToListMenu';
import { useFavoriteLists } from '@/hooks/queries/useFavoriteLists';
import { useMoveFavoriteToList } from '@/hooks/mutations/useFavoriteListMutations';
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

const mockMoveMutate = vi.fn();

const lists: FavoriteList[] = [
  {
    id: 'list-1',
    name: 'سيارات',
    sortOrder: 0,
    itemsCount: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'list-2',
    name: 'هواتف',
    sortOrder: 1,
    itemsCount: 0,
    createdAt: '2026-01-02T00:00:00.000Z',
  },
];

function setup({ listsData = lists }: { listsData?: FavoriteList[] } = {}) {
  vi.mocked(useFavoriteLists).mockReturnValue({
    data: listsData,
    isLoading: false,
  } as never);
  vi.mocked(useMoveFavoriteToList).mockReturnValue({
    mutate: mockMoveMutate,
    isPending: false,
  } as never);
}

describe('MoveToListMenu', () => {
  beforeEach(() => {
    mockMoveMutate.mockReset();
    setup();
  });

  it('renders the trigger button', () => {
    render(<MoveToListMenu favoriteId="fav-1" currentListId={null} />);
    expect(screen.getByRole('button', { name: /نقل إلى قائمة/ })).toBeInTheDocument();
  });

  it('opens menu with lists and "الكل" option', async () => {
    const user = setupUser();
    render(<MoveToListMenu favoriteId="fav-1" currentListId={null} />);

    await user.click(screen.getByRole('button', { name: /نقل إلى قائمة/ }));

    expect(screen.getByRole('menuitem', { name: /الكل/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'سيارات' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'هواتف' })).toBeInTheDocument();
  });

  it('moves favorite to selected list and closes', async () => {
    const user = setupUser();
    render(<MoveToListMenu favoriteId="fav-1" currentListId={null} />);

    await user.click(screen.getByRole('button', { name: /نقل إلى قائمة/ }));
    await user.click(screen.getByRole('menuitem', { name: 'هواتف' }));

    expect(mockMoveMutate).toHaveBeenCalledWith(
      { favoriteId: 'fav-1', listId: 'list-2' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('moves to null when choosing "الكل"', async () => {
    const user = setupUser();
    render(<MoveToListMenu favoriteId="fav-1" currentListId="list-1" />);

    await user.click(screen.getByRole('button', { name: /نقل إلى قائمة/ }));
    await user.click(screen.getByRole('menuitem', { name: /الكل/ }));

    expect(mockMoveMutate).toHaveBeenCalledWith(
      { favoriteId: 'fav-1', listId: null },
      expect.any(Object),
    );
  });

  it('disables the current list option', async () => {
    const user = setupUser();
    render(<MoveToListMenu favoriteId="fav-1" currentListId="list-1" />);

    await user.click(screen.getByRole('button', { name: /نقل إلى قائمة/ }));

    expect(screen.getByRole('menuitem', { name: 'سيارات' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'هواتف' })).not.toBeDisabled();
  });

  it('shows empty-lists hint with link when no lists exist', async () => {
    setup({ listsData: [] });
    const user = setupUser();
    render(<MoveToListMenu favoriteId="fav-1" currentListId={null} />);

    await user.click(screen.getByRole('button', { name: /نقل إلى قائمة/ }));

    expect(screen.getByText(/لا قوائم/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /أنشئ من المفضلة/ })).toBeInTheDocument();
  });
});
