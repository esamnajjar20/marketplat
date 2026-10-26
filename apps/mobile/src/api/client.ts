import { clearPrivateCache, deletePublicCacheEntry, readPublicCache, writePublicCache } from '@/storage/public-cache';
/** Minimal API transport. Set EXPO_PUBLIC_API_URL in apps/mobile/.env before connecting real screens. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
const DEFAULT_TIMEOUT_MS = 12_000;

/** Only explicitly public, read-only API families are eligible for anonymous offline caching. */
function publicGetCacheKey(path: string, method: string, hasToken: boolean): string | null {
  if (method.toUpperCase() !== 'GET' || hasToken || !path.startsWith('/api/v1/')) return null;
  const pathname = path.split('?', 1)[0];
  const allowed = [
    /^\/api\/v1\/ads(?:\/[^/]+)?$/,
    /^\/api\/v1\/categories$/,
    /^\/api\/v1\/product-categories$/,
    /^\/api\/v1\/service-categories$/,
    /^\/api\/v1\/service-listings(?:\/[^/]+)?$/,
    /^\/api\/v1\/search$/,
    /^\/api\/v1\/sellers\/ranking$/,
    /^\/api\/v1\/products(?:\/[^/]+)?$/,
    /^\/api\/v1\/stores(?:\/[^/]+)?$/,
  ];
  if (!allowed.some((pattern) => pattern.test(pathname)) || path.length > 280) return null;
  return `api-public:${path}`;
}

/** Authenticated offline reads require an explicit stable account ID from the caller. */
function privateCacheResourceKey(path: string, ownerId: string | undefined): string | null {
  if (!ownerId?.trim() || !path.startsWith('/api/v1/')) return null;
  const pathname = path.split('?', 1)[0];
  // Only explicit account-scoped GET routes are eligible. Query strings remain in
  // the key so pagination, filters and periods cannot overwrite each other.
  const allowed = [
    /^\/api\/v1\/users\/me$/,
    /^\/api\/v1\/appointments\/me$/,
    /^\/api\/v1\/orders\/(?:mine|seller)$/,
    /^\/api\/v1\/orders\/[^/]+$/,
    /^\/api\/v1\/requests\/me$/,
    /^\/api\/v1\/requests\/offers\/me$/,
    /^\/api\/v1\/sales$/,
    /^\/api\/v1\/sales\/summary$/,
    /^\/api\/v1\/sales\/[^/]+(?:\/receipt)?$/,
    /^\/api\/v1\/sellers\/me\/profile$/,
  ];
  if (!allowed.some((pattern) => pattern.test(pathname))) return null;
  if (ownerId.length > 160 || /[\u0000-\u001f]/.test(ownerId)) return null;
  return `api-private:${encodeURIComponent(ownerId)}:${path}`;
}

function privateGetCacheKey(path: string, method: string, token: string | undefined, ownerId: string | undefined): string | null {
  if (method.toUpperCase() !== 'GET' || !token?.trim()) return null;
  return privateCacheResourceKey(path, ownerId);
}

function isSuccessfulPublicEnvelope(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && (value as { success?: unknown }).success === true);
}

export type ApiRequestOptions = Omit<RequestInit, 'signal'> & {
  timeoutMs?: number;
  token?: string;
  /** Optional caller cancellation (e.g. auth session changed) in addition to the request timeout. */
  signal?: AbortSignal;
  /** Stable authenticated account ID; required for explicitly allow-listed private offline reads. */
  cacheOwnerId?: string;
};

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  if (!path.startsWith('/')) {
    throw new ApiError('يجب أن يبدأ مسار API بعلامة /.');
  }

  const { timeoutMs = DEFAULT_TIMEOUT_MS, token, headers, signal: externalSignal, cacheOwnerId, ...init } = options;
  const cacheKey = publicGetCacheKey(path, init.method ?? 'GET', Boolean(token?.trim()))
    ?? privateGetCacheKey(path, init.method ?? 'GET', token, cacheOwnerId);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ApiError('مهلة الاتصال يجب أن تكون رقمًا موجبًا.');
  }
  if (!API_BASE_URL) {
    if (cacheKey) {
      const cached = await readPublicCache<T>(cacheKey);
      if (cached && isSuccessfulPublicEnvelope(cached)) return cached;
    }
    throw new ApiError('عنوان API غير مضبوط. أضف EXPO_PUBLIC_API_URL إلى ملف البيئة.');
  }
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      credentials: options.credentials ?? 'include',
      headers: {
        Accept: 'application/json',
        ...(init.body && !(typeof FormData !== 'undefined' && init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
    const contentType = response.headers.get('content-type') ?? '';
    const payload: unknown = contentType.toLowerCase().includes('application/json')
      ? await response.json().catch(() => null)
      : null;
    if (!response.ok) {
      const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      const message = typeof body.message === 'string' ? body.message
        : response.status === 401 ? 'انتهت جلسة الدخول أو تحتاج إلى تسجيل الدخول.'
        : response.status === 403 ? 'ليست لديك صلاحية لتنفيذ هذا الإجراء.'
        : `فشل الطلب (${response.status})`;
      const requestId = typeof body.requestId === 'string' ? body.requestId : undefined;
      throw new ApiError(message, response.status, requestId);
    }
    if (cacheKey && isSuccessfulPublicEnvelope(payload)) {
      await writePublicCache(cacheKey, payload);
    } else if (init.method && init.method.toUpperCase() !== 'GET' && token) {
      // Cross-feature mutations (orders, requests, appointments, sales) can affect
      // multiple cached views. Clear private snapshots conservatively after success.
      await clearPrivateCache();
      const resourceKey = privateCacheResourceKey(path, cacheOwnerId)
        ?? (path.split('?', 1)[0] === '/api/v1/users/me/notifications' ? privateCacheResourceKey('/api/v1/users/me', cacheOwnerId) : null);
      if (resourceKey) await deletePublicCacheEntry(resourceKey);
    }
    return payload as T;
  } catch (error) {
    // Fall back only for explicitly allow-listed read endpoints. Private cache keys include
    // the caller-supplied account ID; mutations are always excluded.
    if (cacheKey && !(error instanceof ApiError && error.status !== undefined)) {
      const cached = await readPublicCache<T>(cacheKey);
      if (cached && isSuccessfulPublicEnvelope(cached)) return cached;
    }
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('انتهت مهلة الاتصال. تحقق من الإنترنت وحاول مجددًا.');
    }
    const message = error instanceof TypeError && /network|fetch/i.test(error.message)
      ? 'تعذر الوصول إلى الخادم. تحقق من الإنترنت وعنوان API ثم حاول مجددًا.'
      : 'تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مجددًا.';
    throw new ApiError(message);
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
}
