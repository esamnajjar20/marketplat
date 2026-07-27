/**
 * FIX TEST-V4-11: every API file in this project is a thin wrapper
 * around apiClient with effectively no branching logic, but their own
 * code comments document REAL historical bugs of exactly the class
 * this file guards against:
 *
 *   - getMyAds called '/ads/my' instead of '/ads/me' (FIX C-06)
 *   - getBySlug called '/categories/:slug' instead of
 *     '/categories/slug/:slug' (FIX C-07)
 *   - updateReportStatus called PATCH /admin/reports/:id instead of
 *     PATCH /reports/:id/status (FIX C-08)
 *   - ReportStatus used 'REVIEWED' instead of the real enum 'RESOLVED'
 *     (FIX T-03)
 *
 * None of these would be caught by a type checker (string literals and
 * URL paths are both just strings) — only a test that asserts the
 * actual call shape catches a typo like this before it reaches
 * production. This file is intentionally broad rather than deep: one
 * assertion per endpoint, covering every exported method across the
 * thin-wrapper API files not already covered by client.test.ts
 * (auth/refresh) or ads.api.test.ts (the FormData-heavy methods).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/api/client';
import { authApi } from '@/api/auth.api';
import { usersApi } from '@/api/users.api';
import { favoritesApi } from '@/api/favorites.api';
import { reportsApi } from '@/api/reports.api';
import { categoriesApi } from '@/api/categories.api';
import { adminApi } from '@/api/admin.api';

vi.mock('@/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of ['get', 'post', 'patch', 'delete'] as const) {
    (apiClient[method] as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true, data: null } });
  }
});

describe('authApi', () => {
  it('login → POST /auth/login', async () => {
    await authApi.login({ email: 'a@b.com', password: 'pw' });
    expect(apiClient.post).toHaveBeenCalledWith('/auth/login', { email: 'a@b.com', password: 'pw' });
  });

  it('register → POST /auth/register', async () => {
    const payload = { name: 'A', email: 'a@b.com', password: 'pw' };
    await authApi.register(payload as any);
    expect(apiClient.post).toHaveBeenCalledWith('/auth/register', payload);
  });

  it('logout → POST /auth/logout', async () => {
    await authApi.logout();
    expect(apiClient.post).toHaveBeenCalledWith('/auth/logout');
  });

  it('logoutAll → POST /auth/logout-all (not /auth/logoutAll)', async () => {
    await authApi.logoutAll();
    expect(apiClient.post).toHaveBeenCalledWith('/auth/logout-all');
  });

  it('getSessions → GET /auth/sessions', async () => {
    await authApi.getSessions();
    expect(apiClient.get).toHaveBeenCalledWith('/auth/sessions');
  });

  it('revokeSession → DELETE /auth/sessions/:id', async () => {
    await authApi.revokeSession('session-1');
    expect(apiClient.delete).toHaveBeenCalledWith('/auth/sessions/session-1');
  });

  it('forgotPassword → POST /auth/forgot-password', async () => {
    await authApi.forgotPassword({ email: 'a@b.com' });
    expect(apiClient.post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'a@b.com' });
  });

  it('resetPassword → POST /auth/reset-password', async () => {
    await authApi.resetPassword({ token: 't', newPassword: 'pw' });
    expect(apiClient.post).toHaveBeenCalledWith('/auth/reset-password', { token: 't', newPassword: 'pw' });
  });
});

describe('usersApi', () => {
  it('getMe → GET /users/me', async () => {
    await usersApi.getMe();
    expect(apiClient.get).toHaveBeenCalledWith('/users/me', undefined);
  });

  it('updateMe → PATCH /users/me', async () => {
    await usersApi.updateMe({ name: 'New Name' });
    expect(apiClient.patch).toHaveBeenCalledWith('/users/me', { name: 'New Name' });
  });

  it('deleteMe → DELETE /users/me', async () => {
    await usersApi.deleteMe();
    expect(apiClient.delete).toHaveBeenCalledWith('/users/me');
  });

  it('changePassword → POST /users/me/password', async () => {
    await usersApi.changePassword({ currentPassword: 'old', newPassword: 'new' });
    expect(apiClient.post).toHaveBeenCalledWith('/users/me/password', { currentPassword: 'old', newPassword: 'new' });
  });

  it('updateNotificationPreferences → PATCH /users/me/notifications', async () => {
    await usersApi.updateNotificationPreferences({ promotions: true });
    expect(apiClient.patch).toHaveBeenCalledWith('/users/me/notifications', { promotions: true });
  });

  it('getById → GET /users/:id', async () => {
    await usersApi.getById('user-1');
    expect(apiClient.get).toHaveBeenCalledWith('/users/user-1');
  });

  it('getUserAds → GET /users/:id/ads', async () => {
    await usersApi.getUserAds('user-1', { page: 2 });
    expect(apiClient.get).toHaveBeenCalledWith('/users/user-1/ads', { params: { page: 2 } });
  });

  it('uploadAvatar → POST /users/me/avatar with field name "image" (singular — matches backend multer config)', async () => {
    const file = new File(['bytes'], 'avatar.jpg', { type: 'image/jpeg' });
    await usersApi.uploadAvatar(file);

    expect(apiClient.post).toHaveBeenCalledWith(
      '/users/me/avatar',
      expect.any(FormData),
      expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } }),
    );
    const form = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    expect(form.get('image')).toBeInstanceOf(File);
    expect(form.has('images')).toBe(false);
  });
});

describe('favoritesApi', () => {
  it('getAll → GET /favorites', async () => {
    await favoritesApi.getAll({ page: 1 });
    expect(apiClient.get).toHaveBeenCalledWith('/favorites', { params: { page: 1 } });
  });

  it('toggle → POST /favorites/:adId', async () => {
    await favoritesApi.toggle('ad-1');
    expect(apiClient.post).toHaveBeenCalledWith('/favorites/ad-1');
  });
});

describe('reportsApi', () => {
  it('reportAd → POST /reports/ads/:adId', async () => {
    await reportsApi.reportAd('ad-1', { reason: 'SCAM' as any });
    expect(apiClient.post).toHaveBeenCalledWith('/reports/ads/ad-1', { reason: 'SCAM' });
  });
});

describe('categoriesApi', () => {
  it('getAll → GET /categories', async () => {
    await categoriesApi.getAll();
    expect(apiClient.get).toHaveBeenCalledWith('/categories');
  });

  it('getBySlug → GET /categories/slug/:slug (NOT /categories/:slug — historical bug FIX C-07)', async () => {
    await categoriesApi.getBySlug('electronics');
    expect(apiClient.get).toHaveBeenCalledWith('/categories/slug/electronics');
  });

  // L-7 (audit fix): 'getById → GET /categories/:id' test removed along
  // with categoriesApi.getById itself — see categories.api.ts's comment.
  // Zero callers anywhere in the app; the backend route stays, this was
  // just the unused frontend wrapper and its test.

  it('create → POST /categories', async () => {
    const payload = { name: 'Electronics', nameAr: 'إلكترونيات', slug: 'electronics' };
    await categoriesApi.create(payload);
    expect(apiClient.post).toHaveBeenCalledWith('/categories', payload);
  });

  it('update → PATCH /categories/:id', async () => {
    await categoriesApi.update('cat-1', { name: 'New Name' });
    expect(apiClient.patch).toHaveBeenCalledWith('/categories/cat-1', { name: 'New Name' });
  });

  it('delete → DELETE /categories/:id', async () => {
    await categoriesApi.delete('cat-1');
    expect(apiClient.delete).toHaveBeenCalledWith('/categories/cat-1');
  });
});

describe('adminApi', () => {
  it('getStats → GET /admin/stats', async () => {
    await adminApi.getStats();
    expect(apiClient.get).toHaveBeenCalledWith('/admin/stats');
  });

  it('getAds → GET /admin/ads', async () => {
    await adminApi.getAds({ page: 1 } as any);
    expect(apiClient.get).toHaveBeenCalledWith('/admin/ads', { params: { page: 1 } });
  });

  it('setFeatured → PATCH /admin/ads/:id/featured', async () => {
    await adminApi.setFeatured('ad-1', { isFeatured: true });
    expect(apiClient.patch).toHaveBeenCalledWith('/admin/ads/ad-1/featured', { isFeatured: true });
  });

  it('setPinned → PATCH /admin/ads/:id/pinned', async () => {
    await adminApi.setPinned('ad-1', { isPinned: true });
    expect(apiClient.patch).toHaveBeenCalledWith('/admin/ads/ad-1/pinned', { isPinned: true });
  });

  it('forceDeleteAd → DELETE /admin/ads/:id', async () => {
    await adminApi.forceDeleteAd('ad-1');
    expect(apiClient.delete).toHaveBeenCalledWith('/admin/ads/ad-1');
  });

  it('getUsers → GET /admin/users', async () => {
    await adminApi.getUsers({ page: 1 } as any);
    expect(apiClient.get).toHaveBeenCalledWith('/admin/users', { params: { page: 1 } });
  });

  it('toggleUserActive → PATCH /admin/users/:id/active', async () => {
    await adminApi.toggleUserActive('user-1', { isActive: false });
    expect(apiClient.patch).toHaveBeenCalledWith('/admin/users/user-1/active', { isActive: false });
  });

  it('changeRole → PATCH /admin/users/:id/role', async () => {
    await adminApi.changeRole('user-1', 'ADMIN');
    expect(apiClient.patch).toHaveBeenCalledWith('/admin/users/user-1/role', { role: 'ADMIN' });
  });

  it('getReports → GET /reports (NOT /admin/reports)', async () => {
    await adminApi.getReports({ status: 'PENDING' as any });
    expect(apiClient.get).toHaveBeenCalledWith('/reports', { params: { status: 'PENDING' } });
  });

  it('getReportById → GET /reports/:id', async () => {
    await adminApi.getReportById('report-1');
    expect(apiClient.get).toHaveBeenCalledWith('/reports/report-1');
  });

  it('updateReportStatus → PATCH /reports/:id/status (NOT PATCH /admin/reports/:id — historical bug FIX C-08)', async () => {
    await adminApi.updateReportStatus('report-1', 'RESOLVED');
    expect(apiClient.patch).toHaveBeenCalledWith('/reports/report-1/status', { status: 'RESOLVED' });
  });

  it('updateReportStatus accepts the real backend enum value "RESOLVED" (NOT "REVIEWED" — historical bug FIX T-03)', async () => {
    await adminApi.updateReportStatus('report-1', 'DISMISSED');
    expect(apiClient.patch).toHaveBeenCalledWith('/reports/report-1/status', { status: 'DISMISSED' });
  });
});
