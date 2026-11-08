/**
 * __tests__/components/StoreHeader.test.tsx
 *
 * Coverage gap: 0% prior coverage. Covers 's derived-vs-
 * override follow-state logic, the verified badge, FEATURED plan
 * badge (), the rating line's totalRatings>0 gate, stats
 * card, the follow/unfollow button's own-store and unauthenticated
 * guards, and FEAT-REPORT-USER-STORE's report-button guard (same
 * own-store/unauthenticated condition as follow).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders as render } from '@/test-support/render';
import { screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { StoreHeader } from '@/components/stores/StoreHeader';
import { useAuthStore } from '@/store/auth.store';
import { useToggleStoreFollow } from '@/hooks/mutations/useStoreMutations';
import { useFollowStatus } from '@/hooks/queries/useFollows';
import { useStore } from '@/hooks/queries/useStores';
import type { StoreWithSellerAndCounts } from '@/types/store.types';

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
  selectHasAccessToken: (s: any) => Boolean(s?.accessToken ?? s?.hasAccessToken),
  selectHydratedUser: (s: any) => (s?.isHydrated ? s.user : null),
  selectHydratedIsAuthenticated: (s: any) => (s?.isHydrated ? Boolean(s?.isAuthenticated ?? s?.user) : false),
  selectIsAuthResolving: (s: any) => Boolean(s?.isAuthResolving),
  selectIsHydrated: (s: any) => Boolean(s?.isHydrated),
  selectAccessToken: (s: any) => s?.accessToken,
  selectIsAdmin: (s: any) => Boolean(s?.isAdmin ?? (s?.user?.role === 'ADMIN' || s?.user?.role === 'MODERATOR')),
}));

vi.mock('@/hooks/mutations/useStoreMutations', () => ({
  useToggleStoreFollow: vi.fn(),
}));

vi.mock('@/hooks/queries/useFollows', () => ({
  useFollowStatus: vi.fn(),
}));

vi.mock('@/hooks/queries/useStores', () => ({
  useStore: vi.fn(() => ({ data: undefined, isError: true, isFetching: false })),
}));

vi.mock('@/components/stores/ReportStoreButton', () => ({
  ReportStoreButton: () => <div data-testid="report-store-button" />,
}));

// FEAT-MSG-UNIFY: StoreHeader now renders MessageUserButtonGate
// ("مراسلة المتجر") — mocked the same way PublicProfileHeader.test.tsx
// mocks it, so this file's existing assertions stay unaffected. The
// gate's own self-hide/self-message/unauthenticated logic is covered
// by MessageUserButtonGate.test.tsx; this file only asserts StoreHeader
// wires it to the store owner's userId and respects isOwnStore.
vi.mock('@/hooks/mutations/useStartConversation', () => ({
  useStartConversation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

// FEAT-FAVORITE-POLYMORPHIC PR3: StoreHeader now also renders a
// FavoriteButton (STORE entity, warm=true — distinct from the follow
// button above). Own behavior covered by FavoriteButton.test.tsx.
vi.mock('@/components/shared/FavoriteButton', () => ({
  FavoriteButton: (props: { initialIsFavorited?: boolean; warm?: boolean }) => (
    <div data-testid="favorite-button" data-favorited={String(props.initialIsFavorited)} data-warm={String(props.warm)} />
  ),
}));

const mockToggleMutate = vi.fn();

const store: StoreWithSellerAndCounts = {
  id: 'store-1',
  name: 'متجر السلام',
  description: 'متجر لبيع الأدوات المنزلية',
  city: 'خان يونس',
  phone: '0599111222',
  logoUrl: null,
  coverImageUrl: null,
  plan: 'STANDARD',
  sellerProfile: { userId: 'owner-1', avatarUrl: null, verified: true, averageRating: '4.7', totalRatings: 30 },
  _count: { followers: 50, products: 10 },
} as unknown as StoreWithSellerAndCounts;

function mockAuth(state: { user: Record<string, unknown> | null; isAuthenticated: boolean }) {
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: typeof state) => unknown) => selector(state),
  );
}

vi.mock('@/components/stores/StoreBadges', () => ({
  StoreBadges: (props: { badges?: unknown[] }) => (
    <div data-testid="store-badges" data-badge-count={String(props.badges?.length ?? 'fallback')} />
  ),
}));

describe('StoreHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth({ user: { id: 'viewer-1' }, isAuthenticated: true });
    (useToggleStoreFollow as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: mockToggleMutate, isPending: false });
    (useFollowStatus as ReturnType<typeof vi.fn>).mockReturnValue({ data: false });
    vi.mocked(useStore).mockReturnValue({ data: undefined, isError: true, isFetching: false } as never);
  });

  it('renders the store name and rating (totalRatings > 0)', () => {
    render(<StoreHeader store={store} />);

    expect(screen.getByText('متجر السلام')).toBeInTheDocument();
    expect(screen.getAllByText(/4\.7/).length).toBeGreaterThan(0);
  });

  it('omits the rating line when totalRatings is 0', () => {
    render(<StoreHeader store={{ ...store, sellerProfile: { ...store.sellerProfile, totalRatings: 0 } }} />);

    expect(screen.queryByText(/تقييم\)/)).not.toBeInTheDocument();
  });

  it('shows the FEATURED plan badge only for a FEATURED store (FIX P1-4)', () => {
    render(<StoreHeader store={{ ...store, plan: 'FEATURED' }} />);

    expect(screen.getByText('متجر مميز')).toBeInTheDocument();
  });

  it('renders follower/product counts and city', () => {
    render(<StoreHeader store={store} />);

    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getAllByText('خان يونس').length).toBeGreaterThan(0);
  });

  it('renders a tel: call link', () => {
    render(<StoreHeader store={store} />);

    const callLink = screen.getByText('اتصال').closest('a');
    expect(callLink).toHaveAttribute('href', 'tel:0599111222');
  });

  it('uses the single-target follow state when no aggregate override is given', () => {
    (useFollowStatus as ReturnType<typeof vi.fn>).mockReturnValue({ data: true });
    render(<StoreHeader store={store} />);

    expect(screen.getByRole('button', { name: /إلغاء المتابعة/ })).toBeInTheDocument();
  });

  it('uses the combined page response and suppresses the three individual header reads', () => {
    vi.mocked(useStore).mockReturnValue({
      data: {
        store,
        badges: [{ type: 'POPULAR', label: 'رائج', icon: 'star' }],
        viewer: { isFollowing: true, isFavorited: true },
      },
      isError: false,
      isFetching: false,
    } as never);

    render(<StoreHeader store={store} />);

    expect(useStore).toHaveBeenCalledWith('store-1', { enabled: true });
    expect(useFollowStatus).toHaveBeenCalledWith('STORE', 'store-1', { enabled: false });
    expect(screen.getByRole('button', { name: /إلغاء المتابعة/ })).toBeInTheDocument();
    expect(screen.getByTestId('favorite-button')).toHaveAttribute('data-favorited', 'true');
    expect(screen.getByTestId('favorite-button')).toHaveAttribute('data-warm', 'false');
    expect(screen.getByTestId('store-badges')).toHaveAttribute('data-badge-count', '1');
  });

  it('lets the isFollowing prop override the derived value', () => {
    (useFollowStatus as ReturnType<typeof vi.fn>).mockReturnValue({ data: false });
    render(<StoreHeader store={store} isFollowing={true} />);

    expect(screen.getByRole('button', { name: /إلغاء المتابعة/ })).toBeInTheDocument();
  });

  it('shows "متابعة" and calls toggleFollow.mutate with the store id on click', async () => {
    const user = setupUser();
    render(<StoreHeader store={store} />);

    const followBtn = screen.getByRole('button', { name: /متابعة/ });
    await user.click(followBtn);

    expect(mockToggleMutate).toHaveBeenCalledWith('store-1', expect.objectContaining({ onSuccess: expect.any(Function) }));
  });

  it('hides the follow button on the user\'s own store', () => {
    mockAuth({ user: { id: 'owner-1' }, isAuthenticated: true });
    render(<StoreHeader store={store} />);

    expect(screen.queryByRole('button', { name: /متابعة|إلغاء المتابعة/ })).not.toBeInTheDocument();
  });

  it('hides the follow button when unauthenticated', () => {
    mockAuth({ user: null, isAuthenticated: false });
    render(<StoreHeader store={store} />);

    expect(screen.queryByRole('button', { name: /متابعة|إلغاء المتابعة/ })).not.toBeInTheDocument();
  });

  it('renders the description when present', () => {
    render(<StoreHeader store={store} />);

    expect(screen.getByText('متجر لبيع الأدوات المنزلية')).toBeInTheDocument();
  });

  // PERF-BUNDLE-DETAIL-01: ReportStoreButton is lazy (next/dynamic, ssr:false) → async.
  it('shows the report button for an authenticated non-owner viewer (FEAT-REPORT-USER-STORE)', async () => {
    render(<StoreHeader store={store} />);

    expect(await screen.findByTestId('report-store-button')).toBeInTheDocument();
  });

  it('hides the report button on the user\'s own store', () => {
    mockAuth({ user: { id: 'owner-1' }, isAuthenticated: true });
    render(<StoreHeader store={store} />);

    expect(screen.queryByTestId('report-store-button')).not.toBeInTheDocument();
  });

  it('hides the report button when unauthenticated', () => {
    mockAuth({ user: null, isAuthenticated: false });
    render(<StoreHeader store={store} />);

    expect(screen.queryByTestId('report-store-button')).not.toBeInTheDocument();
  });

  // FEAT-MSG-UNIFY
  describe('مراسلة المتجر (MessageUserButtonGate)', () => {
    it('renders the message-store button for a non-owner viewer', () => {
      render(<StoreHeader store={store} />);

      expect(screen.getByRole('button', { name: /مراسلة المتجر/ })).toBeInTheDocument();
    });

    it('hides the message-store button on the user\'s own store (self-messaging guard)', () => {
      mockAuth({ user: { id: 'owner-1' }, isAuthenticated: true });
      render(<StoreHeader store={store} />);

      expect(screen.queryByRole('button', { name: /مراسلة المتجر/ })).not.toBeInTheDocument();
    });

    it('still shows the message-store button when unauthenticated (auth handled inside the gate)', () => {
      mockAuth({ user: null, isAuthenticated: false });
      render(<StoreHeader store={store} />);

      expect(screen.getByRole('button', { name: /مراسلة المتجر/ })).toBeInTheDocument();
    });
  });
});
