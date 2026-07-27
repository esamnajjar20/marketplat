/**
 * Coverage targets, across useAuth.ts / useUsers.ts / useCategories.ts /
 * useAdmin.ts:
 *
 *  Response-envelope unwrapping (FIX Q-01 / PERF-10 regression guard):
 *   every queryFn here must resolve to r.data.data (the actual payload),
 *   not r.data (the { success, message, data } envelope itself) — this
 *   silently broke before with no error, just empty-looking UI, which
 *   is exactly why it's worth pinning explicitly rather than trusting
 *   it "looks right" in a manual check.
 *
 *  enabled guards:
 *   useMe / useSessions only fire when isAuthenticated; useUser /
 *   useCategoryBySlug / useAdminReportDetail only fire with a non-empty
 *   id/slug.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMe, useSessions } from '@/hooks/queries/useAuth';
import { useUser } from '@/hooks/queries/useUsers';
import { useCategories, useCategoryBySlug } from '@/hooks/queries/useCategories';
import { useAdminAds, useAdminUsers, useAdminReports, useAdminReportDetail, useAdminStats } from '@/hooks/queries/useAdmin';
import { usersApi } from '@/api/users.api';
import { authApi } from '@/api/auth.api';
import { categoriesApi } from '@/api/categories.api';
import { adminApi } from '@/api/admin.api';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/api/users.api', () => ({ usersApi: { getMe: vi.fn(), getById: vi.fn() } }));
vi.mock('@/api/auth.api', () => ({ authApi: { getSessions: vi.fn() } }));
vi.mock('@/api/categories.api', () => ({ categoriesApi: { getAll: vi.fn(), getBySlug: vi.fn() } }));
vi.mock('@/api/admin.api', () => ({
  adminApi: { getAds: vi.fn(), getUsers: vi.fn(), getReports: vi.fn(), getReportById: vi.fn(), getStats: vi.fn() },
}));

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

describe('useMe / useSessions — auth gating', () => {
  it('useMe does not fire when not authenticated', async () => {
    renderHook(() => useMe(), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(usersApi.getMe).not.toHaveBeenCalled();
  });

  it('useMe fires and unwraps r.data.data once authenticated', async () => {
    useAuthStore.getState().setAuth(
      { id: 'u1', name: 'Ahmed', email: 'a@b.com', role: 'USER' },
      { accessToken: 'a' },
    );
    (usersApi.getMe as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, message: 'ok', data: { id: 'u1', name: 'Ahmed', city: 'غزة' } },
    });

    const { result } = renderHook(() => useMe(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ id: 'u1', name: 'Ahmed', city: 'غزة' });
  });

  it('useSessions does not fire when not authenticated', async () => {
    renderHook(() => useSessions(), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(authApi.getSessions).not.toHaveBeenCalled();
  });

  it('useSessions defaults to an empty array when the response has no data', async () => {
    useAuthStore.getState().setAuth(
      { id: 'u1', name: 'Ahmed', email: 'a@b.com', role: 'USER' },
      { accessToken: 'a' },
    );
    (authApi.getSessions as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: undefined } });

    const { result } = renderHook(() => useSessions(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe('useUser — id guard', () => {
  it('does not call usersApi.getById when id is empty', async () => {
    renderHook(() => useUser(''), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(usersApi.getById).not.toHaveBeenCalled();
  });

  it('unwraps r.data.data for a real id', async () => {
    (usersApi.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, data: { id: 'u1', name: 'Ahmed' } },
    });
    const { result } = renderHook(() => useUser('u1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: 'u1', name: 'Ahmed' });
  });
});

describe('useCategories / useCategoryBySlug', () => {
  it('REGRESSION (FIX PERF-10): unwraps r.data.data, not r.data', async () => {
    (categoriesApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, message: 'ok', data: [{ id: 'c1', name: 'Electronics' }] },
    });
    const { result } = renderHook(() => useCategories(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([{ id: 'c1', name: 'Electronics' }]);
  });

  it('useCategoryBySlug does not fire when slug is empty', async () => {
    renderHook(() => useCategoryBySlug(''), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(categoriesApi.getBySlug).not.toHaveBeenCalled();
  });

  it('useCategoryBySlug unwraps r.data.data for a real slug', async () => {
    (categoriesApi.getBySlug as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'c1', slug: 'electronics' } },
    });
    const { result } = renderHook(() => useCategoryBySlug('electronics'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: 'c1', slug: 'electronics' });
  });
});

describe('useAdmin* hooks — response unwrapping', () => {
  it('useAdminAds unwraps r.data.data', async () => {
    (adminApi.getAds as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'ad-1' }], meta: { total: 1 } } },
    });
    const { result } = renderHook(() => useAdminAds(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ items: [{ id: 'ad-1' }], meta: { total: 1 } });
  });

  it('useAdminUsers unwraps r.data.data', async () => {
    (adminApi.getUsers as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'u1' }], meta: { total: 1 } } },
    });
    const { result } = renderHook(() => useAdminUsers(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ items: [{ id: 'u1' }], meta: { total: 1 } });
  });

  it('useAdminReports calls adminApi.getReports (which itself targets GET /reports, FIX C-08)', async () => {
    (adminApi.getReports as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [], meta: {} } },
    });
    const { result } = renderHook(() => useAdminReports({ status: 'PENDING' as any }), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(adminApi.getReports).toHaveBeenCalledWith({ status: 'PENDING' });
  });

  it('useAdminReportDetail does not fire when reportId is empty', async () => {
    renderHook(() => useAdminReportDetail(''), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(adminApi.getReportById).not.toHaveBeenCalled();
  });

  it('useAdminStats unwraps r.data.data', async () => {
    (adminApi.getStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { totalAds: 5, activeAds: 3, totalUsers: 10, activeUsers: 8, openReports: 1, viewsToday: 42 } },
    });
    const { result } = renderHook(() => useAdminStats(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.viewsToday).toBe(42);
  });
});
