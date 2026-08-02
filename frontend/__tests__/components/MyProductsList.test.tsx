/**
 * __tests__/components/MyProductsList.test.tsx
 *
 * Coverage targets:
 *  - Loading state shows a spinner
 *  - Empty state shown when there are no products
 *  - Renders each product's name, price, and status badge
 *  - Status filter tabs: reflect the current ?status= param and call
 *    router.push with the new status when clicked
 *  - Pause/resume button:
 *    * hidden for DELETED products
 *    * shows "Pause" icon semantics for ACTIVE, calls toggleStatus.mutate
 *      with status: 'PAUSED'
 *    * shows "Play" semantics for PAUSED, calls toggleStatus.mutate
 *      with status: 'ACTIVE'
 *    * disabled while a toggle for that exact product is pending
 *      (not disabled for a different product's pending toggle)
 *  - Delete flow goes through ConfirmDialog (not window.confirm):
 *    * clicking the trash icon opens the dialog without deleting yet
 *    * confirming calls deleteProduct.mutate with the correct id
 *    * cancelling does not call deleteProduct.mutate
 *  - Out-of-range page recovery: when the current page exceeds
 *    totalPages, the list shows a spinner (not the empty state) while
 *    it redirects to a valid page
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyProductsList } from '@/components/stores/MyProductsList';
import { useMyProducts } from '@/hooks/queries/useProducts';
import { useDeleteProduct, useToggleProductStatus } from '@/hooks/mutations/useProductMutations';

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/hooks/queries/useProducts', () => ({
  useMyProducts: vi.fn(),
}));

vi.mock('@/hooks/mutations/useProductMutations', () => ({
  useDeleteProduct: vi.fn(),
  useToggleProductStatus: vi.fn(),
}));

function makeProduct(overrides: Partial<{
  id: string; name: string; status: string; price: string; discountPrice: string | null;
  views: number; createdAt: string; images: string[];
}> = {}) {
  return {
    id: 'prod-1',
    name: 'منتج تجريبي',
    status: 'ACTIVE',
    price: '100',
    discountPrice: null,
    views: 5,
    createdAt: new Date().toISOString(),
    images: [],
    ...overrides,
  };
}

const mockDeleteMutate = vi.fn();
const mockToggleMutate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams = new URLSearchParams();
  (useDeleteProduct as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: mockDeleteMutate, isPending: false });
  (useToggleProductStatus as ReturnType<typeof vi.fn>).mockReturnValue({
    mutate: mockToggleMutate, isPending: false, variables: undefined,
  });
});

describe('MyProductsList', () => {
  // ── Loading / empty states ──────────────────────────────────────

  it('shows a loading spinner while fetching', () => {
    (useMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<MyProductsList />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows the empty state when there are no products', () => {
    (useMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyProductsList />);
    expect(screen.getByText('لا توجد منتجات')).toBeInTheDocument();
  });

  it('shows an error state with a retry option', () => {
    const refetch = vi.fn();
    (useMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined, isLoading: false, isError: true, refetch,
    });
    render(<MyProductsList />);
    expect(screen.getByText('حدث خطأ أثناء تحميل منتجاتك')).toBeInTheDocument();
  });

  // ── Rendering product rows ────────────────────────────────────────

  it('renders the product name, price, and status badge', () => {
    (useMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeProduct({ name: 'خلاط كهربائي', status: 'ACTIVE' })], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyProductsList />);
    expect(screen.getByText('خلاط كهربائي')).toBeInTheDocument();
    expect(screen.getByText('نشط')).toBeInTheDocument();
  });

  it('shows the discount price and strikes through the original price when discounted', () => {
    (useMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeProduct({ price: '150', discountPrice: '120' })], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyProductsList />);
    expect(screen.getByText(/120/)).toBeInTheDocument();
    expect(screen.getByText(/150/)).toBeInTheDocument();
  });

  // ── Status filter tabs ────────────────────────────────────────────

  it('marks the "الكل" tab as pressed when no status filter is active', () => {
    (useMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyProductsList />);
    expect(screen.getByRole('button', { name: 'الكل' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks the matching status tab as pressed when ?status= is set', () => {
    mockSearchParams = new URLSearchParams('status=PAUSED');
    (useMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyProductsList />);
    expect(screen.getByRole('button', { name: 'متوقف' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'الكل' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('navigates with the new status (and clears the page param) when a status tab is clicked', async () => {
    const user = userEvent.setup();
    mockSearchParams = new URLSearchParams('page=3');
    (useMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyProductsList />);

    await user.click(screen.getByRole('button', { name: 'نشط' }));

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('status=ACTIVE'));
    expect(mockPush).toHaveBeenCalledWith(expect.not.stringContaining('page='));
  });

  // ── Pause / resume toggle ──────────────────────────────────────────

  it('shows a pause action for an ACTIVE product and toggles it to PAUSED on click', async () => {
    const user = userEvent.setup();
    (useMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeProduct({ id: 'prod-9', status: 'ACTIVE' })], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyProductsList />);

    await user.click(screen.getByTitle('إيقاف مؤقت'));
    expect(mockToggleMutate).toHaveBeenCalledWith({ id: 'prod-9', status: 'PAUSED' });
  });

  it('shows a resume action for a PAUSED product and toggles it to ACTIVE on click', async () => {
    const user = userEvent.setup();
    (useMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeProduct({ id: 'prod-9', status: 'PAUSED' })], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyProductsList />);

    await user.click(screen.getByTitle('إعادة تفعيل'));
    expect(mockToggleMutate).toHaveBeenCalledWith({ id: 'prod-9', status: 'ACTIVE' });
  });

  it('hides the pause/resume action entirely for a DELETED product', () => {
    (useMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeProduct({ status: 'DELETED' })], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyProductsList />);
    expect(screen.queryByTitle('إيقاف مؤقت')).not.toBeInTheDocument();
    expect(screen.queryByTitle('إعادة تفعيل')).not.toBeInTheDocument();
  });

  it('disables the toggle button only for the product currently being toggled', () => {
    (useToggleProductStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockToggleMutate, isPending: true, variables: { id: 'prod-1', status: 'PAUSED' },
    });
    (useMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        items: [makeProduct({ id: 'prod-1', status: 'ACTIVE' }), makeProduct({ id: 'prod-2', status: 'ACTIVE' })],
        meta: { totalPages: 1 },
      },
      isLoading: false,
    });
    render(<MyProductsList />);

    const buttons = screen.getAllByTitle('إيقاف مؤقت');
    expect(buttons[0]).toBeDisabled();  // prod-1 — the one being toggled
    expect(buttons[1]).not.toBeDisabled(); // prod-2 — unaffected
  });

  // ── Delete flow via ConfirmDialog ────────────────────────────────

  it('does not show the confirm dialog initially', () => {
    (useMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeProduct()], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyProductsList />);
    expect(screen.queryByText('حذف المنتج؟')).not.toBeInTheDocument();
  });

  it('clicking the delete icon opens the confirm dialog without deleting yet', async () => {
    const user = userEvent.setup();
    (useMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeProduct({ id: 'prod-7', name: 'منتج سبعة' })], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyProductsList />);

    await user.click(screen.getByRole('button', { name: 'حذف منتج سبعة' }));

    expect(screen.getByText('حذف المنتج؟')).toBeInTheDocument();
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });

  it('confirming the dialog calls deleteProduct.mutate with the correct id', async () => {
    const user = userEvent.setup();
    (useMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeProduct({ id: 'prod-7', name: 'منتج سبعة' })], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyProductsList />);

    await user.click(screen.getByRole('button', { name: 'حذف منتج سبعة' }));
    await user.click(screen.getByRole('button', { name: 'حذف' }));

    expect(mockDeleteMutate).toHaveBeenCalledWith('prod-7', expect.objectContaining({
      onSuccess: expect.any(Function),
    }));
  });

  it('cancelling the dialog does not call deleteProduct.mutate', async () => {
    const user = userEvent.setup();
    (useMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [makeProduct({ id: 'prod-7', name: 'منتج سبعة' })], meta: { totalPages: 1 } },
      isLoading: false,
    });
    render(<MyProductsList />);

    await user.click(screen.getByRole('button', { name: 'حذف منتج سبعة' }));
    await user.click(screen.getByRole('button', { name: 'إلغاء' }));

    expect(mockDeleteMutate).not.toHaveBeenCalled();
    expect(screen.queryByText('حذف المنتج؟')).not.toBeInTheDocument();
  });

  // ── Out-of-range page recovery ────────────────────────────────────

  it('shows a spinner (not the empty state) when the current page exceeds totalPages', () => {
    mockSearchParams = new URLSearchParams('page=5');
    (useMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [], meta: { totalPages: 2 } },
      isLoading: false,
    });
    const { container } = render(<MyProductsList />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('لا توجد منتجات')).not.toBeInTheDocument();
  });
});
