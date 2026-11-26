/**
 * __tests__/components/PublicHeader.test.tsx
 *
 * PublicHeader renders on every public page (home, search, category,
 * ad detail) and had zero coverage. Focus: the isAuthenticated branch
 * (login/register buttons vs. "أضف" + UserMenu — CREATE-SHEET: the
 * primary conversion CTA was renamed from "نشر إعلان" to "أضف" once it
 * started opening CreateSheet's three-destination picker instead of
 * linking straight to /ads/create), since that's
 * the component's only real conditional logic — everything else is
 * static markup delegated to child components (Logo,
 * UserMenu, MobileNav), which are mocked here since each either has
 * its own dedicated test file or is trivial presentational markup.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/store/auth.store', () => ({
  selectLastKnownRoles: (s: any) => s?.lastKnownRoles ?? null,
  selectIsAdminTier: (s: any) => Boolean(s?.isAdmin),
  selectUser: (s: any) => s?.user ?? null,
  selectIsAuthenticated: (s: any) => Boolean(s?.isAuthenticated),
  selectIsHydrated: (s: any) => Boolean(s?.isHydrated),
  selectHydratedUser: (s: any) => (s?.isHydrated ? s.user : null),
  selectHasAccessToken: (s: any) => Boolean(s?.accessToken),
  getState: vi.fn(() => ({})),
  useAuthStore: vi.fn(),
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
  selectHasAccessToken: (s: any) => Boolean(s?.accessToken ?? s?.hasAccessToken),
  selectHydratedUser: (s: any) => (s?.isHydrated ? s.user : null),
  selectHydratedIsAuthenticated: (s: any) => (s?.isHydrated ? Boolean(s?.isAuthenticated ?? s?.user) : false),
  selectIsAuthResolving: (s: any) => Boolean(s?.isAuthResolving),
  selectIsHydrated: (s: any) => Boolean(s?.isHydrated),
  selectAccessToken: (s: any) => s?.accessToken,
  selectUser: (s: any) => s?.user,
  selectIsAdmin: (s: any) => Boolean(s?.isAdmin ?? (s?.user?.role === 'ADMIN' || s?.user?.role === 'MODERATOR')),
}));


vi.mock('@/components/layout/UserMenu', () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}));

vi.mock('@/components/layout/LazyHeaderParts', () => ({
  LazyMobileNav: ({ hideTrigger }: { hideTrigger?: boolean }) => (
    <>
      {!hideTrigger && <button type="button" aria-label="افتح القائمة">القائمة</button>}
      <div data-testid="mobile-nav-drawer-controller" />
    </>
  ),
  LazyUserMenu: () => <div data-testid="user-menu" />,
  LazyNotificationBell: () => <div data-testid="notification-bell" />,
  LazyMessagesLink: () => <div data-testid="messages-link" />,
}));

// NotificationBell (useMyNotifications/useUnreadNotificationCount, both
// react-query) only renders in the isAuthenticated branch — unmocked, it
// throws for lack of a QueryClientProvider the moment that branch is
// exercised. Not what this file is testing, so stub it like the others.
vi.mock('@/components/layout/NotificationBell', () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
}));

// MessagesLink reads useUnreadConversationCount() (also react-query) —
// same reasoning as NotificationBell above.
vi.mock('@/components/layout/MessagesLink', () => ({
  MessagesLink: () => <div data-testid="messages-link" />,
}));

const mockUseAuthStore = vi.mocked(useAuthStore);

function mockAuthState(isAuthenticated: boolean) {
  mockUseAuthStore.mockImplementation((selector) =>
    selector({ isAuthenticated, isHydrated: true, user: isAuthenticated ? { id: 'u1', name: 'أحمد', role: 'USER' } : null } as never),
  );
}

describe('PublicHeader', () => {
  it('shows login and register buttons when not authenticated', () => {
    mockAuthState(false);
    render(<PublicHeader />);

    expect(screen.getByText('تسجيل الدخول')).toBeInTheDocument();
    expect(screen.getByText('إنشاء حساب')).toBeInTheDocument();
    expect(screen.queryByText('نشر إعلان')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'قائمة المستخدم' })).not.toBeInTheDocument();
  });

  // PERF-BUNDLE-HEADER-01: UserMenu/NotificationBell/MessagesLink are loaded
  // lazily (next/dynamic, ssr:false) after mount, so they appear asynchronously.
  it('shows "أضف" and UserMenu when authenticated, hiding auth buttons', async () => {
    mockAuthState(true);
    render(<PublicHeader />);

    expect(screen.getByText('أضف')).toBeInTheDocument();
    expect(await screen.findByTestId('user-menu')).toBeInTheDocument();
    expect(screen.queryByText('تسجيل الدخول')).not.toBeInTheDocument();
    expect(screen.queryByText('إنشاء حساب')).not.toBeInTheDocument();
  });

  it('renders the logo linking to the home route', () => {
    mockAuthState(false);
    render(<PublicHeader />);

    const homeLink = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/');
    expect(homeLink).toBeDefined();
  });

  it('renders search icon links (desktop + mobile) and no inline search field', () => {
    mockAuthState(false);
    render(<PublicHeader />);

    const searchLinks = screen.getAllByRole('link', { name: 'بحث' });
    expect(searchLinks).toHaveLength(2);
    searchLinks.forEach((a) => expect(a).toHaveAttribute('href', '/search'));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('hides the header menu trigger when the public BottomNav owns the menu entry', () => {
    mockAuthState(false);
    render(<PublicHeader />);

    expect(screen.queryByRole('button', { name: 'افتح القائمة' })).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-nav-drawer-controller')).toBeInTheDocument();
  });

  it('keeps the header menu trigger for signed-in users because BottomNav shows their account link', async () => {
    mockAuthState(true);
    render(<PublicHeader />);

    expect(await screen.findByRole('button', { name: 'افتح القائمة' })).toBeInTheDocument();
    expect(screen.getByTestId('mobile-nav-drawer-controller')).toBeInTheDocument();
  });

  it('shows the header menu trigger on authentication pages without BottomNav', () => {
    mockAuthState(false);
    render(<PublicHeader showMenuTrigger />);

    expect(screen.getByRole('button', { name: 'افتح القائمة' })).toBeInTheDocument();
  });

  // UX-FIX: showSearch={false} is (auth)/layout.tsx's own opt-out for
  // login/register/forgot-password/reset-password — a search bar makes
  // no sense mid-auth-flow.
  it('hides the search icons when showSearch is false', () => {
    mockAuthState(false);
    render(<PublicHeader showSearch={false} />);

    expect(screen.queryByRole('link', { name: 'بحث' })).not.toBeInTheDocument();
  });
});
