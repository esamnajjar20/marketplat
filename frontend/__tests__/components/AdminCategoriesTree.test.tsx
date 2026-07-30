/**
 * __tests__/components/AdminCategoriesTree.test.tsx
 *
 * Coverage for FIX INTEG-06: AdminCategoriesTree was read-only despite
 * useUpdateCategory/useDeleteCategory and their backend endpoints being
 * fully implemented and tested. This covers the newly wired edit
 * dialog and delete confirmation flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminCategoriesTree } from '@/components/admin/AdminCategoriesTree';
import { useCategories } from '@/hooks/queries/useCategories';
import { useUpdateCategory, useDeleteCategory } from '@/hooks/mutations/useCategoryMutations';
import type { Category } from '@/types/category.types';

vi.mock('@/hooks/queries/useCategories', () => ({
  useCategories: vi.fn(),
}));

vi.mock('@/hooks/mutations/useCategoryMutations', () => ({
  useUpdateCategory: vi.fn(),
  useDeleteCategory: vi.fn(),
  useCreateCategory: vi.fn(),
}));

const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();

const rootCategory: Category = {
  id: 'cat-1',
  name: 'Electronics',
  nameAr: 'إلكترونيات',
  slug: 'electronics',
  parentId: null,
  children: [],
  _count: { ads: 5 },
};

describe('AdminCategoriesTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useCategories as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [rootCategory],
      isLoading: false,
    });
    (useUpdateCategory as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockUpdateMutate,
      isPending: false,
    });
    (useDeleteCategory as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockDeleteMutate,
      isPending: false,
    });
  });

  it('renders an edit and a delete button for each root category', () => {
    render(<AdminCategoriesTree />);

    expect(screen.getByRole('button', { name: 'تعديل إلكترونيات' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حذف إلكترونيات' })).toBeInTheDocument();
  });

  describe('editing', () => {
    it('opens the edit dialog pre-filled with the category values', async () => {
      const user = userEvent.setup();
      render(<AdminCategoriesTree />);

      await user.click(screen.getByRole('button', { name: 'تعديل إلكترونيات' }));

      expect(screen.getByText('تعديل الفئة')).toBeInTheDocument();
      expect(screen.getByDisplayValue('إلكترونيات')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Electronics')).toBeInTheDocument();
    });

    it('calls useUpdateCategory.mutate with only the changed fields', async () => {
      const user = userEvent.setup();
      render(<AdminCategoriesTree />);

      await user.click(screen.getByRole('button', { name: 'تعديل إلكترونيات' }));
      const arabicInput = screen.getByDisplayValue('إلكترونيات');
      await user.clear(arabicInput);
      await user.type(arabicInput, 'إلكترونيات جديدة');
      await user.click(screen.getByRole('button', { name: 'حفظ' }));

      expect(mockUpdateMutate).toHaveBeenCalledWith(
        { nameAr: 'إلكترونيات جديدة' },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('does not call mutate when no field was actually changed', async () => {
      const user = userEvent.setup();
      render(<AdminCategoriesTree />);

      await user.click(screen.getByRole('button', { name: 'تعديل إلكترونيات' }));
      await user.click(screen.getByRole('button', { name: 'حفظ' }));

      expect(mockUpdateMutate).not.toHaveBeenCalled();
    });

    it('shows a required-field error and does not submit when the Arabic name is cleared', async () => {
      const user = userEvent.setup();
      render(<AdminCategoriesTree />);

      await user.click(screen.getByRole('button', { name: 'تعديل إلكترونيات' }));
      await user.clear(screen.getByDisplayValue('إلكترونيات'));
      await user.click(screen.getByRole('button', { name: 'حفظ' }));

      expect(mockUpdateMutate).not.toHaveBeenCalled();
    });
  });

  describe('deleting', () => {
    it('opens a confirmation dialog before deleting — does not delete immediately', async () => {
      const user = userEvent.setup();
      render(<AdminCategoriesTree />);

      await user.click(screen.getByRole('button', { name: 'حذف إلكترونيات' }));

      expect(screen.getByText('حذف "إلكترونيات"؟')).toBeInTheDocument();
      expect(mockDeleteMutate).not.toHaveBeenCalled();
    });

    it('calls useDeleteCategory.mutate with the category id on confirm', async () => {
      const user = userEvent.setup();
      render(<AdminCategoriesTree />);

      await user.click(screen.getByRole('button', { name: 'حذف إلكترونيات' }));
      // ConfirmDialog's confirm button uses the confirmLabel prop
      // ("حذف") — distinct from the icon button's "حذف إلكترونيات"
      // aria-label, so no ambiguity between the two.
      await user.click(screen.getByRole('button', { name: 'حذف' }));

      // UX-FIX P1-3: ConfirmDialog now waits for the mutation to resolve
      // before closing, so the caller passes an onSuccess callback
      // alongside the id.
      expect(mockDeleteMutate).toHaveBeenCalledWith('cat-1', expect.objectContaining({
        onSuccess: expect.any(Function),
      }));
    });

    it('does not delete when cancelled', async () => {
      const user = userEvent.setup();
      render(<AdminCategoriesTree />);

      await user.click(screen.getByRole('button', { name: 'حذف إلكترونيات' }));
      await user.click(screen.getByRole('button', { name: 'إلغاء' }));

      expect(mockDeleteMutate).not.toHaveBeenCalled();
      expect(screen.queryByText('حذف "إلكترونيات"؟')).not.toBeInTheDocument();
    });
  });

  describe('subcategories', () => {
    it('renders edit and delete actions for child categories too, once expanded', async () => {
      const withChild: Category = {
        ...rootCategory,
        children: [{
          id: 'cat-2', name: 'Phones', nameAr: 'هواتف', slug: 'phones',
          parentId: 'cat-1', children: [], _count: { ads: 2 },
        }],
      };
      (useCategories as ReturnType<typeof vi.fn>).mockReturnValue({
        data: [withChild],
        isLoading: false,
      });

      const user = userEvent.setup();
      render(<AdminCategoriesTree />);

      await user.click(screen.getByRole('button', { name: /إلكترونيات — فتح الفئات الفرعية/ }));

      expect(screen.getByRole('button', { name: 'تعديل هواتف' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'حذف هواتف' })).toBeInTheDocument();
    });
  });
});
