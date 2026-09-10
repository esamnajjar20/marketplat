/**
 * __tests__/unit/hooks/useAdjustProductStock.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAdjustProductStock } from '@/hooks/mutations/useAdjustProductStock';
import { adjustProductStock } from '@/api/products-stock.api';
import { toast } from 'sonner';

vi.mock('@/api/products-stock.api', () => ({
  adjustProductStock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/errorParser', () => ({
  parseApiError: (e: unknown) => ({
    message: e instanceof Error ? e.message : 'خطأ',
  }),
}));

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return function W({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('useAdjustProductStock', () => {
  beforeEach(() => {
    vi.mocked(adjustProductStock).mockReset();
    vi.mocked(toast.success).mockReset();
  });

  it('updates stock and toasts success', async () => {
    vi.mocked(adjustProductStock).mockResolvedValue({ id: 'p1', stockQuantity: 3 } as never);
    const { result } = renderHook(() => useAdjustProductStock(), { wrapper: wrapper() });

    await act(async () => {
      result.current.mutate({ id: 'p1', stockQuantity: 3 });
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('تم تحديث المخزون'));
    expect(adjustProductStock).toHaveBeenCalledWith('p1', 3);
  });
});
