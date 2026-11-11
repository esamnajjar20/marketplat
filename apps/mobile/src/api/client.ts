import { clearPrivateCacheForPrefix, deletePublicCacheEntry, deletePublicCacheEntriesByPrefix, readPublicCacheEntry, writePublicCache } from '@/storage/public-cache';
import type { ZodType } from 'zod';
import { parseApiResponse } from '@/api/response-validation';
import { API_BASE_URL_ERROR, getConfiguredApiBaseUrl } from '@/lib/api-base-url';
import { markFreshApiResponse, markOfflineCacheResponse } from '@/api/offline-cache-status';
import { logger } from '@/lib/logger';
/** Minimal API transport. Set EXPO_PUBLIC_API_URL in apps/mobile/.env before connecting real screens. */
export type ApiFieldErrors = Record<string, string[]>;
export type ApiErrorMeta = Record<string, unknown>;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly requestId?: string,
    public readonly code?: string,
    public readonly fieldErrors?: ApiFieldErrors,
    public readonly errorMeta?: ApiErrorMeta,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Marker set on responses served from offline cache after a network failure. */
export type CachedResult<T> = T & { readonly __fromCache?: true; readonly __cachedAt?: number; readonly __staleForMs?: number };

/** Returns true when the given API response was served from offline cache. */
export function isFromCache(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && (value as { __fromCache?: boolean }).__fromCache === true);
}

/** Wrap a cached payload so callers can detect stale data (spread only safe for object envelopes). */
function tagFromCache<T>(value: T, savedAt: number): CachedResult<T> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      ...(value as object),
      __fromCache: true as const,
      __cachedAt: savedAt,
      __staleForMs: Math.max(0, Date.now() - savedAt),
    } as CachedResult<T>;
  }
  return value as CachedResult<T>;
}

/** Cache contents are also untrusted input and must satisfy the same schema as live responses. */
async function readValidatedCache<T>(
  cacheKey: string,
  responseSchema?: ZodType<T>,
  expectedEpoch?: number,
): Promise<CachedResult<T> | null> {
  try {
    if (expectedEpoch !== undefined && expectedEpoch !== publicCacheEpoch) return null;
    const entry = await readPublicCacheEntry<unknown>(cacheKey);
    if (expectedEpoch !== undefined && expectedEpoch !== publicCacheEpoch) return null;
    if (!entry || !Number.isFinite(entry.savedAt)) return null;
    const cached = entry.value;
    if (!cached || !isSuccessfulPublicEnvelope(cached)) return null;
    if (responseSchema) {
      const parsed = parseApiResponse(responseSchema, cached);
      if (!parsed.success) return null;
      markOfflineCacheResponse(cacheKey, entry.savedAt);
      return tagFromCache(parsed.data, entry.savedAt) as CachedResult<T>;
    }
    markOfflineCacheResponse(cacheKey, entry.savedAt);
    return tagFromCache(cached as T, entry.savedAt);
  } catch {
    // A cache read is best-effort. It must never hide the real network/config error.
    return null;
  }
}

const API_BASE_URL = getConfiguredApiBaseUrl();

/** Public API origin used by authenticated streaming transports as well as JSON requests. */
export function getApiBaseUrl(): string {
  if (!API_BASE_URL) {
    throw new ApiError(API_BASE_URL_ERROR);
  }
  return API_BASE_URL;
}

type RefreshHandler = () => Promise<{
  accessToken: string;
  csrfToken?: string;
  expiresIn?: number;
}>;
type TokenUpdater = (
  accessToken: string,
  csrfToken: string | undefined,
  expiresIn: number | undefined,
) => void;

let refreshHandler: RefreshHandler | null = null;
let tokenUpdater: TokenUpdater | null = null;
let authFailureHandler: ((error: ApiError) => void) | null = null;
let refreshInFlight: Promise<string> | null = null;
// Latest CSRF value returned by the same refresh that rotated the cookie.
// Used only to rebuild a mutation retry after a 401; never persisted here.
let refreshedCsrfToken: string | undefined;

