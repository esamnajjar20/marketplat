/**
 * __tests__/unit/hooks/useStoreMutations.test.tsx
 *
 * Coverage targets:
 *
 *  useCreateStore:
 *   - calls storesApi.create with the payload
 *   - on success: invalidates the "my store" query and shows a success toast
 *   - on error: shows an error toast
 *
 *  useUpdateStore:
 *   - calls storesApi.updateMyStore with the payload
 *   - on success: invalidates the whole ['stores'] prefix (not just 'me')
 *     — the public directory/detail views must not keep showing stale
 *     data after an owner edits their store
 *   - on success: shows a success toast
 *   - on error: shows an error toast
 *
 *  useToggleStoreFollow:
 *   - calls storesApi.toggleFollow with the store ID
 *   - on success: invalidates both the store detail query and the
 *     followed-stores query
 *   - shows "تمت متابعة المتجر" when action is 'followed'
 *   - shows "تم إلغاء متابعة المتجر" when action is 'unfollowed'
 *   - on error: shows an error toast
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreateStore, useUpdateStore, useToggleStoreFollow } from '@/hooks/mutations/useStoreMutations';
import { storesApi } from '@/api/stores.api';
import { toast } from 'sonner';

vi.mock('@/api/stores.api', () => ({
  storesApi: {
    create: vi.fn(),
    updateMyStore: vi.fn(),
    toggleFollow: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidateSpy };
}

beforeEach(() => vi.clearAllMocks());

describe('useCreateStore', () => {
  it('calls storesApi.create with the payload', async () => {
    (storesApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'store-1' } } });
    const { wrapper } = createWrapper();
    const payload = { name: 'متجري', description: 'وصف', city: 'غزة', phone: '0599000000' };

    const { result } = renderHook(() => useCreateStore(), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(storesApi.create).toHaveBeenCalledWith(payload);
  });

  it('invalidates the "my store" query on success', async () => {
    (storesApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'store-1' } } });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateStore(), { wrapper });
    act(() => { result.current.mutate({ name: 'متجري', description: 'وصف', city: 'غزة', phone: '0599000000' }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(invalidatedKeys.some((k) => k.includes('"me"'))).toBe(true);
  });

  it('shows a success toast on success', async () => {
    (storesApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'store-1' } } });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateStore(), { wrapper });
    act(() => { result.current.mutate({ name: 'متجري', description: 'وصف', city: 'غزة', phone: '0599000000' }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم إنشاء المتجر بنجاح');
  });

  it('shows an error toast on failure', async () => {
    (storesApi.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('conflict'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateStore(), { wrapper });
    act(() => { result.current.mutate({ name: 'متجري', description: 'وصف', city: 'غزة', phone: '0599000000' }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useUpdateStore', () => {
  it('calls storesApi.updateMyStore with the payload', async () => {
    (storesApi.updateMyStore as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'store-1' } } });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateStore(), { wrapper });
    act(() => { result.current.mutate({ name: 'اسم محدث' }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(storesApi.updateMyStore).toHaveBeenCalledWith({ name: 'اسم محدث' });
  });

  it('invalidates the entire ["stores"] prefix on success (not just "me")', async () => {
    (storesApi.updateMyStore as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'store-1' } } });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useUpdateStore(), { wrapper });
    act(() => { result.current.mutate({ name: 'اسم محدث' }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['stores'] });
  });

  it('shows a success toast on success', async () => {
    (storesApi.updateMyStore as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'store-1' } } });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateStore(), { wrapper });
    act(() => { result.current.mutate({ name: 'اسم محدث' }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم حفظ التعديلات');
  });

  it('shows an error toast on failure', async () => {
    (storesApi.updateMyStore as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('bad request'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateStore(), { wrapper });
    act(() => { result.current.mutate({ name: 'اسم محدث' }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useToggleStoreFollow', () => {
  it('calls storesApi.toggleFollow with the store ID', async () => {
    (storesApi.toggleFollow as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { action: 'followed' } } });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useToggleStoreFollow(), { wrapper });
    act(() => { result.current.mutate('store-1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(storesApi.toggleFollow).toHaveBeenCalledWith('store-1');
  });

  it('invalidates both the store detail query and the followed-stores query on success', async () => {
    (storesApi.toggleFollow as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { action: 'followed' } } });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useToggleStoreFollow(), { wrapper });
    act(() => { result.current.mutate('store-1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(invalidatedKeys.some((k) => k.includes('"detail"') && k.includes('store-1'))).toBe(true);
    expect(invalidatedKeys.some((k) => k.includes('"followed"'))).toBe(true);
  });

  it('shows "تمت متابعة المتجر" when the response action is "followed"', async () => {
    (storesApi.toggleFollow as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { action: 'followed' } } });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useToggleStoreFollow(), { wrapper });
    act(() => { result.current.mutate('store-1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تمت متابعة المتجر');
  });

  it('shows "تم إلغاء متابعة المتجر" when the response action is "unfollowed"', async () => {
    (storesApi.toggleFollow as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { action: 'unfollowed' } } });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useToggleStoreFollow(), { wrapper });
    act(() => { result.current.mutate('store-1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم إلغاء متابعة المتجر');
  });

  it('shows an error toast on failure', async () => {
    (storesApi.toggleFollow as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('unauthorized'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useToggleStoreFollow(), { wrapper });
    act(() => { result.current.mutate('store-1'); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});
