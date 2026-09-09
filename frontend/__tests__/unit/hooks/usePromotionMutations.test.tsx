import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreatePromotion, useUpdatePromotion, useCancelPromotion } from '@/hooks/mutations/usePromotionMutations';
import { promotionsApi } from '@/api/promotions.api';
import { queryKeys } from '@/lib/queryKeys';
vi.mock('@/api/promotions.api', () => ({ promotionsApi: { create: vi.fn(), update: vi.fn(), cancel: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return { wrapper, invalidateSpy };
}
beforeEach(() => vi.clearAllMocks());
describe('usePromotionMutations', () => {
  it('create invalidates promotions+products', async () => {
    (promotionsApi.create as any).mockResolvedValue({ data: { data: { id: 'p1' } } });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useCreatePromotion(), { wrapper });
    act(() => result.current.mutate({} as any));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.promotions.all() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.products.all() });
  });
  it('update + cancel succeed', async () => {
    (promotionsApi.update as any).mockResolvedValue({ data: { data: { id: 'p1' } } });
    (promotionsApi.cancel as any).mockResolvedValue({ data: { data: null } });
    const { wrapper } = createWrapper();
    const up = renderHook(() => useUpdatePromotion('p1'), { wrapper });
    act(() => up.result.current.mutate({} as any));
    await waitFor(() => expect(up.result.current.isSuccess).toBe(true));
    const ca = renderHook(() => useCancelPromotion(), { wrapper });
    act(() => ca.result.current.mutate('p1'));
    await waitFor(() => expect(ca.result.current.isSuccess).toBe(true));
  });
});
