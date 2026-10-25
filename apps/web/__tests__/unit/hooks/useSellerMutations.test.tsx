import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreateSellerProfile, useCreateSellerRating } from '@/hooks/mutations/useSellerMutations';
import { sellersApi } from '@/api/sellers.api';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from 'sonner';

vi.mock('@/api/sellers.api', () => ({
  sellersApi: { createMyProfile: vi.fn(), createRating: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCreateSellerProfile', () => {
  it('invalidates the "my profile" query and shows a success toast', async () => {
    const queryClient = newClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    (sellersApi.createMyProfile as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 's1' } } });

    const { result } = renderHook(() => useCreateSellerProfile(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ displayName: 'متجري', agreedToSellerTerms: true });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(sellersApi.createMyProfile).toHaveBeenCalledWith({ displayName: 'متجري', agreedToSellerTerms: true });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.sellers.me() });
    expect(toast.success).toHaveBeenCalledWith('تم إنشاء ملفك كبائع بنجاح');
  });

  it('shows an error toast on failure', async () => {
    const queryClient = newClient();
    (sellersApi.createMyProfile as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 409, data: { message: 'لديك ملف بائع بالفعل' } },
    });

    const { result } = renderHook(() => useCreateSellerProfile(), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ agreedToSellerTerms: true });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useCreateSellerRating', () => {
  it('invalidates both the seller detail and ratings list, and shows a success toast', async () => {
    const queryClient = newClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    (sellersApi.createRating as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'r1' } } });

    const { result } = renderHook(() => useCreateSellerRating('seller-1'), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ score: 5, comment: 'ممتاز' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(sellersApi.createRating).toHaveBeenCalledWith('seller-1', { score: 5, comment: 'ممتاز' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.sellers.detail('seller-1') });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.sellers.ratings('seller-1') });
    expect(toast.success).toHaveBeenCalledWith('تم إرسال تقييمك');
  });

  it('shows an error toast on failure', async () => {
    const queryClient = newClient();
    (sellersApi.createRating as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 400, data: { message: 'لا يمكنك تقييم نفسك' } },
    });

    const { result } = renderHook(() => useCreateSellerRating('seller-1'), { wrapper: createWrapper(queryClient) });
    act(() => {
      result.current.mutate({ score: 1 });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalled();
  });
});
