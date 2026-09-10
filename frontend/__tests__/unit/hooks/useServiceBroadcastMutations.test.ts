/**
 * __tests__/unit/hooks/useServiceBroadcastMutations.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  useWithdrawServiceQuote,
  useAcceptServiceQuote,
} from '@/hooks/mutations/useServiceBroadcastMutations';
import { serviceBroadcastsApi } from '@/api/service-broadcasts.api';
import { toast } from 'sonner';

vi.mock('@/api/service-broadcasts.api', () => ({
  serviceBroadcastsApi: {
    withdrawQuote: vi.fn(),
    acceptQuote: vi.fn(),
  },
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/errorParser', () => ({
  parseApiError: () => ({ message: 'خطأ' }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('useServiceBroadcastMutations', () => {
  beforeEach(() => {
    vi.mocked(serviceBroadcastsApi.withdrawQuote).mockResolvedValue({
      data: { data: {} },
    } as never);
    vi.mocked(serviceBroadcastsApi.acceptQuote).mockResolvedValue({
      data: { data: {} },
    } as never);
    vi.mocked(toast.success).mockReset();
  });

  it('withdraw shows success toast', async () => {
    const { result } = renderHook(() => useWithdrawServiceQuote('b1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('q1');
    });
    expect(serviceBroadcastsApi.withdrawQuote).toHaveBeenCalledWith('b1', 'q1');
    expect(toast.success).toHaveBeenCalledWith('تم سحب العرض');
  });

  it('accept shows success toast', async () => {
    const { result } = renderHook(() => useAcceptServiceQuote('b1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('q1');
    });
    expect(serviceBroadcastsApi.acceptQuote).toHaveBeenCalledWith('b1', 'q1');
    expect(toast.success).toHaveBeenCalledWith('تم قبول العرض');
  });
});
