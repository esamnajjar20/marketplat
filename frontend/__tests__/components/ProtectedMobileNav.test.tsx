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
import { useMyStore } from '@/hooks/queries/useStores';

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

vi.mock('@/hooks/queries/useStores', () => ({
  useMyStore: vi.fn(),
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
    (useMyStore as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { id: 'store-1', status: 'ACTIVE' },
      isSuccess: true,
    });
  });

  it('renders a closed drawer by default with aria-hidden="true"', () => {
    isMobileNavOpen = false;
    const { container } = render(<ProtectedMobileNav />);
    // getByRole excludes aria-hidden elements from the accessibility
    // tree by design, so it can never find the nav while it's closed —
    // query the DOM directly instead.
    const nav = container.querySelector('nav[aria-label="القائمة الشخصية"]');
    expect(nav).not.toBeNull();
    expect(nav?.getAttribute('aria-hidden')).toBe('true');
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

  it('renders "الإعدادات" as a disclosure group (FIX UX-16: was a flat link, now matches ProtectedSidebar\'s 8-destination group)', () => {
    // FIX (test bug, not a component bug): getByRole excludes
    // aria-hidden elements from the accessibility tree by design (see
    // this file's own first test's comment) — the drawer's <nav> is
    // aria-hidden="true" while isMobileNavOpen is false (the default),
    // so getByRole('button', ...) could never find the settings
    // toggle regardless of whether the component renders it correctly.
    // Every other test here that needs an accessible-role query on
    // drawer content sets isMobileNavOpen = true first (see 'shows a
    // backdrop when open' etc.) — this test just needed the same.
    isMobileNavOpen = true;
    render(<ProtectedMobileNav />);
    expect(screen.getByRole('button', { name: /الإعدادات/ })).toBeInTheDocument();
  });

  it('settings group opens automatically and shows all 8 sub-destinations when already on a /settings/* subpath', () => {
    // Same fix as the test above — must open the drawer before
    // getByRole can see anything inside it.
    isMobileNavOpen = true;
    mockUsePathname.mockReturnValue('/settings/security');
    render(<ProtectedMobileNav />);
    const toggle = screen.getByRole('button', { name: /الإعدادات/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('الملف الشخصي').closest('a')?.getAttribute('href')).toBe('/settings/profile');
    expect(screen.getByText('ملف البائع').closest('a')?.getAttribute('href')).toBe('/settings/seller');
    expect(screen.getByText('ملف مقدم الخدمة').closest('a')?.getAttribute('href')).toBe('/settings/service-provider');
    expect(screen.getByText('الأمان').closest('a')?.getAttribute('href')).toBe('/settings/security');
    expect(screen.getByText('الجلسات').closest('a')?.getAttribute('href')).toBe('/settings/sessions');
    expect(screen.getByText('الإشعارات').closest('a')?.getAttribute('href')).toBe('/settings/notifications');
    expect(screen.getByText('المستخدمون المحظورون').closest('a')?.getAttribute('href')).toBe('/settings/blocked-users');
    expect(screen.getByText('الأمان').closest('a')?.getAttribute('aria-current')).toBe('page');
  });

  // AUDIT-FIX (dynamic sidebar): "خدماتي"/"متجري" are fully absent for
  // non-provider/non-seller users, no CTA fallback ("أصبح مقدّم
  // خدمة"/"أصبح بائعاً"/"افتح متجرك" rows removed). /settings/seller and
  // /settings/service-provider are unchanged and still reachable
  // through the settings disclosure group.
  describe('dynamic role sections', () => {
    it('renders "خدماتي" as a disclosure group when the user is a service provider', () => {
      isMobileNavOpen = true;
      (useMyServiceProvider as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { id: 'provider-1' }, isSuccess: true,
      });
      render(<ProtectedMobileNav />);
      expect(screen.getByRole('button', { name: /خدماتي/ })).toBeInTheDocument();
    });

    it('hides "خدماتي" entirely when the user has no service-provider profile', () => {
      isMobileNavOpen = true;
      (useMyServiceProvider as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined, isSuccess: true,
      });
      render(<ProtectedMobileNav />);
      expect(screen.queryByRole('button', { name: /خدماتي/ })).not.toBeInTheDocument();
      expect(screen.queryByText('أصبح مقدّم خدمة')).not.toBeInTheDocument();
    });

    it('treats a still-loading service-provider query the same as "not yet" (section absent)', () => {
      isMobileNavOpen = true;
      (useMyServiceProvider as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined, isSuccess: false,
      });
      render(<ProtectedMobileNav />);
      expect(screen.queryByRole('button', { name: /خدماتي/ })).not.toBeInTheDocument();
    });

    it('renders "متجري" as a disclosure group when the user is a seller', () => {
      isMobileNavOpen = true;
      (useMySellerProfile as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { id: 'seller-1' }, isSuccess: true,
      });
      render(<ProtectedMobileNav />);
      expect(screen.getByRole('button', { name: /متجري/ })).toBeInTheDocument();
    });

    it('hides "متجري" and "عرض متجري" entirely when the user has no seller profile, and shows إعلاناتي\'s CTA', () => {
      isMobileNavOpen = true;
      (useMySellerProfile as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined, isSuccess: true,
      });
      (useMyStore as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined, isSuccess: false,
      });
      render(<ProtectedMobileNav />);
      expect(screen.queryByRole('button', { name: /^متجري/ })).not.toBeInTheDocument();
      expect(screen.queryByText('افتح متجرك')).not.toBeInTheDocument();
      expect(screen.queryByText('أصبح بائعاً')).not.toBeInTheDocument();
      expect(screen.queryByText('عرض متجري')).not.toBeInTheDocument();
      expect(screen.queryByText('إعلاناتي')).not.toBeInTheDocument();
      expect(screen.getByText('أنشئ حساب بائع')).toBeInTheDocument();
    });

    it('hides both sections and shows the seller-signup CTA when the user has neither role', () => {
      isMobileNavOpen = true;
      (useMySellerProfile as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined, isSuccess: true,
      });
      (useMyServiceProvider as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined, isSuccess: true,
      });
      (useMyStore as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined, isSuccess: false,
      });
      render(<ProtectedMobileNav />);
      expect(screen.queryByRole('button', { name: /خدماتي/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^متجري/ })).not.toBeInTheDocument();
      // SELLER-GATE: إعلاناتي hidden for non-sellers, CTA shown instead.
      expect(screen.queryByText('إعلاناتي')).not.toBeInTheDocument();
      expect(screen.getByText('أنشئ حساب بائع').closest('a')?.getAttribute('href')).toBe('/settings/seller');
    });

    it('hides "عرض متجري" when the store exists but is not ACTIVE', () => {
      isMobileNavOpen = true;
      (useMyStore as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { id: 'store-1', status: 'PENDING' }, isSuccess: true,
      });
      render(<ProtectedMobileNav />);
      expect(screen.getByRole('button', { name: /^متجري/ })).toBeInTheDocument();
      expect(screen.queryByText('عرض متجري')).not.toBeInTheDocument();
    });

    it('shows "عرض متجري" pointing at the public store page when ACTIVE', () => {
      isMobileNavOpen = true;
      render(<ProtectedMobileNav />);
      expect(screen.getByText('عرض متجري').closest('a')?.getAttribute('href')).toBe('/stores/store-1');
    });
  });

  describe('disclosure groups', () => {
    it('"خدماتي" is collapsed by default outside the group and expands on click', () => {
      isMobileNavOpen = true;
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
      isMobileNavOpen = true;
      mockUsePathname.mockReturnValue('/my-requests');
      render(<ProtectedMobileNav />);
      expect(screen.getByRole('button', { name: /خدماتي/ }).getAttribute('aria-expanded')).toBe(
        'true',
      );
    });

    it('"متجري" is collapsed by default outside the group and expands on click', () => {
      isMobileNavOpen = true;
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
      isMobileNavOpen = true;
      mockUsePathname.mockReturnValue('/my-store/followed');
      render(<ProtectedMobileNav />);
      expect(screen.getByRole('button', { name: /متجري/ }).getAttribute('aria-expanded')).toBe(
        'true',
      );
    });

    it('clicking a disclosure child link closes the drawer via onNavigate', () => {
      isMobileNavOpen = true;
      render(<ProtectedMobileNav />);
      fireEvent.click(screen.getByRole('button', { name: /خدماتي/ }));
      fireEvent.click(screen.getByText('طلباتي'));
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('admin link', () => {
    it('does not render the admin link for non-admins', () => {
      isMobileNavOpen = true;
      isAdmin = false;
      render(<ProtectedMobileNav />);
      expect(screen.queryByText('لوحة الإدارة')).not.toBeInTheDocument();
    });

    it('renders the admin link for admins', () => {
      isMobileNavOpen = true;
      isAdmin = true;
      render(<ProtectedMobileNav />);
      expect(screen.getByText('لوحة الإدارة').closest('a')?.getAttribute('href')).toBe(
        '/admin/dashboard',
      );
    });
  });

  describe('logout', () => {
    it('calls logout and closes the drawer on click', () => {
      isMobileNavOpen = true;
      render(<ProtectedMobileNav />);
      fireEvent.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));
      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });
});
