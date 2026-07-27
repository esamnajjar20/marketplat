/**
 * __tests__/components/EditCategoryButton.test.tsx
 *
 * EditCategoryButton's real logic — more subtle than CreateCategoryButton:
 *   - Computes a PARTIAL patch: only fields that actually changed from
 *     category.nameAr/category.name go into the mutate payload.
 *   - slug is only recomputed (and included) when the English name
 *     changed — editing only the Arabic name must not touch slug.
 *   - If nothing changed, it closes the dialog WITHOUT calling mutate
 *     at all (a silent no-op save shouldn't hit the network).
 *   - Reopening the dialog resets fields to the category's *current*
 *     values, so a previously-cancelled edit doesn't leak into the next
 *     open.
 *   - The trigger button calls e.stopPropagation() (it's rendered
 *     inside a clickable tree row in AdminCategoriesTree).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditCategoryButton } from '@/components/admin/EditCategoryButton';
import { useUpdateCategory } from '@/hooks/mutations/useCategoryMutations';
import type { Category } from '@/types/category.types';

vi.mock('@/hooks/mutations/useCategoryMutations', () => ({
  useUpdateCategory: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

afterEach(() => {
  cleanup();
});

const mockMutate = vi.fn();

const baseCategory: Category = {
  id: 'cat-1',
  name: 'Electronics',
  nameAr: 'إلكترونيات',
  slug: 'electronics',
  parentId: null,
  children: [],
};

async function openDialog(category: Category = baseCategory) {
  const user = userEvent.setup();
  render(<EditCategoryButton category={category} />);
  await user.click(screen.getByRole('button', { name: `تعديل ${category.nameAr}` }));
  return user;
}

describe('EditCategoryButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useUpdateCategory).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as never);
  });

  it('calls useUpdateCategory with the category id', async () => {
    await openDialog();
    expect(useUpdateCategory).toHaveBeenCalledWith('cat-1');
  });

  it('prefills both name fields with the current category values', async () => {
    await openDialog();
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByPlaceholderText('مثال: إلكترونيات')).toHaveValue('إلكترونيات');
    expect(within(dialog).getByPlaceholderText('e.g. Electronics')).toHaveValue('Electronics');
  });

  it('stops click propagation on the trigger button (it sits inside a clickable tree row)', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <EditCategoryButton category={baseCategory} />
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'تعديل إلكترونيات' }));

    expect(onRowClick).not.toHaveBeenCalled();
  });

  describe('partial patch computation', () => {
    it('includes only nameAr in the patch when only the Arabic name changed', async () => {
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      const arInput = within(dialog).getByPlaceholderText('مثال: إلكترونيات');
      await user.clear(arInput);
      await user.type(arInput, 'أجهزة إلكترونية');
      await user.click(within(dialog).getByRole('button', { name: 'حفظ' }));

      expect(mockMutate).toHaveBeenCalledWith(
        { nameAr: 'أجهزة إلكترونية' },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('includes both name and slug in the patch when only the English name changed', async () => {
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      const enInput = within(dialog).getByPlaceholderText('e.g. Electronics');
      await user.clear(enInput);
      await user.type(enInput, 'Home Electronics');
      await user.click(within(dialog).getByRole('button', { name: 'حفظ' }));

      expect(mockMutate).toHaveBeenCalledWith(
        { name: 'Home Electronics', slug: 'home-electronics' },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('includes all three fields when both names changed', async () => {
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      const arInput = within(dialog).getByPlaceholderText('مثال: إلكترونيات');
      const enInput = within(dialog).getByPlaceholderText('e.g. Electronics');
      await user.clear(arInput);
      await user.type(arInput, 'أجهزة');
      await user.clear(enInput);
      await user.type(enInput, 'Devices');
      await user.click(within(dialog).getByRole('button', { name: 'حفظ' }));

      expect(mockMutate).toHaveBeenCalledWith(
        { nameAr: 'أجهزة', name: 'Devices', slug: 'devices' },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('does NOT call mutate and just closes the dialog when nothing changed', async () => {
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      // Save immediately with unchanged prefilled values.
      await user.click(within(dialog).getByRole('button', { name: 'حفظ' }));

      expect(mockMutate).not.toHaveBeenCalled();
      expect(screen.queryByText('تعديل الفئة')).not.toBeInTheDocument();
    });

    it('treats whitespace-only edits as unchanged (trimmed comparison)', async () => {
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      const arInput = within(dialog).getByPlaceholderText('مثال: إلكترونيات');
      await user.type(arInput, '  '); // trailing spaces only, trims to the same value
      await user.click(within(dialog).getByRole('button', { name: 'حفظ' }));

      expect(mockMutate).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('shows an Arabic-required error and does not call mutate when cleared to empty', async () => {
      const { toast } = await import('sonner');
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      await user.clear(within(dialog).getByPlaceholderText('مثال: إلكترونيات'));
      await user.click(within(dialog).getByRole('button', { name: 'حفظ' }));

      expect(toast.error).toHaveBeenCalledWith('الاسم بالعربي مطلوب');
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('shows an English-required error and does not call mutate when cleared to empty', async () => {
      const { toast } = await import('sonner');
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      await user.clear(within(dialog).getByPlaceholderText('e.g. Electronics'));
      await user.click(within(dialog).getByRole('button', { name: 'حفظ' }));

      expect(toast.error).toHaveBeenCalledWith('الاسم بالإنجليزي مطلوب');
      expect(mockMutate).not.toHaveBeenCalled();
    });
  });

  describe('reopen resets to current values', () => {
    it('resets fields to the category values even after a cancelled edit', async () => {
      const user = await openDialog();
      let dialog = screen.getByRole('dialog');

      const enInput = within(dialog).getByPlaceholderText('e.g. Electronics');
      await user.clear(enInput);
      await user.type(enInput, 'Something Else');
      await user.click(within(dialog).getByRole('button', { name: 'إلغاء' }));

      // Reopen — should show the original category value, not the
      // cancelled edit.
      await user.click(screen.getByRole('button', { name: 'تعديل إلكترونيات' }));
      dialog = screen.getByRole('dialog');
      expect(within(dialog).getByPlaceholderText('e.g. Electronics')).toHaveValue('Electronics');
    });
  });

  describe('slug preview', () => {
    it('shows a slug preview only when the English name actually changed', async () => {
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      expect(within(dialog).queryByText(/^slug:/)).not.toBeInTheDocument();

      const enInput = within(dialog).getByPlaceholderText('e.g. Electronics');
      await user.clear(enInput);
      await user.type(enInput, 'New Name');

      expect(within(dialog).getByText('slug: new-name')).toBeInTheDocument();
    });
  });

  describe('pending state', () => {
    it('shows a pending label and disables save while updating', async () => {
      vi.mocked(useUpdateCategory).mockReturnValue({
        mutate: mockMutate,
        isPending: true,
      } as never);
      await openDialog();
      const dialog = screen.getByRole('dialog');

      expect(within(dialog).getByRole('button', { name: 'جارٍ الحفظ…' })).toBeDisabled();
    });
  });
});
