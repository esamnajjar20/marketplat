/**
 * __tests__/components/PublicHeader.test.tsx
 *
 * PublicHeader renders on every public page (home, search, category,
 * ad detail) and had zero coverage. Focus: the isAuthenticated branch
 * (login/register buttons vs. "نشر إعلان" + UserMenu), since that's
 * the component's only real conditional logic — everything else is
 * static markup delegated to child components (Logo, SearchBar,
 * UserMenu, MobileNav), which are mocked here since each either has
 * its own dedicated test file or is trivial presentational markup.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
}));

vi.mock('@/components/layout/SearchBar', () => ({
  SearchBar: () => <div data-testid="search-bar" />,
}));

vi.mock('@/components/layout/UserMenu', () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}));

vi.mock('@/components/layout/MobileNav', () => ({
  MobileNav: () => <div data-testid="mobile-nav" />,
}));

const mockUseAuthStore = vi.mocked(useAuthStore);

function mockAuthState(isAuthenticated: boolean) {
  mockUseAuthStore.mockImplementation((selector) =>
    selector({ isAuthenticated } as never),
  );
}

describe('PublicHeader', () => {
  it('shows login and register buttons when not authenticated', () => {
    mockAuthState(false);
    render(<PublicHeader />);

    expect(screen.getByText('تسجيل الدخول')).toBeInTheDocument();
    expect(screen.getByText('إنشاء حساب')).toBeInTheDocument();
    expect(screen.queryByText('نشر إعلان')).not.toBeInTheDocument();
    expect(screen.queryByTestId('user-menu')).not.toBeInTheDocument();
  });

  it('shows "نشر إعلان" and UserMenu when authenticated, hiding auth buttons', () => {
    mockAuthState(true);
    render(<PublicHeader />);

    expect(screen.getByText('نشر إعلان')).toBeInTheDocument();
    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
    expect(screen.queryByText('تسجيل الدخول')).not.toBeInTheDocument();
    expect(screen.queryByText('إنشاء حساب')).not.toBeInTheDocument();
  });

  it('renders the logo linking to the home route', () => {
    mockAuthState(false);
    render(<PublicHeader />);

    const homeLink = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/');
    expect(homeLink).toBeDefined();
  });

  it('renders both a desktop and a mobile search bar', () => {
    mockAuthState(false);
    render(<PublicHeader />);

    // One SearchBar for md+ screens, one for the mobile row below the header.
    expect(screen.getAllByTestId('search-bar')).toHaveLength(2);
  });

  it('renders the mobile nav trigger', () => {
    mockAuthState(false);
    render(<PublicHeader />);

    expect(screen.getByTestId('mobile-nav')).toBeInTheDocument();
  });
});
