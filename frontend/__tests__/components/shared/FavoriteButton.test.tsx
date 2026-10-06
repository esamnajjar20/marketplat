/**
 * __tests__/components/shared/FavoriteButton.test.tsx
 *
 * FEAT-FAVORITE-POLYMORPHIC PR3: FavoriteButton is the shared,
 * entity-agnostic heart button used by ProductCard/StoreCard/
 * StoreHeader/ServiceListingCard/ServiceListingDetail. Same coverage
 * shape as AdCard.test.tsx's "favorite button ()" block (the
 * inline heart button this component was factored out of), plus the
 * one thing genuinely new here: the `warm` prop's effect on whether
 * useFavoriteEntityCheck's network call fires — mocked rather than
 * wrapped in a QueryClientProvider, same reasoning as AdCard's test:
 * the hooks' own behavior (optimistic update, rollback, cache
 * subscription, enabled-gating) is already covered by
 * useFavorites.test.tsx; this file only needs to confirm the button
 * renders correctly and wires clicks/props through.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { useToggleFavoriteEntity } from '@/hooks/mutations/useFavoriteMutations';
import { useIsEntityFavorited, useFavoriteEntityCheck } from '@/hooks/queries/useFavorites';
import { useAuthStore } from '@/store/auth.store';
import { toast } from 'sonner';

vi.mock('@/hooks/mutations/useFavoriteMutations', () => ({
  useToggleFavoriteEntity: vi.fn(),
}));

vi.mock('@/hooks/queries/useFavorites', () => ({
  useIsEntityFavorited: vi.fn(),
  useFavoriteEntityCheck: vi.fn(),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockToggleMutate = vi.fn();

function mockFavoriteState({ isAuth = true, isFavorited = false } = {}) {
  vi.mocked(useAuthStore).mockImplementation((selector: unknown) =>
    (selector as (s: { isAuthenticated: boolean }) => unknown)({ isAuthenticated: isAuth }),
  );
  vi.mocked(useIsEntityFavorited).mockReturnValue(isFavorited);
  vi.mocked(useFavoriteEntityCheck).mockReturnValue({} as unknown as ReturnType<typeof useFavoriteEntityCheck>);
  vi.mocked(useToggleFavoriteEntity).mockReturnValue({
    mutate: mockToggleMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useToggleFavoriteEntity>);
}

describe('FavoriteButton', () => {
  beforeEach(() => {
    mockToggleMutate.mockReset();
    vi.mocked(useFavoriteEntityCheck).mockClear();
    mockFavoriteState();
  });

  it('renders with an "add" label/aria-pressed=false when not favorited', () => {
    render(<FavoriteButton entityType="PRODUCT" entityId="prod-1" />);
    const btn = screen.getByRole('button', { name: 'إضافة إلى المفضلة' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders with a "remove" label/aria-pressed=true when favorited', () => {
    mockFavoriteState({ isFavorited: true });
    render(<FavoriteButton entityType="STORE" entityId="store-1" />);
    const btn = screen.getByRole('button', { name: 'إزالة من المفضلة' });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls toggleFavorite.mutate with the entityId when clicked while authenticated', async () => {
    const user = setupUser();
    render(<FavoriteButton entityType="SERVICE_LISTING" entityId="svc-1" />);
    await user.click(screen.getByRole('button', { name: 'إضافة إلى المفضلة' }));
    expect(mockToggleMutate).toHaveBeenCalledWith('svc-1');
  });

  it('shows a toast and does not mutate when clicked while unauthenticated', async () => {
    mockFavoriteState({ isAuth: false });
    const user = setupUser();
    render(<FavoriteButton entityType="PRODUCT" entityId="prod-1" />);
    await user.click(screen.getByRole('button', { name: 'إضافة إلى المفضلة' }));
    expect(toast.error).toHaveBeenCalled();
    expect(mockToggleMutate).not.toHaveBeenCalled();
  });

  it('is disabled and does not double-mutate while a toggle is pending', async () => {
    vi.mocked(useToggleFavoriteEntity).mockReturnValue({
      mutate: mockToggleMutate,
      isPending: true,
    } as unknown as ReturnType<typeof useToggleFavoriteEntity>);
    render(<FavoriteButton entityType="PRODUCT" entityId="prod-1" />);
    const btn = screen.getByRole('button', { name: 'إضافة إلى المفضلة' });
    expect(btn).toBeDisabled();
  });

  it('stops click propagation (so a parent <Link> never navigates on this click)', async () => {
    const user = setupUser();
    const parentClick = vi.fn();
    render(
       
      <div onClick={parentClick}>
        <FavoriteButton entityType="PRODUCT" entityId="prod-1" />
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'إضافة إلى المفضلة' }));
    expect(parentClick).not.toHaveBeenCalled();
    expect(mockToggleMutate).toHaveBeenCalledTimes(1);
  });

  describe('warm prop', () => {
    it('passes enabled=false through to useFavoriteEntityCheck by default (card-grid usage)', () => {
      render(<FavoriteButton entityType="PRODUCT" entityId="prod-1" />);
      expect(useFavoriteEntityCheck).toHaveBeenCalledWith('PRODUCT', 'prod-1', false);
    });

    it('passes enabled=true through to useFavoriteEntityCheck when warm (single-entity detail views)', () => {
      render(<FavoriteButton entityType="STORE" entityId="store-1" warm />);
      expect(useFavoriteEntityCheck).toHaveBeenCalledWith('STORE', 'store-1', true);
    });
  });
});
