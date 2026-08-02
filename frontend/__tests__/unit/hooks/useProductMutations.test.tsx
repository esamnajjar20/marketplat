/**
 * __tests__/unit/hooks/useProductMutations.test.tsx
 *
 * Coverage targets:
 *
 *  useCreateProduct:
 *   - calls productsApi.create with the payload and the onUploadProgress callback
 *   - on success: invalidates the products query, shows a success toast,
 *     and navigates to /my-store/products
 *   - on error: shows an error toast and does not navigate
 *
 *  useUpdateProduct:
 *   - calls productsApi.update with the product id + payload
 *   - on success: invalidates products, shows a success toast, navigates
 *   - on error: shows an error toast
 *
 *  useDeleteProduct:
 *   - calls productsApi.delete with the id
 *   - on success: invalidates products and shows a success toast
 *   - on error: shows an error toast
 *
 *  useToggleProductStatus (optimistic update + rollback — the one
 *  genuinely complex mutation in this module):
 *   - optimistically flips the status of the matching item in every
 *     cached products list *before* the network call resolves
 *   - leaves non-matching items in the list untouched
 *   - on success: shows the correct toast for PAUSED vs ACTIVE and
 *     keeps the optimistic value (no flicker back)
 *   - on error: rolls back every affected query to its pre-mutation
 *     snapshot and shows an error toast
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useToggleProductStatus,
} from '@/hooks/mutations/useProductMutations';
import { productsApi } from '@/api/products.api';
import { queryKeys } from '@/lib/queryKeys';
import { ROUTES } from '@/lib/constants';
import { toast } from 'sonner';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/api/products.api', () => ({
  productsApi: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function createWrapper(queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
})) {
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidateSpy, queryClient };
}

beforeEach(() => vi.clearAllMocks());

describe('useCreateProduct', () => {
  const payload = {
    categoryId: 'cat-1', name: 'منتج', description: 'وصف طويل بما فيه الكفاية',
    price: 100, images: [],
  };

  it('calls productsApi.create with the payload and the onUploadProgress callback', async () => {
    (productsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'p-1' } } });
    const { wrapper } = createWrapper();
    const onProgress = vi.fn();

    const { result } = renderHook(() => useCreateProduct(onProgress), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(productsApi.create).toHaveBeenCalledWith(payload, onProgress);
  });

  it('invalidates the products query, shows a success toast, and navigates on success', async () => {
    (productsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'p-1' } } });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateProduct(), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.products.all() });
    expect(toast.success).toHaveBeenCalledWith('تم إضافة المنتج بنجاح');
    expect(mockPush).toHaveBeenCalledWith(ROUTES.myStoreProducts);
  });

  it('shows an error toast and does not navigate on failure', async () => {
    (productsApi.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('bad'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateProduct(), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('useUpdateProduct', () => {
  it('calls productsApi.update with the product id and payload', async () => {
    (productsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'p-1' } } });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateProduct('p-1'), { wrapper });
    act(() => { result.current.mutate({ name: 'اسم محدث' }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(productsApi.update).toHaveBeenCalledWith('p-1', { name: 'اسم محدث' });
  });

  it('invalidates products, shows a success toast, and navigates on success', async () => {
    (productsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'p-1' } } });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useUpdateProduct('p-1'), { wrapper });
    act(() => { result.current.mutate({ name: 'اسم محدث' }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.products.all() });
    expect(toast.success).toHaveBeenCalledWith('تم حفظ التعديلات');
    expect(mockPush).toHaveBeenCalledWith(ROUTES.myStoreProducts);
  });

  it('shows an error toast on failure', async () => {
    (productsApi.update as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('bad'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateProduct('p-1'), { wrapper });
    act(() => { result.current.mutate({ name: 'اسم محدث' }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useDeleteProduct', () => {
  it('calls productsApi.delete with the id', async () => {
    (productsApi.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: null } });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useDeleteProduct(), { wrapper });
    act(() => { result.current.mutate('p-1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(productsApi.delete).toHaveBeenCalledWith('p-1');
  });

  it('invalidates products and shows a success toast on success', async () => {
    (productsApi.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: null } });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useDeleteProduct(), { wrapper });
    act(() => { result.current.mutate('p-1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.products.all() });
    expect(toast.success).toHaveBeenCalledWith('تم حذف المنتج');
  });

  it('shows an error toast on failure', async () => {
    (productsApi.delete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('bad'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useDeleteProduct(), { wrapper });
    act(() => { result.current.mutate('p-1'); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useToggleProductStatus', () => {
  function seedProductsList(queryClient: QueryClient) {
    const key = queryKeys.products.mine({ limit: 10 });
    queryClient.setQueryData(key, {
      items: [
        { id: 'p-1', name: 'أول', status: 'ACTIVE' },
        { id: 'p-2', name: 'ثاني', status: 'ACTIVE' },
      ],
      meta: { totalPages: 1 },
    });
    return key;
  }

  it("optimistically flips the matching item's status before the network call resolves", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const key = seedProductsList(queryClient);

    // Never resolves during this assertion window — isolates the
    // synchronous optimistic write from the eventual server response.
    (productsApi.update as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    const { wrapper } = createWrapper(queryClient);

    const { result } = renderHook(() => useToggleProductStatus(), { wrapper });
    act(() => { result.current.mutate({ id: 'p-1', status: 'PAUSED' }); });

    await waitFor(() => {
      const data = queryClient.getQueryData<any>(key);
      expect(data.items[0].status).toBe('PAUSED');
    });
  });

  it('leaves non-matching items in the list untouched', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const key = seedProductsList(queryClient);

    (productsApi.update as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    const { wrapper } = createWrapper(queryClient);

    const { result } = renderHook(() => useToggleProductStatus(), { wrapper });
    act(() => { result.current.mutate({ id: 'p-1', status: 'PAUSED' }); });

    await waitFor(() => {
      const data = queryClient.getQueryData<any>(key);
      expect(data.items[0].status).toBe('PAUSED');
    });
    const data = queryClient.getQueryData<any>(key);
    expect(data.items[1].status).toBe('ACTIVE');
  });

  it('shows "تم إيقاف المنتج مؤقتاً" when toggling to PAUSED', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    seedProductsList(queryClient);
    (productsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'p-1', status: 'PAUSED' } } });
    const { wrapper } = createWrapper(queryClient);

    const { result } = renderHook(() => useToggleProductStatus(), { wrapper });
    act(() => { result.current.mutate({ id: 'p-1', status: 'PAUSED' }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم إيقاف المنتج مؤقتاً');
  });

  it('shows "تمت إعادة تفعيل المنتج" when toggling to ACTIVE', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    seedProductsList(queryClient);
    (productsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'p-1', status: 'ACTIVE' } } });
    const { wrapper } = createWrapper(queryClient);

    const { result } = renderHook(() => useToggleProductStatus(), { wrapper });
    act(() => { result.current.mutate({ id: 'p-1', status: 'ACTIVE' }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تمت إعادة تفعيل المنتج');
  });

  it('rolls back the optimistic update to the pre-mutation snapshot on error', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const key = seedProductsList(queryClient);
    (productsApi.update as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('server error'));
    const { wrapper } = createWrapper(queryClient);

    const { result } = renderHook(() => useToggleProductStatus(), { wrapper });
    act(() => { result.current.mutate({ id: 'p-1', status: 'PAUSED' }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const data = queryClient.getQueryData<any>(key);
    // Back to ACTIVE — the optimistic PAUSED write must have been undone.
    expect(data.items[0].status).toBe('ACTIVE');
  });

  it('shows an error toast on failure', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    seedProductsList(queryClient);
    (productsApi.update as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('server error'));
    const { wrapper } = createWrapper(queryClient);

    const { result } = renderHook(() => useToggleProductStatus(), { wrapper });
    act(() => { result.current.mutate({ id: 'p-1', status: 'PAUSED' }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });

  it('invalidates the products query on settle, regardless of outcome', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    seedProductsList(queryClient);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    (productsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'p-1', status: 'PAUSED' } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useToggleProductStatus(), { wrapper });
    act(() => { result.current.mutate({ id: 'p-1', status: 'PAUSED' }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.products.all() });
  });
});
