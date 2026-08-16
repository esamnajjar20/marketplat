/**
 * __tests__/components/AdminEntityCategoriesTree.test.tsx
 *
 * AdminEntityCategoriesTree is a generic component (see file header —
 * FIX SEC-4.2) whose data/mutation hooks are injected as props, so it
 * can be tested directly without mocking any module. Real logic under
 * test: loading/error(-with-retry)/empty states, expand/collapse of a
 * root row's children, the visibility (Eye/EyeOff) toggle, per-row
 * pending-disable, and the delete ConfirmDialog flow.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { AdminEntityCategoriesTree } from '@/components/admin/AdminEntityCategoriesTree';

interface TestCategory {
  id: string;
  nameAr: string;
  isActive: boolean;
  children?: TestCategory[];
}

function makeCategory(overrides: Partial<TestCategory> = {}): TestCategory {
  return { id: 'cat-1', nameAr: 'إلكترونيات', isActive: true, ...overrides };
}

const mockDeleteMutate = vi.fn();
const mockToggleMutate = vi.fn();

function baseProps(overrides: Partial<Parameters<typeof AdminEntityCategoriesTree>[0]> = {}) {
  return {
    useCategories: () => ({ data: [makeCategory()], isLoading: false, isError: false, refetch: vi.fn() }),
    useDeleteCategory: () => ({ mutate: mockDeleteMutate, isPending: false }),
    useToggleActive: () => ({ mutate: mockToggleMutate, isPending: false, variables: undefined }),
    EditButton: () => <button type="button">تعديل</button>,
    icon: <span data-testid="icon" />,
    childIcon: <span data-testid="child-icon" />,
    countLabel: (cat: TestCategory) => `${cat.nameAr}-count`,
    loadErrorText: 'حدث خطأ أثناء تحميل الفئات',
    emptyText: 'لا توجد فئات',
    deleteBlockedDescription: 'لا يمكن حذف فئة تحتوي على عناصر',
    ...overrides,
  };
}

describe('AdminEntityCategoriesTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading spinner while fetching', () => {
    render(<AdminEntityCategoriesTree {...baseProps({
      useCategories: () => ({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() }),
    })} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state with retry that calls refetch', async () => {
    const refetch = vi.fn();
    const user = setupUser();
    render(<AdminEntityCategoriesTree {...baseProps({
      useCategories: () => ({ data: undefined, isLoading: false, isError: true, refetch }),
    })} />);

    expect(screen.getByText('حدث خطأ أثناء تحميل الفئات')).toBeInTheDocument();
    await user.click(screen.getByText('إعادة المحاولة'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there are no categories', () => {
    render(<AdminEntityCategoriesTree {...baseProps({
      useCategories: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
    })} />);
    expect(screen.getByText('لا توجد فئات')).toBeInTheDocument();
  });

  it('renders a root category with its count label', () => {
    render(<AdminEntityCategoriesTree {...baseProps()} />);
    expect(screen.getByText('إلكترونيات')).toBeInTheDocument();
    expect(screen.getByText('إلكترونيات-count')).toBeInTheDocument();
  });

  it('shows the "مخفية" badge for an inactive category', () => {
    render(<AdminEntityCategoriesTree {...baseProps({
      useCategories: () => ({ data: [makeCategory({ isActive: false })], isLoading: false, isError: false, refetch: vi.fn() }),
    })} />);
    expect(screen.getByText('مخفية')).toBeInTheDocument();
  });

  it('does not render children until the root row is expanded', async () => {
    const parent = makeCategory({ id: 'p1', nameAr: 'أب', children: [makeCategory({ id: 'c1', nameAr: 'ابن' })] });
    const user = setupUser();
    render(<AdminEntityCategoriesTree {...baseProps({
      useCategories: () => ({ data: [parent], isLoading: false, isError: false, refetch: vi.fn() }),
    })} />);

    expect(screen.queryByText('ابن')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('أب — فتح الفئات الفرعية'));
    expect(screen.getByText('ابن')).toBeInTheDocument();

    await user.click(screen.getByLabelText('أب — إغلاق الفئات الفرعية'));
    expect(screen.queryByText('ابن')).not.toBeInTheDocument();
  });

  it('toggles isActive when the visibility button is clicked', async () => {
    const user = setupUser();
    render(<AdminEntityCategoriesTree {...baseProps({
      useCategories: () => ({ data: [makeCategory({ id: 'cat-9', nameAr: 'فئة تسعة', isActive: true })], isLoading: false, isError: false, refetch: vi.fn() }),
    })} />);

    await user.click(screen.getByLabelText('إخفاء فئة تسعة'));
    expect(mockToggleMutate).toHaveBeenCalledWith({ id: 'cat-9', isActive: false });
  });

  it('disables the visibility toggle only for the category currently being toggled', () => {
    render(<AdminEntityCategoriesTree {...baseProps({
      useCategories: () => ({
        data: [makeCategory({ id: 'cat-1', nameAr: 'فئة واحدة' }), makeCategory({ id: 'cat-2', nameAr: 'فئة اثنان' })],
        isLoading: false, isError: false, refetch: vi.fn(),
      }),
      useToggleActive: () => ({ mutate: mockToggleMutate, isPending: true, variables: { id: 'cat-1' } }),
    })} />);

    expect(screen.getByLabelText('إخفاء فئة واحدة')).toBeDisabled();
    expect(screen.getByLabelText('إخفاء فئة اثنان')).not.toBeDisabled();
  });

  describe('delete flow', () => {
    it('clicking delete opens the confirm dialog without deleting yet', async () => {
      const user = setupUser();
      render(<AdminEntityCategoriesTree {...baseProps({
        useCategories: () => ({ data: [makeCategory({ nameAr: 'فئة للحذف' })], isLoading: false, isError: false, refetch: vi.fn() }),
      })} />);

      await user.click(screen.getByLabelText('حذف فئة للحذف'));

      expect(screen.getByText('حذف "فئة للحذف"؟')).toBeInTheDocument();
      expect(screen.getByText('لا يمكن حذف فئة تحتوي على عناصر')).toBeInTheDocument();
      expect(mockDeleteMutate).not.toHaveBeenCalled();
    });

    it('confirming delete calls mutate with the category id', async () => {
      const user = setupUser();
      render(<AdminEntityCategoriesTree {...baseProps({
        useCategories: () => ({ data: [makeCategory({ id: 'cat-9', nameAr: 'فئة للحذف' })], isLoading: false, isError: false, refetch: vi.fn() }),
      })} />);

      await user.click(screen.getByLabelText('حذف فئة للحذف'));
      await user.click(screen.getByRole('button', { name: 'حذف' }));

      expect(mockDeleteMutate).toHaveBeenCalledWith('cat-9', expect.objectContaining({ onSuccess: expect.any(Function) }));
    });

    it('cancelling the dialog does not delete', async () => {
      const user = setupUser();
      render(<AdminEntityCategoriesTree {...baseProps({
        useCategories: () => ({ data: [makeCategory({ nameAr: 'فئة للحذف' })], isLoading: false, isError: false, refetch: vi.fn() }),
      })} />);

      await user.click(screen.getByLabelText('حذف فئة للحذف'));
      await user.click(screen.getByRole('button', { name: 'إلغاء' }));

      expect(mockDeleteMutate).not.toHaveBeenCalled();
      expect(screen.queryByText('حذف "فئة للحذف"؟')).not.toBeInTheDocument();
    });
  });
});
