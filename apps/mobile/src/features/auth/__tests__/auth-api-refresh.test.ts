import { afterEach, describe, expect, it, vi } from 'vitest';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('@/api/client', () => ({ apiRequest }));

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('refreshAccessSession', () => {
  it('coalesces concurrent refresh calls into one cookie rotation request', async () => {
    let resolveRefresh: ((value: unknown) => void) | undefined;
    apiRequest.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRefresh = resolve;
    }));

    const { refreshAccessSession } = await import('../auth.api');
    const first = refreshAccessSession();
    const second = refreshAccessSession();

    expect(second).toBe(first);
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/auth/refresh', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      signal: expect.any(AbortSignal),
    }));

    resolveRefresh?.({
      success: true,
      data: { tokens: { accessToken: 'fresh-access-token', expiresIn: 900 }, csrfToken: 'csrf-token' },
    });
    await expect(first).resolves.toEqual({
      accessToken: 'fresh-access-token',
      expiresIn: 900,
      csrfToken: 'csrf-token',
    });
  });
});
