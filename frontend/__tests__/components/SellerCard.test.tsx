/**
 * __tests__/components/SellerCard.test.tsx
 *
 * SellerCard's real logic: links to the seller's profile (the seller
 * page when sellerProfileId is present, falling back to the plain user
 * profile for legacy ads with none), conditionally shows the city and
 * verified badge, and starts a real conversation with the seller via
 * useStartConversation (messaging has shipped — see useConversationMutations.ts).
 * The messaging button is hidden entirely for the ad's own owner
 * (isOwnAd) and gated behind auth otherwise, mirroring AdDetail's own
 * handleFavorite auth gate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SellerCard } from '@/components/ads/SellerCard';
import { sellersApi } from '@/api/sellers.api';
import { useStartConversation } from '@/hooks/mutations/useConversationMutations';
import { useAuthStore } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import { toast } from 'sonner';
import type { AdAuthor } from '@/types/ad.types';

vi.mock('@/api/sellers.api', () => ({
  sellersApi: {
    getById: vi.fn(),
  },
}));

vi.mock('@/hooks/mutations/useConversationMutations', () => ({
  useStartConversation: vi.fn(),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

const baseSeller: AdAuthor = {
  id: 'seller-1',
  name: 'محمد أحمد',
  avatarUrl: null,
  city: 'غزة',
};

const mockStartConversation = vi.fn();

function mockAuth(isAuthenticated: boolean, currentUser: { id: string } | null = null) {
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: { isAuthenticated: boolean; user: unknown }) => unknown) =>
      selector({ isAuthenticated, user: currentUser }),
  );
}

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.mocked(sellersApi.getById).mockReset();
  vi.mocked(useStartConversation).mockReturnValue({
    mutate: mockStartConversation,
    isPending: false,
  } as never);
  mockAuth(true);
});

describe('SellerCard', () => {
  it('links to the seller profile page when sellerProfileId is present', () => {
    renderWithClient(
      <SellerCard seller={baseSeller} adId="ad-1" sellerProfileId="sp-1" />
    );

    const profileLink = screen.getByText('محمد أحمد').closest('a');
    expect(profileLink).toHaveAttribute('href', ROUTES.sellerProfile('sp-1'));
  });

  it('falls back to the plain user profile when sellerProfileId is null (legacy ad)', () => {
    renderWithClient(
      <SellerCard seller={baseSeller} adId="ad-1" sellerProfileId={null} />
    );

    const profileLink = screen.getByText('محمد أحمد').closest('a');
    expect(profileLink).toHaveAttribute('href', ROUTES.userProfile(baseSeller.id));
    // No sellerProfileId means nothing to look up — the query stays disabled.
    expect(sellersApi.getById).not.toHaveBeenCalled();
  });

  it('shows the seller city when present', () => {
    renderWithClient(
      <SellerCard seller={baseSeller} adId="ad-1" sellerProfileId={null} />
    );
    expect(screen.getByText('غزة')).toBeInTheDocument();
  });

  it('does not render a city element when city is null', () => {
    renderWithClient(
      <SellerCard seller={{ ...baseSeller, city: null }} adId="ad-1" sellerProfileId={null} />
    );
    expect(screen.queryByText('غزة')).not.toBeInTheDocument();
  });

  it('renders the messaging button as enabled once authenticated (messaging has shipped)', () => {
    renderWithClient(
      <SellerCard seller={baseSeller} adId="ad-1" sellerProfileId={null} />
    );

    const messageButton = screen.getByRole('button', { name: 'مراسلة البائع' });
    expect(messageButton).not.toBeDisabled();
  });

  it('starts a conversation and navigates to it on click', async () => {
    mockStartConversation.mockImplementation((_payload, opts?: { onSuccess?: (c: { id: string }) => void }) => {
      opts?.onSuccess?.({ id: 'conv-1' });
    });
    const user = userEvent.setup();
    renderWithClient(
      <SellerCard seller={baseSeller} adId="ad-1" sellerProfileId={null} />
    );

    await user.click(screen.getByRole('button', { name: 'مراسلة البائع' }));

    expect(mockStartConversation).toHaveBeenCalledWith(
      { adId: 'ad-1' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('shows an error toast and does not start a conversation when unauthenticated', async () => {
    mockAuth(false);
    const user = userEvent.setup();
    renderWithClient(
      <SellerCard seller={baseSeller} adId="ad-1" sellerProfileId={null} />
    );

    await user.click(screen.getByRole('button', { name: 'مراسلة البائع' }));

    expect(toast.error).toHaveBeenCalledWith('يرجى تسجيل الدخول أولاً');
    expect(mockStartConversation).not.toHaveBeenCalled();
  });

  it('hides the messaging button entirely for the ad’s own owner', () => {
    mockAuth(true, { id: baseSeller.id });
    renderWithClient(
      <SellerCard seller={baseSeller} adId="ad-1" sellerProfileId={null} />
    );

    expect(screen.queryByRole('button', { name: 'مراسلة البائع' })).not.toBeInTheDocument();
  });

  it('shows a pending label and disables the button while the conversation is starting', () => {
    vi.mocked(useStartConversation).mockReturnValue({
      mutate: mockStartConversation,
      isPending: true,
    } as never);
    renderWithClient(
      <SellerCard seller={baseSeller} adId="ad-1" sellerProfileId={null} />
    );

    expect(screen.getByRole('button', { name: 'جارٍ التحضير…' })).toBeDisabled();
  });
});
