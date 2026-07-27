/**
 * __tests__/components/SellerCard.test.tsx
 *
 * SellerCard's real logic: links to the seller's profile (the seller
 * page when sellerProfileId is present, falling back to the plain user
 * profile for legacy ads with none), conditionally shows the city and
 * verified badge, and — the part most worth pinning down — the
 * messaging button is deliberately disabled (no messaging backend
 * exists yet, per the component's own FIX FEAT-01 comment). A future
 * change accidentally re-enabling that button before a real messaging
 * module ships would route users to a dead end; this test exists to
 * catch exactly that regression.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SellerCard } from '@/components/ads/SellerCard';
import { sellersApi } from '@/api/sellers.api';
import { ROUTES } from '@/lib/constants';
import type { AdAuthor } from '@/types/ad.types';

vi.mock('@/api/sellers.api', () => ({
  sellersApi: {
    getById: vi.fn(),
  },
}));

const baseSeller: AdAuthor = {
  id: 'seller-1',
  name: 'محمد أحمد',
  avatarUrl: null,
  city: 'غزة',
};

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.mocked(sellersApi.getById).mockReset();
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

  it('renders the messaging button as disabled (no messaging backend exists yet)', () => {
    renderWithClient(
      <SellerCard seller={baseSeller} adId="ad-1" sellerProfileId={null} />
    );

    const messageButton = screen.getByRole('button', { name: /مراسلة البائع/ });
    expect(messageButton).toBeDisabled();
  });

  it('labels the messaging button as "coming soon" rather than implying it works', () => {
    renderWithClient(
      <SellerCard seller={baseSeller} adId="ad-1" sellerProfileId={null} />
    );
    expect(screen.getByText('مراسلة البائع (قريباً)')).toBeInTheDocument();
  });
});
