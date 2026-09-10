/**
 * __tests__/unit/hooks/useRepublishAd.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useRepublishAd } from '@/hooks/mutations/useRepublishAd';
import { republishAd } from '@/api/ads-republish.api';
import { toast } from 'sonner';

vi.mock('@/api/ads-republish.api', () => ({
  republishAd: vi.fn(),
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

describe('useRepublishAd', () => {
  beforeEach(() => {
    vi.mocked(republishAd).mockReset();
    vi.mocked(toast.success).mockReset();
  });

  it('republishes and shows success toast', async () => {
    vi.mocked(republishAd).mockResolvedValue({ data: { data: {} } } as never);
    const { result } = renderHook(() => useRepublishAd(), { wrapper: wrapper() });

    await act(async () => {
      result.current.mutate('ad-1');
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('تم إعادة نشر الإعلان'));
    expect(republishAd).toHaveBeenCalledWith('ad-1');
  });
});
