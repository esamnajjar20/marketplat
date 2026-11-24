/**
 * CollectionProductsManager — toggle products in/out of a collection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { CollectionProductsManager } from '@/components/stores/CollectionProductsManager';
import { useCollection, useManageCollectionProducts } from '@/hooks/queries/useCollections';
import { useInfiniteMyProducts } from '@/hooks/queries/useProducts';
import {
  useAddProductToCollection,
  useRemoveProductFromCollection,
} from '@/hooks/mutations/useCollectionMutations';

vi.mock('@/hooks/queries/useCollections', () => ({
  useCollection: vi.fn(),
  useManageCollectionProducts: vi.fn(),
}));

vi.mock('@/hooks/queries/useProducts', () => ({
  useInfiniteMyProducts: vi.fn(),
}));

vi.mock('@/hooks/mutations/useCollectionMutations', () => ({
  useAddProductToCollection: vi.fn(),
  useRemoveProductFromCollection: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/components/shared/ui/SafeImage', () => ({
  SafeImage: () => <span data-testid="img" />,
}));

const mockAdd = vi.fn();
const mockRemove = vi.fn();
const mockRefetch = vi.fn();

const product = {
  id: 'p1',
  name: 'منتج تجريبي',
  price: 50,
  images: [] as string[],
};

describe('CollectionProductsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useCollection as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { id: 'c1', storeId: 'store-1', name: 'مجموعة' },
      isLoading: false,
    });
    (useAddProductToCollection as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockAdd,
      isPending: false,
      variables: undefined,
    });
    (useRemoveProductFromCollection as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockRemove,
      isPending: false,
      variables: undefined,
    });
  });

  it('shows collection name in the heading', () => {
    (useManageCollectionProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });
    (useInfiniteMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { pages: [{ items: [] }] },
      isLoading: false, isError: false, hasNextPage: false, isFetchingNextPage: false,
      fetchNextPage: vi.fn(), refetch: vi.fn(),
    });
    render(<CollectionProductsManager collectionId="c1" />);
    expect(screen.getByText(/منتجات: مجموعة/)).toBeInTheDocument();
    expect(useInfiniteMyProducts).toHaveBeenCalledWith(
      { status: 'ACTIVE', limit: 50, storeId: 'store-1' },
      { enabled: true },
    );
  });

  it('shows error with retry', async () => {
    (useManageCollectionProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    });
    (useInfiniteMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { pages: [{ items: [] }] },
      isLoading: false, isError: false, hasNextPage: false, isFetchingNextPage: false,
      fetchNextPage: vi.fn(), refetch: vi.fn(),
    });
    const user = setupUser();
    render(<CollectionProductsManager collectionId="c1" />);
    expect(screen.getByText('حدث خطأ أثناء تحميل المنتجات')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'إعادة تحميل عضويات المجموعة' }));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows empty state when store has no active products', () => {
    (useManageCollectionProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });
    (useInfiniteMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { pages: [{ items: [] }] },
      isLoading: false, isError: false, hasNextPage: false, isFetchingNextPage: false,
      fetchNextPage: vi.fn(), refetch: vi.fn(),
    });
    render(<CollectionProductsManager collectionId="c1" />);
    expect(screen.getByText('لا توجد منتجات نشطة')).toBeInTheDocument();
  });

  it('adds a product that is not yet a member', async () => {
    (useManageCollectionProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });
    (useInfiniteMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { pages: [{ items: [product] }] },
      isLoading: false, isError: false, hasNextPage: false, isFetchingNextPage: false,
      fetchNextPage: vi.fn(), refetch: vi.fn(),
    });
    const user = setupUser();
    render(<CollectionProductsManager collectionId="c1" />);
    await user.click(screen.getByText('منتج تجريبي'));
    expect(mockAdd).toHaveBeenCalledWith('p1');
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('removes a product that is already a member', async () => {
    (useManageCollectionProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [product],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });
    (useInfiniteMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { pages: [{ items: [product] }] },
      isLoading: false, isError: false, hasNextPage: false, isFetchingNextPage: false,
      fetchNextPage: vi.fn(), refetch: vi.fn(),
    });
    const user = setupUser();
    render(<CollectionProductsManager collectionId="c1" />);
    await user.click(screen.getByText('منتج تجريبي'));
    expect(mockRemove).toHaveBeenCalledWith('p1');
    expect(mockAdd).not.toHaveBeenCalled();
  });
});
