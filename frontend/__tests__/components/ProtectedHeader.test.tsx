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
import { ProtectedHeader } from '@/components/layout/ProtectedHeader';
import { ROUTES } from '@/lib/constants';

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

describe('ProtectedHeader', () => {
  it('renders the logo linking to the home route', () => {
    render(<ProtectedHeader />);

    const homeLink = screen.getAllByRole('link').find((a) => a.getAttribute('href') === ROUTES.home);
    expect(homeLink).toBeDefined();
  });

  it('renders a "نشر إعلان" button linking to the real ad-create route', () => {
    render(<ProtectedHeader />);

    const createLink = screen.getByText('+ نشر إعلان').closest('a');
    expect(createLink).toHaveAttribute('href', ROUTES.adCreate);
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
