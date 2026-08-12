/**
 * __tests__/components/ProtectedMobileNav.test.tsx
 *
 * Previously uncovered (0%), ~403 lines. Slide-out drawer nav for the
 * authenticated section below `lg`, structurally close to
 * ProtectedSidebar (already tested) but with its own open/close wiring
 * (useUIStore), body-scroll-lock, Escape-to-close, and role-gated
 * disclosure groups (services/store) vs CTA rows.
 *
 * Coverage targets:
 *  - toggle button opens/closes the drawer (useUIStore wiring)
 *  - backdrop click and Escape key both close it
 *  - body scroll gets locked while open and restored on close
 *  - "خدماتي"/"متجري": disclosure group when the role exists, CTA link
 *    when it doesn't (gated on isSuccess && data, same as ProtectedSidebar)
 *  - disclosure groups expand by default when pathname is inside them
 *  - active link gets aria-current="page"
 *  - admin link only renders for admins
 *  - logout button calls logout + close
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProtectedMobileNav } from '@/components/layout/ProtectedMobileNav';
import { useUIStore } from '@/store/ui.store';
import { useAuthStore } from '@/store/auth.store';
import { useLogout } from '@/hooks/mutations/useAuthMutations';
import { useMySellerProfile } from '@/hooks/queries/useSellers';
import { useMyServiceProvider } from '@/hooks/queries/useServiceProviders';

const mockUsePathname = vi.fn(() => '/dashboard');
const mockToggle = vi.fn();
const mockClose = vi.fn();
const mockLogout = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

let isMobileNavOpen = false;

vi.mock('@/store/ui.store', () => ({
  useUIStore: (selector: (s: unknown) => unknown) =>
    selector({
      isMobileNavOpen,
      toggleMobileNav: mockToggle,
      closeMobileNav: mockClose,
    }),
  selectIsMobileNavOpen: (s: { isMobileNavOpen: boolean }) => s.isMobileNavOpen,
}));

let isAdmin = false;

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (s: { isAdmin: boolean }) => unknown) => selector({ isAdmin }),
  selectIsAdmin: (s: { isAdmin: boolean }) => s.isAdmin,
}));

vi.mock('@/hooks/mutations/useAuthMutations', () => ({
  useLogout: () => ({ mutate: mockLogout, isPending: false }),
}));

vi.mock('@/hooks/queries/useSellers', () => ({
  useMySellerProfile: vi.fn(),
}));

vi.mock('@/hooks/queries/useServiceProviders', () => ({
  useMyServiceProvider: vi.fn(),
}));

describe('ProtectedMobileNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMobileNavOpen = false;
    isAdmin = false;
    mockUsePathname.mockReturnValue('/dashboard');
    document.body.style.overflow = '';
    (useMySellerProfile as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { id: 'seller-1' },
      isSuccess: true,
    });
    (useMyServiceProvider as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { id: 'provider-1' },
      isSuccess: true,
    });
  });

  it('renders a closed drawer by default with aria-hidden="true"', () => {
    isMobileNavOpen = false;
    render(<ProtectedMobileNav />);
    const nav = screen.getByRole('navigation', { name: 'القائمة الشخصية' });
    expect(nav.getAttribute('aria-hidden')).toBe('true');
  });

  it('toggle button calls toggleMobileNav on click', () => {
    render(<ProtectedMobileNav />);
    fireEvent.click(screen.getByLabelText('افتح القائمة'));
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it('shows a backdrop when open, and clicking it closes the drawer', () => {
    isMobileNavOpen = true;
    const { container } = render(<ProtectedMobileNav />);
    const backdrop = container.querySelector('.fixed.inset-0.z-40');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('does not render a backdrop when closed', () => {
    isMobileNavOpen = false;
    const { container } = render(<ProtectedMobileNav />);
    expect(container.querySelector('.fixed.inset-0.z-40')).toBeNull();
  });

  it('pressing Escape closes the drawer while open', () => {
    isMobileNavOpen = true;
    render(<ProtectedMobileNav />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('does not respond to Escape while closed', () => {
    isMobileNavOpen = false;
    render(<ProtectedMobileNav />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('locks body scroll while open and restores it when closed', () => {
    isMobileNavOpen = true;
    const { unmount } = render(<ProtectedMobileNav />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('renders the browse links section', () => {
    render(<ProtectedMobileNav />);
    expect(screen.getByText('الرئيسية').closest('a')?.getAttribute('href')).toBe('/');
    expect(screen.getByText('البحث').closest('a')).not.toBeNull();
    expect(screen.getByText('المتاجر').closest('a')).not.toBeNull();
    expect(screen.getByText('الخدمات').closest('a')).not.toBeNull();
    expect(screen.getByText('مقدمو الخدمة').closest('a')).not.toBeNull();
  });

  it('renders the core account links', () => {
    render(<ProtectedMobileNav />);
    expect(screen.getByText('لوحة التحكم')).toBeInTheDocument();
    expect(screen.getByText('إعلاناتي')).toBeInTheDocument();
    expect(screen.getByText('المفضلة')).toBeInTheDocument();
    expect(screen.getByText('الرسائل')).toBeInTheDocument();
    expect(screen.getByText('البحثات المحفوظة')).toBeInTheDocument();
    expect(screen.getByText('نشاطي')).toBeInTheDocument();
    expect(screen.getByText('بلاغاتي')).toBeInTheDocument();
    expect(screen.getByText('الإعدادات')).toBeInTheDocument();
  });

  it('sets aria-current="page" on the active link', () => {
    mockUsePathname.mockReturnValue('/my-ads');
    render(<ProtectedMobileNav />);
    expect(screen.getByText('إعلاناتي').closest('a')?.getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('المفضلة').closest('a')?.getAttribute('aria-current')).toBeNull();
  });

  it('settings link uses activeMatch — aria-current set for any /settings/* subpath', () => {
    mockUsePathname.mockReturnValue('/settings/security');
    render(<ProtectedMobileNav />);
    expect(screen.getByText('الإعدادات').closest('a')?.getAttribute('aria-current')).toBe('page');
  });

  describe('role-gated groups', () => {
    it('renders "خدماتي" as a disclosure group when the user is a service provider', () => {
      (useMyServiceProvider as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { id: 'provider-1' }, isSuccess: true,
      });
      render(<ProtectedMobileNav />);
      expect(screen.getByRole('button', { name: /خدماتي/ })).toBeInTheDocument();
      expect(screen.queryByText('أصبح مقدّم خدمة')).not.toBeInTheDocument();
    });

    it('renders "أصبح مقدّم خدمة" CTA when the user has no service-provider profile', () => {
      (useMyServiceProvider as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined, isSuccess: true,
      });
      render(<ProtectedMobileNav />);
      expect(screen.getByText('أصبح مقدّم خدمة').closest('a')?.getAttribute('href')).toBe(
        '/settings/service-provider',
      );
      expect(screen.queryByRole('button', { name: /خدماتي/ })).not.toBeInTheDocument();
    });

    it('treats a still-loading service-provider query the same as "not yet" (CTA, not group)', () => {
      (useMyServiceProvider as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined, isSuccess: false,
      });
      render(<ProtectedMobileNav />);
      expect(screen.getByText('أصبح مقدّم خدمة')).toBeInTheDocument();
    });

    it('renders "متجري" as a disclosure group when the user is a seller', () => {
      (useMySellerProfile as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { id: 'seller-1' }, isSuccess: true,
      });
      render(<ProtectedMobileNav />);
      expect(screen.getByRole('button', { name: /متجري/ })).toBeInTheDocument();
      expect(screen.queryByText('افتح متجرك')).not.toBeInTheDocument();
    });

    it('renders "افتح متجرك" CTA when the user has no store yet', () => {
      (useMySellerProfile as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined, isSuccess: true,
      });
      render(<ProtectedMobileNav />);
      expect(screen.getByText('افتح متجرك').closest('a')?.getAttribute('href')).toBe('/my-store');
      expect(screen.queryByRole('button', { name: /متجري/ })).not.toBeInTheDocument();
    });
  });

  describe('disclosure groups', () => {
    it('"خدماتي" is collapsed by default outside the group and expands on click', () => {
      render(<ProtectedMobileNav />);
      const toggle = screen.getByRole('button', { name: /خدماتي/ });
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByText('الطلبات الواردة').closest('a')?.getAttribute('href')).toBe(
        '/my-services/requests',
      );
      expect(screen.getByText('مواعيدي').closest('a')?.getAttribute('href')).toBe(
        '/my-services/appointments',
      );
      expect(screen.getByText('طلباتي').closest('a')?.getAttribute('href')).toBe('/my-requests');
    });

    it('"خدماتي" is expanded by default when pathname is inside the group', () => {
      mockUsePathname.mockReturnValue('/my-requests');
      render(<ProtectedMobileNav />);
      expect(screen.getByRole('button', { name: /خدماتي/ }).getAttribute('aria-expanded')).toBe(
        'true',
      );
    });

    it('"متجري" is collapsed by default outside the group and expands on click', () => {
      render(<ProtectedMobileNav />);
      const toggle = screen.getByRole('button', { name: /متجري/ });
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(toggle);
      expect(screen.getByText('منتجاتي').closest('a')?.getAttribute('href')).toBe(
        '/my-store/products',
      );
      expect(screen.getByText('المتاجر المتابَعة').closest('a')?.getAttribute('href')).toBe(
        '/my-store/followed',
      );
    });

    it('"متجري" is expanded by default when pathname is inside the group', () => {
      mockUsePathname.mockReturnValue('/my-store/followed');
      render(<ProtectedMobileNav />);
      expect(screen.getByRole('button', { name: /متجري/ }).getAttribute('aria-expanded')).toBe(
        'true',
      );
    });

    it('clicking a disclosure child link closes the drawer via onNavigate', () => {
      render(<ProtectedMobileNav />);
      fireEvent.click(screen.getByRole('button', { name: /خدماتي/ }));
      fireEvent.click(screen.getByText('طلباتي'));
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('admin link', () => {
    it('does not render the admin link for non-admins', () => {
      isAdmin = false;
      render(<ProtectedMobileNav />);
      expect(screen.queryByText('لوحة الإدارة')).not.toBeInTheDocument();
    });

    it('renders the admin link for admins', () => {
      isAdmin = true;
      render(<ProtectedMobileNav />);
      expect(screen.getByText('لوحة الإدارة').closest('a')?.getAttribute('href')).toBe(
        '/admin/dashboard',
      );
    });
  });

  describe('logout', () => {
    it('calls logout and closes the drawer on click', () => {
      render(<ProtectedMobileNav />);
      fireEvent.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));
      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });
});
