/**
 * __tests__/components/AdDetail.test.tsx
 *
 * FIX E2E-GAP-01 (coverage gap identified in the audit): AdDetail.tsx
 * had zero test coverage despite being one of the two most important
 * components in the product (ad listing page + this detail page).
 * Covers: image gallery navigation, the favorite toggle's optimistic
 * update + rollback, the auth-gated favorite action, and status/
 * condition/featured badge rendering.
 *
 * FIX INTEG-07: the report button is now the real ReportAdButton
 * component (its own dialog + useReportAd mutation, covered by
 * ReportAdButton.test.tsx). Here we only assert that AdDetail renders
 * it and hands it the right ad id — the button's own click/dialog/
 * submit behavior is out of scope for this file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdDetail } from '@/components/ads/AdDetail';
import { useToggleFavorite } from '@/hooks/mutations/useFavoriteMutations';
import { useAuthStore } from '@/store/auth.store';
import { toast } from 'sonner';
import { formatPrice } from '@/lib/formatters';
import type { Ad } from '@/types/ad.types';

vi.mock('@/hooks/mutations/useFavoriteMutations', () => ({
  useToggleFavorite: vi.fn(),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
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

function mockAuth(isAuthenticated: boolean) {
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: { isAuthenticated: boolean }) => unknown) => selector({ isAuthenticated }),
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
      render(<AdDetail ad={baseAd} />);

      expect(screen.getByText('آيفون 14 برو للبيع')).toBeInTheDocument();
      expect(screen.getByText(formatPrice(baseAd.price), { exact: false })).toBeInTheDocument();
      expect(screen.getByText('غزة')).toBeInTheDocument();
      expect(screen.getByText(/42/)).toBeInTheDocument();
      expect(screen.getByText('إلكترونيات')).toBeInTheDocument();
    });

    it('shows "قابل للتفاوض" only when isNegotiable is true', () => {
      const { rerender } = render(<AdDetail ad={baseAd} />);
      expect(screen.queryByText('قابل للتفاوض')).not.toBeInTheDocument();

      rerender(<AdDetail ad={{ ...baseAd, isNegotiable: true }} />);
      expect(screen.getByText('قابل للتفاوض')).toBeInTheDocument();
    });

    it('shows the condition label', () => {
      render(<AdDetail ad={baseAd} />);
      expect(screen.getByText('مستعمل')).toBeInTheDocument();
    });

    it('shows a status badge only when the ad is not ACTIVE', () => {
      const { rerender } = render(<AdDetail ad={baseAd} />);
      expect(screen.queryByText('تم البيع')).not.toBeInTheDocument();

      rerender(<AdDetail ad={{ ...baseAd, status: 'SOLD' }} />);
      expect(screen.getByText('تم البيع')).toBeInTheDocument();
    });

    it('shows a "مميز" badge only when isFeatured is true', () => {
      const { rerender } = render(<AdDetail ad={baseAd} />);
      expect(screen.queryByText('مميز')).not.toBeInTheDocument();

      rerender(<AdDetail ad={{ ...baseAd, isFeatured: true }} />);
      expect(screen.getByText('مميز')).toBeInTheDocument();
    });

    it('renders SellerCard with the ad author', () => {
      render(<AdDetail ad={baseAd} />);
      expect(screen.getByText('SellerCard: أحمد')).toBeInTheDocument();
    });

    it('renders the last 8 characters of the ad id as a reference number', () => {
      render(<AdDetail ad={baseAd} />);
      expect(screen.getByText(baseAd.id.slice(-8))).toBeInTheDocument();
    });
  });

  describe('image gallery navigation', () => {
    it('shows navigation arrows and a counter only when there is more than one image', () => {
      const { rerender } = render(<AdDetail ad={{ ...baseAd, images: [baseAd.images[0]] }} />);
      expect(screen.queryByLabelText('الصورة التالية')).not.toBeInTheDocument();

      rerender(<AdDetail ad={baseAd} />);
      expect(screen.getByLabelText('الصورة التالية')).toBeInTheDocument();
      expect(screen.getByText('1 / 2')).toBeInTheDocument();
    });

    it('disables the previous button on the first image', () => {
      render(<AdDetail ad={baseAd} />);
      expect(screen.getByLabelText('الصورة السابقة')).toBeDisabled();
    });

    it('advances to the next image and updates the counter', async () => {
      const user = userEvent.setup();
      render(<AdDetail ad={baseAd} />);

      await user.click(screen.getByLabelText('الصورة التالية'));

      expect(screen.getByText('2 / 2')).toBeInTheDocument();
      expect(screen.getByLabelText('الصورة التالية')).toBeDisabled();
    });

    it('does not advance past the last image', async () => {
      const user = userEvent.setup();
      render(<AdDetail ad={baseAd} />);

      await user.click(screen.getByLabelText('الصورة التالية'));
      await user.click(screen.getByLabelText('الصورة التالية'));

      expect(screen.getByText('2 / 2')).toBeInTheDocument();
    });

    it('jumps to a specific image via its thumbnail', async () => {
      const user = userEvent.setup();
      render(<AdDetail ad={baseAd} />);

      await user.click(screen.getByLabelText('عرض الصورة 2 من 2'));

      expect(screen.getByText('2 / 2')).toBeInTheDocument();
    });

    it('falls back to a single placeholder image with no gallery controls when the ad has no images', () => {
      render(<AdDetail ad={{ ...baseAd, images: [] }} />);
      expect(screen.queryByLabelText('الصورة التالية')).not.toBeInTheDocument();
      expect(screen.queryByText(/\d \/ \d/)).not.toBeInTheDocument();
    });
  });

  describe('favorite toggle', () => {
    it('shows an error toast and does not call mutate when the user is not authenticated', async () => {
      mockAuth(false);
      const user = userEvent.setup();
      render(<AdDetail ad={baseAd} />);

      await user.click(screen.getByLabelText('حفظ'));

      expect(toast.error).toHaveBeenCalledWith('يرجى تسجيل الدخول أولاً');
      expect(mockToggleMutate).not.toHaveBeenCalled();
    });

    it('calls toggleFavorite.mutate with the ad id when authenticated', async () => {
      const user = userEvent.setup();
      render(<AdDetail ad={baseAd} isFavorited={false} />);

      await user.click(screen.getByLabelText('حفظ'));

      expect(mockToggleMutate).toHaveBeenCalledWith('ad-12345678', expect.objectContaining({
        onError: expect.any(Function),
      }));
    });

    it('optimistically fills the heart icon immediately on click, before the mutation resolves', async () => {
      const user = userEvent.setup();
      render(<AdDetail ad={baseAd} isFavorited={false} />);

      const heartButton = screen.getByLabelText('حفظ');
      const heartIcon = heartButton.querySelector('svg');
      expect(heartIcon).not.toHaveClass('fill-destructive');

      await user.click(heartButton);

      expect(heartIcon).toHaveClass('fill-destructive');
    });

    it('rolls back the optimistic update when the mutation fails', async () => {
      mockToggleMutate.mockImplementation((_id, { onError }) => onError());
      const user = userEvent.setup();
      render(<AdDetail ad={baseAd} isFavorited={false} />);

      const heartButton = screen.getByLabelText('حفظ');
      const heartIcon = heartButton.querySelector('svg');

      await user.click(heartButton);

      // onError flips it back to false synchronously in this mock,
      // so the net visible state after the click is "not favorited".
      expect(heartIcon).not.toHaveClass('fill-destructive');
    });

    it('starts filled when isFavorited is initially true', () => {
      render(<AdDetail ad={baseAd} isFavorited />);

      const heartIcon = screen.getByLabelText('حفظ').querySelector('svg');
      expect(heartIcon).toHaveClass('fill-destructive');
    });
  });

  describe('report button', () => {
    it('renders ReportAdButton with the current ad id', () => {
      render(<AdDetail ad={baseAd} />);
      expect(screen.getByText(`ReportAdButton: ${baseAd.id}`)).toBeInTheDocument();
    });
  });
});
