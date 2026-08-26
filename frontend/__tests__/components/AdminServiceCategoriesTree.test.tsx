/**
 * AdminServiceCategoriesTree — thin wrapper around AdminEntityCategoriesTree.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminServiceCategoriesTree } from '@/components/admin/AdminServiceCategoriesTree';
import { useServiceCategoriesForAdmin } from '@/hooks/queries/useServiceCategories';
import {
  useDeleteServiceCategory,
  useToggleServiceCategoryActive,
} from '@/hooks/mutations/useServiceCategoryMutations';

vi.mock('@/hooks/queries/useServiceCategories', () => ({
  useServiceCategoriesForAdmin: vi.fn(),
}));

vi.mock('@/hooks/mutations/useServiceCategoryMutations', () => ({
  useDeleteServiceCategory: vi.fn(),
  useToggleServiceCategoryActive: vi.fn(),
}));

vi.mock('@/components/admin/EditServiceCategoryButton', () => ({
  EditServiceCategoryButton: () => <button type="button">تعديل</button>,
}));

const mockUseServiceCategoriesForAdmin = vi.mocked(useServiceCategoriesForAdmin);
const mockUseDeleteServiceCategory = vi.mocked(useDeleteServiceCategory);
const mockUseToggleServiceCategoryActive = vi.mocked(useToggleServiceCategoryActive);

describe('AdminServiceCategoriesTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDeleteServiceCategory.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
    mockUseToggleServiceCategoryActive.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      variables: undefined,
    } as never);
  });

  it('renders a category with its listings count', () => {
    mockUseServiceCategoriesForAdmin.mockReturnValue({
      data: [
        {
          id: 'cat-1',
          nameAr: 'سباكة',
          isActive: true,
          _count: { listings: 4 },
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<AdminServiceCategoriesTree />);
    expect(screen.getByText('سباكة')).toBeInTheDocument();
    expect(screen.getByText('4 خدمة')).toBeInTheDocument();
  });

  it('shows service-specific load error text', () => {
    mockUseServiceCategoriesForAdmin.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as never);
    render(<AdminServiceCategoriesTree />);
    expect(screen.getByText('حدث خطأ أثناء تحميل فئات الخدمات')).toBeInTheDocument();
  });

  it('shows service-specific empty text', () => {
    mockUseServiceCategoriesForAdmin.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<AdminServiceCategoriesTree />);
    expect(
      screen.getByText('لا توجد فئات خدمات بعد — ابدأ بإنشاء أول فئة.'),
    ).toBeInTheDocument();
  });
});
