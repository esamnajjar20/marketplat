/**
 * FIX TEST-V4-09: api/client.ts had zero test coverage despite being
 * the single most bug-history-laden frontend file across this project's
 * audit sessions — a cookie/token desync bug (the 14-min cookie
 * expiring independently of the access token) and a dead
 * AbortController were both real production bugs found and fixed here.
 *
 * Uses MSW (already a declared dependency, with scaffolding in
 * vitest.setup.ts that nothing previously used — see that file's
 * getMswServer() export, added as part of this fix) to intercept real
 * HTTP calls the actual axios instance makes. This is necessary because
 * the interceptor logic is registered as a side effect at module import
 * time and closes over module-level mutable state (isRefreshing,
 * refreshQueue) — there's no exported function to call directly that
 * would exercise the real retry/queue behavior; only sending real
 * requests through the real apiClient does that.
 *
 * IMPORTANT — single static import, no vi.resetModules(): auth.store.ts's
 * useAuthStore has no globalThis-based singleton protection (unlike the
 * backend's prisma.ts client). Resetting modules between tests would
 * cause api/client.ts's *internal* import of useAuthStore to resolve to
 * a different store instance than the one this test file holds a
 * reference to, completely disconnecting setAuthenticatedState() from
 * what the interceptor actually reads. The interceptor's own
 * isRefreshing/refreshQueue state already self-resets via its `finally`
 * block after each complete request cycle, so sequential tests don't
 * need a module reset at all; true concurrency (the "queues a second
 * concurrent 401" test) is exercised within a single test body via
 * Promise.all, not across tests.
 *
 * PROD-FIX-15: refreshToken no longer lives in the auth store or any
 * request body — the backend reads it from an httpOnly cookie the
 * browser sends automatically (apiClient's withCredentials:true).
 * setAuthenticatedState() below only sets an accessToken now.
 * authApi.refresh() takes no token argument. MSW intercepts requests
 * before they hit a real network stack, so it can't actually validate
 * cookie behavior end-to-end — these tests still confirm the
 * interceptor's own logic (attaching Authorization, retry-on-401,
 * queueing, redirect-on-failure) is unchanged by the fix.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { getMswServer } from '../../../vitest.setup';
import { apiClient } from '@/api/client';
import { authApi } from '@/api/auth.api';
import { useAuthStore } from '@/store/auth.store';
import { API_BASE_URL } from '@/lib/constants';
import { deleteCookie } from '@/lib/cookies';

// UX-FIX P0-1: client.ts's 401/refresh-failure branch now shows a toast
// before redirecting — mocked here the same way other test files in
// this codebase mock sonner, so the test suite doesn't depend on
// sonner's real (headless, but unmounted-Toaster) runtime behavior.
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const REFRESH_URL = `${API_BASE_URL}/auth/refresh`;
const PROTECTED_URL = `${API_BASE_URL}/users/me`;

function setAuthenticatedState(accessToken: string) {
  useAuthStore.getState().setAuth(
    { id: 'user-1', name: 'Ahmed', email: 'a@example.com', role: 'USER' },
    { accessToken },
  );
}

describe('api/client.ts — request interceptor', () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
  });

  it('attaches the Authorization header when an access token is present', async () => {
    setAuthenticatedState('valid-access-token');
    let capturedAuthHeader: string | null = null;

    getMswServer()?.use(
      http.get(PROTECTED_URL, ({ request }) => {
        capturedAuthHeader = request.headers.get('authorization');
        return HttpResponse.json({ success: true, data: {} });
      }),
    );

    await apiClient.get('/users/me');

    expect(capturedAuthHeader).toBe('Bearer valid-access-token');
  });

  it('sends no Authorization header when logged out', async () => {
    let capturedAuthHeader: string | null = 'not-checked-yet';

    getMswServer()?.use(
      http.get(PROTECTED_URL, ({ request }) => {
        capturedAuthHeader = request.headers.get('authorization');
        return HttpResponse.json({ success: true, data: {} });
      }),
    );

    await apiClient.get('/users/me');

    expect(capturedAuthHeader).toBeNull();
  });
});

describe('api/client.ts — silent refresh on 401', () => {
  let originalLocation: Location;

  beforeEach(() => {
    useAuthStore.getState().logout();
    // BUGFIX (found during a post-implementation code audit): without
    // this, a cookie set by the 'REGRESSION (cookie desync)' test
    // below could leak into a later test run and mask a real failure
    // in client.ts's setCookie() call — the assertion further down
    // (`expect(document.cookie).toContain(...)`) would pass even if
    // that call were broken, simply because a stale cookie with the
    // same literal value happened to still be present from a prior
    // test. `document.cookie = ''` (used elsewhere in this codebase)
    // does NOT clear existing cookies in jsdom or real browsers —
    // it's a no-op, since an empty string isn't a valid
    // "name=value" cookie description; deleteCookie() is the correct
    // way to actually remove one.
    deleteCookie('app_access_token');
    originalLocation = window.location;
    const mockUrl = new URL('http://localhost:3000/dashboard');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...mockUrl,
        href: mockUrl.href,
        origin: mockUrl.origin,
        protocol: mockUrl.protocol,
        host: mockUrl.host,
        hostname: mockUrl.hostname,
        port: mockUrl.port,
        pathname: mockUrl.pathname,
        search: mockUrl.search,
        hash: mockUrl.hash,
        assign: vi.fn(),
        replace: vi.fn(),
        reload: vi.fn(),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('on a 401, silently refreshes and retries the original request with the new token', async () => {
    setAuthenticatedState('expired-access-token');
    let protectedCallCount = 0;
    let lastAuthHeaderSeen: string | null = null;

    getMswServer()?.use(
      http.post(REFRESH_URL, () =>
        HttpResponse.json({
          success: true,
          data: { tokens: { accessToken: 'new-access-token' }, csrfToken: 'csrf-abc' },
        }),
      ),
      http.get(PROTECTED_URL, ({ request }) => {
        protectedCallCount += 1;
        lastAuthHeaderSeen = request.headers.get('authorization');
        if (protectedCallCount === 1) {
          return HttpResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }
        return HttpResponse.json({ success: true, data: { ok: true } });
      }),
    );

    const response = await apiClient.get('/users/me');

    expect(protectedCallCount).toBe(2);
    expect(lastAuthHeaderSeen).toBe('Bearer new-access-token');
    expect(response.data.data.ok).toBe(true);
  });

  it('updates the in-memory access token in the auth store after a successful refresh', async () => {
    setAuthenticatedState('expired-access-token');

    getMswServer()?.use(
      http.post(REFRESH_URL, () =>
        HttpResponse.json({
          success: true,
          data: { tokens: { accessToken: 'new-access-token' }, csrfToken: 'csrf-abc' },
        }),
      ),
      http.get(PROTECTED_URL, ({ request }) => {
        const auth = request.headers.get('authorization');
        if (auth === 'Bearer expired-access-token') {
          return HttpResponse.json({ success: false }, { status: 401 });
        }
        return HttpResponse.json({ success: true, data: {} });
      }),
    );

    await apiClient.get('/users/me');

    expect(useAuthStore.getState().accessToken).toBe('new-access-token');
  });

  it('REGRESSION (cookie desync): re-syncs the app_access_token cookie after a silent refresh, not just at login', async () => {
    setAuthenticatedState('expired-access-token');

    getMswServer()?.use(
      http.post(REFRESH_URL, () =>
        HttpResponse.json({
          success: true,
          data: { tokens: { accessToken: 'new-access-token' }, csrfToken: 'csrf-abc' },
        }),
      ),
      http.get(PROTECTED_URL, ({ request }) => {
        const auth = request.headers.get('authorization');
        if (auth === 'Bearer expired-access-token') {
          return HttpResponse.json({ success: false }, { status: 401 });
        }
        return HttpResponse.json({ success: true, data: {} });
      }),
    );

    await apiClient.get('/users/me');

    expect(document.cookie).toContain('app_access_token=new-access-token');
  });

  it('queues a second concurrent 401 instead of triggering a second refresh call', async () => {
    setAuthenticatedState('expired-access-token');
    let refreshCallCount = 0;

    getMswServer()?.use(
      http.post(REFRESH_URL, async () => {
        refreshCallCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return HttpResponse.json({
          success: true,
          data: { tokens: { accessToken: 'new-access-token' }, csrfToken: 'csrf-abc' },
        });
      }),
      http.get(PROTECTED_URL, ({ request }) => {
        const auth = request.headers.get('authorization');
        if (auth === 'Bearer expired-access-token') {
          return HttpResponse.json({ success: false }, { status: 401 });
        }
        return HttpResponse.json({ success: true, data: {} });
      }),
    );

    const [first, second] = await Promise.all([
      apiClient.get('/users/me'),
      apiClient.get('/users/me'),
    ]);

    expect(refreshCallCount).toBe(1);
    expect(first.data.data).toEqual({});
    expect(second.data.data).toEqual({});
  });

  it('does not attempt to refresh when the 401 comes from the refresh endpoint itself', async () => {
    setAuthenticatedState('expired-access-token');
    let refreshCallCount = 0;

    getMswServer()?.use(
      http.post(REFRESH_URL, () => {
        refreshCallCount += 1;
        return HttpResponse.json({ success: false, message: 'Invalid refresh token' }, { status: 401 });
      }),
    );

    // PROD-FIX-15: refresh() no longer takes a token argument — the
    // (invalid, or entirely absent) refreshToken cookie is what the
    // backend actually rejects; there's nothing left for the frontend
    // to pass explicitly.
    await expect(authApi.refresh()).rejects.toBeDefined();
    expect(refreshCallCount).toBe(1);
  });

  it('on refresh failure, shows a toast and redirects to /login with `from` and `reason` params', async () => {
    setAuthenticatedState('expired-access-token');

    getMswServer()?.use(
      http.post(REFRESH_URL, () =>
        HttpResponse.json({ success: false, message: 'Invalid refresh token' }, { status: 401 }),
      ),
      http.get(PROTECTED_URL, () =>
        HttpResponse.json({ success: false }, { status: 401 }),
      ),
    );

    await expect(apiClient.get('/users/me')).rejects.toBeDefined();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);

    // UX-FIX P0-1/P0-2: the redirect is no longer immediate — a toast is
    // shown first (asserted in the LoginForm/client unit-level toast
    // coverage), then navigation fires after a short real delay so the
    // toast actually has time to be seen. Wait for that delay (real
    // timers — mixing fake timers with MSW's own internal scheduling is
    // unreliable) rather than asserting synchronously.
    await vi.waitFor(
      () => expect(window.location.href).toBe('/login?from=%2Fdashboard&reason=session_expired'),
      { timeout: 2000, interval: 50 },
    );
  });

  it('does not retry a request that already failed once (the _retry guard)', async () => {
    setAuthenticatedState('expired-access-token');
    let protectedCallCount = 0;

    getMswServer()?.use(
      http.post(REFRESH_URL, () =>
        HttpResponse.json({
          success: true,
          data: { tokens: { accessToken: 'new-access-token' }, csrfToken: 'csrf-abc' },
        }),
      ),
      http.get(PROTECTED_URL, () => {
        protectedCallCount += 1;
        return HttpResponse.json({ success: false }, { status: 401 });
      }),
    );

    await expect(apiClient.get('/users/me')).rejects.toBeDefined();

    expect(protectedCallCount).toBe(2);
  });
});
