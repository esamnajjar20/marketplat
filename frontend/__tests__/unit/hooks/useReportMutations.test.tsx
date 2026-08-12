/**
 * __tests__/unit/hooks/useReportMutations.test.tsx
 *
 * Previously uncovered (0%) despite backing all three "الإبلاغ عن..."
 * buttons (ad / user / store). Coverage for useReportAd, useReportUser,
 * useReportStore — each:
 *   - calls the matching reportsApi.report* method with (targetId, payload)
 *   - shows a success toast on success
 *   - shows an error toast on failure
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useReportAd,
  useReportUser,
  useReportStore,
} from '@/hooks/mutations/useReportMutations';
import { reportsApi } from '@/api/reports.api';
import { toast } from 'sonner';

vi.mock('@/api/reports.api', () => ({
  reportsApi: {
    reportAd: vi.fn(),
    reportUser: vi.fn(),
    reportStore: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return wrapper;
}

beforeEach(() => vi.clearAllMocks());

const payload = { reason: 'SCAM' as const, notes: 'looks fake' };

describe('useReportAd', () => {
  it('calls reportsApi.reportAd with the ad ID and payload', async () => {
    (reportsApi.reportAd as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: null } });
    const wrapper = createWrapper();

    const { result } = renderHook(() => useReportAd('ad-1'), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(reportsApi.reportAd).toHaveBeenCalledWith('ad-1', payload);
  });

  it('shows a success toast on success', async () => {
    (reportsApi.reportAd as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: null } });
    const wrapper = createWrapper();

    const { result } = renderHook(() => useReportAd('ad-1'), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم إرسال بلاغك، شكراً لك');
  });

  it('shows an error toast on failure', async () => {
    (reportsApi.reportAd as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Rate limited'));
    const wrapper = createWrapper();

    const { result } = renderHook(() => useReportAd('ad-1'), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useReportUser', () => {
  it('calls reportsApi.reportUser with the user ID and payload', async () => {
    (reportsApi.reportUser as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: null } });
    const wrapper = createWrapper();

    const { result } = renderHook(() => useReportUser('user-1'), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(reportsApi.reportUser).toHaveBeenCalledWith('user-1', payload);
  });

  it('shows a success toast on success', async () => {
    (reportsApi.reportUser as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: null } });
    const wrapper = createWrapper();

    const { result } = renderHook(() => useReportUser('user-1'), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم إرسال بلاغك، شكراً لك');
  });

  it('shows an error toast on failure', async () => {
    (reportsApi.reportUser as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Rate limited'));
    const wrapper = createWrapper();

    const { result } = renderHook(() => useReportUser('user-1'), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useReportStore', () => {
  it('calls reportsApi.reportStore with the store ID and payload', async () => {
    (reportsApi.reportStore as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: null } });
    const wrapper = createWrapper();

    const { result } = renderHook(() => useReportStore('store-1'), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(reportsApi.reportStore).toHaveBeenCalledWith('store-1', payload);
  });

  it('shows a success toast on success', async () => {
    (reportsApi.reportStore as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: null } });
    const wrapper = createWrapper();

    const { result } = renderHook(() => useReportStore('store-1'), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم إرسال بلاغك، شكراً لك');
  });

  it('shows an error toast on failure', async () => {
    (reportsApi.reportStore as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Rate limited'));
    const wrapper = createWrapper();

    const { result } = renderHook(() => useReportStore('store-1'), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});
