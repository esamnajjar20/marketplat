/**
 * __tests__/components/AdDetail.test.tsx
 *
 * (coverage gap identified in the audit): AdDetail.tsx
 * had zero test coverage despite being one of the two most important
 * components in the product (ad listing page + this detail page).
 * Covers: image gallery navigation, the favorite toggle's optimistic
 * update + rollback, the auth-gated favorite action, and status/
 * condition/featured badge rendering.
 *
 * the report button is now the real ReportAdButton
 * component (its own dialog + useReportAd mutation, covered by
 * ReportAdButton.test.tsx). Here we only assert that AdDetail renders
 * it and hands it the right ad id — the button's own click/dialog/
 * submit behavior is out of scope for this file.
 */
import type { ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdDetail } from '@/components/ads/AdDetail';
import { useToggleFavorite } from '@/hooks/mutations/useFavoriteMutations';
import { useAuthStore } from '@/store/auth.store';
import { toast } from 'sonner';
import { formatPrice } from '@/lib/formatters';
import { queryKeys } from '@/lib/queryKeys';
import type { Ad } from '@/types/ad.types';

vi.mock('@/hooks/mutations/useFavoriteMutations', () => ({
  useToggleFavorite: vi.fn(),
}));

// AdDetail resolves the category link via useCategories() (react-query).
// Mock it directly so we don't need real network/cache behavior here —
// AdDetail's own category-href logic isn't what this file is testing.
vi.mock('@/hooks/queries/useCategories', () => ({
  useCategories: vi.fn(() => ({ data: [] })),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
  selectUser: (s: { user: unknown }) => s.user,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// SellerCard has its own responsibilities (contact button, avatar,
// join date) unrelated to AdDetail's own logic under test here.
vi.mock('@/components/ads/SellerCard', () => ({
  SellerCard: ({ seller }: { seller: { name: string } }) => <div>SellerCard: {seller.name}</div>,
}));

// ReportAdButton has its own dialog/mutation logic, covered separately
// in ReportAdButton.test.tsx — here we only need to see which ad id
// AdDetail hands it.
vi.mock('@/components/ads/ReportAdButton', () => ({
  ReportAdButton: ({ adId }: { adId: string }) => <div>ReportAdButton: {adId}</div>,
}));

vi.mock('@/components/ads/StickyContactBar', () => ({
  StickyContactBar: () => null,
}));

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  };
});

const mockToggleMutate = vi.fn();

const baseAd: Ad = {
  id: 'ad-12345678',
  title: 'آيفون 14 برو للبيع',
  description: 'جهاز بحالة ممتازة',
  price: '3500',
  isNegotiable: false,
  condition: 'USED',
  city: 'غزة',
  images: ['https://res.cloudinary.com/demo/image/upload/a.jpg', 'https://res.cloudinary.com/demo/image/upload/b.jpg'],
  status: 'ACTIVE',
  views: 42,
  isFeatured: false,
  isPinned: false,
  userId: 'user-1',
  sellerProfileId: 'sp-1',
  categoryId: 'cat-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  user: { id: 'user-1', name: 'أحمد', avatarUrl: null, city: 'غزة' },
  category: { id: 'cat-1', name: 'Electronics', nameAr: 'إلكترونيات' },
};

function renderWithClient(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
  // Wrap rerender so callers can pass just the component (as before) and
  // still keep it inside the same QueryClientProvider — a bare
  // rerender(<Component />) replaces the whole tree RTL rendered,
  // including the provider from the initial render() call above.
  return {
    ...result,
    qc,
    rerender: (nextUi: ReactElement) =>
      result.rerender(<QueryClientProvider client={qc}>{nextUi}</QueryClientProvider>),
  };
}

function mockAuth(isAuthenticated: boolean) {
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: { isAuthenticated: boolean; user: { id: string } | null }) => unknown) =>
      selector({ isAuthenticated, user: isAuthenticated ? { id: 'viewer-1' } : null }),
  );
}

