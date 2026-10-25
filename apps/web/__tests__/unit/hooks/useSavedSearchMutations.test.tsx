/**
 * __tests__/unit/hooks/useSavedSearchMutations.test.tsx
 *
 * Previously uncovered (0%). Coverage:
 *
 *  useCreateSavedSearch:
 *   - calls savedSearchesApi.create with the input
 *   - invalidates savedSearches.all() on success
 *   - shows a success toast on success
 *   - shows an error toast on failure
 *
 *  useDeleteSavedSearch:
 *   - calls savedSearchesApi.delete with the id
 *   - invalidates savedSearches.all() on success
 *   - shows a success toast on success
 *   - shows an error toast on failure
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useCreateSavedSearch,
  useDeleteSavedSearch,
} from '@/hooks/mutations/useSavedSearchMutations';
import { savedSearchesApi } from '@/api/savedSearches.api';
import { toast } from 'sonner';

vi.mock('@/api/savedSearches.api', () => ({
  savedSearchesApi: {
    create: vi.fn(),
    delete: vi.fn(),
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

describe('useCreateSavedSearch', () => {
  it('calls savedSearchesApi.create with the input', async () => {
    (savedSearchesApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'ss-1' } },
    });
    const { wrapper } = createWrapper();
    const input = { name: 'My search', query: { q: 'car' } } as unknown as Parameters<
      typeof savedSearchesApi.create
    >[0];

    const { result } = renderHook(() => useCreateSavedSearch(), { wrapper });
    act(() => { result.current.mutate(input); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(savedSearchesApi.create).toHaveBeenCalledWith(input);
  });

  it('invalidates savedSearches.all() and shows a success toast on success (defaults to ads wording when filters.type is absent)', async () => {
    (savedSearchesApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'ss-1' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateSavedSearch(), { wrapper });
    act(() => {
      result.current.mutate({} as Parameters<typeof savedSearchesApi.create>[0]);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) =>
      JSON.stringify((c[0] as { queryKey: unknown }).queryKey),
    );
    expect(invalidatedKeys.some((k) => k === JSON.stringify(['savedSearches', 'list']))).toBe(true);
    expect(toast.success).toHaveBeenCalledWith('تم حفظ البحث — سنُعلمك عند وجود إعلان مطابق');
  });

  // PLATFORM-WIDE-01
  it('shows product-specific success wording when filters.type is products', async () => {
    (savedSearchesApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'ss-1' } },
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateSavedSearch(), { wrapper });
    act(() => {
      result.current.mutate({
        label: 'Cases',
        filters: { type: 'products', q: 'case' },
      } as Parameters<typeof savedSearchesApi.create>[0]);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم حفظ البحث — سنُعلمك عند وجود منتج مطابق');
  });

  // PLATFORM-WIDE-01
  it('shows service-specific success wording when filters.type is services', async () => {
    (savedSearchesApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'ss-1' } },
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateSavedSearch(), { wrapper });
    act(() => {
      result.current.mutate({
        label: 'AC repair',
        filters: { type: 'services', q: 'ac' },
      } as Parameters<typeof savedSearchesApi.create>[0]);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم حفظ البحث — سنُعلمك عند وجود خدمة مطابقة');
  });

  it('shows an error toast on failure', async () => {
    (savedSearchesApi.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Server error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateSavedSearch(), { wrapper });
    act(() => {
      result.current.mutate({} as Parameters<typeof savedSearchesApi.create>[0]);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useDeleteSavedSearch', () => {
  it('calls savedSearchesApi.delete with the id', async () => {
    (savedSearchesApi.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true } });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useDeleteSavedSearch(), { wrapper });
    act(() => { result.current.mutate('ss-1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(savedSearchesApi.delete).toHaveBeenCalledWith('ss-1');
  });

  it('invalidates savedSearches.all() and shows a success toast on success', async () => {
    (savedSearchesApi.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true } });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useDeleteSavedSearch(), { wrapper });
    act(() => { result.current.mutate('ss-1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) =>
      JSON.stringify((c[0] as { queryKey: unknown }).queryKey),
    );
    expect(invalidatedKeys.some((k) => k === JSON.stringify(['savedSearches', 'list']))).toBe(true);
    expect(toast.success).toHaveBeenCalledWith('تم حذف البحث المحفوظ');
  });

  it('shows an error toast on failure', async () => {
    (savedSearchesApi.delete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Cannot delete'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useDeleteSavedSearch(), { wrapper });
    act(() => { result.current.mutate('ss-1'); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});
