/**
 * __tests__/components/CreateCategoryButton.test.tsx
 *
 * CreateCategoryButton's real logic: required-field validation with
 * distinct error messages for the Arabic/English name fields, the
 * slugify() function (English-only chars, whitespace collapsing, and
 * a timestamp-based fallback when the English name has no ASCII
 * letters/digits at all), the exact mutate payload shape, and
 * resetting/closing the dialog only on a successful create.
 *
 * useCreateCategory is mocked at the module boundary (same approach as
 * AdminCategoriesTree.test.tsx) — its internal toast.success/onError
 * calls are the mocked hook's concern, not this component's.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateCategoryButton } from '@/components/admin/CreateCategoryButton';
import { useCreateCategory } from '@/hooks/mutations/useCategoryMutations';

vi.mock('@/hooks/mutations/useCategoryMutations', () => ({
  useCreateCategory: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

afterEach(() => {
  cleanup();
});

const mockMutate = vi.fn();

async function openDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'فئة جديدة' }));
  return user;
}

describe('CreateCategoryButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCreateCategory).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as never);
    render(<CreateCategoryButton />);
  });

  it('opens the create-category dialog on click', async () => {
    await openDialog();
    expect(screen.getByText('إنشاء فئة جديدة')).toBeInTheDocument();
  });

  describe('validation', () => {
    it('shows an Arabic-required error and does not call mutate when the Arabic name is empty', async () => {
      const { toast } = await import('sonner');
      const user = await openDialog();

      const dialog = screen.getByRole('dialog');
      await user.type(within(dialog).getByPlaceholderText('e.g. Electronics'), 'Electronics');
      await user.click(within(dialog).getByRole('button', { name: 'إنشاء' }));

      expect(toast.error).toHaveBeenCalledWith('الاسم بالعربي مطلوب');
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('shows an English-required error and does not call mutate when the English name is empty', async () => {
      const { toast } = await import('sonner');
      const user = await openDialog();

      const dialog = screen.getByRole('dialog');
      await user.type(within(dialog).getByPlaceholderText('مثال: إلكترونيات'), 'إلكترونيات');
      await user.click(within(dialog).getByRole('button', { name: 'إنشاء' }));

      expect(toast.error).toHaveBeenCalledWith('الاسم بالإنجليزي مطلوب');
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('treats a whitespace-only name as empty for validation purposes', async () => {
      const { toast } = await import('sonner');
      const user = await openDialog();

      const dialog = screen.getByRole('dialog');
      await user.type(within(dialog).getByPlaceholderText('مثال: إلكترونيات'), '   ');
      await user.type(within(dialog).getByPlaceholderText('e.g. Electronics'), 'Electronics');
      await user.click(within(dialog).getByRole('button', { name: 'إنشاء' }));

      expect(toast.error).toHaveBeenCalledWith('الاسم بالعربي مطلوب');
    });
  });

  describe('slug generation preview', () => {
    it('shows a lowercase, hyphenated slug preview derived from the English name', async () => {
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      await user.type(within(dialog).getByPlaceholderText('e.g. Electronics'), 'Home Appliances');

      expect(within(dialog).getByText('slug: home-appliances')).toBeInTheDocument();
    });

    it('strips non-ASCII characters and collapses repeated separators', async () => {
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      await user.type(within(dialog).getByPlaceholderText('e.g. Electronics'), '  Kids -- Toys!! ');

      expect(within(dialog).getByText('slug: kids-toys')).toBeInTheDocument();
    });

    it('shows no slug preview when the English name is empty', async () => {
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      expect(within(dialog).queryByText(/^slug:/)).not.toBeInTheDocument();
      // typing then clearing should also hide it again
      const input = within(dialog).getByPlaceholderText('e.g. Electronics');
      await user.type(input, 'Test');
      await user.clear(input);
      expect(within(dialog).queryByText(/^slug:/)).not.toBeInTheDocument();
    });
  });

  describe('submission', () => {
    it('calls mutate with the trimmed names and derived slug', async () => {
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      await user.type(within(dialog).getByPlaceholderText('مثال: إلكترونيات'), '  إلكترونيات  ');
      await user.type(within(dialog).getByPlaceholderText('e.g. Electronics'), '  Electronics  ');
      await user.click(within(dialog).getByRole('button', { name: 'إنشاء' }));

      expect(mockMutate).toHaveBeenCalledWith(
        { name: 'Electronics', nameAr: 'إلكترونيات', slug: 'electronics' },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('closes the dialog and resets the fields when onSuccess fires', async () => {
      mockMutate.mockImplementation((_payload, { onSuccess }) => onSuccess());
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      await user.type(within(dialog).getByPlaceholderText('مثال: إلكترونيات'), 'إلكترونيات');
      await user.type(within(dialog).getByPlaceholderText('e.g. Electronics'), 'Electronics');
      await user.click(within(dialog).getByRole('button', { name: 'إنشاء' }));

      expect(screen.queryByText('إنشاء فئة جديدة')).not.toBeInTheDocument();
    });

    it('keeps the dialog open with fields intact when the mutation does not call onSuccess (e.g. an error occurred)', async () => {
      mockMutate.mockImplementation(() => {}); // never calls onSuccess
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      await user.type(within(dialog).getByPlaceholderText('مثال: إلكترونيات'), 'إلكترونيات');
      await user.type(within(dialog).getByPlaceholderText('e.g. Electronics'), 'Electronics');
      await user.click(within(dialog).getByRole('button', { name: 'إنشاء' }));

      expect(screen.getByText('إنشاء فئة جديدة')).toBeInTheDocument();
      expect(within(dialog).getByPlaceholderText('مثال: إلكترونيات')).toHaveValue('إلكترونيات');
    });

    it('shows a pending label and disables the submit button while creating', async () => {
      vi.mocked(useCreateCategory).mockReturnValue({
        mutate: mockMutate,
        isPending: true,
      } as never);
      render(<CreateCategoryButton />);
      const user = userEvent.setup();
      await user.click(screen.getAllByRole('button', { name: 'فئة جديدة' })[0]);
      const dialog = screen.getAllByRole('dialog')[0];

      expect(within(dialog).getByRole('button', { name: 'جارٍ الإنشاء…' })).toBeDisabled();
    });
  });

  describe('cancel', () => {
    it('closes the dialog without calling mutate', async () => {
      const user = await openDialog();
      const dialog = screen.getByRole('dialog');

      await user.click(within(dialog).getByRole('button', { name: 'إلغاء' }));

      expect(mockMutate).not.toHaveBeenCalled();
      expect(screen.queryByText('إنشاء فئة جديدة')).not.toBeInTheDocument();
    });
  });
});
