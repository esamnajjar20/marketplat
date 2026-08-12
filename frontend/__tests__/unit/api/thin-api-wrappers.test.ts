/**
 * Coverage gap closure: activity, appointments, blocked-users,
 * conversations, notifications, product-categories, recommendations,
 * search, sellers, service-categories, service-providers,
 * service-requests, service-reviews — all sat at 0% coverage.
 *
 * These are thin apiClient wrappers, same shape as thin-wrappers.test.ts
 * and ads.api.test.ts: no branching logic to speak of, but every
 * endpoint path, HTTP method, and param-shape is a plain string/object
 * literal that a type checker cannot verify. One assertion per method
 * pins the exact call shape so a typo (e.g. '/ads/my' vs '/ads/me',
 * a historical bug already hit once in this codebase per
 * thin-wrappers.test.ts) fails a test instead of shipping a 404.
 *
 * Paginated endpoints (those piped through unwrapPaginated) get an
 * additional assertion verifying the response reshaping: axios's
 * `.data.data` (bare array) + `.data.meta.pagination` becomes
 * `.data.data.items` + `.data.data.meta`, since that reshape is the one
 * piece of real logic these files contain.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/api/client';
import { activityApi } from '@/api/activity.api';
import { appointmentsApi } from '@/api/appointments.api';
import { blockedUsersApi } from '@/api/blocked-users.api';
import { conversationsApi } from '@/api/conversations.api';
import { notificationsApi } from '@/api/notifications.api';
import { productCategoriesApi } from '@/api/product-categories.api';
import { recommendationsApi } from '@/api/recommendations.api';
import { searchApi } from '@/api/search.api';
import { sellersApi } from '@/api/sellers.api';
import { serviceCategoriesApi } from '@/api/service-categories.api';
import { serviceProvidersApi } from '@/api/service-providers.api';
import { serviceRequestsApi } from '@/api/service-requests.api';
import { serviceReviewsApi } from '@/api/service-reviews.api';

vi.mock('@/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const PAGINATION = {
  total: 42, page: 2, limit: 20, totalPages: 3, hasNextPage: true, hasPrevPage: true,
};

function mockPaginatedResponse(items: unknown[]) {
  return {
    data: { success: true, message: 'ok', data: items, meta: { pagination: PAGINATION } },
  };
}

function mockPlainResponse(data: unknown) {
  return { data: { success: true, message: 'ok', data } };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of ['get', 'post', 'patch', 'delete'] as const) {
    (apiClient[method] as ReturnType<typeof vi.fn>).mockResolvedValue(mockPlainResponse(null));
  }
});

// ── activityApi ──────────────────────────────────────────────────────

describe('activityApi', () => {
  it('getMine → GET /activity with query params', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockPaginatedResponse([{ id: 'a1' }]));
    const res = await activityApi.getMine({ page: 2 } as any);
    expect(apiClient.get).toHaveBeenCalledWith('/activity', { params: { page: 2 } });
    expect(res.data.data.items).toEqual([{ id: 'a1' }]);
    expect(res.data.data.meta).toEqual(PAGINATION);
  });

  it('getMine → GET /activity with no params', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockPaginatedResponse([]));
    await activityApi.getMine();
    expect(apiClient.get).toHaveBeenCalledWith('/activity', { params: undefined });
  });
});

// ── appointmentsApi ──────────────────────────────────────────────────

describe('appointmentsApi', () => {
  it('getAvailability → GET /appointments/availability/:providerId?date=', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockPlainResponse({ slots: [] }));
    await appointmentsApi.getAvailability('prov-1', '2026-08-20');
    expect(apiClient.get).toHaveBeenCalledWith('/appointments/availability/prov-1', {
      params: { date: '2026-08-20' },
    });
  });

  it('getMine → GET /appointments/me, paginated', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockPaginatedResponse([{ id: 'appt-1' }]));
    const res = await appointmentsApi.getMine({ page: 1 } as any);
    expect(apiClient.get).toHaveBeenCalledWith('/appointments/me', { params: { page: 1 } });
    expect(res.data.data.items).toEqual([{ id: 'appt-1' }]);
  });

  it('create → POST /appointments with payload', async () => {
    const payload = { providerId: 'prov-1', startTime: '2026-08-20T10:00:00Z' } as any;
    await appointmentsApi.create(payload);
    expect(apiClient.post).toHaveBeenCalledWith('/appointments', payload);
  });

  it('updateStatus → PATCH /appointments/:id/status with payload', async () => {
    const payload = { status: 'COMPLETED' } as any;
    await appointmentsApi.updateStatus('appt-1', payload);
    expect(apiClient.patch).toHaveBeenCalledWith('/appointments/appt-1/status', payload);
  });
});

// ── blockedUsersApi ──────────────────────────────────────────────────

describe('blockedUsersApi', () => {
  it('getMine → GET /blocked-users, paginated', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockPaginatedResponse([{ id: 'block-1' }]));
    const res = await blockedUsersApi.getMine({ page: 1 } as any);
    expect(apiClient.get).toHaveBeenCalledWith('/blocked-users', { params: { page: 1 } });
    expect(res.data.data.items).toEqual([{ id: 'block-1' }]);
  });

  it('toggleBlock → POST /blocked-users/:userId with no body', async () => {
    await blockedUsersApi.toggleBlock('user-1');
    expect(apiClient.post).toHaveBeenCalledWith('/blocked-users/user-1');
  });
});

// ── conversationsApi ─────────────────────────────────────────────────

describe('conversationsApi', () => {
  it('getMine → GET /conversations, paginated', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockPaginatedResponse([{ id: 'conv-1' }]));
    const res = await conversationsApi.getMine({ page: 1 } as any);
    expect(apiClient.get).toHaveBeenCalledWith('/conversations', { params: { page: 1 } });
    expect(res.data.data.items).toEqual([{ id: 'conv-1' }]);
  });

  it('start → POST /conversations with payload', async () => {
    const payload = { adId: 'ad-1' } as any;
    await conversationsApi.start(payload);
    expect(apiClient.post).toHaveBeenCalledWith('/conversations', payload);
  });

  it('getById → GET /conversations/:id', async () => {
    await conversationsApi.getById('conv-1');
    expect(apiClient.get).toHaveBeenCalledWith('/conversations/conv-1');
  });

  it('getMessages → GET /conversations/:id/messages, paginated', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockPaginatedResponse([{ id: 'msg-1' }]));
    const res = await conversationsApi.getMessages('conv-1', { page: 1 } as any);
    expect(apiClient.get).toHaveBeenCalledWith('/conversations/conv-1/messages', { params: { page: 1 } });
    expect(res.data.data.items).toEqual([{ id: 'msg-1' }]);
  });

  it('sendMessage → POST /conversations/:id/messages with payload', async () => {
    const payload = { content: 'hello' } as any;
    await conversationsApi.sendMessage('conv-1', payload);
    expect(apiClient.post).toHaveBeenCalledWith('/conversations/conv-1/messages', payload);
  });
});

// ── notificationsApi ─────────────────────────────────────────────────

describe('notificationsApi', () => {
  it('getMine → GET /notifications, paginated', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockPaginatedResponse([{ id: 'notif-1' }]));
    const res = await notificationsApi.getMine({ page: 1 } as any);
    expect(apiClient.get).toHaveBeenCalledWith('/notifications', { params: { page: 1 } });
    expect(res.data.data.items).toEqual([{ id: 'notif-1' }]);
  });

  it('getUnreadCount → GET /notifications/unread-count', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockPlainResponse({ count: 3 }));
    await notificationsApi.getUnreadCount();
    expect(apiClient.get).toHaveBeenCalledWith('/notifications/unread-count');
  });

  it('markRead → PATCH /notifications/:id/read with no body', async () => {
    await notificationsApi.markRead('notif-1');
    expect(apiClient.patch).toHaveBeenCalledWith('/notifications/notif-1/read');
  });

  it('markAllRead → PATCH /notifications/read-all with no body', async () => {
    await notificationsApi.markAllRead();
    expect(apiClient.patch).toHaveBeenCalledWith('/notifications/read-all');
  });
});

// ── productCategoriesApi ─────────────────────────────────────────────

describe('productCategoriesApi', () => {
  it('getAll → GET /product-categories', async () => {
    await productCategoriesApi.getAll();
    expect(apiClient.get).toHaveBeenCalledWith('/product-categories');
  });

  it('getBySlug → GET /product-categories/slug/:slug (not /product-categories/:slug)', async () => {
    await productCategoriesApi.getBySlug('electronics');
    expect(apiClient.get).toHaveBeenCalledWith('/product-categories/slug/electronics');
  });

  it('getById → GET /product-categories/:id', async () => {
    await productCategoriesApi.getById('cat-1');
    expect(apiClient.get).toHaveBeenCalledWith('/product-categories/cat-1');
  });

  it('getAllForAdmin → GET /product-categories/admin/all', async () => {
    await productCategoriesApi.getAllForAdmin();
    expect(apiClient.get).toHaveBeenCalledWith('/product-categories/admin/all');
  });

  it('create → POST /product-categories with payload', async () => {
    const payload = { name: 'Electronics' } as any;
    await productCategoriesApi.create(payload);
    expect(apiClient.post).toHaveBeenCalledWith('/product-categories', payload);
  });

  it('update → PATCH /product-categories/:id with payload', async () => {
    const payload = { name: 'New name' } as any;
    await productCategoriesApi.update('cat-1', payload);
    expect(apiClient.patch).toHaveBeenCalledWith('/product-categories/cat-1', payload);
  });

  it('delete → DELETE /product-categories/:id', async () => {
    await productCategoriesApi.delete('cat-1');
    expect(apiClient.delete).toHaveBeenCalledWith('/product-categories/cat-1');
  });
});

// ── recommendationsApi ───────────────────────────────────────────────

describe('recommendationsApi', () => {
  it('getRecommendations → GET /recommendations with params', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockPlainResponse([{ id: 'ad-1' }]));
    await recommendationsApi.getRecommendations({ limit: 8, excludeAdId: 'ad-99' });
    expect(apiClient.get).toHaveBeenCalledWith('/recommendations', {
      params: { limit: 8, excludeAdId: 'ad-99' },
    });
  });

  it('getRecommendations → GET /recommendations with no params', async () => {
    await recommendationsApi.getRecommendations();
    expect(apiClient.get).toHaveBeenCalledWith('/recommendations', { params: undefined });
  });

  it('getRecommendations returns the bare array (not paginated)', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockPlainResponse([{ id: 'ad-1' }, { id: 'ad-2' }]));
    const res = await recommendationsApi.getRecommendations();
    expect(res.data.data).toEqual([{ id: 'ad-1' }, { id: 'ad-2' }]);
  });
});

// ── searchApi ─────────────────────────────────────────────────────────

describe('searchApi', () => {
  it('search → GET /search, paginated', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockPaginatedResponse([{ id: 'r1' }]));
    const res = await searchApi.search({ q: 'phone' } as any);
    expect(apiClient.get).toHaveBeenCalledWith('/search', { params: { q: 'phone' } });
    expect(res.data.data.items).toEqual([{ id: 'r1' }]);
  });

  it('suggest → GET /search/suggestions (not paginated, bare suggestions array)', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockPlainResponse({ suggestions: ['phone', 'phones'] }));
    const res = await searchApi.suggest({ q: 'pho' } as any);
    expect(apiClient.get).toHaveBeenCalledWith('/search/suggestions', { params: { q: 'pho' } });
    expect(res.data.data).toEqual({ suggestions: ['phone', 'phones'] });
  });
});

// ── sellersApi ────────────────────────────────────────────────────────

describe('sellersApi', () => {
  it('createMyProfile → POST /sellers/me/profile with payload', async () => {
    const payload = { displayName: 'My Shop' } as any;
    await sellersApi.createMyProfile(payload);
    expect(apiClient.post).toHaveBeenCalledWith('/sellers/me/profile', payload);
  });

  it('getMyProfile → GET /sellers/me/profile', async () => {
    await sellersApi.getMyProfile();
    expect(apiClient.get).toHaveBeenCalledWith('/sellers/me/profile');
  });

  it('getById → GET /sellers/:id', async () => {
    await sellersApi.getById('seller-1');
    expect(apiClient.get).toHaveBeenCalledWith('/sellers/seller-1');
  });

  it('createRating → POST /sellers/:id/ratings with payload', async () => {
    const payload = { score: 5, comment: 'great' } as any;
    await sellersApi.createRating('seller-1', payload);
    expect(apiClient.post).toHaveBeenCalledWith('/sellers/seller-1/ratings', payload);
  });

  it('getRatings → GET /sellers/:id/ratings, paginated', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockPaginatedResponse([{ id: 'rating-1' }]));
    const res = await sellersApi.getRatings('seller-1', { page: 1 });
    expect(apiClient.get).toHaveBeenCalledWith('/sellers/seller-1/ratings', { params: { page: 1 } });
    expect(res.data.data.items).toEqual([{ id: 'rating-1' }]);
  });
});

// ── serviceCategoriesApi ─────────────────────────────────────────────

describe('serviceCategoriesApi', () => {
  it('getAll → GET /service-categories', async () => {
    await serviceCategoriesApi.getAll();
    expect(apiClient.get).toHaveBeenCalledWith('/service-categories');
  });

  it('getBySlug → GET /service-categories/slug/:slug', async () => {
    await serviceCategoriesApi.getBySlug('plumbing');
    expect(apiClient.get).toHaveBeenCalledWith('/service-categories/slug/plumbing');
  });

  it('getById → GET /service-categories/:id', async () => {
    await serviceCategoriesApi.getById('cat-1');
    expect(apiClient.get).toHaveBeenCalledWith('/service-categories/cat-1');
  });

  it('getAllForAdmin → GET /service-categories/admin/all', async () => {
    await serviceCategoriesApi.getAllForAdmin();
    expect(apiClient.get).toHaveBeenCalledWith('/service-categories/admin/all');
  });

  it('create → POST /service-categories with payload', async () => {
    const payload = { name: 'Plumbing' } as any;
    await serviceCategoriesApi.create(payload);
    expect(apiClient.post).toHaveBeenCalledWith('/service-categories', payload);
  });

  it('update → PATCH /service-categories/:id with payload', async () => {
    const payload = { name: 'New name' } as any;
    await serviceCategoriesApi.update('cat-1', payload);
    expect(apiClient.patch).toHaveBeenCalledWith('/service-categories/cat-1', payload);
  });

  it('delete → DELETE /service-categories/:id', async () => {
    await serviceCategoriesApi.delete('cat-1');
    expect(apiClient.delete).toHaveBeenCalledWith('/service-categories/cat-1');
  });
});

// ── serviceProvidersApi ──────────────────────────────────────────────

describe('serviceProvidersApi', () => {
  it('createMyProvider → POST /service-providers/me with payload', async () => {
    const payload = { bio: 'Expert plumber' } as any;
    await serviceProvidersApi.createMyProvider(payload);
    expect(apiClient.post).toHaveBeenCalledWith('/service-providers/me', payload);
  });

  it('getMyProvider → GET /service-providers/me', async () => {
    await serviceProvidersApi.getMyProvider();
    expect(apiClient.get).toHaveBeenCalledWith('/service-providers/me');
  });

  it('updateMyProvider → PATCH /service-providers/me with payload', async () => {
    const payload = { availabilityStatus: 'AVAILABLE' } as any;
    await serviceProvidersApi.updateMyProvider(payload);
    expect(apiClient.patch).toHaveBeenCalledWith('/service-providers/me', payload);
  });

  it('getById → GET /service-providers/:id', async () => {
    await serviceProvidersApi.getById('prov-1');
    expect(apiClient.get).toHaveBeenCalledWith('/service-providers/prov-1');
  });

  it('getNearby → GET /service-providers/nearby, paginated', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockPaginatedResponse([{ id: 'prov-1' }]));
    const params = { lat: 31.5, lng: 34.4, radiusKm: 10 } as any;
    const res = await serviceProvidersApi.getNearby(params);
    expect(apiClient.get).toHaveBeenCalledWith('/service-providers/nearby', { params });
    expect(res.data.data.items).toEqual([{ id: 'prov-1' }]);
  });
});

// ── serviceRequestsApi ───────────────────────────────────────────────

describe('serviceRequestsApi', () => {
  it('create → POST /service-requests with payload', async () => {
    const payload = { providerId: 'prov-1', description: 'Fix sink' } as any;
    await serviceRequestsApi.create(payload);
    expect(apiClient.post).toHaveBeenCalledWith('/service-requests', payload);
  });

  it('getById → GET /service-requests/:id', async () => {
    await serviceRequestsApi.getById('req-1');
    expect(apiClient.get).toHaveBeenCalledWith('/service-requests/req-1');
  });

  it('getMineAsCustomer → GET /service-requests/me, paginated', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockPaginatedResponse([{ id: 'req-1' }]));
    const res = await serviceRequestsApi.getMineAsCustomer({ page: 1 } as any);
    expect(apiClient.get).toHaveBeenCalledWith('/service-requests/me', { params: { page: 1 } });
    expect(res.data.data.items).toEqual([{ id: 'req-1' }]);
  });

  it('getIncomingAsProvider → GET /service-requests/incoming (not /me), paginated', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockPaginatedResponse([{ id: 'req-2' }]));
    const res = await serviceRequestsApi.getIncomingAsProvider({ page: 1 } as any);
    expect(apiClient.get).toHaveBeenCalledWith('/service-requests/incoming', { params: { page: 1 } });
    expect(res.data.data.items).toEqual([{ id: 'req-2' }]);
  });

  it('respond → PATCH /service-requests/:id/respond with action payload (single endpoint, not accept/reject)', async () => {
    const payload = { action: 'ACCEPTED' } as any;
    await serviceRequestsApi.respond('req-1', payload);
    expect(apiClient.patch).toHaveBeenCalledWith('/service-requests/req-1/respond', payload);
  });
});

// ── serviceReviewsApi ────────────────────────────────────────────────

describe('serviceReviewsApi', () => {
  it('create → POST /service-reviews with payload (own module, not nested under service-requests)', async () => {
    const payload = { requestId: 'req-1', score: 5, comment: 'great work' } as any;
    await serviceReviewsApi.create(payload);
    expect(apiClient.post).toHaveBeenCalledWith('/service-reviews', payload);
  });

  it('getForSeller → GET /service-reviews/seller/:sellerProfileId, paginated', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockPaginatedResponse([{ id: 'rev-1' }]));
    const res = await serviceReviewsApi.getForSeller('seller-1', { page: 1 });
    expect(apiClient.get).toHaveBeenCalledWith('/service-reviews/seller/seller-1', { params: { page: 1 } });
    expect(res.data.data.items).toEqual([{ id: 'rev-1' }]);
  });
});
