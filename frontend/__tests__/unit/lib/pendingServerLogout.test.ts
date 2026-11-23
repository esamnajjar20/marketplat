/**
 * FIX WEB-PENDING-LOGOUT-01: tests for lib/pendingServerLogout.ts.
 *
 * Real HTTP goes through MSW (same approach as api/client.test.ts) so the
 * bare-axios completion flow — refresh, session-id comparison, then
 * /auth/logout with the freshly issued access + CSRF pair — is exercised
 * end to end rather than against hand-rolled axios doubles.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { getMswServer } from '../../../vitest.setup';
import { API_BASE_URL } from '@/lib/constants';
import { useAuthStore } from '@/store/auth.store';
import {
  PENDING_SERVER_LOGOUT_KEY,
  PENDING_SERVER_LOGOUT_TTL_MS,
  clearPendingServerLogout,
  completePendingServerLogout,
  completePendingServerLogoutWithin,
  getCurrentSessionIdHint,
  hasPendingServerLogout,
  markPendingServerLogout,
  readPendingServerLogout,
  sessionIdFromAccessToken,
} from '@/lib/pendingServerLogout';

const REFRESH_URL = `${API_BASE_URL}/auth/refresh`;
const LOGOUT_URL = `${API_BASE_URL}/auth/logout`;
const LOGOUT_ALL_URL = `${API_BASE_URL}/auth/logout-all`;

function b64url(o: object): string {
  return btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function jwtWithSession(sessionId: string): string {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ userId: 'u1', sessionId })}.sig`;
}

function refreshOk(sessionId: string, csrfToken = 'csrf-fresh') {
  return HttpResponse.json(
    { success: true, data: { tokens: { accessToken: jwtWithSession(sessionId), expiresIn: '15m' }, csrfToken } },
    { status: 200 },
  );
}

beforeEach(() => {
  localStorage.clear();
  useAuthStore.getState().logout();
  document.cookie = 'app_access_token=; max-age=0; path=/';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('sessionIdFromAccessToken', () => {
  it('reads the sessionId claim', () => {
    expect(sessionIdFromAccessToken(jwtWithSession('sess-1'))).toBe('sess-1');
  });

  it.each([[null], [undefined], [''], ['not-a-jwt'], ['a.b'], ['a.%%%.c']])(
    'returns null for unusable input %s',
    (input) => {
      expect(sessionIdFromAccessToken(input as string | null | undefined)).toBeNull();
    },
  );

  it('returns null when the payload has no sessionId', () => {
    expect(sessionIdFromAccessToken(`h.${b64url({ userId: 'u1' })}.s`)).toBeNull();
  });
});

describe('getCurrentSessionIdHint', () => {
  it('prefers the in-memory access token', () => {
    useAuthStore.getState().setAuth(
      { id: 'u1', name: 'A', email: 'a@example.com', role: 'USER' } as never,
      { accessToken: jwtWithSession('from-store') },
    );
    document.cookie = `app_access_token=${encodeURIComponent(jwtWithSession('from-cookie'))}; path=/`;
    expect(getCurrentSessionIdHint()).toBe('from-store');
  });

  it('falls back to the JS-readable token cookie when the in-memory token is empty', () => {
    document.cookie = `app_access_token=${encodeURIComponent(jwtWithSession('from-cookie'))}; path=/`;
    expect(getCurrentSessionIdHint()).toBe('from-cookie');
  });

  it('returns null when neither source has a token', () => {
    expect(getCurrentSessionIdHint()).toBeNull();
  });
});

describe('marker storage', () => {
  it('round-trips a marker', () => {
    markPendingServerLogout('one', 'sess-1', 1_000);
    expect(readPendingServerLogout(1_000)).toEqual({ v: 1, scope: 'one', sessionId: 'sess-1', at: 1_000 });
    expect(hasPendingServerLogout()).toBe(true);
  });

  it('never downgrades scope "all" or forgets a captured session id', () => {
    markPendingServerLogout('all', 'sess-1', 1_000);
    markPendingServerLogout('one', null, 2_000);
    expect(readPendingServerLogout(2_000)).toMatchObject({ scope: 'all', sessionId: 'sess-1', at: 2_000 });
  });

  it('drops an expired marker', () => {
    markPendingServerLogout('one', 'sess-1', 1_000);
    expect(readPendingServerLogout(1_000 + PENDING_SERVER_LOGOUT_TTL_MS + 1)).toBeNull();
    expect(localStorage.getItem(PENDING_SERVER_LOGOUT_KEY)).toBeNull();
  });

  it.each([['{not json'], ['{"v":2,"scope":"one","sessionId":null,"at":1}'], ['{"v":1,"scope":"x","sessionId":null,"at":1}'], ['null']])(
    'discards a corrupt marker: %s',
    (raw) => {
      localStorage.setItem(PENDING_SERVER_LOGOUT_KEY, raw);
      expect(readPendingServerLogout()).toBeNull();
      expect(localStorage.getItem(PENDING_SERVER_LOGOUT_KEY)).toBeNull();
    },
  );

  it('clearPendingServerLogout removes it', () => {
    markPendingServerLogout('one', 'sess-1');
    clearPendingServerLogout();
    expect(hasPendingServerLogout()).toBe(false);
  });
});

describe('completePendingServerLogout', () => {
  it('does nothing and sends no request when no logout is owed', async () => {
    let calls = 0;
    getMswServer()?.use(
      http.post(REFRESH_URL, () => { calls += 1; return refreshOk('s'); }),
      http.post(LOGOUT_URL, () => { calls += 1; return HttpResponse.json({ success: true }); }),
    );

    await expect(completePendingServerLogout()).resolves.toBe('none');
    expect(calls).toBe(0);
  });

  it('refreshes with the cookie, then logs out with the fresh Authorization + CSRF pair', async () => {
    markPendingServerLogout('one', 'sess-A');
    let logoutHeaders: Headers | null = null;
    getMswServer()?.use(
      http.post(REFRESH_URL, () => refreshOk('sess-A', 'csrf-xyz')),
      http.post(LOGOUT_URL, ({ request }) => {
        logoutHeaders = request.headers;
        return HttpResponse.json({ success: true });
      }),
    );

    await expect(completePendingServerLogout()).resolves.toBe('completed');

    expect(logoutHeaders).not.toBeNull();
    expect(logoutHeaders!.get('authorization')).toBe(`Bearer ${jwtWithSession('sess-A')}`);
    expect(logoutHeaders!.get('x-csrf-token')).toBe('csrf-xyz');
    expect(hasPendingServerLogout()).toBe(false);
  });

  it('uses /auth/logout-all for an "all devices" marker', async () => {
    markPendingServerLogout('all', 'sess-A');
    let hit = '';
    getMswServer()?.use(
      http.post(REFRESH_URL, () => refreshOk('sess-A')),
      http.post(LOGOUT_URL, () => { hit = 'one'; return HttpResponse.json({ success: true }); }),
      http.post(LOGOUT_ALL_URL, () => { hit = 'all'; return HttpResponse.json({ success: true }); }),
    );

    await expect(completePendingServerLogout()).resolves.toBe('completed');
    expect(hit).toBe('all');
  });

  it('revokes the cookie’s session when the marker has no session id', async () => {
    markPendingServerLogout('one', null);
    let logoutCalled = false;
    getMswServer()?.use(
      http.post(REFRESH_URL, () => refreshOk('whatever')),
      http.post(LOGOUT_URL, () => { logoutCalled = true; return HttpResponse.json({ success: true }); }),
    );

    await expect(completePendingServerLogout()).resolves.toBe('completed');
    expect(logoutCalled).toBe(true);
  });

  it('leaves a NEWER login alone (session id differs) and drops the marker', async () => {
    markPendingServerLogout('one', 'sess-OLD');
    let logoutCalled = false;
    getMswServer()?.use(
      http.post(REFRESH_URL, () => refreshOk('sess-NEW')),
      http.post(LOGOUT_URL, () => { logoutCalled = true; return HttpResponse.json({ success: true }); }),
    );

    await expect(completePendingServerLogout()).resolves.toBe('superseded');
    expect(logoutCalled).toBe(false);
    expect(hasPendingServerLogout()).toBe(false);
  });

  it.each([[503], [502], [500], [429]])(
    'keeps the marker and does not call logout when refresh answers %s',
    async (status) => {
      markPendingServerLogout('one', 'sess-A');
      let logoutCalled = false;
      getMswServer()?.use(
        http.post(REFRESH_URL, () => HttpResponse.json({ success: false }, { status })),
        http.post(LOGOUT_URL, () => { logoutCalled = true; return HttpResponse.json({ success: true }); }),
      );

      await expect(completePendingServerLogout()).resolves.toBe('retry-later');
      expect(logoutCalled).toBe(false);
      expect(hasPendingServerLogout()).toBe(true);
    },
  );

  it('keeps the marker when the network is down (no response at all)', async () => {
    markPendingServerLogout('one', 'sess-A');
    getMswServer()?.use(http.post(REFRESH_URL, () => HttpResponse.error()));

    await expect(completePendingServerLogout()).resolves.toBe('retry-later');
    expect(hasPendingServerLogout()).toBe(true);
  });

  it('treats a refresh that stays rejected (401) as "session already gone" and clears the marker', async () => {
    markPendingServerLogout('one', 'sess-A');
    let refreshCalls = 0;
    let logoutCalled = false;
    getMswServer()?.use(
      http.post(REFRESH_URL, () => { refreshCalls += 1; return HttpResponse.json({ success: false }, { status: 401 }); }),
      http.post(LOGOUT_URL, () => { logoutCalled = true; return HttpResponse.json({ success: true }); }),
    );

    await expect(completePendingServerLogout()).resolves.toBe('already-ended');
    expect(refreshCalls).toBe(2); // one retry for the refresh-race 401
    expect(logoutCalled).toBe(false);
    expect(hasPendingServerLogout()).toBe(false);
  });

  it('survives a refresh-race 401: the retry succeeds and the logout completes', async () => {
    markPendingServerLogout('one', 'sess-A');
    let refreshCalls = 0;
    getMswServer()?.use(
      http.post(REFRESH_URL, () => {
        refreshCalls += 1;
        return refreshCalls === 1 ? HttpResponse.json({ success: false }, { status: 401 }) : refreshOk('sess-A');
      }),
      http.post(LOGOUT_URL, () => HttpResponse.json({ success: true })),
    );

    await expect(completePendingServerLogout()).resolves.toBe('completed');
    expect(refreshCalls).toBe(2);
  });

  it('keeps the marker when logout itself fails transiently (503)', async () => {
    markPendingServerLogout('one', 'sess-A');
    getMswServer()?.use(
      http.post(REFRESH_URL, () => refreshOk('sess-A')),
      http.post(LOGOUT_URL, () => HttpResponse.json({ success: false }, { status: 503 })),
    );

    await expect(completePendingServerLogout()).resolves.toBe('retry-later');
    expect(hasPendingServerLogout()).toBe(true);
  });

  it('a 401 from logout means nothing live is left: marker cleared', async () => {
    markPendingServerLogout('one', 'sess-A');
    getMswServer()?.use(
      http.post(REFRESH_URL, () => refreshOk('sess-A')),
      http.post(LOGOUT_URL, () => HttpResponse.json({ success: false }, { status: 401 })),
    );

    await expect(completePendingServerLogout()).resolves.toBe('already-ended');
    expect(hasPendingServerLogout()).toBe(false);
  });

  it('gives up (drops the marker) on a permanent 4xx from logout instead of retrying forever', async () => {
    markPendingServerLogout('one', 'sess-A');
    getMswServer()?.use(
      http.post(REFRESH_URL, () => refreshOk('sess-A')),
      http.post(LOGOUT_URL, () => HttpResponse.json({ success: false }, { status: 404 })),
    );

    await expect(completePendingServerLogout()).resolves.toBe('gave-up');
    expect(hasPendingServerLogout()).toBe(false);
  });

  it('shares one attempt between concurrent callers in the same tab', async () => {
    markPendingServerLogout('one', 'sess-A');
    let refreshCalls = 0;
    getMswServer()?.use(
      http.post(REFRESH_URL, async () => { refreshCalls += 1; await delay(30); return refreshOk('sess-A'); }),
      http.post(LOGOUT_URL, () => HttpResponse.json({ success: true })),
    );

    const [a, b] = await Promise.all([completePendingServerLogout(), completePendingServerLogout()]);

    expect(a).toBe('completed');
    expect(b).toBe('completed');
    expect(refreshCalls).toBe(1);
  });
});

describe('completePendingServerLogoutWithin', () => {
  it('stops WAITING after the cap with "retry-later" while the attempt keeps running', async () => {
    markPendingServerLogout('one', 'sess-A');
    getMswServer()?.use(
      http.post(REFRESH_URL, async () => { await delay(250); return refreshOk('sess-A'); }),
      http.post(LOGOUT_URL, () => HttpResponse.json({ success: true })),
    );

    await expect(completePendingServerLogoutWithin(20)).resolves.toBe('retry-later');
    // the underlying attempt is still the shared in-flight one and completes
    await expect(completePendingServerLogout()).resolves.toBe('completed');
    expect(hasPendingServerLogout()).toBe(false);
  });
});
