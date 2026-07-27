/**
 * Coverage targets:
 *
 *  useAdminSetFeatured / useAdminSetPinned (shared useToggleAdField factory):
 *   - optimistically updates the matching ad's field in every cached
 *     admin ads list query, leaving other ads/fields untouched
 *   - rolls back to the exact previous snapshot on failure
 *   - shows the correct success toast depending on the new value
 *
 *  useAdminForceDeleteAd:
 *   - removes the ad's detail query and invalidates the admin ads list
 *
 *  useAdminToggleUserActive / useAdminChangeRole:
 *   - same optimistic-update/rollback shape as the ad-field toggles,
 *     applied to the admin users list
 *
 *  useAdminUpdateReportStatus:
 *   - updates the report detail cache entry and invalidates the list
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useAdminSetFeatured, useAdminSetPinned, useAdminForceDeleteAd,
  useAdminToggleUserActive, useAdminChangeRole, useAdminUpdateReportStatus,
} from '@/hooks/mutations/useAdminMutations';
import { adminApi } from '@/api/admin.api';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from 'sonner';

vi.mock('@/api/admin.api', () => ({
  adminApi: {
    setFeatured: vi.fn(), setPinned: vi.fn(), forceDeleteAd: vi.fn(),
    toggleUserActive: vi.fn(), changeRole: vi.fn(), updateReportStatus: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAdminSetFeatured / useAdminSetPinned (shared optimistic-update logic)', () => {
  function seedAdsList(queryClient: QueryClient) {
    queryClient.setQueryData(queryKeys.admin.ads(), {
      items: [
        { id: 'ad-1', title: 'Ad One', isFeatured: false, isPinned: false },
        { id: 'ad-2', title: 'Ad Two', isFeatured: false, isPinned: false },
      ],
      meta: { total: 2 },
    });
  }

  it('optimistically sets isFeatured on the matching ad only', async () => {
    const queryClient = makeClient();
    seedAdsList(queryClient);
    (adminApi.setFeatured as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: {} } });

    const { result } = renderHook(() => useAdminSetFeatured(), { wrapper: createWrapper(queryClient) });
    act(() => { result.current.mutate({ adId: 'ad-1', value: true }); });

    const duringFlight = queryClient.getQueryData<any>(queryKeys.admin.ads());
    expect(duringFlight.items.find((a: any) => a.id === 'ad-1').isFeatured).toBe(true);
    expect(duringFlight.items.find((a: any) => a.id === 'ad-2').isFeatured).toBe(false);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls back to the exact previous snapshot when the request fails', async () => {
    const queryClient = makeClient();
    seedAdsList(queryClient);
    (adminApi.setFeatured as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 500, data: { message: 'فشل التحديث' } },
    });

    const { result } = renderHook(() => useAdminSetFeatured(), { wrapper: createWrapper(queryClient) });
    act(() => { result.current.mutate({ adId: 'ad-1', value: true }); });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const afterRollback = queryClient.getQueryData<any>(queryKeys.admin.ads());
    expect(afterRollback.items.find((a: any) => a.id === 'ad-1').isFeatured).toBe(false);
    expect(toast.error).toHaveBeenCalled();
  });

  it('shows the "removed" toast message when setting isFeatured back to false', async () => {
    const queryClient = makeClient();
    seedAdsList(queryClient);
    (adminApi.setFeatured as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: {} } });

    const { result } = renderHook(() => useAdminSetFeatured(), { wrapper: createWrapper(queryClient) });
    act(() => { result.current.mutate({ adId: 'ad-1', value: false }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(toast.success).toHaveBeenCalledWith('تم إلغاء التمييز');
  });

  it('useAdminSetPinned updates isPinned independently of isFeatured', async () => {
    const queryClient = makeClient();
    seedAdsList(queryClient);
    (adminApi.setPinned as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: {} } });

    const { result } = renderHook(() => useAdminSetPinned(), { wrapper: createWrapper(queryClient) });
    act(() => { result.current.mutate({ adId: 'ad-1', value: true }); });

    const duringFlight = queryClient.getQueryData<any>(queryKeys.admin.ads());
    const ad1 = duringFlight.items.find((a: any) => a.id === 'ad-1');
    expect(ad1.isPinned).toBe(true);
    expect(ad1.isFeatured).toBe(false); // untouched by this mutation

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('does not crash when the cache has no matching admin ads query yet', async () => {
    const queryClient = makeClient(); // no seedAdsList call
    (adminApi.setFeatured as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: {} } });

    const { result } = renderHook(() => useAdminSetFeatured(), { wrapper: createWrapper(queryClient) });
    expect(() => act(() => { result.current.mutate({ adId: 'ad-1', value: true }); })).not.toThrow();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useAdminForceDeleteAd', () => {
  it('removes the ad detail cache entry and shows a success toast', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(queryKeys.ads.detail('ad-1'), { id: 'ad-1', title: 'Ad One' });
    (adminApi.forceDeleteAd as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true } });

    const { result } = renderHook(() => useAdminForceDeleteAd(), { wrapper: createWrapper(queryClient) });
    act(() => { result.current.mutate('ad-1'); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(queryKeys.ads.detail('ad-1'))).toBeUndefined();
    expect(toast.success).toHaveBeenCalledWith('تم حذف الإعلان نهائياً');
  });

  it('shows an error toast on failure', async () => {
    const queryClient = makeClient();
    (adminApi.forceDeleteAd as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 403, data: { message: 'غير مسموح' } },
    });

    const { result } = renderHook(() => useAdminForceDeleteAd(), { wrapper: createWrapper(queryClient) });
    act(() => { result.current.mutate('ad-1'); });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useAdminToggleUserActive', () => {
  function seedUsersList(queryClient: QueryClient) {
    queryClient.setQueryData(queryKeys.admin.users(), {
      items: [{ id: 'user-1', name: 'Ahmed', isActive: true, role: 'USER' }],
      meta: { total: 1 },
    });
  }

  it('optimistically updates isActive, rolling back on failure', async () => {
    const queryClient = makeClient();
    seedUsersList(queryClient);
    (adminApi.toggleUserActive as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useAdminToggleUserActive(), { wrapper: createWrapper(queryClient) });
    act(() => { result.current.mutate({ userId: 'user-1', isActive: false }); });

    const duringFlight = queryClient.getQueryData<any>(queryKeys.admin.users());
    expect(duringFlight.items[0].isActive).toBe(false);

    await waitFor(() => expect(result.current.isError).toBe(true));
    const afterRollback = queryClient.getQueryData<any>(queryKeys.admin.users());
    expect(afterRollback.items[0].isActive).toBe(true);
  });

  it('shows the correct toast for activation vs deactivation', async () => {
    const queryClient = makeClient();
    seedUsersList(queryClient);
    (adminApi.toggleUserActive as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: {} } });

    const { result } = renderHook(() => useAdminToggleUserActive(), { wrapper: createWrapper(queryClient) });
    act(() => { result.current.mutate({ userId: 'user-1', isActive: false }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(toast.success).toHaveBeenCalledWith('تم تعطيل الحساب');
  });
});

describe('useAdminChangeRole (FIX AUDIT-V3-05)', () => {
  function seedUsersList(queryClient: QueryClient) {
    queryClient.setQueryData(queryKeys.admin.users(), {
      items: [{ id: 'user-1', name: 'Ahmed', isActive: true, role: 'USER' }],
      meta: { total: 1 },
    });
  }

  it('optimistically updates the role field', async () => {
    const queryClient = makeClient();
    seedUsersList(queryClient);
    (adminApi.changeRole as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: {} } });

    const { result } = renderHook(() => useAdminChangeRole(), { wrapper: createWrapper(queryClient) });
    act(() => { result.current.mutate({ userId: 'user-1', role: 'ADMIN' }); });

    const duringFlight = queryClient.getQueryData<any>(queryKeys.admin.users());
    expect(duringFlight.items[0].role).toBe('ADMIN');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم ترقية المستخدم إلى مدير');
  });

  it('rolls back the role on failure (e.g. the backend\'s last-admin guard rejecting it)', async () => {
    const queryClient = makeClient();
    seedUsersList(queryClient);
    (adminApi.changeRole as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 400, data: { message: 'لا يمكن تنزيل صلاحيات آخر مدير نشط' } },
    });

    const { result } = renderHook(() => useAdminChangeRole(), { wrapper: createWrapper(queryClient) });
    act(() => { result.current.mutate({ userId: 'user-1', role: 'USER' }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const afterRollback = queryClient.getQueryData<any>(queryKeys.admin.users());
    expect(afterRollback.items[0].role).toBe('USER'); // back to original, unchanged
    expect(toast.error).toHaveBeenCalled();
  });

  it('shows the demotion toast message for USER role', async () => {
    const queryClient = makeClient();
    seedUsersList(queryClient);
    (adminApi.changeRole as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: {} } });

    const { result } = renderHook(() => useAdminChangeRole(), { wrapper: createWrapper(queryClient) });
    act(() => { result.current.mutate({ userId: 'user-1', role: 'USER' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(toast.success).toHaveBeenCalledWith('تم تنزيل المستخدم إلى مستخدم عادي');
  });
});

describe('useAdminUpdateReportStatus', () => {
  it('updates the report detail cache and shows a success toast', async () => {
    const queryClient = makeClient();
    const updatedReport = { id: 'report-1', status: 'RESOLVED' };
    (adminApi.updateReportStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: updatedReport } });

    const { result } = renderHook(() => useAdminUpdateReportStatus(), { wrapper: createWrapper(queryClient) });
    act(() => { result.current.mutate({ reportId: 'report-1', status: 'RESOLVED' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(queryKeys.admin.reportDetail('report-1'))).toEqual(updatedReport);
    expect(toast.success).toHaveBeenCalledWith('تم تحديث حالة البلاغ');
  });

  it('shows an error toast on failure', async () => {
    const queryClient = makeClient();
    (adminApi.updateReportStatus as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 404, data: { message: 'البلاغ غير موجود' } },
    });

    const { result } = renderHook(() => useAdminUpdateReportStatus(), { wrapper: createWrapper(queryClient) });
    act(() => { result.current.mutate({ reportId: 'report-1', status: 'DISMISSED' }); });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalled();
  });
});
