/**
 * __tests__/components/BottomNav.test.tsx
 *
 * AUDIT-FIX ("Bottom Nav بيدفن 3 من 4 أقسام رئيسية"): pins down that
 * "البحث" was replaced with "استكشاف" (opens ExploreSheet instead of
 * navigating directly), that the sheet itself isn't rendered until
 * opened, and that "استكشاف" reads as active on any of the
 * destinations reachable through it — not just /search.
 *
 * No prior test file existed for BottomNav itself; this also covers
 * its pre-existing guest/authenticated home/messages links so the
 * whole component has baseline coverage, not just the new tab.
 *
 * CREATE-SHEET FIX: the center button no longer swaps between
 * /ads/create and /settings/seller based on isSeller — it opens
 * CreateSheet with all create destinations (four as of
 * FEAT-CREATE-BROADCAST-01), and no longer queries useIsSeller at all
 * (see BottomNav's own doc comment), so the old "center create button"
 * describe block below is replaced with coverage of the sheet instead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { BottomNav } from '@/components/layout/BottomNav';
import { useAuthStore } from '@/store/auth.store';

const mockUsePathname = vi.fn(() => '/');
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

describe('BottomNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/');
    useAuthStore.getState().logout();
  });

  it('renders الرئيسية, استكشاف, الرسائل, and the menu button', () => {
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: /الرئيسية/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /استكشاف/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /الرسائل/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /القائمة/ })).toBeInTheDocument();
  });

  it('does not render a plain "البحث" link anymore', () => {
    render(<BottomNav />);
    expect(screen.queryByRole('link', { name: 'البحث' })).not.toBeInTheDocument();
  });

  it('does not render ExploreSheet contents until "استكشاف" is tapped', () => {
    render(<BottomNav />);
    expect(screen.queryByText('بحث شامل')).not.toBeInTheDocument();
  });

  it('opens ExploreSheet with all five destinations when "استكشاف" is tapped', async () => {
    const user = setupUser();
    render(<BottomNav />);
    await user.click(screen.getByRole('button', { name: /استكشاف/ }));

    expect(screen.getByRole('link', { name: /بحث شامل/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /الإعلانات/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /المنتجات/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /الخدمات/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /المتاجر/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /مقدمو الخدمة/ })).toBeInTheDocument();
  });

  it('marks "استكشاف" active when already on /stores, even without opening the sheet', () => {
    mockUsePathname.mockReturnValue('/stores');
    render(<BottomNav />);
    expect(screen.getByRole('button', { name: /استكشاف/ }).getAttribute('aria-current')).toBe('page');
  });

  it('marks "استكشاف" active when already on /service-providers', () => {
    mockUsePathname.mockReturnValue('/service-providers');
    render(<BottomNav />);
    expect(screen.getByRole('button', { name: /استكشاف/ }).getAttribute('aria-current')).toBe('page');
  });

  it('does not mark "استكشاف" active on unrelated pages', () => {
    mockUsePathname.mockReturnValue('/messages');
    render(<BottomNav />);
    expect(screen.getByRole('button', { name: /استكشاف/ }).getAttribute('aria-current')).toBeNull();
  });

  describe('center create button', () => {
    it('renders an "أضف" button, not a direct link', () => {
      render(<BottomNav />);
      expect(screen.getByRole('button', { name: 'أضف' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'أضف' })).not.toBeInTheDocument();
    });

    it('does not render CreateSheet contents until "أضف" is tapped', () => {
      render(<BottomNav />);
      expect(screen.queryByText('إعلان جديد')).not.toBeInTheDocument();
    });

    it('opens CreateSheet with all four create destinations when "أضف" is tapped', async () => {
      const user = setupUser();
      render(<BottomNav />);
      await user.click(screen.getByRole('button', { name: 'أضف' }));

      expect(screen.getByRole('link', { name: /إعلان جديد/ })).toHaveAttribute('href', '/ads/create');
      expect(screen.getByRole('link', { name: /منتج جديد/ })).toHaveAttribute('href', '/my-store/products/new');
      expect(screen.getByRole('link', { name: /خدمة جديدة/ })).toHaveAttribute('href', '/my-services/new');
      // Open Requests marketplace — unified request/need create entry.
      expect(screen.getByRole('link', { name: /طلب \/ احتياج|طلب/ })).toHaveAttribute('href', '/requests/new');
    });
  });

  describe('account tab', () => {
    it('shows القائمة for guests', () => {
      render(<BottomNav />);
      expect(screen.getByRole('button', { name: /القائمة/ })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /حسابي/ })).not.toBeInTheDocument();
    });

    it('links حسابي to the user profile when authenticated', () => {
      useAuthStore.setState({
        user: {
          id: 'user-1',
          name: 'Test',
          email: 't@example.com',
          role: 'USER',
          isEmailVerified: true,
        } as never,
        accessToken: 'tok',
        isAuthenticated: true,
      } as never);
      render(<BottomNav />);
      const link = screen.getByRole('link', { name: /حسابي/ });
      expect(link).toHaveAttribute('href', '/profile/user-1');
      expect(screen.queryByRole('button', { name: /القائمة/ })).not.toBeInTheDocument();
    });
  });

});
