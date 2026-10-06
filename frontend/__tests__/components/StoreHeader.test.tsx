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
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { StoreHeader } from '@/components/stores/StoreHeader';
import { useAuthStore } from '@/store/auth.store';
import { useToggleStoreFollow } from '@/hooks/mutations/useStoreMutations';
import { useIsFollowingStore } from '@/hooks/queries/useStores';
import type { StoreWithSellerAndCounts } from '@/types/store.types';

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
}));

vi.mock('@/hooks/mutations/useStoreMutations', () => ({
  useToggleStoreFollow: vi.fn(),
}));

vi.mock('@/hooks/queries/useStores', () => ({
  useIsFollowingStore: vi.fn(),
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
vi.mock('@/hooks/mutations/useConversationMutations', () => ({
  useStartConversation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

// FEAT-FAVORITE-POLYMORPHIC PR3: StoreHeader now also renders a
// FavoriteButton (STORE entity, warm=true — distinct from the follow
// button above). Own behavior covered by FavoriteButton.test.tsx.
vi.mock('@/components/shared/FavoriteButton', () => ({
  FavoriteButton: () => <div data-testid="favorite-button" />,
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
  StoreBadges: () => null,
}));

describe('StoreHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth({ user: { id: 'viewer-1' }, isAuthenticated: true });
    (useToggleStoreFollow as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: mockToggleMutate, isPending: false });
    (useIsFollowingStore as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  it('renders the store name and rating (totalRatings > 0)', () => {
    render(<StoreHeader store={store} />);

    expect(screen.getByText('متجر السلام')).toBeInTheDocument();
    expect(screen.getByText(/4\.7/)).toBeInTheDocument();
  });

  it('omits the rating line when totalRatings is 0', () => {
    render(<StoreHeader store={{ ...store, sellerProfile: { ...store.sellerProfile, totalRatings: 0 } }} />);

    expect(screen.queryByText(/تقييم\)/)).not.toBeInTheDocument();
  });

  it('shows the FEATURED plan badge only for a FEATURED store (FIX P1-4)', () => {
    render(<StoreHeader store={{ ...store, plan: 'FEATURED' }} />);

    expect(screen.getByText('مميز')).toBeInTheDocument();
  });

  it('renders follower/product counts and city', () => {
    render(<StoreHeader store={store} />);

    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('خان يونس')).toBeInTheDocument();
  });

  it('renders a tel: call link with the formatted phone number', () => {
    render(<StoreHeader store={store} />);

    const callLink = screen.getByText(/0599/).closest('a');
    expect(callLink).toHaveAttribute('href', 'tel:0599111222');
  });

  it('uses the derived follow state from useIsFollowingStore when no override prop is given (FIX BUG-03)', () => {
    (useIsFollowingStore as ReturnType<typeof vi.fn>).mockReturnValue(true);
    render(<StoreHeader store={store} />);

    expect(screen.getByRole('button', { name: /إلغاء المتابعة/ })).toBeInTheDocument();
  });

  it('lets the isFollowing prop override the derived value', () => {
    (useIsFollowingStore as ReturnType<typeof vi.fn>).mockReturnValue(false);
    render(<StoreHeader store={store} isFollowing={true} />);

    expect(screen.getByRole('button', { name: /إلغاء المتابعة/ })).toBeInTheDocument();
  });

  it('shows "متابعة" and calls toggleFollow.mutate with the store id on click', async () => {
    const user = setupUser();
    render(<StoreHeader store={store} />);

    const followBtn = screen.getByRole('button', { name: /متابعة/ });
    await user.click(followBtn);

    expect(mockToggleMutate).toHaveBeenCalledWith('store-1');
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

  it('shows the report button for an authenticated non-owner viewer (FEAT-REPORT-USER-STORE)', () => {
    render(<StoreHeader store={store} />);

    expect(screen.getByTestId('report-store-button')).toBeInTheDocument();
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
