/**
 * __tests__/unit/hooks/useMoreQueries.test.tsx
 *
 * Previously uncovered (0%): useActivity.ts, useAppointments.ts,
 * useProducts.ts, useSearch.ts.
 *
 *  useMyActivity: auth-gated, unwraps r.data.data.
 *  useMyAppointments: auth-gated, unwraps r.data.data.
 *  useAvailability: only fires with both providerId and date.
 *  useProducts / useProduct / useMyProducts: public list/detail/mine,
 *   useProduct gated on a non-empty id.
 *  useSearch: always enabled, unwraps r.data.data.
 *  useSearchSuggestions: only fires with a trimmed query >= 2 chars.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMyActivity } from '@/hooks/queries/useActivity';
import { useMyAppointments, useAvailability } from '@/hooks/queries/useAppointments';
import { useProducts, useProduct, useMyProducts } from '@/hooks/queries/useProducts';
import { useSearch, useSearchSuggestions } from '@/hooks/queries/useSearch';
import { activityApi } from '@/api/activity.api';
import { appointmentsApi } from '@/api/appointments.api';
import { productsApi } from '@/api/products.api';
import { searchApi } from '@/api/search.api';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/api/activity.api', () => ({ activityApi: { getMine: vi.fn() } }));
vi.mock('@/api/appointments.api', () => ({
  appointmentsApi: { getMine: vi.fn(), getAvailability: vi.fn() },
}));
vi.mock('@/api/products.api', () => ({
  productsApi: { getAll: vi.fn(), getById: vi.fn(), getMine: vi.fn() },
}));
vi.mock('@/api/search.api', () => ({ searchApi: { search: vi.fn(), suggest: vi.fn() } }));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.getState().logout();
});

describe('useMyActivity', () => {
  it('does not fire when not authenticated', async () => {
    renderHook(() => useMyActivity(), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(activityApi.getMine).not.toHaveBeenCalled();
  });

  it('fires and unwraps r.data.data once authenticated', async () => {
    useAuthStore.getState().setAuth(
      { id: 'u1', name: 'Ahmed', email: 'a@b.com', role: 'USER' },
      { accessToken: 'a' },
    );
    (activityApi.getMine as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'act-1' }], meta: { total: 1 } } },
    });

    const { result } = renderHook(() => useMyActivity(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ items: [{ id: 'act-1' }], meta: { total: 1 } });
  });
});

describe('useMyAppointments', () => {
  it('does not fire when not authenticated', async () => {
    renderHook(() => useMyAppointments(), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(appointmentsApi.getMine).not.toHaveBeenCalled();
  });

  it('fires and unwraps r.data.data once authenticated', async () => {
    useAuthStore.getState().setAuth(
      { id: 'u1', name: 'Ahmed', email: 'a@b.com', role: 'USER' },
      { accessToken: 'a' },
    );
    (appointmentsApi.getMine as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'appt-1' }], meta: { total: 1 } } },
    });

    const { result } = renderHook(() => useMyAppointments(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ items: [{ id: 'appt-1' }], meta: { total: 1 } });
  });
});

describe('useAvailability', () => {
  it('does not fire without both providerId and date', async () => {
    renderHook(() => useAvailability('', '2026-08-13'), { wrapper: createWrapper() });
    renderHook(() => useAvailability('provider-1', ''), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(appointmentsApi.getAvailability).not.toHaveBeenCalled();
  });

  it('fires and unwraps r.data.data when both are present', async () => {
    (appointmentsApi.getAvailability as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { slots: ['10:00', '11:00'] } },
    });

    const { result } = renderHook(() => useAvailability('provider-1', '2026-08-13'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(appointmentsApi.getAvailability).toHaveBeenCalledWith('provider-1', '2026-08-13');
    expect(result.current.data).toEqual({ slots: ['10:00', '11:00'] });
  });
});

describe('useProducts / useProduct / useMyProducts', () => {
  it('useProducts fires without auth and unwraps r.data.data', async () => {
    (productsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'p1' }], meta: { total: 1 } } },
    });

    const { result } = renderHook(() => useProducts(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ items: [{ id: 'p1' }], meta: { total: 1 } });
  });

  it('useProduct does not fire with an empty id', async () => {
    renderHook(() => useProduct(''), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(productsApi.getById).not.toHaveBeenCalled();
  });

  it('useProduct fires and unwraps r.data.data with a non-empty id', async () => {
    (productsApi.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'p1', title: 'Product' } },
    });

    const { result } = renderHook(() => useProduct('p1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(productsApi.getById).toHaveBeenCalledWith('p1');
    expect(result.current.data).toEqual({ id: 'p1', title: 'Product' });
  });

  it('useMyProducts unwraps r.data.data', async () => {
    (productsApi.getMine as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'p2' }], meta: { total: 1 } } },
    });

    const { result } = renderHook(() => useMyProducts(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ items: [{ id: 'p2' }], meta: { total: 1 } });
  });
});

describe('useSearch', () => {
  it('fires unconditionally (even with no params) and unwraps r.data.data', async () => {
    (searchApi.search as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'r1' }], meta: { total: 1 } } },
    });

    const { result } = renderHook(() => useSearch(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(searchApi.search).toHaveBeenCalledWith(undefined);
    expect(result.current.data).toEqual({ items: [{ id: 'r1' }], meta: { total: 1 } });
  });
});

describe('useSearchSuggestions', () => {
  it('does not fire for a query shorter than 2 trimmed characters', async () => {
    renderHook(() => useSearchSuggestions('a'), { wrapper: createWrapper() });
    renderHook(() => useSearchSuggestions('  '), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(searchApi.suggest).not.toHaveBeenCalled();
  });

  it('fires for a 2+ character query and defaults to an empty array with no data', async () => {
    (searchApi.suggest as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: undefined } });

    const { result } = renderHook(() => useSearchSuggestions('ca'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(searchApi.suggest).toHaveBeenCalledWith({ q: 'ca' });
    expect(result.current.data).toEqual([]);
  });

  it('returns the suggestions array when present', async () => {
    (searchApi.suggest as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { suggestions: ['car', 'card'] } },
    });

    const { result } = renderHook(() => useSearchSuggestions('car'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(['car', 'card']);
  });
});
