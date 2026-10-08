/**
 * lib/serverApiAdapter.ts — FIX SSR-BINDING-01
 *
 * Server-side (Cloudflare Worker SSR) axios calls used to go to an absolute
 * https://marketplat-api.<account>.workers.dev URL. A Worker fetching another
 * Worker on the same *.workers.dev account is blocked (CF error 1042), so every
 * RSC / generateMetadata call failed -> "Minified React error #441" (same
 * digest on every page) and profile pages showing "user not found".
 *
 * This adapter routes viewer-independent public GETs through the API_WORKER
 * Service Binding (same path app/api/v1/[...path]/route.ts already uses).
 * Anything else, or any failure to obtain the binding, falls back to axios's
 * normal adapter, so behaviour is never worse than before.
 */
import axios, {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { stripIdentityHeaders } from '@/lib/edgeProxy';

type BindingFetcher = { fetch: typeof fetch };

async function getApiWorker(): Promise<BindingFetcher | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const env = getCloudflareContext().env as unknown as { API_WORKER?: BindingFetcher };
    return env.API_WORKER ?? null;
  } catch {
    return null; // not on Cloudflare (local dev / tests)
  }
}

function toSegments(config: InternalAxiosRequestConfig): { segs: string[]; search: string } | null {
  try {
    const full = new URL(axios.getUri(config));
    const marker = '/api/v1/';
    const i = full.pathname.indexOf(marker);
    if (i === -1) return null;
    const segs = full.pathname.slice(i + marker.length).split('/').filter(Boolean);
    return { segs, search: full.search };
  } catch {
    return null;
  }
}

export const serverApiAdapter: AxiosAdapter = async (config) => {
  const fallback = axios.getAdapter(axios.defaults.adapter);
  const method = (config.method ?? 'get').toUpperCase();
  const parts = method === 'GET' ? toSegments(config) : null;

  // FIX SSR-BINDING-02: SSR requests carry no viewer identity, so ANY anonymous
  // GET may use the binding (e.g. GET /users/:id, which is not in edgeProxy's
  // cacheable shapes but must still avoid the blocked workers.dev hop; the API
  // worker passes non-cacheable paths straight through to the backend).
  // A request that does carry credentials keeps the normal path.
  const h = config.headers as unknown as { get?: (k: string) => unknown } | undefined;
  const hasAuth = Boolean(h?.get?.('Authorization') || h?.get?.('authorization') || h?.get?.('Cookie'));
  if (!parts || hasAuth) return fallback(config);

  const worker = await getApiWorker();
  if (!worker) return fallback(config);

  let res: Response;
  try {
    res = await worker.fetch(
      new Request(`https://api/api/v1/${parts.segs.join('/')}${parts.search}`, {
        method: 'GET',
        headers: stripIdentityHeaders(new Headers(config.headers as unknown as Record<string, string>)),
        redirect: 'manual',
      }),
    );
  } catch {
    return fallback(config); // binding failed -> try the normal path
  }

  const text = await res.text();
  let data: unknown = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep raw text */ }

  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => { headers[k] = v; });

  const response: AxiosResponse = {
    data, status: res.status, statusText: res.statusText,
    headers, config, request: undefined,
  };
  const ok = config.validateStatus ? config.validateStatus(res.status) : res.status >= 200 && res.status < 300;
  if (ok) return response;
  throw new AxiosError(
    `Request failed with status code ${res.status}`,
    res.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
    config, undefined, response,
  );
};
