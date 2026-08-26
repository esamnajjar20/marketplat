/**
 * MyCollectionsList — owner collections tab.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { MyCollectionsList } from '@/components/stores/MyCollectionsList';
import { useMyCollections } from '@/hooks/queries/useCollections';
import { useDeleteCollection, useReorderCollections } from '@/hooks/mutations/useCollectionMutations';

vi.mock('@/hooks/queries/useCollections', () => ({
  useMyCollections: vi.fn(),
}));

vi.mock('@/hooks/mutations/useCollectionMutations', () => ({
  useDeleteCollection: vi.fn(),
  useReorderCollections: vi.fn(),
  useCreateCollection: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateCollection: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/components/shared/ui/SafeImage', () => ({
  SafeImage: () => <span data-testid="img" />,
}));

const mockDeleteMutate = vi.fn();
const mockReorderMutate = vi.fn();
const mockRefetch = vi.fn();

const collection = {
  id: 'c1',
  name: 'تشكيلة الصيف',
  description: 'وصف',
  imageUrl: null,
  slug: 'summer',
  isActive: true,
  storeId: 's1',
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
  _count: { products: 3 },
};

describe('MyCollectionsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDeleteCollection as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockDeleteMutate,
      isPending: false,
    });
    (useReorderCollections as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockReorderMutate,
      isPending: false,
    });
  });

  it('shows error state with retry', async () => {
    (useMyCollections as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    });
    const user = setupUser();
    render(<MyCollectionsList />);
    expect(screen.getByText('حدث خطأ أثناء تحميل المجموعات')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows empty state', () => {
    (useMyCollections as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });
    render(<MyCollectionsList />);
    expect(screen.getByText('لا توجد مجموعات')).toBeInTheDocument();
  });

  it('renders collection name and product count', () => {
    (useMyCollections as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [collection],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });
    render(<MyCollectionsList />);
    expect(screen.getByText('تشكيلة الصيف')).toBeInTheDocument();
    expect(screen.getByText(/3 منتج/)).toBeInTheDocument();
  });

  it('shows hidden badge when isActive is false', () => {
    (useMyCollections as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [{ ...collection, isActive: false }],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });
    render(<MyCollectionsList />);
    expect(screen.getByText('مخفية')).toBeInTheDocument();
  });

  it('reorders down via move button', async () => {
    (useMyCollections as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [collection, { ...collection, id: 'c2', name: 'شتاء' }],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });
    const user = setupUser();
    render(<MyCollectionsList />);
    await user.click(screen.getAllByLabelText('نقل لأسفل')[0]!);
    expect(mockReorderMutate).toHaveBeenCalledWith({ orderedIds: ['c2', 'c1'] });
  });

  it('opens confirm and deletes on confirm', async () => {
    (useMyCollections as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [collection],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });
    mockDeleteMutate.mockImplementation((_id, opts) => opts?.onSuccess?.());
    const user = setupUser();
    render(<MyCollectionsList />);
    await user.click(screen.getByLabelText('حذف'));
    expect(screen.getByText('حذف المجموعة؟')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'حذف المجموعة' }));
    expect(mockDeleteMutate).toHaveBeenCalledWith('c1', expect.any(Object));
  });
});
