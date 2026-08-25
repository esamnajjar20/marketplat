/**
 * __tests__/components/MyPromotionsList.test.tsx
 *
 * Coverage targets:
 *  - loading skeleton, error state with retry, empty state
 *  - renders each promotion's title, status badge, and discount label
 *    (percentage vs fixed-amount)
 *  - cancel action is only offered for ACTIVE/SCHEDULED promotions,
 *    not EXPIRED/CANCELLED/DRAFT
 *  - confirming cancel calls useCancelPromotion.mutate with the right id
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { MyPromotionsList } from '@/components/stores/MyPromotionsList';
import { useMyPromotions } from '@/hooks/queries/usePromotions';
import { useCancelPromotion, useCreatePromotion } from '@/hooks/mutations/usePromotionMutations';
import { useMyProducts } from '@/hooks/queries/useProducts';
import type { Promotion } from '@/types/promotion.types';

vi.mock('@/hooks/queries/usePromotions', () => ({
  useMyPromotions: vi.fn(),
}));

vi.mock('@/hooks/mutations/usePromotionMutations', () => ({
  useCancelPromotion: vi.fn(),
  useCreatePromotion: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUpdatePromotion: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('@/hooks/queries/useProducts', () => ({
  useMyProducts: vi.fn(),
}));

const mockCancelMutate = vi.fn();
const mockRefetch = vi.fn();

const basePromotion: Promotion = {
  id: 'promo-1',
  storeId: 'store-1',
  productId: 'product-1',
  title: 'خصم الصيف',
  description: null,
  discountType: 'PERCENTAGE',
  discountValue: '15',
  startsAt: '2026-08-19T00:00:00.000Z',
  endsAt: '2026-08-25T00:00:00.000Z',
  status: 'ACTIVE',
  maxUses: null,
  usageCount: 0,
  createdAt: '2026-08-18T00:00:00.000Z',
  updatedAt: '2026-08-18T00:00:00.000Z',
};

describe('MyPromotionsList', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.resetAllMocks();
    (useMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [{ id: 'product-1', name: 'خلاط كهربائي' }] },
    });
    (useCancelPromotion as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockCancelMutate,
      isPending: false,
    });
    (useCreatePromotion as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
  });

  it('shows a loading skeleton while fetching', () => {
    (useMyPromotions as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined, isLoading: true, isError: false, refetch: mockRefetch,
    });
    render(<MyPromotionsList />);
    expect(screen.queryByText('لا توجد عروض')).not.toBeInTheDocument();
  });

  it('shows an error state with a retry action', async () => {
    (useMyPromotions as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined, isLoading: false, isError: true, refetch: mockRefetch,
    });
    const user = setupUser();
    render(<MyPromotionsList />);

    expect(screen.getByText('حدث خطأ أثناء تحميل العروض')).toBeInTheDocument();
    await user.click(screen.getByText('إعادة المحاولة'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state when there are no promotions', () => {
    (useMyPromotions as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [], isLoading: false, isError: false, refetch: mockRefetch,
    });
    render(<MyPromotionsList />);
    expect(screen.getByText('لا توجد عروض')).toBeInTheDocument();
  });

  describe('rendering a promotion row', () => {
    it('shows the title, product name, and percentage discount label', () => {
      (useMyPromotions as ReturnType<typeof vi.fn>).mockReturnValue({
        data: [basePromotion], isLoading: false, isError: false, refetch: mockRefetch,
      });
      render(<MyPromotionsList />);

      expect(screen.getByText('خصم الصيف')).toBeInTheDocument();
      expect(screen.getByText(/خلاط كهربائي/)).toBeInTheDocument();
      expect(screen.getByText(/15%/)).toBeInTheDocument();
      expect(screen.getByText('نشط')).toBeInTheDocument();
    });

    it('shows a fixed-amount discount as a formatted price, not a percentage', () => {
      (useMyPromotions as ReturnType<typeof vi.fn>).mockReturnValue({
        data: [{ ...basePromotion, discountType: 'FIXED_AMOUNT', discountValue: '30' }],
        isLoading: false, isError: false, refetch: mockRefetch,
      });
      render(<MyPromotionsList />);

      expect(screen.queryByText(/30%/)).not.toBeInTheDocument();
    });

    it('falls back to "منتج محذوف" when the product is not found in the owner\'s product list', () => {
      (useMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({ data: { items: [] } });
      (useMyPromotions as ReturnType<typeof vi.fn>).mockReturnValue({
        data: [basePromotion], isLoading: false, isError: false, refetch: mockRefetch,
      });
      render(<MyPromotionsList />);

      expect(screen.getByText(/منتج محذوف/)).toBeInTheDocument();
    });
  });

  describe('cancel action availability', () => {
    it.each(['ACTIVE', 'SCHEDULED'] as const)('shows a cancel button for %s promotions', (status) => {
      (useMyPromotions as ReturnType<typeof vi.fn>).mockReturnValue({
        data: [{ ...basePromotion, status }], isLoading: false, isError: false, refetch: mockRefetch,
      });
      render(<MyPromotionsList />);
      expect(screen.getByText('إلغاء')).toBeInTheDocument();
    });

    it.each(['EXPIRED', 'CANCELLED', 'DRAFT'] as const)('hides the cancel button for %s promotions', (status) => {
      (useMyPromotions as ReturnType<typeof vi.fn>).mockReturnValue({
        data: [{ ...basePromotion, status }], isLoading: false, isError: false, refetch: mockRefetch,
      });
      render(<MyPromotionsList />);
      expect(screen.queryByText('إلغاء')).not.toBeInTheDocument();
    });
  });

  describe('cancel flow', () => {
    it('calls cancelPromotion.mutate with the promotion id after confirming', async () => {
      (useMyPromotions as ReturnType<typeof vi.fn>).mockReturnValue({
        data: [basePromotion], isLoading: false, isError: false, refetch: mockRefetch,
      });
      const user = setupUser();
      render(<MyPromotionsList />);

      await user.click(screen.getByText('إلغاء'));
      await user.click(screen.getByRole('button', { name: 'إلغاء العرض' }));

      expect(mockCancelMutate).toHaveBeenCalledWith('promo-1', expect.any(Object));
    });
  });
});
