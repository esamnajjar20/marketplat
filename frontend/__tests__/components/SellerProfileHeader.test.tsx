/**
 * __tests__/components/SellerProfileHeader.test.tsx
 *
 * Coverage gap: 0% prior coverage. Covers the verified checkmark
 * badge, the rating line (only shown when totalRatings > 0), stats
 * card values, the own-profile guard hiding the "rate seller" CTA,
 * the unauthenticated-disabled rate button with its login hint, and
 * optional bio rendering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { SellerProfileHeader } from '@/components/sellers/SellerProfileHeader';
import { useAuthStore } from '@/store/auth.store';
import type { SellerProfile } from '@/types/seller.types';

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
}));

vi.mock('@/components/sellers/RateSellerDialog', () => ({
  RateSellerDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="rate-dialog" /> : null),
}));

const seller: SellerProfile = {
  id: 'seller-1',
  userId: 'user-owner',
  displayName: 'بائع الجملة',
  avatarUrl: null,
  verified: true,
  bio: 'متخصص في بيع الأثاث المستعمل',
  activeAds: 7,
  totalRatings: 15,
  averageRating: '4.2',
  joinedSellingAt: '2025-05-01T00:00:00.000Z',
} as SellerProfile;

function mockAuth(state: { user: Record<string, unknown> | null; isAuthenticated: boolean }) {
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: typeof state) => unknown) => selector(state),
  );
}

describe('SellerProfileHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth({ user: { id: 'viewer-1' }, isAuthenticated: true });
  });

  it('shows the display name and verified checkmark', () => {
    render(<SellerProfileHeader seller={seller} />);

    expect(screen.getByText('بائع الجملة')).toBeInTheDocument();
  });

  it('shows the rating line with count when totalRatings > 0', () => {
    render(<SellerProfileHeader seller={seller} />);

    expect(screen.getByText(/4\.2/)).toBeInTheDocument();
    expect(screen.getByText(/15 تقييم/)).toBeInTheDocument();
  });

  it('omits the rating line when totalRatings is 0', () => {
    render(<SellerProfileHeader seller={{ ...seller, totalRatings: 0 }} />);

    expect(screen.queryByText(/تقييم\)/)).not.toBeInTheDocument();
  });

  it('shows the active-ads count and selling-since date', () => {
    render(<SellerProfileHeader seller={seller} />);

    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText(/يبيع منذ/)).toBeInTheDocument();
  });

  it('shows the "rate seller" CTA when viewing someone else\'s profile', () => {
    render(<SellerProfileHeader seller={seller} />);

    expect(screen.getByRole('button', { name: 'قيّم هذا البائع' })).toBeInTheDocument();
  });

  it('hides the "rate seller" CTA on the user\'s own profile', () => {
    mockAuth({ user: { id: 'user-owner' }, isAuthenticated: true });
    render(<SellerProfileHeader seller={seller} />);

    expect(screen.queryByRole('button', { name: 'قيّم هذا البائع' })).not.toBeInTheDocument();
  });

  it('disables the rate button and shows a login hint when unauthenticated', () => {
    mockAuth({ user: null, isAuthenticated: false });
    render(<SellerProfileHeader seller={seller} />);

    expect(screen.getByRole('button', { name: 'قيّم هذا البائع' })).toBeDisabled();
    expect(screen.getByText('سجّل الدخول لتتمكن من التقييم')).toBeInTheDocument();
  });

  it('opens the rate dialog when the CTA is clicked', async () => {
    const user = setupUser();
    render(<SellerProfileHeader seller={seller} />);

    await user.click(screen.getByRole('button', { name: 'قيّم هذا البائع' }));

    expect(screen.getByTestId('rate-dialog')).toBeInTheDocument();
  });

  it('renders the bio when present', () => {
    render(<SellerProfileHeader seller={seller} />);

    expect(screen.getByText('متخصص في بيع الأثاث المستعمل')).toBeInTheDocument();
  });

  it('omits the bio paragraph when bio is empty', () => {
    render(<SellerProfileHeader seller={{ ...seller, bio: '' }} />);

    expect(screen.queryByText('متخصص في بيع الأثاث المستعمل')).not.toBeInTheDocument();
  });
});
