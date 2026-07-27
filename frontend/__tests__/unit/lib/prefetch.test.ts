/**
 * __tests__/unit/lib/prefetch.test.ts
 *
 * Coverage for lib/prefetch.ts. The most important surface here is the
 * internal serverFetch() helper (API-INT-09): it must distinguish
 * network failure / non-OK HTTP status / JSON parse failure, log the
 * real cause server-side only, and throw a generic Arabic message in
 * every case — never leaking the internal API path or raw error
 * details into something that could surface in an RSC error boundary.
 *
 * FIX API-SHAPE-01: prefetchCategories/prefetchAdList/prefetchAdDetail
 * must each cache the UNWRAPPED value the matching client hook expects
 * (useCategories/useAds/useAd all resolve via `.then(r => r.data.data)`)
 * — not the raw ApiResponse envelope, and for the paginated ad list,
 * reassembled into { items, meta } from the backend's real shape
 * (items directly on `data`, pagination under top-level
 * `meta.pagination`). This file previously asserted the cache held the
 * full envelope for prefetchCategories/prefetchAdDetail as if that were
 * correct — that was itself the bug this fix corrects, encoded into
 * the test. See lib/apiPagination.ts for the full backend-shape story.
 *
 * prefetchCategories / prefetchAdList / prefetchAdDetail are thin
 * wrappers around qc.prefetchQuery — tested here by asserting the
 * QueryClient actually ends up with the expected cached data, which
 * exercises the real queryFn (serverFetch) end-to-end via a mocked
 * global fetch rather than mocking prefetchQuery itself.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  prefetchCategories,
  prefetchAdList,
  prefetchAdDetail,
  dehydrateClient,
} from '@/lib/prefetch';
import { queryKeys } from '@/lib/queryKeys';

function jsonResponse(body: unknown, init?: { status?: number }) {
  return {
    ok: (init?.status ?? 200) < 400,
    status: init?.status ?? 200,
    json: async () => body,
  } as Response;
}

describe('prefetch helpers', () => {
  let qc: QueryClient;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    qc = new QueryClient();
    vi.restoreAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('prefetchCategories', () => {
    // FIX API-SHAPE-01: GET /categories is not paginated — the backend
    // puts the flat array directly on `data`. The cache must hold that
    // array itself (matching useCategories()'s `.then(r => r.data.data)`),
    // not the { success, message, data } envelope around it.
    it('populates the query cache with the unwrapped categories array on success', async () => {
      const categories = [{ id: 'c1', name: 'Electronics', slug: 'electronics' }];
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        jsonResponse({ success: true, message: 'ok', data: categories }),
      ));

      await prefetchCategories(qc);

      const cached = qc.getQueryData(queryKeys.categories.all());
      expect(cached).toEqual(categories);
      vi.unstubAllGlobals();
    });

    it('caches an empty array when the backend returns no data field', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        jsonResponse({ success: true, message: 'ok' }),
      ));

      await prefetchCategories(qc);

      expect(qc.getQueryData(queryKeys.categories.all())).toEqual([]);
      vi.unstubAllGlobals();
    });

    it('throws a generic Arabic message (not the raw network error) on connection failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED 10.0.0.1:4000')));

      // prefetchQuery itself swallows the queryFn error into query state
      // rather than rejecting, so assert on the thrown error indirectly
      // via the query's error state.
      await prefetchCategories(qc);
      const state = qc.getQueryState(queryKeys.categories.all());

      expect(state?.status).toBe('error');
      expect((state?.error as Error).message).toBe('فشل الاتصال بالخادم');
      expect((state?.error as Error).message).not.toMatch(/ECONNREFUSED/);
      vi.unstubAllGlobals();
    });

    it('throws a generic Arabic message including the status code on a non-OK HTTP response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, { status: 503 })));

      await prefetchCategories(qc);
      const state = qc.getQueryState(queryKeys.categories.all());

      expect(state?.status).toBe('error');
      expect((state?.error as Error).message).toBe('طلب الخادم فشل (503)');
      vi.unstubAllGlobals();
    });

    it('throws a generic Arabic message when the response body is not valid JSON', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError('Unexpected token'); },
      } as Response));

      await prefetchCategories(qc);
      const state = qc.getQueryState(queryKeys.categories.all());

      expect(state?.status).toBe('error');
      expect((state?.error as Error).message).toBe('استجابة الخادم غير صالحة');
      vi.unstubAllGlobals();
    });
  });

  describe('prefetchAdList', () => {
    it('builds the query string from the given params and caches the result', async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        jsonResponse({ success: true, message: 'ok', data: [] }),
      );
      vi.stubGlobal('fetch', fetchSpy);

      await prefetchAdList(qc, { city: 'الرياض', page: 2, categoryId: undefined });

      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/ads?');
      expect(calledUrl).toContain('city=');
      expect(calledUrl).toContain('page=2');
      // undefined params must be filtered out of the query string.
      expect(calledUrl).not.toContain('categoryId');

      vi.unstubAllGlobals();
    });

    it('omits the query string entirely when no params are given', async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        jsonResponse({ success: true, message: 'ok', data: [] }),
      );
      vi.stubGlobal('fetch', fetchSpy);

      await prefetchAdList(qc);

      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl.endsWith('/ads')).toBe(true);

      vi.unstubAllGlobals();
    });

    // FIX API-SHAPE-01: the backend puts the ad array directly on `data`
    // and pagination info under the top-level `meta.pagination` — NOT
    // `data.items`/`data.meta`. The cache must hold the reassembled
    // { items, meta } shape useAds() expects.
    it('reassembles the backend\'s real shape (data: T[], meta.pagination) into { items, meta }', async () => {
      const ads = [{ id: 'ad-1', title: 'Test Ad' }];
      const pagination = { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        jsonResponse({ success: true, message: 'ok', data: ads, meta: { pagination } }),
      ));

      await prefetchAdList(qc, { page: 1 });

      const cached = qc.getQueryData(queryKeys.ads.list({ page: 1 }));
      expect(cached).toEqual({ items: ads, meta: pagination });
      vi.unstubAllGlobals();
    });

    it('caches an empty items array and empty meta when the backend response has neither', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        jsonResponse({ success: true, message: 'ok' }),
      ));

      await prefetchAdList(qc, { page: 1 });

      const cached = qc.getQueryData(queryKeys.ads.list({ page: 1 }));
      expect(cached).toEqual({ items: [], meta: {} });
      vi.unstubAllGlobals();
    });
  });

  describe('prefetchAdDetail', () => {
    // FIX API-SHAPE-01: GET /ads/:id is not paginated — `data` is the
    // Ad object directly. The cache must hold that object itself
    // (matching useAd()'s `.then(r => r.data.data)`), not the
    // { success, message, data } envelope around it.
    it('caches the unwrapped ad object under the correct query key', async () => {
      const ad = { id: 'ad-1', title: 'Test Ad' };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        jsonResponse({ success: true, message: 'ok', data: ad }),
      ));

      await prefetchAdDetail(qc, 'ad-1');

      const cached = qc.getQueryData(queryKeys.ads.detail('ad-1'));
      expect(cached).toEqual(ad);
      vi.unstubAllGlobals();
    });

    // FIX PERF-11: generateMetadata and the page component in
    // ads/[id]/page.tsx each call prefetchAdDetail with the same id
    // during the same render pass. React.cache() around the
    // underlying fetch means the second call must not hit the network
    // again. This uses a fresh, unique id per test (rather than the
    // shared 'ad-1' used above) since React.cache()'s memoization can
    // outlive a single test in this non-RSC test runtime.
    it('does not issue a second network request when called twice with the same id in the same pass', async () => {
      const id = `ad-cache-check-${Date.now()}`;
      const ad = { id, title: 'Test Ad' };
      const fetchSpy = vi.fn().mockResolvedValue(
        jsonResponse({ success: true, message: 'ok', data: ad }),
      );
      vi.stubGlobal('fetch', fetchSpy);

      const qcForMetadata = new QueryClient();
      const qcForPage      = new QueryClient();
      await prefetchAdDetail(qcForMetadata, id);
      await prefetchAdDetail(qcForPage, id);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      // Both QueryClients still end up with the (shared-promise) result,
      // unwrapped the same way a single call would produce.
      expect(qcForMetadata.getQueryData(queryKeys.ads.detail(id))).toEqual(ad);
      expect(qcForPage.getQueryData(queryKeys.ads.detail(id))).toEqual(ad);
      vi.unstubAllGlobals();
    });
  });

  describe('dehydrateClient', () => {
    it('returns a dehydrated state containing the cached queries', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        jsonResponse({ success: true, message: 'ok', data: [] }),
      ));
      await prefetchCategories(qc);

      const dehydrated = dehydrateClient(qc);
      expect(dehydrated.queries.length).toBeGreaterThan(0);
      vi.unstubAllGlobals();
    });
  });
});
