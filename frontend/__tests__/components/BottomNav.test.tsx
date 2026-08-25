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
 * its pre-existing seller/guest + button swap and home/messages links
 * so the whole component has baseline coverage, not just the new tab.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { BottomNav } from '@/components/layout/BottomNav';
import { useAuthStore } from '@/store/auth.store';
import { useIsSeller } from '@/hooks/queries/useSellers';

vi.mock('@/hooks/queries/useSellers', () => ({
  useIsSeller: vi.fn(() => ({ isSeller: false, isLoaded: true })),
}));

const mockUsePathname = vi.fn(() => '/');
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

describe('BottomNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/');
    useAuthStore.getState().logout();
    vi.mocked(useIsSeller).mockReturnValue({ isSeller: false, isLoaded: true });
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
    // Label text sits in a sibling <span>, not inside the <Link> (the
    // link only wraps the Plus icon). Walk up to the shared parent and
    // read the href from the <a> there.
    function centerCreateHref() {
      const label = screen.getByText(/نشر إعلان|أنشئ حساب بائع/);
      return label.parentElement?.querySelector('a')?.getAttribute('href');
    }

    it('links to /ads/create for a seller', () => {
      vi.mocked(useIsSeller).mockReturnValue({ isSeller: true, isLoaded: true });
      useAuthStore.getState().setAuth({ id: 'u1', name: 'أحمد', email: 'a@a.com', role: 'USER' }, { accessToken: 't' });
      render(<BottomNav />);
      expect(centerCreateHref()).toBe('/ads/create');
    });

    it('links to seller signup for an authenticated non-seller', () => {
      vi.mocked(useIsSeller).mockReturnValue({ isSeller: false, isLoaded: true });
      useAuthStore.getState().setAuth({ id: 'u1', name: 'أحمد', email: 'a@a.com', role: 'USER' }, { accessToken: 't' });
      render(<BottomNav />);
      expect(centerCreateHref()).toBe('/settings/seller');
    });
  });
});
