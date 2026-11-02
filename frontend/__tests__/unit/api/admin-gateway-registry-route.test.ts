import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockBindingFetch } = vi.hoisted(() => ({ mockBindingFetch: vi.fn() }));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({
    env: {
      API_WORKER: { fetch: mockBindingFetch },
      GATEWAY_ADMIN_TOKEN: 'server-only-test-secret',
    },
  }),
}));

import { GET, POST, PUT } from '@/app/api/admin/gateway/registry/route';

const APP_ORIGIN = 'https://marketplat.example';

function request(method: string, options: { role?: string; origin?: string; body?: string; accessToken?: string } = {}) {
  const headers = new Headers();
  if (options.role !== 'none') headers.set('cookie', 'session=valid-session');
  if (options.accessToken) headers.set('authorization', `Bearer ${options.accessToken}`);
  if (options.origin) headers.set('origin', options.origin);
  if (options.origin === APP_ORIGIN) headers.set('sec-fetch-site', 'same-origin');
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  return new NextRequest(`${APP_ORIGIN}/api/admin/gateway/registry`, {
    method,
    headers,
    ...(options.body !== undefined ? { body: options.body } : {}),
  });
}

function installAdminResponses(role = 'ADMIN') {
  mockBindingFetch.mockImplementation(async (incoming: Request) => {
    const url = new URL(incoming.url);
    if (url.pathname === '/api/v1/users/me') {
      return Response.json({ success: true, data: { user: { id: 'admin-1', role } } });
    }
    if (url.pathname === '/__gateway/registry') {
      return Response.json({ ok: true, registry: { version: 1, backend: { servers: [] } } });
    }
    return new Response('Not Found', { status: 404 });
  });
}

describe('admin gateway registry route security', () => {
  beforeEach(() => mockBindingFetch.mockReset());

  it('fails closed when the request has no session cookie', async () => {
    const response = await GET(request('GET', { role: 'none' }));
    expect(response.status).toBe(403);
    expect(mockBindingFetch).not.toHaveBeenCalled();
  });

  it('accepts the in-memory access token and does not forward it to the gateway', async () => {
    installAdminResponses('ADMIN');
    const response = await GET(request('GET', { role: 'none', accessToken: 'browser-access-token' }));
    expect(response.status).toBe(200);
    const authRequest = mockBindingFetch.mock.calls[0]![0] as Request;
    const gatewayRequest = mockBindingFetch.mock.calls[1]![0] as Request;
    expect(authRequest.headers.get('authorization')).toBe('Bearer browser-access-token');
    expect(gatewayRequest.headers.get('authorization')).toBeNull();
    expect(gatewayRequest.headers.get('x-gateway-admin-token')).toBe('server-only-test-secret');
  });

  it('rejects MODERATOR even though the general admin panel is available to that role', async () => {
    installAdminResponses('MODERATOR');
    const response = await GET(request('GET'));
    expect(response.status).toBe(403);
    expect(mockBindingFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the gateway token server-side when an ADMIN reads the registry', async () => {
    installAdminResponses('ADMIN');
    const response = await GET(request('GET'));
    expect(response.status).toBe(200);
    expect(mockBindingFetch).toHaveBeenCalledTimes(2);
    const gatewayRequest = mockBindingFetch.mock.calls[1]![0] as Request;
    expect(new URL(gatewayRequest.url).pathname).toBe('/__gateway/registry');
    expect(gatewayRequest.headers.get('x-gateway-admin-token')).toBe('server-only-test-secret');
    expect(await response.text()).not.toContain('server-only-test-secret');
  });

  it('rejects cross-origin mutations after authenticating the administrator', async () => {
    installAdminResponses('SUPER_ADMIN');
    const response = await PUT(request('PUT', {
      origin: 'https://attacker.example',
      body: JSON.stringify({ backend: { servers: [] } }),
    }));
    expect(response.status).toBe(403);
    expect(mockBindingFetch).toHaveBeenCalledTimes(1);
  });

  it('allows same-origin ADMIN mutations and forwards only the body plus server token', async () => {
    installAdminResponses('ADMIN');
    const body = JSON.stringify({ backend: { strategy: 'weighted-random', servers: [{ id: 'primary', url: 'https://api.example.com', weight: 100, enabled: true }] } });
    const response = await PUT(request('PUT', { origin: APP_ORIGIN, body }));
    expect(response.status).toBe(200);
    expect(mockBindingFetch).toHaveBeenCalledTimes(2);
    const gatewayRequest = mockBindingFetch.mock.calls[1]![0] as Request;
    expect(gatewayRequest.method).toBe('PUT');
    expect(await gatewayRequest.text()).toBe(body);
    expect(gatewayRequest.headers.get('x-gateway-admin-token')).toBe('server-only-test-secret');
  });

  it('allows an authenticated same-origin admin to request an explicit probe', async () => {
    installAdminResponses('SUPER_ADMIN');
    const response = await POST(request('POST', { origin: APP_ORIGIN, body: JSON.stringify({ action: 'probe' }) }));
    expect(response.status).toBe(200);
    const gatewayRequest = mockBindingFetch.mock.calls[1]![0] as Request;
    expect(gatewayRequest.method).toBe('POST');
    expect(await gatewayRequest.text()).toBe(JSON.stringify({ action: 'probe' }));
  });
});
