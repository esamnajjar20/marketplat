import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockBindingFetch } = vi.hoisted(() => ({ mockBindingFetch: vi.fn() }));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { API_WORKER: { fetch: mockBindingFetch } } }),
}));

import { GET } from '@/app/api/public/feature-flags/route';

describe('public feature flags route', () => {
  beforeEach(() => mockBindingFetch.mockReset());

  it('reads the filtered public flag snapshot through API_WORKER without a secret', async () => {
    mockBindingFetch.mockResolvedValue(Response.json({ ok: true, flags: { PUBLIC_NEW_HOME: { enabled: true, rolloutPercent: 20 } } }));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, flags: { PUBLIC_NEW_HOME: { enabled: true, rolloutPercent: 20 } } });
    const request = mockBindingFetch.mock.calls[0]![0] as Request;
    expect(new URL(request.url).pathname).toBe('/__gateway/public-feature-flags');
    expect(request.headers.get('x-feature-flags-token')).toBeNull();
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('returns a controlled error when the API Worker binding fails', async () => {
    mockBindingFetch.mockRejectedValue(new Error('binding failed'));
    const response = await GET();
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: 'FEATURE_FLAGS_WORKER_UNAVAILABLE' });
  });
});
