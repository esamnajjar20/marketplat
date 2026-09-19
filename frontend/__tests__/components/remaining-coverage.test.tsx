/**
 * Remaining low-coverage FE components (thin wrappers + shared chrome).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { Mail } from 'lucide-react';

import { AuthDivider } from '@/components/auth/AuthDivider';
import { AuthField } from '@/components/auth/AuthField';
import { CreateProductCategoryButton } from '@/components/admin/CreateProductCategoryButton';
import { CreateServiceCategoryButton } from '@/components/admin/CreateServiceCategoryButton';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { BulkActionBar } from '@/components/shared/admin/BulkActionBar';
import { EditPageHeader } from '@/components/shared/EditPageHeader';
import { PageTransition } from '@/components/shared/PageTransition';
import { PresenceHeartbeat } from '@/components/shared/PresenceHeartbeat';
import { WebVitals } from '@/components/shared/WebVitals';
import { TableSkeleton } from '@/components/shared/skeletons/TableSkeleton';
import { AdDetailsSkeleton } from '@/components/shared/skeletons/AdDetailsSkeleton';
import { ProfileSkeleton } from '@/components/shared/skeletons/ProfileSkeleton';
import { MyStoreAnalytics } from '@/components/stores/MyStoreAnalytics';
import { MyServiceProviderAnalytics } from '@/components/services/MyServiceProviderAnalytics';
import { ProfileTabsSection } from '@/components/profile/ProfileTabsSection';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/test',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'system',
    setTheme: vi.fn(),
    resolvedTheme: 'light',
  }),
}));

vi.mock('next/web-vitals', () => ({
  useReportWebVitals: (cb: (m: unknown) => void) => {
    cb({ name: 'LCP', value: 1200, rating: 'good', id: 'v1' });
  },
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/api/users.api', () => ({
  usersApi: { touchPresence: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn((sel: any) =>
    typeof sel === 'function'
      ? sel({ user: { id: 'u1' }, isAuthenticated: true })
      : true,
  ),
  selectUser: (s: any) => s.user,
  selectIsAuthenticated: (s: any) => s.isAuthenticated,
}));

// PresenceHeartbeat skips its beat while no CSRF token is available.
vi.mock('@/lib/csrf', () => ({ getCsrfToken: vi.fn(() => 'csrf-token') }));

vi.mock('@/hooks/mutations/useProductCategoryMutations', () => ({
  useCreateProductCategory: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/mutations/useServiceCategoryMutations', () => ({
  useCreateServiceCategory: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/queries/useStores', () => ({
  useMyStoreAnalytics: vi.fn(),
}));

vi.mock('@/hooks/queries/useServiceProviders', () => ({
  useMyServiceProviderAnalytics: vi.fn(),
}));

vi.mock('@/components/profile/PublicProfileAds', () => ({
  PublicProfileAds: () => <div>ads-grid</div>,
}));

vi.mock('@/components/sellers/SellerRatingsList', () => ({
  SellerRatingsList: () => <div>ratings</div>,
}));

vi.mock('@/components/services/ServiceReviewsList', () => ({
  ServiceReviewsList: () => <div>reviews</div>,
}));

vi.mock('@/components/shared/feedback/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/shared/ui/SafeImage', () => ({
  SafeImage: () => <span />,
}));

vi.mock('next/image', () => ({
  default: (props: { alt?: string }) => <img alt={props.alt ?? ''} />,
}));

import { useMyStoreAnalytics } from '@/hooks/queries/useStores';
import { useMyServiceProviderAnalytics } from '@/hooks/queries/useServiceProviders';
import { usersApi } from '@/api/users.api';
import { track } from '@/lib/analytics';

describe('AuthDivider / AuthField', () => {
  it('renders the أو separator', () => {
    render(<AuthDivider />);
    expect(screen.getByText('أو')).toBeInTheDocument();
  });

  it('renders label, wires error alert, and clones child a11y props', () => {
    render(
      <AuthField label="البريد" htmlFor="email" icon={Mail} error="مطلوب" required>
        <input id="email" />
      </AuthField>,
    );
    expect(screen.getByText('البريد')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('مطلوب');
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('Create category thin wrappers', () => {
  it('CreateProductCategoryButton shows product label', () => {
    render(<CreateProductCategoryButton />);
    expect(screen.getByRole('button', { name: /فئة منتج جديدة/ })).toBeInTheDocument();
  });

  it('CreateServiceCategoryButton shows service label', () => {
    render(<CreateServiceCategoryButton />);
    expect(screen.getByRole('button', { name: /فئة خدمة جديدة/ })).toBeInTheDocument();
  });
});

describe('ThemeToggle', () => {
  it('exposes theme options', async () => {
    const user = setupUser();
    render(<ThemeToggle />);
    await user.click(screen.getByLabelText('تبديل المظهر'));
    expect(screen.getByText('فاتح')).toBeInTheDocument();
    expect(screen.getByText('داكن')).toBeInTheDocument();
    expect(screen.getByText('حسب النظام')).toBeInTheDocument();
  });
});

describe('PublicFooter', () => {
  it('renders Arabic sections and tagline', () => {
    render(<PublicFooter />);
    expect(screen.getByText(/المكان الموثوق للبيع والشراء/)).toBeInTheDocument();
    expect(screen.getByText('الشركة')).toBeInTheDocument();
    expect(screen.getByText('الدعم')).toBeInTheDocument();
    expect(screen.getByText('قانوني')).toBeInTheDocument();
  });
});

describe('BulkActionBar', () => {
  it('renders null when nothing is selected', () => {
    const { container } = render(
      <BulkActionBar selectedCount={0} onClear={vi.fn()}>
        <button type="button">فعل</button>
      </BulkActionBar>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows count and clears selection', async () => {
    const onClear = vi.fn();
    const user = setupUser();
    render(
      <BulkActionBar selectedCount={3} onClear={onClear}>
        <button type="button">حل</button>
      </BulkActionBar>,
    );
    expect(screen.getByText('3 محدد')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /إلغاء التحديد/ }));
    expect(onClear).toHaveBeenCalled();
  });
});

describe('EditPageHeader / PageTransition / skeletons', () => {
  it('EditPageHeader links back with title', () => {
    render(<EditPageHeader backTo="/my-ads" backLabel="الإعلانات" title="تعديل الإعلان" />);
    expect(screen.getByRole('heading', { name: 'تعديل الإعلان' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /الإعلانات/ })).toHaveAttribute('href', '/my-ads');
  });

  it('PageTransition renders children', () => {
    render(
      <PageTransition>
        <p>محتوى الصفحة</p>
      </PageTransition>,
    );
    expect(screen.getByText('محتوى الصفحة')).toBeInTheDocument();
  });

  it('skeletons mount without throwing', () => {
    const { container: t } = render(<TableSkeleton columns={4} />);
    const { container: a } = render(<AdDetailsSkeleton />);
    const { container: p } = render(<ProfileSkeleton />);
    expect(t.firstChild).toBeTruthy();
    expect(a.firstChild).toBeTruthy();
    expect(p.firstChild).toBeTruthy();
  });
});

describe('PresenceHeartbeat / WebVitals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('PresenceHeartbeat pings when authenticated', () => {
    render(<PresenceHeartbeat />);
    expect(usersApi.touchPresence).toHaveBeenCalled();
  });

  it('PresenceHeartbeat skips the ping while no CSRF token is available', async () => {
    const { getCsrfToken } = await import('@/lib/csrf');
    vi.mocked(getCsrfToken).mockReturnValueOnce(null);
    render(<PresenceHeartbeat />);
    expect(usersApi.touchPresence).not.toHaveBeenCalled();
  });

  it('WebVitals tracks a sample metric', () => {
    render(<WebVitals />);
    expect(track).toHaveBeenCalledWith(
      'PAGE_VIEW',
      expect.objectContaining({ webVital: 'LCP' }),
    );
  });
});

describe('MyStoreAnalytics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows 404 empty state', () => {
    vi.mocked(useMyStoreAnalytics).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { statusCode: 404 },
      refetch: vi.fn(),
    } as never);
    render(<MyStoreAnalytics />);
    expect(screen.getByText('لا يوجد متجر بعد')).toBeInTheDocument();
  });

  it('renders stat cards from analytics payload', () => {
    vi.mocked(useMyStoreAnalytics).mockReturnValue({
      data: {
        views: 10,
        followers: 2,
        newFollowers30d: 1,
        activeProducts: 3,
        activePromotions: 0,
        promotionUses: 0,
        topProducts: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<MyStoreAnalytics />);
    expect(screen.getByText('مشاهدات المتجر')).toBeInTheDocument();
    expect(screen.getByText('لا توجد بيانات مشاهدات بعد.')).toBeInTheDocument();
  });
});

describe('MyServiceProviderAnalytics', () => {
  it('shows error retry path', () => {
    vi.mocked(useMyServiceProviderAnalytics).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { statusCode: 500 },
      refetch: vi.fn(),
    } as never);
    render(<MyServiceProviderAnalytics />);
    // Component has similar error UI — match common Arabic error or retry
    expect(
      screen.getByText('تعذّر تحميل إحصائيات مقدم الخدمة. يرجى المحاولة مرة أخرى.'),
    ).toBeTruthy();
  });
});

describe('ProfileTabsSection', () => {
  it('shows ads tab for a plain user', () => {
    const user = {
      id: 'u1',
      name: 'مستخدم',
      sellerProfile: null,
    };
    render(<ProfileTabsSection user={user as any} />);
    expect(screen.getByRole('tab', { name: 'الإعلانات' })).toBeInTheDocument();
  });

  it('includes store and services tabs when present', () => {
    const user = {
      id: 'u1',
      name: 'بائع',
      sellerProfile: {
        totalRatings: 0,
        _count: { serviceReviews: 0 },
        storeDetails: {
          id: 's1',
          name: 'متجر',
          city: 'غزة',
          plan: 'FREE',
          logoUrl: null,
          coverImageUrl: null,
          _count: { products: 1, followers: 0 },
        },
        serviceProviderDetails: {
          id: 'p1',
          businessName: 'خدمات',
          availabilityStatus: 'AVAILABLE',
          serviceAreaCities: [],
          logoUrl: null,
        },
      },
    };
    render(<ProfileTabsSection user={user as any} />);
    expect(screen.getByRole('tab', { name: 'المتجر' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'الخدمات' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'نظرة عامة' })).toBeInTheDocument();
  });
});
