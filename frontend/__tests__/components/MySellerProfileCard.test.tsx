/**
 * __tests__/components/MySellerProfileCard.test.tsx
 *
 * Coverage gap: 0% prior coverage. Pure props-driven card — covers
 * the verified/unverified badge branch, optional bio rendering, the
 * rating fallback ('—') when totalRatings is 0 vs a formatted rating
 * otherwise, the stats grid, and the two CTA links (public profile,
 * AUDIT-FIX #5's "create your store" next-step link).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MySellerProfileCard } from '@/components/sellers/MySellerProfileCard';
import { useRequestSellerVerification, useUpdateSellerProfile } from '@/hooks/mutations/useSellerMutations';
import type { SellerProfile } from '@/types/seller.types';

vi.mock('@/hooks/mutations/useSellerMutations', () => ({
  useRequestSellerVerification: vi.fn(),
  useUpdateSellerProfile: vi.fn(),
}));

const mockRequestVerification = vi.fn();

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const baseProfile: SellerProfile = {
  id: 'seller-1',
  userId: 'user-1',
  displayName: 'متجر أبو محمد',
  verified: true,
  verificationStatus: 'VERIFIED',
  bio: 'نبيع أجهزة كهربائية مستعملة بحالة ممتازة',
  activeAds: 12,
  totalSales: 34,
  averageRating: '4.5',
  totalRatings: 20,
  responseRate: null,
  responseTimeMinutes: null,
  joinedSellingAt: '2026-01-15T00:00:00.000Z',
} as SellerProfile;

beforeEach(() => {
  mockRequestVerification.mockReset();
  vi.mocked(useRequestSellerVerification).mockReturnValue({
    mutate: mockRequestVerification,
    isPending: false,
  } as never);
  vi.mocked(useUpdateSellerProfile).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as never);
});

describe('MySellerProfileCard', () => {
  it('renders the verified badge when the seller is verified', () => {
    renderWithClient(<MySellerProfileCard profile={baseProfile} />);

    expect(screen.getByText('بائع موثّق')).toBeInTheDocument();
    expect(screen.queryByText('غير موثّق')).not.toBeInTheDocument();
  });

  it('renders the unverified badge when the seller is not verified', () => {
    renderWithClient(
      <MySellerProfileCard
        profile={{ ...baseProfile, verified: false, verificationStatus: 'UNVERIFIED' }}
      />,
    );

    expect(screen.getByText('غير موثّق')).toBeInTheDocument();
  });

  it('renders the bio when present', () => {
    renderWithClient(<MySellerProfileCard profile={baseProfile} />);

    expect(screen.getByText('نبيع أجهزة كهربائية مستعملة بحالة ممتازة')).toBeInTheDocument();
  });

  it('omits the bio paragraph when bio is empty', () => {
    renderWithClient(<MySellerProfileCard profile={{ ...baseProfile, bio: '' }} />);

    expect(screen.queryByText('نبيع أجهزة كهربائية مستعملة بحالة ممتازة')).not.toBeInTheDocument();
  });

  it('renders active ads, total sales, and formatted rating', () => {
    renderWithClient(<MySellerProfileCard profile={baseProfile} />);

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('34')).toBeInTheDocument();
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('20 تقييم')).toBeInTheDocument();
  });

  it('shows a "—" placeholder for rating when totalRatings is 0', () => {
    renderWithClient(<MySellerProfileCard profile={{ ...baseProfile, totalRatings: 0 }} />);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('4.5')).not.toBeInTheDocument();
  });

  it('links to the person\'s unified public profile page', () => {
    // UNIFIED-PROFILE: now links to /profile/[userId] directly rather
    // than the old /sellers/[sellerProfileId] page (which is now just
    // a redirect back here — see that page's own comment).
    renderWithClient(<MySellerProfileCard profile={baseProfile} />);

    const link = screen.getByText('عرض صفحتي العامة').closest('a');
    expect(link).toHaveAttribute('href', expect.stringContaining('user-1'));
  });

  it('renders the "create your store" CTA (AUDIT-FIX #5)', () => {
    renderWithClient(<MySellerProfileCard profile={baseProfile} />);

    expect(screen.getByText('أنشئ متجرك الآن')).toBeInTheDocument();
  });

  // PLAN-P1-4
  it('does not show a verification-request affordance once already verified', () => {
    renderWithClient(<MySellerProfileCard profile={baseProfile} />);

    expect(screen.queryByText('طلب توثيق الحساب')).not.toBeInTheDocument();
    expect(screen.queryByText('طلب التوثيق قيد المراجعة')).not.toBeInTheDocument();
  });

  it('shows a request-verification button when unverified and no request is pending', () => {
    renderWithClient(
      <MySellerProfileCard
        profile={{ ...baseProfile, verified: false, verificationStatus: 'UNVERIFIED' }}
      />,
    );

    expect(screen.getByRole('button', { name: 'طلب توثيق الحساب' })).toBeInTheDocument();
  });

  it('shows a request-verification button when a prior request was rejected', () => {
    renderWithClient(
      <MySellerProfileCard
        profile={{ ...baseProfile, verified: false, verificationStatus: 'REJECTED' }}
      />,
    );

    expect(screen.getByRole('button', { name: 'طلب توثيق الحساب' })).toBeInTheDocument();
  });

  it('shows a pending message instead of a button while verificationStatus is PENDING', () => {
    renderWithClient(
      <MySellerProfileCard
        profile={{ ...baseProfile, verified: false, verificationStatus: 'PENDING' }}
      />,
    );

    expect(screen.getByText('طلب التوثيق قيد المراجعة')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'طلب توثيق الحساب' })).not.toBeInTheDocument();
  });

  it('calls the mutation when the request-verification button is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    renderWithClient(
      <MySellerProfileCard
        profile={{ ...baseProfile, verified: false, verificationStatus: 'UNVERIFIED' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'طلب توثيق الحساب' }));
    expect(mockRequestVerification).toHaveBeenCalledTimes(1);
  });
});