describe('AdDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useToggleFavorite as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: mockToggleMutate });
    mockAuth(true);
  });

  describe('basic rendering', () => {
    it('renders the title, price, city, views, and category', () => {
      renderWithClient(<AdDetail ad={baseAd} />);

      expect(screen.getByText('آيفون 14 برو للبيع')).toBeInTheDocument();
      // Price and city render twice on purpose (mobile block + desktop
      // sticky panel) — use getAllByText so either layout counts.
      expect(screen.getAllByText(formatPrice(baseAd.price), { exact: false }).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('غزة').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/42/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('إلكترونيات').length).toBeGreaterThanOrEqual(1);
    });

    it('shows "قابل للتفاوض" only when isNegotiable is true', () => {
      const { rerender } = renderWithClient(<AdDetail ad={baseAd} />);
      expect(screen.queryByText('قابل للتفاوض')).not.toBeInTheDocument();

      rerender(<AdDetail ad={{ ...baseAd, isNegotiable: true }} />);
      expect(screen.getAllByText('قابل للتفاوض')[0]).toBeInTheDocument();
    });

    it('shows the condition label', () => {
      renderWithClient(<AdDetail ad={baseAd} />);
      expect(screen.getAllByText('مستعمل')[0]).toBeInTheDocument();
    });

    it('shows a status badge only when the ad is not ACTIVE', () => {
      const { rerender } = renderWithClient(<AdDetail ad={baseAd} />);
      expect(screen.queryByText('تم البيع')).not.toBeInTheDocument();

      rerender(<AdDetail ad={{ ...baseAd, status: 'SOLD' }} />);
      expect(screen.getByText('تم البيع')).toBeInTheDocument();
    });

    it('shows a "مميز" badge only when isFeatured is true', () => {
      const { rerender } = renderWithClient(<AdDetail ad={baseAd} />);
      expect(screen.queryByText('مميز')).not.toBeInTheDocument();

      rerender(<AdDetail ad={{ ...baseAd, isFeatured: true }} />);
      expect(screen.getByText('مميز')).toBeInTheDocument();
    });

    it('renders SellerCard with the ad author', () => {
      renderWithClient(<AdDetail ad={baseAd} />);
      // P1 FIX (layout audit §2): SellerCard now renders twice in the
      // DOM — once inline after price (lg:hidden, for mobile) and once
      // in the desktop-only right column (hidden lg:block) — so the
      // CTA sits high on the page without a JS breakpoint check. Both
      // copies carry the same content; jsdom has no viewport, so both
      // are present regardless of the CSS that hides one at runtime.
      expect(screen.getAllByText('SellerCard: أحمد').length).toBe(2);
    });

    it('renders the last 8 characters of the ad id as a reference number', () => {
      renderWithClient(<AdDetail ad={baseAd} />);
      expect(screen.getByText(baseAd.id.slice(-8))).toBeInTheDocument();
    });
  });

  describe('image gallery navigation', () => {
    it('shows navigation arrows and a counter only when there is more than one image', () => {
      const { rerender } = renderWithClient(<AdDetail ad={{ ...baseAd, images: [baseAd.images[0]] }} />);
      expect(screen.queryByLabelText('الصورة التالية')).not.toBeInTheDocument();

      rerender(<AdDetail ad={baseAd} />);
      expect(screen.getByLabelText('الصورة التالية')).toBeInTheDocument();
      expect(screen.getByText('1 / 2')).toBeInTheDocument();
    });

    it('disables the previous button on the first image', () => {
      renderWithClient(<AdDetail ad={baseAd} />);
      expect(screen.getByLabelText('الصورة السابقة')).toBeDisabled();
    });

    it('advances to the next image and updates the counter', async () => {
      const user = setupUser();
      renderWithClient(<AdDetail ad={baseAd} />);

      await user.click(screen.getByLabelText('الصورة التالية'));

      expect(screen.getByText('2 / 2')).toBeInTheDocument();
      expect(screen.getByLabelText('الصورة التالية')).toBeDisabled();
    });

    it('does not advance past the last image', async () => {
      const user = setupUser();
      renderWithClient(<AdDetail ad={baseAd} />);

      await user.click(screen.getByLabelText('الصورة التالية'));
      await user.click(screen.getByLabelText('الصورة التالية'));

      expect(screen.getByText('2 / 2')).toBeInTheDocument();
    });

    it('jumps to a specific image via its thumbnail', async () => {
      const user = setupUser();
      renderWithClient(<AdDetail ad={baseAd} />);

      await user.click(screen.getByLabelText('عرض الصورة 2 من 2'));

      expect(screen.getByText('2 / 2')).toBeInTheDocument();
    });

    it('falls back to a single placeholder image with no gallery controls when the ad has no images', () => {
      renderWithClient(<AdDetail ad={{ ...baseAd, images: [] }} />);
      expect(screen.queryByLabelText('الصورة التالية')).not.toBeInTheDocument();
      expect(screen.queryByText(/\d \/ \d/)).not.toBeInTheDocument();
    });
  });

  describe('favorite toggle', () => {
    it('shows an error toast and does not call mutate when the user is not authenticated', async () => {
      mockAuth(false);
      const user = setupUser();
      renderWithClient(<AdDetail ad={baseAd} />);

      // aria-label is dynamic (favorited ? 'إزالة من المفضلة' :
      // 'إضافة إلى المفضلة'), not the static 'حفظ' — mirrors AdCard's
      // equivalent button (see the comment in AdDetail.tsx).
      await user.click(screen.getByLabelText('إضافة إلى المفضلة'));

      expect(toast.error).toHaveBeenCalledWith('يرجى تسجيل الدخول أولاً');
      expect(mockToggleMutate).not.toHaveBeenCalled();
    });

    it('calls toggleFavorite.mutate with the ad id when authenticated', async () => {
      const user = setupUser();
      renderWithClient(<AdDetail ad={baseAd} isFavorited={false} />);

      await user.click(screen.getByLabelText('إضافة إلى المفضلة'));

      // useToggleFavorite owns its own onMutate/onError internally (see
      // hooks/mutations/useFavoriteMutations.ts) — AdDetail just passes
      // the ad id, it doesn't pass a per-call onError.
      expect(mockToggleMutate).toHaveBeenCalledWith('ad-12345678');
    });

    it('optimistically fills the heart icon immediately on click, before the mutation resolves', async () => {
      // The optimistic write lives in useToggleFavorite's own onMutate
      // (see hooks/mutations/useFavoriteMutations.ts), which is mocked
      // out in this file. Reproduce that one write here so the shared
      // cache AdDetail reads via useIsFavorited actually changes —
      // otherwise the mock mutate() is a no-op and the heart can't fill.
      const user = setupUser();
      const { qc } = renderWithClient(<AdDetail ad={baseAd} isFavorited={false} />);
      mockToggleMutate.mockImplementation((adId: string) => {
        qc.setQueryData<Set<string>>(queryKeys.favorites.ids(), (old) => {
          const next = new Set(old ?? []);
          next.add(adId);
          return next;
        });
      });

      const heartButton = screen.getByLabelText('إضافة إلى المفضلة');
      const heartIcon = heartButton.querySelector('svg');
      expect(heartIcon).not.toHaveClass('fill-current');

      await user.click(heartButton);

      expect(heartIcon).toHaveClass('fill-current');
    });

    it('rolls back the optimistic update when the mutation fails', async () => {
      // Same gap as the optimistic-fill test above: the real rollback
      // happens inside useToggleFavorite's onMutate/onError (mocked out
      // here), so reproduce optimistic-write-then-rollback against the
      // actual shared cache the component reads.
      const user = setupUser();
      const { qc } = renderWithClient(<AdDetail ad={baseAd} isFavorited={false} />);
      mockToggleMutate.mockImplementation((adId: string) => {
        const previous = qc.getQueryData<Set<string>>(queryKeys.favorites.ids());
        qc.setQueryData<Set<string>>(queryKeys.favorites.ids(), (old) => {
          const next = new Set(old ?? []);
          next.add(adId);
          return next;
        });
        // Simulate the mutation failing: onError rolls back to the
        // pre-mutate snapshot, same as the real hook.
        qc.setQueryData(queryKeys.favorites.ids(), previous ?? new Set());
      });

      const heartButton = screen.getByLabelText('إضافة إلى المفضلة');
      const heartIcon = heartButton.querySelector('svg');

      await user.click(heartButton);

      expect(heartIcon).not.toHaveClass('fill-current');
    });

    it('starts filled when isFavorited is initially true', () => {
      renderWithClient(<AdDetail ad={baseAd} isFavorited />);

      // Already favorited on mount, so the label reads "إزالة من المفضلة".
      const heartIcon = screen.getByLabelText('إزالة من المفضلة').querySelector('svg');
      expect(heartIcon).toHaveClass('fill-current');
    });
  });

  describe('report button', () => {
    it('renders ReportAdButton with the current ad id', () => {
      renderWithClient(<AdDetail ad={baseAd} />);
      expect(screen.getByText(`ReportAdButton: ${baseAd.id}`)).toBeInTheDocument();
    });
  });
});
