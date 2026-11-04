import { afterEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  accessToken: 'test-access-token' as string | null,
  csrfToken: null as string | null,
}));
const refreshMock = vi.hoisted(() => vi.fn());

vi.mock('@/store/auth.store', () => ({
  useAuthStore: { getState: () => authState },
}));

vi.mock('@/api/client', () => ({
  refreshSessionShared: refreshMock,
}));

import { fetchClient } from '@/lib/fetchClient';

function setCookie(value: string) {
  Object.defineProperty(document, 'cookie', {
    value,
    writable: true,
    configurable: true,
  });
}

describe('fetchClient CSRF headers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setCookie('');
    authState.accessToken = 'test-access-token';
    authState.csrfToken = null;
    refreshMock.mockReset();
  });

  it('sends the backend csrfToken cookie as X-CSRF-Token on POST requests', async () => {
    setCookie('csrfToken=rotated-session-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchClient.post('/api/v1/notifications/push-subscriptions', { endpoint: 'https://push.test/1' });

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const init = call?.[1] as RequestInit | undefined;
    const headers = new Headers(init?.headers);
    expect(headers.get('X-CSRF-Token')).toBe('rotated-session-token');
    expect(headers.get('Authorization')).toBe('Bearer test-access-token');
    expect(init?.credentials).toBe('include');
  });

  it('does not attach CSRF headers to safe GET requests', async () => {
    setCookie('csrfToken=rotated-session-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchClient.get('/api/v1/notifications/unread-count');

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const init = call?.[1] as RequestInit | undefined;
    const headers = new Headers(init?.headers);
    expect(headers.has('X-CSRF-Token')).toBe(false);
    expect(headers.get('Authorization')).toBe('Bearer test-access-token');
  });

  it('uses the canonical refresh coordinator and retries with rotated auth headers after 401', async () => {
    authState.accessToken = 'expired-access-token';
    authState.csrfToken = 'old-csrf-token';
    setCookie('');
    refreshMock.mockImplementation(async () => {
      authState.accessToken = 'fresh-access-token';
      authState.csrfToken = 'fresh-csrf-token';
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ message: 'expired' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await fetchClient.post('/api/v1/notifications/push-subscriptions', { endpoint: 'https://push.test/2' });

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    const retryHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(firstHeaders.get('Authorization')).toBe('Bearer expired-access-token');
    expect(firstHeaders.get('X-CSRF-Token')).toBe('old-csrf-token');
    expect(retryHeaders.get('Authorization')).toBe('Bearer fresh-access-token');
    expect(retryHeaders.get('X-CSRF-Token')).toBe('fresh-csrf-token');
  });

  it('does not invent an Authorization header when no session token is in memory', async () => {
    authState.accessToken = null;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchClient.get('/api/v1/notifications/unread-count');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });
});
