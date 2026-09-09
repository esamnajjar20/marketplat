/**
 * __tests__/components/ProtectedHeader.test.tsx
 *
 * ProtectedHeader is pure static markup (no conditional logic, unlike
 * PublicHeader) — renders on every authenticated page (dashboard,
 * my-ads, settings, etc.). This also pins down the ROUTES.adCreate
 * link: the component previously referenced the nonexistent
 * ROUTES.createAd (real key is ROUTES.adCreate), a build-breaking
 * TypeScript error caught while writing this suite.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { ProtectedHeader } from '@/components/layout/ProtectedHeader';
import { ROUTES } from '@/lib/constants';
import { useIsSeller } from '@/hooks/queries/useSellers';

vi.mock('@/components/layout/UserMenu', () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}));

// NotificationBell (useMyNotifications/useUnreadNotificationCount) and
// ProtectedMobileNav (useLogout, a useMutation hook) both need a
// QueryClientProvider in the tree to even construct — neither is what
// this file is testing, so stub them out the same way UserMenu already
// is above, rather than pulling in react-query just to satisfy them.
vi.mock('@/components/layout/NotificationBell', () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
}));

vi.mock('@/components/layout/ProtectedMobileNav', () => ({
  ProtectedMobileNav: () => <div data-testid="protected-mobile-nav" />,
}));

// MessagesLink reads useUnreadConversationCount() (a useQuery hook) —
// same QueryClientProvider issue as NotificationBell/ProtectedMobileNav
// above, so it's stubbed the same way rather than wrapped.
vi.mock('@/components/layout/MessagesLink', () => ({
  MessagesLink: () => <div data-testid="messages-link" />,
}));

// CREATE-SHEET: the old two-state "+ نشر إعلان"/"أنشئ حساب بائع" CTA was
// replaced by a single "أضف" button that opens CreateSheet (mirrors
// BottomNav's own CreateSheet migration) — useIsSeller() is now read only
// to gate a flash of the button before it resolves (sellerLoaded), not to
// pick a label/href, so isSeller's value itself no longer changes what
// renders. Mocked rather than wrapped in a QueryClientProvider, same
// reasoning as NotificationBell/ProtectedMobileNav above.
vi.mock('@/hooks/queries/useSellers', () => ({
  useMySellerProfile: vi.fn(() => ({ data: { id: 'seller-1' }, isSuccess: true })),
  useIsSeller: vi.fn(() => ({ isSeller: true, isLoaded: true })),
}));

describe('ProtectedHeader', () => {
  it('renders the logo linking to the home route', () => {
    render(<ProtectedHeader />);

    const homeLink = screen.getAllByRole('link').find((a) => a.getAttribute('href') === ROUTES.home);
    expect(homeLink).toBeDefined();
  });

  it('opens CreateSheet with the ad-create route when "أضف" is tapped', async () => {
    const user = setupUser();
    render(<ProtectedHeader />);

    expect(screen.queryByRole('link', { name: /إعلان جديد/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'أضف' }));

    expect(screen.getByRole('link', { name: /إعلان جديد/ })).toHaveAttribute('href', ROUTES.adCreate);
  });

  it('still shows the same "أضف" CTA when the user has no SellerProfile', () => {
    vi.mocked(useIsSeller).mockReturnValueOnce({ isSeller: false, isLoaded: true });
    render(<ProtectedHeader />);

    // CreateSheet's destinations are seller-agnostic — each target page
    // (CreateAdGate etc.) handles the missing-profile case itself, so the
    // header CTA no longer swaps label/href based on isSeller.
    expect(screen.getByRole('button', { name: 'أضف' })).toBeInTheDocument();
  });

  it('renders the UserMenu', () => {
    render(<ProtectedHeader />);
    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
  });

  // REORG-06: browse links (stores/services/service-providers), mirroring
  // PublicHeader, so a signed-in user isn't stuck inside the protected
  // section to reach public browse.
  it('renders stores/services/service-providers links', () => {
    render(<ProtectedHeader />);
    expect(screen.getByText('المتاجر').closest('a')).toHaveAttribute('href', ROUTES.stores);
    expect(screen.getByText('الخدمات').closest('a')).toHaveAttribute('href', ROUTES.services);
    expect(screen.getByText('مقدمو الخدمة').closest('a')).toHaveAttribute('href', ROUTES.serviceProviders);
  });
});
