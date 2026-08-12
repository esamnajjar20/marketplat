/**
 * __tests__/components/AdminProductCategoriesTree.test.tsx
 *
 * AdminProductCategoriesTree is a thin wrapper (see file header — FIX
 * SEC-4.2) supplying product-specific hooks/copy to the shared,
 * already-tested AdminEntityCategoriesTree. This file only pins down
 * that the wiring is correct: the right query/mutation hooks are used,
 * the count label reads `_count.products`, and the product-specific
 * copy strings are passed through.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminProductCategoriesTree } from '@/components/admin/AdminProductCategoriesTree';
import { useProductCategoriesForAdmin } from '@/hooks/queries/useProductCategories';
import { useDeleteProductCategory, useToggleProductCategoryActive } from '@/hooks/mutations/useProductCategoryMutations';

vi.mock('@/hooks/queries/useProductCategories', () => ({
  useProductCategoriesForAdmin: vi.fn(),
}));

vi.mock('@/hooks/mutations/useProductCategoryMutations', () => ({
  useDeleteProductCategory: vi.fn(),
  useToggleProductCategoryActive: vi.fn(),
}));

vi.mock('@/components/admin/EditProductCategoryButton', () => ({
  EditProductCategoryButton: () => <button type="button">تعديل</button>,
}));

const mockUseProductCategoriesForAdmin = vi.mocked(useProductCategoriesForAdmin);
const mockUseDeleteProductCategory = vi.mocked(useDeleteProductCategory);
const mockUseToggleProductCategoryActive = vi.mocked(useToggleProductCategoryActive);

describe('AdminProductCategoriesTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDeleteProductCategory.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    mockUseToggleProductCategoryActive.mockReturnValue({ mutate: vi.fn(), isPending: false, variables: undefined } as never);
  });

  it('renders a category with its product count', () => {
    mockUseProductCategoriesForAdmin.mockReturnValue({
      data: [{ id: 'cat-1', nameAr: 'إلكترونيات', isActive: true, _count: { products: 7 } }],
      isLoading: false, isError: false, refetch: vi.fn(),
    } as never);
    render(<AdminProductCategoriesTree />);

    expect(screen.getByText('إلكترونيات')).toBeInTheDocument();
    expect(screen.getByText('7 منتج')).toBeInTheDocument();
  });

  it('renders no count text when _count is absent', () => {
    mockUseProductCategoriesForAdmin.mockReturnValue({
      data: [{ id: 'cat-1', nameAr: 'إلكترونيات', isActive: true }],
      isLoading: false, isError: false, refetch: vi.fn(),
    } as never);
    render(<AdminProductCategoriesTree />);
    expect(screen.queryByText(/منتج/)).not.toBeInTheDocument();
  });

  it('shows the product-specific load error text on failure', () => {
    mockUseProductCategoriesForAdmin.mockReturnValue({
      data: undefined, isLoading: false, isError: true, refetch: vi.fn(),
    } as never);
    render(<AdminProductCategoriesTree />);
    expect(screen.getByText('حدث خطأ أثناء تحميل فئات المنتجات')).toBeInTheDocument();
  });

  it('shows the product-specific empty text', () => {
    mockUseProductCategoriesForAdmin.mockReturnValue({
      data: [], isLoading: false, isError: false, refetch: vi.fn(),
    } as never);
    render(<AdminProductCategoriesTree />);
    expect(screen.getByText('لا توجد فئات منتجات بعد — ابدأ بإنشاء أول فئة.')).toBeInTheDocument();
  });
});
