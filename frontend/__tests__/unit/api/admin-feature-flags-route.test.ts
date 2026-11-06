import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockBindingFetch } = vi.hoisted(() => ({ mockBindingFetch: vi.fn() }));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({
    env: {
      API_WORKER: { fetch: mockBindingFetch },
      FEATURE_FLAGS_ADMIN_TOKEN: 'feature-flags-server-secret-0123456789abcdef',
    },
  }),
}));

import { GET, PUT } from '@/app/api/admin/feature-flags/route';

const APP_ORIGIN = 'https://marketplat.example';

function request(method: 'GET' | 'PUT', options: { role?: string; cookie?: boolean; accessToken?: string; origin?: string; body?: string } = {}) {
  const headers = new Headers();
  if (options.cookie !== false) headers.set('cookie', 'session=valid-session');
  if (options.accessToken) headers.set('authorization', `Bearer ${options.accessToken}`);
  if (options.origin) {
    headers.set('origin', options.origin);
    if (options.origin === APP_ORIGIN) headers.set('sec-fetch-site', 'same-origin');
  }
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  return new NextRequest(`${APP_ORIGIN}/api/admin/feature-flags`, {
    method,
    headers,
    ...(options.body !== undefined ? { body: options.body } : {}),
  });
}

function installResponses(role = 'SUPER_ADMIN') {
  mockBindingFetch.mockImplementation(async (incoming: Request) => {
    const url = new URL(incoming.url);
    if (url.pathname === '/api/v1/users/me') {
      return Response.json({ success: true, data: { user: { id: 'root-1', role } } });
    }
    if (url.pathname === '/__gateway/feature-flags') {
      expect(incoming.headers.get('x-feature-flags-token')).toBe('feature-flags-server-secret-0123456789abcdef');
      if (incoming.method === 'PUT') {
        const body = await incoming.json() as { name: string; enabled: boolean; rolloutPercent: number };
        return Response.json({ ok: true, flag: { ...body, updatedAt: 1 } });
      }
      return Response.json({ ok: true, flags: [] });
    }
    return new Response('Not Found', { status: 404 });
  });
}

describe('admin feature flags route security', () => {
  beforeEach(() => mockBindingFetch.mockReset());

  it('rejects requests without a session before reaching the feature flag control plane', async () => {
    const response = await GET(request('GET', { cookie: false }));
    expect(response.status).toBe(403);
    expect(mockBindingFetch).not.toHaveBeenCalled();
  });

  it('rejects ADMIN and MODERATOR; only SUPER_ADMIN is allowed', async () => {
    installResponses('ADMIN');
    const adminResponse = await GET(request('GET'));
    expect(adminResponse.status).toBe(403);
    expect(mockBindingFetch).toHaveBeenCalledTimes(1);

    mockBindingFetch.mockReset();
    installResponses('MODERATOR');
    const moderatorResponse = await GET(request('GET'));
    expect(moderatorResponse.status).toBe(403);
    expect(mockBindingFetch).toHaveBeenCalledTimes(1);
  });

  it('proxies a SUPER_ADMIN GET using the server-only Worker secret', async () => {
    installResponses();
    const response = await GET(request('GET', { cookie: false, accessToken: 'access-token-only' }));
    expect(response.status).toBe(200);
    const responseText = await response.clone().text();
    expect(JSON.parse(responseText)).toEqual({ ok: true, flags: [] });
    expect(responseText.includes('feature-flags-server-secret')).toBe(false);
    expect(mockBindingFetch).toHaveBeenCalledTimes(2);
    const authRequest = mockBindingFetch.mock.calls[0]![0] as Request;
    expect(authRequest.headers.get('authorization')).toBe('Bearer access-token-only');
    const controlPlaneRequest = mockBindingFetch.mock.calls[1]![0] as Request;
    expect(new URL(controlPlaneRequest.url).pathname).toBe('/__gateway/feature-flags');
    expect(controlPlaneRequest.headers.get('x-feature-flags-token')).toBe('feature-flags-server-secret-0123456789abcdef');
  });

  it('rejects cross-origin mutations and validates the body before proxying', async () => {
    installResponses();
    const csrf = await PUT(request('PUT', { origin: 'https://attacker.example', body: JSON.stringify({ name: 'PUBLIC_X', enabled: true }) }));
    expect(csrf.status).toBe(403);
    expect(mockBindingFetch).not.toHaveBeenCalled();

    const invalid = await PUT(request('PUT', { origin: APP_ORIGIN, body: JSON.stringify({ name: 'not-valid', enabled: true }) }));
    expect(invalid.status).toBe(400);
    const invalidRollout = await PUT(request('PUT', { origin: APP_ORIGIN, body: JSON.stringify({ name: 'PUBLIC_X', enabled: true, rolloutPercent: 101 }) }));
    expect(invalidRollout.status).toBe(400);
    expect(mockBindingFetch).toHaveBeenCalledTimes(2); // Only the two session checks; control plane is not called.
  });

  it('allows a valid same-origin SUPER_ADMIN mutation', async () => {
    installResponses();
    const response = await PUT(request('PUT', {
      origin: APP_ORIGIN,
      body: JSON.stringify({ name: 'PUBLIC_NEW_HOME', enabled: true, rolloutPercent: 25 }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, flag: { name: 'PUBLIC_NEW_HOME', enabled: true, rolloutPercent: 25 } });
    expect(mockBindingFetch).toHaveBeenCalledTimes(2);
  });
});