/** Refresh the access token once across concurrent REST and streaming requests. */
export async function refreshAccessTokenForStream(): Promise<string> {
  if (!refreshHandler) throw new ApiError('تعذر تجديد جلسة تسجيل الدخول.', 401);
  if (!refreshInFlight) {
    refreshInFlight = refreshHandler()
      .then((refreshed) => {
        if (refreshed.csrfToken) refreshedCsrfToken = refreshed.csrfToken;
        tokenUpdater?.(refreshed.accessToken, refreshed.csrfToken, refreshed.expiresIn);
        return refreshed.accessToken;
      })
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

/** Register a handler that resolves a fresh access token when the current one expires (401).
 *  Passing null clears it (e.g. on logout). */
export function setRefreshHandler(handler: RefreshHandler | null): void {
  refreshHandler = handler;
  if (!handler) {
    refreshInFlight = null;
    refreshedCsrfToken = undefined;
  }
}

/** Register a callback that updates caller-side session state after a successful refresh. */
export function setTokenUpdater(updater: TokenUpdater | null): void {
  tokenUpdater = updater;
}

/** Called once by the auth provider when the refresh cookie is definitively rejected. */
export function setAuthFailureHandler(handler: ((error: ApiError) => void) | null): void {
  authFailureHandler = handler;
}

const DEFAULT_TIMEOUT_MS = 10_000;
export const UPLOAD_TIMEOUT_MS = 120_000;
// Prevent a GET that started before a successful mutation from re-inserting its
// stale response after that mutation has cleared the local SQLite snapshots.
let publicCacheEpoch = 0;

/** Only explicitly public, read-only API families are eligible for anonymous offline caching; mutations are always excluded. */
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
    /^\/api\/v1\/sales\/debts(?:\/summary)?$/,
    /^\/api\/v1\/sales\/installments\/(?:upcoming|overdue)$/,
    /^\/api\/v1\/customers(?:\/summary)?$/,
    /^\/api\/v1\/notifications$/,
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

/** One mutation-to-cache map for all mobile features. Private snapshots are always
 * invalidated within the authenticated owner namespace; missing owner IDs never
 * trigger a cross-account purge. Public read models are invalidated independently. */
const MUTATION_CACHE_RULES: ReadonlyArray<{
  route: RegExp;
  privatePrefixes: readonly string[];
  publicPrefixes: readonly string[];
}> = [
  { route: /^\/api\/v1\/(?:ads|ad-images)(?:\/|$)/, privatePrefixes: ['/api/v1/ads', '/api/v1/users/me'], publicPrefixes: ['api-public:/api/v1/ads', 'api-public:/api/v1/search', 'ads:', 'ad-detail:'] },
  { route: /^\/api\/v1\/(?:products|product-images)(?:\/|$)/, privatePrefixes: ['/api/v1/products', '/api/v1/users/me'], publicPrefixes: ['api-public:/api/v1/products', 'api-public:/api/v1/stores', 'api-public:/api/v1/search', 'home:public-products:v1'] },
  { route: /^\/api\/v1\/(?:service-listings|services|service-images)(?:\/|$)/, privatePrefixes: ['/api/v1/service-listings', '/api/v1/users/me'], publicPrefixes: ['api-public:/api/v1/service-listings', 'api-public:/api/v1/search', 'service-listings:', 'home:public-services:v1'] },
  { route: /^\/api\/v1\/(?:stores|store-members|store-invites|store-promotions|store-hours)(?:\/|$)/, privatePrefixes: ['/api/v1/stores', '/api/v1/users/me'], publicPrefixes: ['api-public:/api/v1/stores', 'api-public:/api/v1/search', 'home:public-stores:v1'] },
  { route: /^\/api\/v1\/(?:favorites|favourites)(?:\/|$)/, privatePrefixes: ['/api/v1/favorites', '/api/v1/users/me'], publicPrefixes: ['api-public:/api/v1/search', 'api-public:/api/v1/ads', 'api-public:/api/v1/products'] },
  { route: /^\/api\/v1\/(?:stories)(?:\/|$)/, privatePrefixes: ['/api/v1/stories', '/api/v1/users/me'], publicPrefixes: ['api-public:/api/v1/stories', 'api-public:/api/v1/search'] },
  { route: /^\/api\/v1\/(?:blocks|blocked-users)(?:\/|$)/, privatePrefixes: ['/api/v1/blocks', '/api/v1/blocked-users', '/api/v1/users/me'], publicPrefixes: [] },
  { route: /^\/api\/v1\/(?:users|profile|sellers)(?:\/|$)/, privatePrefixes: ['/api/v1/users', '/api/v1/sellers/me', '/api/v1/service-providers'], publicPrefixes: ['api-public:/api/v1/sellers', 'api-public:/api/v1/search', 'api-public:/api/v1/service-listings'] },
  { route: /^\/api\/v1\/(?:service-providers)(?:\/|$)/, privatePrefixes: ['/api/v1/service-providers', '/api/v1/service-listings'], publicPrefixes: ['api-public:/api/v1/service-listings', 'api-public:/api/v1/sellers/ranking', 'home:public-services:v1'] },
  { route: /^\/api\/v1\/(?:service-reviews|reviews|ratings)(?:\/|$)/, privatePrefixes: ['/api/v1/service-reviews', '/api/v1/service-listings', '/api/v1/service-providers'], publicPrefixes: ['api-public:/api/v1/service-listings', 'api-public:/api/v1/sellers/ranking', 'home:public-services:v1'] },
  { route: /^\/api\/v1\/service-requests(?:\/|$)/, privatePrefixes: ['/api/v1/service-requests'], publicPrefixes: [] },
  { route: /^\/api\/v1\/follows(?:\/|$)/, privatePrefixes: ['/api/v1/follows', '/api/v1/users/me'], publicPrefixes: ['api-public:/api/v1/search'] },
  { route: /^\/api\/v1\/orders(?:\/|$)/, privatePrefixes: ['/api/v1/orders'], publicPrefixes: [] },
  { route: /^\/api\/v1\/requests(?:\/|$)/, privatePrefixes: ['/api/v1/requests'], publicPrefixes: [] },
  { route: /^\/api\/v1\/appointments(?:\/|$)/, privatePrefixes: ['/api/v1/appointments'], publicPrefixes: [] },
  { route: /^\/api\/v1\/sales(?:\/|$)/, privatePrefixes: ['/api/v1/sales'], publicPrefixes: [] },
  { route: /^\/api\/v1\/customers(?:\/|$)/, privatePrefixes: ['/api/v1/customers'], publicPrefixes: [] },
  { route: /^\/api\/v1\/notifications(?:\/|$)/, privatePrefixes: ['/api/v1/notifications'], publicPrefixes: [] },
];

async function invalidateMutationCaches(path: string, ownerId?: string): Promise<void> {
  const pathname = path.split('?', 1)[0];
  const rule = MUTATION_CACHE_RULES.find((candidate) => candidate.route.test(pathname));
  if (!rule) return;
  if (ownerId?.trim()) {
    for (const prefix of rule.privatePrefixes) await clearPrivateCacheForPrefix(prefix, ownerId);
  } else if (rule.privatePrefixes.length && __DEV__) {
    logger.warn('api/client', 'skipped private cache invalidation because cacheOwnerId is missing', { pathname });
  }
  for (const prefix of rule.publicPrefixes) await deletePublicCacheEntriesByPrefix(prefix);
}

/** Parse delta-seconds or an HTTP date from Retry-After without sleeping inside the API client. */
function parseRetryAfterSeconds(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(trimmed);
  if (!Number.isFinite(date)) return undefined;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

export type ApiRequestOptions<T = unknown> = Omit<RequestInit, 'signal'> & {
  timeoutMs?: number;
  token?: string;
  /** Optional caller cancellation (e.g. auth session changed) in addition to the request timeout. */
  signal?: AbortSignal;
  /** Stable authenticated account ID; required for explicitly allow-listed private offline reads. */
  cacheOwnerId?: string;
  /** Runtime validation for untrusted JSON returned by security/commerce-critical endpoints. */
  responseSchema?: ZodType<T>;
  /** @internal — set internally to prevent infinite 401 retry loops. */
  _retried?: boolean;
  /** @internal — retry one idempotent GET after a transient cold-start/network failure. */
  _networkRetried?: boolean;
};

const API_ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: 'تحقق من الحقول المدخلة؛ بعض البيانات غير صحيحة.',
  BAD_REQUEST: 'تحقق من البيانات المدخلة ثم حاول مرة أخرى.',
  RESOURCE_NOT_FOUND: 'العنصر المطلوب غير موجود أو لم يعد متاحًا.',
  UNAUTHORIZED: 'انتهت جلسة الدخول أو تحتاج إلى تسجيل الدخول.',
  STORE_ACCESS_DENIED: 'ليس لديك وصول إلى هذا المتجر.',
  STORE_ROLE_INSUFFICIENT: 'صلاحية عضويتك لا تسمح بتنفيذ هذا الإجراء.',
  STORE_OWNER_ONLY: 'هذا الإجراء متاح لمالك المتجر فقط.',
  STORE_BLOCKED: 'هذا المتجر محظور ولا يمكن إجراء تغييرات عليه.',
  STORE_OWNER_SUSPENDED: 'حساب مالك المتجر موقوف مؤقتًا.',
  SERVICE_ATTRIBUTE_REQUIRED: 'أكمل الخصائص المطلوبة للخدمة.',
  SERVICE_ATTRIBUTE_INVALID: 'تحقق من قيم خصائص الخدمة.',
  INVALID_INPUT: 'تحقق من البيانات المدخلة ثم حاول مرة أخرى.',
  INTERNAL_ERROR: 'حدث خطأ غير متوقع في الخادم. حاول مرة أخرى لاحقًا.',
  SERVICE_UNAVAILABLE: 'الخدمة غير متاحة مؤقتًا. حاول مرة أخرى بعد قليل.',
  STORE_NOT_FOUND: 'لم يتم العثور على متجر مرتبط بحسابك.',
  SELLER_NOT_FOUND: 'أكمل ملف البائع أو أنشئ متجرًا للمتابعة.',
  EMAIL_NOT_VERIFIED: 'أكد بريدك الإلكتروني قبل تنفيذ هذه العملية.',
  INSUFFICIENT_PERMISSIONS: 'ليست لديك صلاحية لتنفيذ هذا الإجراء.',
  FORBIDDEN: 'ليست لديك صلاحية لتنفيذ هذا الإجراء.',
  NOT_FOUND: 'العنصر المطلوب غير موجود أو لم يعد متاحًا.',
  CONFLICT: 'تعذّر إتمام العملية بسبب تعارض مع الحالة الحالية.',
  RATE_LIMIT_EXCEEDED: 'تم تنفيذ طلبات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.',
};

function localizeApiMessage(message: string, status?: number, code?: string): string {
  if (code && API_ERROR_MESSAGES[code]) return API_ERROR_MESSAGES[code];
  const normalized = message.trim().toLowerCase();
  if (!normalized || /^(validation failed|internal server error|service unavailable|forbidden|not found|bad request|request failed)$/i.test(message.trim())) {
    if (status === 400 || status === 422) return 'تحقق من البيانات المدخلة ثم حاول مرة أخرى.';
    if (status === 401) return 'انتهت جلسة الدخول أو تحتاج إلى تسجيل الدخول.';
    if (status === 403) return 'ليست لديك صلاحية لتنفيذ هذا الإجراء.';
    if (status === 404) return 'العنصر المطلوب غير موجود أو لم يعد متاحًا.';
    if (status === 409) return 'تعذّر إتمام العملية بسبب تعارض مع الحالة الحالية.';
    if (status && status >= 500) return 'حدث خطأ في الخادم. حاول مرة أخرى لاحقًا.';
    return '';
  }
  // Keep already-Arabic application messages; translate common framework/server text.
  if (/[\u0600-\u06FF]/.test(message)) return message;
  if (/invalid email/i.test(message)) return 'صيغة البريد الإلكتروني غير صحيحة.';
  if (/email.*(already|exists|taken)/i.test(message)) return 'هذا البريد الإلكتروني مستخدم بالفعل.';
  if (/too many (?:password|login|sign[- ]?in) attempts|account.{0,32}locked|locked.{0,32}account/i.test(message)) {
    return 'تم قفل الحساب مؤقتًا بسبب كثرة محاولات الدخول. انتظر قليلًا ثم حاول مرة أخرى.';
  }
  if (/(invalid|incorrect|wrong|malformed).*phone|phone.*(invalid|incorrect|required|missing)/i.test(message)) return 'تحقق من رقم الهاتف المدخل.';
  if (/(invalid|incorrect|wrong|weak|missing|required).*password|password.*(invalid|incorrect|weak|required|missing|too short)/i.test(message)) return 'تحقق من كلمة المرور المدخلة.';
  if (/unauthorized/i.test(message)) return 'انتهت جلسة الدخول أو تحتاج إلى تسجيل الدخول.';
  if (/forbidden|permission/i.test(message)) return 'ليست لديك صلاحية لتنفيذ هذا الإجراء.';
  if (/not found/i.test(message)) return 'العنصر المطلوب غير موجود أو لم يعد متاحًا.';
  if (/validation|invalid|bad request/i.test(message)) return 'تحقق من البيانات المدخلة ثم حاول مرة أخرى.';
  if (/internal|server error|temporarily unavailable/i.test(message)) return 'حدث خطأ في الخادم. حاول مرة أخرى لاحقًا.';
  if (status === 400 || status === 422) return 'تحقق من البيانات المدخلة ثم حاول مرة أخرى.';
  if (status === 401) return 'انتهت جلسة الدخول أو تحتاج إلى تسجيل الدخول.';
  if (status === 403) return 'ليست لديك صلاحية لتنفيذ هذا الإجراء.';
  if (status === 404) return 'العنصر المطلوب غير موجود أو لم يعد متاحًا.';
  if (status === 409) return 'تعذّر إتمام العملية بسبب تعارض مع الحالة الحالية.';
  if (status && status >= 500) return 'حدث خطأ في الخادم. حاول مرة أخرى لاحقًا.';
  return 'تعذر إتمام الطلب. حاول مرة أخرى.';
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions<T> = {}): Promise<T> {
  if (!path.startsWith('/')) {
    throw new ApiError('يجب أن يبدأ مسار API بعلامة /.');
  }

  const { timeoutMs: requestedTimeoutMs, token, headers, signal: externalSignal, cacheOwnerId, responseSchema, _retried, _networkRetried, ...init } = options;
  const isMultipartUpload = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const timeoutMs = requestedTimeoutMs ?? (isMultipartUpload ? UPLOAD_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
  const cacheEpochAtRequestStart = publicCacheEpoch;
  const cacheKey = publicGetCacheKey(path, init.method ?? 'GET', Boolean(token?.trim()))
    ?? privateGetCacheKey(path, init.method ?? 'GET', token, cacheOwnerId);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ApiError('مهلة الاتصال يجب أن تكون رقمًا موجبًا.');
  }
  if (!API_BASE_URL) {
    if (cacheKey) {
      const cached = await readValidatedCache<T>(cacheKey, responseSchema, cacheEpochAtRequestStart);
      if (cached) return cached;
    }
    throw new ApiError(API_BASE_URL_ERROR);
  }
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  let timeoutExpired = false;
  let allowHttpCacheFallback = false;
  const timeout = setTimeout(() => {
    timeoutExpired = true;
    controller.abort();
  }, timeoutMs);
  try {
    // Normalize headers through the Headers API. Object-spreading a Headers
    // instance drops its entries because they are not enumerable; this matters
    // for the refreshed CSRF header passed by the transparent 401 retry.
    const requestHeaders = new Headers({
      Accept: 'application/json',
      ...(init.body && !(typeof FormData !== 'undefined' && init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });
    new Headers(headers).forEach((value, name) => requestHeaders.set(name, value));

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      // On React Native, fetch() delegates cookie handling to the native HTTP client
      // (CookieManager on Android, NSHTTPCookieStorage on iOS). The browser-only
      // 'credentials' flag is respected on web builds but is effectively a no-op on
      // native — the refresh cookie flows through the platform cookie jar, which is
      // cleared automatically on logout (Set-Cookie with max-age=0). Do not rely on
      // document.cookie or manual cookie storage; the platform handles it.
      credentials: options.credentials ?? 'include',
      headers: requestHeaders,
    });
    const contentType = response.headers.get('content-type') ?? '';
    const payload: unknown = contentType.toLowerCase().includes('application/json')
      ? await response.json().catch(() => null)
      : null;
    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) allowHttpCacheFallback = true;
      if ((response.status === 502 || response.status === 503 || response.status === 504)
        && (init.method ?? 'GET').toUpperCase() === 'GET'
        && !_networkRetried && !externalSignal?.aborted) {
        return apiRequest<T>(path, { ...options, timeoutMs, _networkRetried: true });
      }
      // Transparent refresh on 401: one retry per request, only when we have a token,
      // and never on auth endpoints (would loop).
      if (
        response.status === 401
        && !_retried
        && refreshHandler
        && Boolean(token?.trim())
        && !path.startsWith('/api/v1/auth/')
      ) {
        try {
          const refreshedToken = await refreshAccessTokenForStream();
          // Refresh rotates the CSRF cookie on the server. Reuse of the original
          // X-CSRF-Token would therefore make this otherwise-valid mutation fail
          // with 403. Replace it only when the caller originally supplied the
          // header, preserving all other request headers and auth semantics.
          const retryHeaders = new Headers(headers);
          if (refreshedCsrfToken && retryHeaders.has('X-CSRF-Token')) {
            retryHeaders.set('X-CSRF-Token', refreshedCsrfToken);
          }
          return apiRequest<T>(path, {
            ...options,
            headers: retryHeaders,
            token: refreshedToken,
            _retried: true,
          });
        } catch (refreshError) {
          // A rejected/expired refresh credential is a terminal session failure.
          // Transport errors (offline/timeout/5xx) must not erase a usable offline session.
          if (refreshError instanceof ApiError && refreshError.status === 401) {
            authFailureHandler?.(refreshError);
          }
          // Fall through to the original request's 401 either way.
        }
      }
      const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      const code = typeof body.code === 'string' ? body.code : undefined;
      const requestId = typeof body.requestId === 'string' ? body.requestId : undefined;
      const rawErrors = body.errors && typeof body.errors === 'object' && !Array.isArray(body.errors)
        ? body.errors as Record<string, unknown> : undefined;
      const fieldErrors: ApiFieldErrors = {};
      if (rawErrors) {
        for (const [field, value] of Object.entries(rawErrors)) {
          const messages = (Array.isArray(value) ? value : [value])
            .filter((item): item is string => typeof item === 'string')
            .map((item) => localizeApiMessage(item) || 'قيمة هذا الحقل غير صحيحة.');
          if (messages.length) fieldErrors[field] = messages;
        }
      }
      const rawErrorMeta = body.errorMeta && typeof body.errorMeta === 'object' && !Array.isArray(body.errorMeta)
        ? body.errorMeta as ApiErrorMeta : undefined;
      const retryAfterSeconds = response.status === 429
        ? parseRetryAfterSeconds(response.headers.get('retry-after'))
        : undefined;
      const errorMeta: ApiErrorMeta | undefined = retryAfterSeconds === undefined
        ? rawErrorMeta
        : { ...(rawErrorMeta ?? {}), retryAfterSeconds };
      const serverMessage = typeof body.message === 'string' ? body.message : '';
      const rateLimitMessage = retryAfterSeconds === undefined
        ? 'تم تنفيذ طلبات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.'
        : `تم تنفيذ طلبات كثيرة. أعد المحاولة بعد ${retryAfterSeconds} ثانية.`;
      const baseMessage = response.status === 429
        ? rateLimitMessage
        : localizeApiMessage(serverMessage, response.status, code)
        || (response.status === 401 ? 'انتهت جلسة الدخول أو تحتاج إلى تسجيل الدخول.'
          : response.status === 403 ? 'ليست لديك صلاحية لتنفيذ هذا الإجراء.'
          : response.status === 404 ? 'العنصر المطلوب غير موجود أو لم يعد متاحًا.'
          : response.status === 409 ? 'تعذّر إتمام العملية بسبب تعارض مع الحالة الحالية.'
          : response.status === 422 || response.status === 400 ? 'تحقق من البيانات المدخلة ثم حاول مرة أخرى.'
          : response.status >= 500 ? 'حدث خطأ في الخادم. حاول مرة أخرى لاحقًا.'
          : `تعذر إتمام الطلب (${response.status}).`);
      const fieldDetails = Object.values(fieldErrors).flat().slice(0, 6).join('؛ ');
      const message = fieldDetails ? `${baseMessage}\n${fieldDetails}` : baseMessage;
      throw new ApiError(message, response.status, requestId, code, Object.keys(fieldErrors).length ? fieldErrors : undefined, errorMeta);
    }
    let validatedPayload: unknown = payload;
    if (responseSchema) {
      const parsed = parseApiResponse(responseSchema, payload);
      if (!parsed.success) {
        // Treat malformed 2xx responses as an upstream contract error. Do not cache
        // the bad payload or fall back to potentially misleading stale data.
        throw new ApiError('استجابة الخادم لا تطابق مخطط البيانات المتوقع.', 502);
      }
      validatedPayload = parsed.data;
    }
    if (cacheKey && isSuccessfulPublicEnvelope(validatedPayload)) {
      // A GET that began before a mutation must not resurrect the pre-mutation
      // snapshot after invalidation has completed. Keep the normal write async.
      if (cacheEpochAtRequestStart === publicCacheEpoch) {
        markFreshApiResponse(cacheKey);
        void writePublicCache(cacheKey, validatedPayload).catch(() => undefined);
      }
    } else if (init.method && init.method.toUpperCase() !== 'GET') {
      // Invalidate before resolving the successful mutation to its caller. The
      // epoch fence also blocks already-running GETs from writing older data.
      publicCacheEpoch += 1;
      try {
        await invalidateMutationCaches(path, cacheOwnerId);
      } catch {
        // Cache maintenance never changes the authoritative mutation result.
      }
    }
    return validatedPayload as T;
  } catch (error) {
    const method = (init.method ?? 'GET').toUpperCase();
    // A caller abort (screen unmounted/session changed) is not a network failure:
    // never retry it and never replace it with a cached success.
    if (externalSignal?.aborted) {
      throw new ApiError('تم إلغاء الطلب.', undefined, undefined, 'REQUEST_CANCELLED');
    }
    const transientTransportFailure = error instanceof Error && (
      (error.name === 'AbortError' && timeoutExpired)
      || (error instanceof TypeError && /network|fetch/i.test(error.message))
    );
    const requestTimedOut = error instanceof Error && error.name === 'AbortError' && timeoutExpired;
    if (method === 'GET' && !_networkRetried && transientTransportFailure && !requestTimedOut) {
      return apiRequest<T>(path, {
        ...options,
        timeoutMs,
        _networkRetried: true,
      });
    }
    // Fall back for explicitly allow-listed read endpoints after transport failures,
    // HTTP 5xx or rate limiting. Do not hide ordinary 4xx or malformed 2xx payloads.
    if (cacheKey && (allowHttpCacheFallback || !(error instanceof ApiError && error.status !== undefined))) {
      const cached = await readValidatedCache<T>(cacheKey, responseSchema, cacheEpochAtRequestStart);
      if (cached) return cached;
    }
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(timeoutExpired
        ? 'انتهت مهلة الاتصال. تحقق من الإنترنت وحاول مرة أخرى.'
        : 'تم إلغاء الطلب.', undefined, undefined, timeoutExpired ? 'REQUEST_TIMEOUT' : 'REQUEST_CANCELLED');
    }
    const message = error instanceof TypeError && /network|fetch/i.test(error.message)
      ? 'تعذر الوصول إلى الخادم. تحقق من الإنترنت وعنوان API ثم حاول مرة أخرى.'
      : 'تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مرة أخرى.';
    throw new ApiError(message);
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
}
