/**
 * Edge-cache proxy for /api/v1/*.
 *
 * next.config.ts's rewrites() and middleware rewrites are unreliable
 * in OpenNext/Cloudflare — OpenNext matches routes before middleware
 * runs, so a rewrite to an external origin never fires and every
 * /api/v1/* request 404s. An explicit catch-all route handler runs
 * exactly where it's needed.
 *
 * Public GET/HEAD requests without Authorization/Cookie go through
 * marketplat-api.workers.dev (which edge-caches 2xx responses).
 * Everything else (POST/PATCH, auth, admin) bypasses the API Worker
 * and hits Render directly to avoid caching anything private.
 */
import type { NextRequest } from 'next/server';

const API_WORKER = 'https://marketplat-api.esamnajjar6.workers.dev';
const RENDER = 'https://marketplat.onrender.com';

const CACHEABLE_GET = new Set([
  'home', 'categories', 'product-categories', 'service-categories',
  'service-types', 'store-types', 'ads', 'products', 'stores',
  'service-listings', 'service-providers', 'recommendations',
  'search', 'requests', 'sellers',
]);

function shouldUseWorker(method: string, path: string[], req: NextRequest): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (req.headers.has('authorization') || req.headers.has('cookie')) return false;
  const first = path[0] ?? '';
  return CACHEABLE_GET.has(first);
}

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  const search = req.nextUrl.search;

  const base = shouldUseWorker(req.method, path, req) ? API_WORKER : RENDER;
  const target = `${base}/api/v1/${path.join('/')}${search}`;

  const headers = new Headers();
  // Pass through content negotiation + auth
  for (const [k, v] of req.headers.entries()) {
    if (k.toLowerCase() === 'host') continue;
    headers.set(k, v);
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body;
    (init as { duplex?: string }).duplex = 'half';
  }

  return fetch(target, init);
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
