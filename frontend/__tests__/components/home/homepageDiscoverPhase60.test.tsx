import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeDiscoverHero } from '@/components/home/HomeDiscoverHero';

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean; isHydrated: boolean }) => unknown) =>
    selector({ isAuthenticated: false, isHydrated: true }),
  selectIsAuthenticated: (state: { isAuthenticated: boolean }) => state.isAuthenticated,
  selectIsHydrated: (state: { isHydrated: boolean }) => state.isHydrated,
}));
vi.mock('@/components/search/SearchBox', () => ({ SearchBox: () => <div data-testid="home-search" /> }));
vi.mock('@/components/home/WelcomeBar', () => ({ WelcomeBar: () => <div data-testid="welcome-bar" /> }));

describe('homepage discovery hero — phase 60', () => {
  it('keeps search first and exposes four marketplace shortcuts directly below it', () => {
    render(<HomeDiscoverHero />);
    expect(screen.getByTestId('home-search')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'استكشف حسب النوع' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'إعلانات' })).toHaveAttribute('href', '/ads');
    expect(screen.getByRole('link', { name: 'منتجات' })).toHaveAttribute('href', '/products');
    expect(screen.getByRole('link', { name: 'خدمات' })).toHaveAttribute('href', '/services');
    expect(screen.getByRole('link', { name: 'متاجر' })).toHaveAttribute('href', '/stores');
    expect(screen.getByText('السوق المحلي — ابحث، قارن، واكتشف')).toBeInTheDocument();
  });
});
