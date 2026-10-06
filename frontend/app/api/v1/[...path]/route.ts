/**
 * Edge-cache proxy for /api/v1/*.
 *
 * يستخدم Service Binding (env.API_WORKER) بدلاً من fetch المباشر
 * إلى marketplat-api.workers.dev — لأن Cloudflare يحظر fetch بين
 * Workers على نفس نطاق *.workers.dev (خطأ 1042).
 *
 * Public GET/HEAD بدون Authorization/Cookie → عبر API Worker (edge cache).
 * الباقي (POST/PATCH, auth, admin) → مباشرة إلى Render.
 */
import type { NextRequest } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

const RENDER = 'https://marketplat.onrender.com';

const CACHEABLE_GET = new Set([
  'home', 'categories', 'product-categories', 'service-categories',
  'service-types', 'store-types', 'ads', 'products', 'stores',
  'service-listings', 'service-providers', 'recommendations',
  'search', 'requests', 'sellers',
]);

function shouldUseApiWorker(method: string, path: string[], req: NextRequest): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (req.headers.has('authorization') || req.headers.has('cookie')) return false;
  return CACHEABLE_GET.has(path[0] ?? '');
}

async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params;
  const search = req.nextUrl.search;
  const pathStr = path.join('/');

  const headers = new Headers();
  for (const [k, v] of req.headers.entries()) {
    if (k.toLowerCase() === 'host') continue;
    headers.set(k, v);
  }

  const init: RequestInit = { method: req.method, headers, redirect: 'manual' };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body;
    (init as { duplex?: string }).duplex = 'half';
  }

  if (shouldUseApiWorker(req.method, path, req)) {
    // استخدام Service Binding — لا يمر عبر الشبكة، لا يحظره Cloudflare
    try {
      const cfCtx = getCloudflareContext();
      const env = cfCtx.env;
      const apiWorker = (env as unknown as { API_WORKER?: { fetch: typeof fetch } }).API_WORKER;
      if (apiWorker) {
        return await apiWorker.fetch(new Request(`https://api/api/v1/${pathStr}${search}`, init));
      }
    } catch {
      // fallback: fetch عادي (للتطوير المحلي)
    }
  }

  // Render مباشرة (authenticated أو غير قابل للـcache)
  return fetch(`${RENDER}/api/v1/${pathStr}${search}`, init);
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
