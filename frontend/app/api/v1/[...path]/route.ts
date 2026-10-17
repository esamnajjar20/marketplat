/**
 * Edge-cache proxy for /api/v1/*.
 *
 * يستخدم Service Binding (env.API_WORKER) بدلاً من fetch المباشر
 * إلى marketplat-api.workers.dev — لأن Cloudflare يحظر fetch بين
 * Workers على نفس نطاق *.workers.dev (خطأ 1042).
 *
 * Public GET/HEAD بدون Authorization/Cookie → عبر API Worker (edge cache).
 * الباقي (POST/PATCH, auth, admin) → مباشرة إلى أصل الـAPI المضبوط
 * عبر API_BASE_URL / NEXT_PUBLIC_API_URL، مع Render كقيمة افتراضية للإنتاج.
 *
 * EDGE-AUTH-STRIP-01: المستخدم المسجّل يرسل Authorization + cookie مع كل طلب،
 * فكان يتجاوز الـedge بالكامل حتى للقوائم العامة المتطابقة للجميع. الآن، لمسارات
 * القراءة العامة المطابقة لقائمة lib/edgeProxy.ts فقط (deny-by-default)، تُحذف
 * ترويسات الهوية قبل الانتقال إلى API Worker فيُخدَم من نفس كاش الزوار.
 * أي مسار غير مدرج هناك يبقى على السلوك السابق (Render مباشرة عند وجود هوية).
 */
import type { NextRequest } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { isViewerIndependentPath, stripIdentityHeaders } from '@/lib/edgeProxy';

const DEFAULT_API_ORIGIN = 'https://marketplat.onrender.com';

/**
 * Keep the server-side proxy pointed at the same backend as the app.
 * CI and local development set NEXT_PUBLIC_API_URL to the disposable
 * backend (for example http://localhost:5000); hard-coding Render here
 * made browser login and all authenticated E2E journeys hit production
 * instead of the migrated/seeded test database.
 */
function getApiOrigin(): string {
  const configured = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL;
  const candidate = configured?.trim();
  if (!candidate) return DEFAULT_API_ORIGIN;

  const url = new URL(candidate);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('API_BASE_URL/NEXT_PUBLIC_API_URL must use http or https');
  }
  // Accept either an origin or a value already ending in /api/v1 without
  // accidentally generating /api/v1/api/v1/... when proxying the request.
  const basePath = url.pathname
    .replace(/\/api\/v1\/?$/, '')
    .replace(/\/+$/, '');
  return `${url.origin}${basePath}`;
}

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

  // EDGE-AUTH-STRIP-01: عام ومتطابق للجميع → نفس كاش الـedge حتى للمسجّل.
  // نبني Request جديدًا بترويسات مجرّدة من الهوية؛ `init` الأصلي يبقى كما هو
  // للـfallback إلى Render.
  if (isViewerIndependentPath(req.method, path)) {
    try {
      const { env } = getCloudflareContext();
      const apiWorker = (env as unknown as { API_WORKER?: { fetch: typeof fetch } }).API_WORKER;
      if (apiWorker) {
        return await apiWorker.fetch(
          new Request(`https://api/api/v1/${pathStr}${search}`, {
            method: req.method,
            headers: stripIdentityHeaders(req.headers),
            redirect: 'manual',
          }),
        );
      }
    } catch {
      // fallback: Render مباشرة بالترويسات الأصلية (تطوير محلي / Binding غير متاح)
    }
  } else if (shouldUseApiWorker(req.method, path, req)) {
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

  // Direct backend fallback (authenticated or non-cacheable requests).
  return fetch(`${getApiOrigin()}/api/v1/${pathStr}${search}`, init);
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
