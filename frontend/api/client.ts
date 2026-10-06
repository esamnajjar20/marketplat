/**
 * Axios client singleton.
 *
 * FIX AUTH-01: Access token read from auth store on every request.
 * FIX AUTH-02: Silent refresh with request queue to prevent race conditions.
 * FIX NEXT15-01: Replaced require() with ES module imports.
 *   require() breaks TypeScript path alias resolution (@/*) and is incompatible
 *   with Next.js 15 module bundler resolution. Dynamic imports with await are
 *   used instead to break the circular dependency: client ↔ auth.store ↔ client.
 *
 * Circular dependency chain:
 *   auth.api.ts → client.ts → auth.store.ts  (store doesn't import client — OK)
 *   client.ts → auth.api.ts (only inside catch block — lazy, not at module load)
 *
 * Resolution: import auth.store at module level (it doesn't import client).
 *             import auth.api lazily inside the interceptor catch block.
 *
 * PROD-FIX-15: withCredentials flipped to true — refreshToken is now an
 * httpOnly cookie the backend sets (see backend-v9's
 * shared/utils/authCookies.ts), not a value read from the auth store /
 * localStorage. Without withCredentials:true, the browser would never
 * attach that cookie to cross-origin requests (the frontend and
 * backend run on different origins/ports even in local dev), and the
 * backend would never see it on /auth/refresh or set it in the first
 * place on login/register (a Set-Cookie response header is also
 * ignored by the browser for a fetch/XHR that didn't opt into
 * credentials). Every state-changing request also gets an
 * X-CSRF-Token header — see getCsrfToken()'s own comment for why that
 * is the necessary other half of moving to a cookie-based refresh flow.
 */
import { recordRequestFailure, recordRequestTiming, recordRequestSuccess } from '@/lib/connectionQuality';
import { getNetworkPolicy } from '@/lib/networkPolicy';
import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { useAuthStore }  from '@/store/auth.store';
import { parseApiError } from '@/lib/errorParser';
import { API_BASE_URL }  from '@/lib/constants';
import { setCookie, deleteCookie, cookieMaxAgeFromExpiresIn, SESSION_HINT_COOKIE_MAX_AGE } from '@/lib/cookies';
import { getCsrfToken } from '@/lib/csrf';
import { toast } from 'sonner';
import { QUEUE_UPDATED_EVENT } from '@/hooks/useQueuedRequestCount';
import { clearSensitiveLocalData } from '@/lib/authCleanup';
import { makeOfflineError } from '@/lib/offlineError';
import { OFFLINE_OP_ID_HEADER, newOfflineOperationId } from '@/lib/offlineOperationId';
import { recordRequestRetry, recordRequestStarted } from '@/lib/networkObservability';
import { isNetworkFailure } from '@/lib/networkErrors';

export type BatchGetRequest = {
  url: string;
  params?: Record<string, unknown>;
};

const NETWORK_RETRY_MARKER = '_networkRetryCount';
function getRetryDelayMs(attempt: number, retryAfterMs?: number): number {
  if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs)) {
    return Math.min(Math.max(retryAfterMs, 250), 15_000);
  }
  const base = Math.min(1_000 * 2 ** Math.max(0, attempt - 1), 4_000);
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

function isSafeMethod(method?: string): boolean {
  return SAFE_METHODS.has((method ?? 'get').toLowerCase());
}

function isNetworkRetryableAxiosError(error: AxiosError): boolean {
  if (axios.isCancel(error)) return false;
  const status = error.response?.status;
  if (status === 408 || status === 429 || status === 502 || status === 503 || status === 504) return true;
  return isNetworkFailure(error);
}

function getRetryAfterMs(error: AxiosError): number | undefined {
  const raw = error.response?.headers?.['retry-after'];
  if (raw == null) return undefined;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const dateMs = Date.parse(String(value));
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : undefined;
}

function supportsOfflineOperationId(method: string, url: string): boolean {
  if (method !== 'post') return false;
  const path = url.split('?')[0] ?? url;
  return (
    /^\/ads$/.test(path) ||
    /^\/products$/.test(path) ||
    /^\/service-listings$/.test(path) ||
    /^\/service-requests$/.test(path) ||
    /^\/sales$/.test(path) ||
    /^\/conversations\/[^/]+\/messages(?:\/(?:file|audio))?$/.test(path)
  );
}

export type BatchGetResponse<T = unknown> = {
  data: T;
  status: number;
};

type ApiClientWithBatchGet = AxiosInstance & {
  batchGet<T = unknown>(requests: BatchGetRequest[]): Promise<BatchGetResponse<T>[]>;
};

export const apiClient = axios.create({
  baseURL:         API_BASE_URL,
  withCredentials: true,
  headers:         { 'Content-Type': 'application/json' },
}) as ApiClientWithBatchGet;

const SAFE_METHODS = new Set(['get', 'head', 'options']);

const inflightGetRequests = new Map<string, Promise<unknown>>();

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function getDedupKey(url: string, config?: AxiosRequestConfig): string {
  const userId = useAuthStore.getState().user?.id ?? 'anonymous';
  return `${userId}|${url}|${JSON.stringify(stableValue(config?.params ?? null))}|${config?.responseType ?? 'json'}`;
}

const rawGet = apiClient.get.bind(apiClient);
apiClient.get = ((url: string, config?: AxiosRequestConfig) => {
  // Do not share requests carrying an AbortSignal: one caller cancelling its
  // request must never cancel another caller's request. Blob downloads are
  // also excluded because they are usually user-initiated media actions.
  const responseType = config?.responseType;
  if (config?.signal || responseType === 'blob' || responseType === 'arraybuffer') {
    return rawGet(url, config);
  }

  const key = getDedupKey(url, config);
  const existing = inflightGetRequests.get(key);
  if (existing) return existing as ReturnType<typeof rawGet>;

  const request = rawGet(url, config).finally(() => {
    if (inflightGetRequests.get(key) === request) inflightGetRequests.delete(key);
  });
  inflightGetRequests.set(key, request);
  return request;
}) as typeof apiClient.get;

// ── Request interceptor — attach access token + CSRF token ────────
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  recordRequestStarted();
  const method = (config.method ?? 'get').toLowerCase();

  // FIX OFFLINE-FAST-FAIL: when navigator.onLine is definitively
  // false, reject state-changing requests immediately instead of
  // waiting up to 15s for axios's own timeout. On several mobile
  // network stacks (Android/Chrome behind Gaza carrier NATs
  // especially), an offline POST doesn't fail fast — the request
  // just hangs until axios's timeout fires. That's exactly the
  // "يطول كثير وهو يحاول يحفظ" symptom: the user waits 15s of
  // nothing before the onError path finally runs and shows the
  // "محفوظ محليًا" toast. Throwing here drops that to ~0ms.
  //
  // Safe methods (GET/HEAD/OPTIONS) are NOT touched: an offline GET
  // should still fall through so the SW's cache strategy can serve
  // a cached response if one exists. Only the mutations the SW
  // can't help with get the fast-fail.
  if (
    !SAFE_METHODS.has(method) &&
    typeof navigator !== 'undefined' &&
    navigator.onLine === false
  ) {
    throw makeOfflineError();
  }

  // FIX MUTATION-TIMEOUT-01: cap state-changing requests at 8s instead
  // of the global 15s. On Gaza mobile networks (this app's target
  // audience) a POST the browser thinks is "online" can sit silently
  // for the full 15s before axios gives up and onError fires — during
  // which the user sees "جاري الحفظ..." with zero progress. 8s halves
  // the worst perceived hang. Multipart uploads (which need real
  // bandwidth) override this via mediaApi's own 30s budget; GETs keep
  // the 15s global since they have no fallback.
  // FIX MUTATION-TIMEOUT-02: axios merges the instance's timeout
  // default into config before this interceptor runs, so config.timeout
  // was never undefined and the 8s cap for mutations never actually
  // applied - every POST/PUT/PATCH/DELETE hung the full 15s that
  // FIX MUTATION-TIMEOUT-01 was written to avoid. Drop the instance-level
  // default and decide here: safe methods get 15s, mutations 8s. Explicit
  // per-call timeouts (e.g. mediaApi's 30s multipart budget) still win -
  // they arrive as a non-undefined config.timeout and are left alone.
  // T665 — axios's own default is `timeout: 0` (no timeout), not
  // `undefined`. mergeConfig copies that 0 into config before this
  // interceptor runs, so `config.timeout === undefined` was always
  // false and the caps below never actually applied — every request
  // (GET included) ran with axios's "no timeout" default. `!config.timeout`
  // catches both 0 and undefined, and still leaves any explicit
  // per-call timeout (e.g. mediaApi's 30s multipart budget) alone
  // since those arrive non-zero.
  if (!config.timeout) {
    // Phase 2: use the central NetworkPolicy instead of a fixed timeout.
    // Auth remains deliberately longer because refresh rotation is a
    // correctness-critical path; explicit per-call timeouts still win.
    const url = config.url ?? '';
    const isAuthPath = url.includes('/auth/');
    const policyTimeout = getNetworkPolicy().requestTimeoutMs;
    config.timeout = isAuthPath
      ? 20_000
      : (policyTimeout > 0 ? policyTimeout : (isSafeMethod(method) ? 15_000 : 8_000));
  }

  // PHASE-1 UX: sample RTT for connection quality indicator
  (config as AxiosRequestConfig & { metadata?: { start: number } }).metadata = {
    start: typeof performance !== 'undefined' ? performance.now() : Date.now(),
  };

  // For create operations whose backend already enforces X-Offline-Op-Id,
  // generate the id at the request boundary when the caller did not provide
  // one. The same Axios config is reused by manual retries and SW replay, so
  // the id remains stable and a late server response cannot turn into a
  // duplicate create. We deliberately do not add this header to mutations
  // whose backend has no matching idempotency contract.
  if (supportsOfflineOperationId(method, config.url ?? '')) {
    const headers = config.headers as Record<string, string | undefined>;
    if (!headers[OFFLINE_OP_ID_HEADER] && !headers[OFFLINE_OP_ID_HEADER.toLowerCase()]) {
      headers[OFFLINE_OP_ID_HEADER] = newOfflineOperationId();
    }
  }

  // useAuthStore.getState() is synchronous — safe outside React components.
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // PROD-FIX-15: only needed on state-changing requests — matches
  // csrf.middleware.ts's own method allowlist on the backend (GET/HEAD/
  // OPTIONS are exempt there too). Harmless to omit on safe methods,
  // but adding it unconditionally would mean every single GET request
  // pays a document.cookie read for no reason.
  if (!SAFE_METHODS.has(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }

  // FIX BUG-IMG-CONTENTTYPE-01: apiClient is created with a default
  // 'Content-Type: application/json' header (see axios.create() above).
  // That default is a real, explicitly-set header — not just axios's
  // own internal placeholder — so it survives even for calls that pass
  // a FormData body (ads.api.ts/products.api.ts/service-listings.api.ts's
  // create/addImages, and every avatar/logo/cover upload). Axios only
  // lets the browser generate the correct
  // 'multipart/form-data; boundary=...' header when Content-Type is
  // NOT already set; with the instance default present, requests were
  // going out as 'Content-Type: application/json' with a FormData body,
  // which the backend's multer can't parse as multipart at all — it
  // silently sees zero files (not a parse error), so createAd's
  // IMAGE_REQUIRED check fires even though the user did attach a
  // photo. Deleting it here (only when the body is actually FormData)
  // lets the browser set the real multipart Content-Type/boundary for
  // every upload endpoint in one place, instead of patching each of
  // the ~10 FormData call sites individually.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  return config;
});


// READ-BATCH: explicit opt-in only.
// Individual GETs keep their normal Axios semantics. Pages/components that have
// several independent reads can call apiClient.batchGet([...]) explicitly.

type BatchResponseItem = {
  status: number;
  body?: unknown;
  error?: string;
  headers?: Record<string, string | string[]>;
};

const MAX_BATCH_GETS = 8;

function makeBatchAxiosError(
  item: BatchResponseItem,
  config: AxiosRequestConfig,
): AxiosError {
  return new AxiosError(
    item.error || `Request failed with status ${item.status}`,
    item.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
    config as InternalAxiosRequestConfig,
    undefined,
    {
      data: item.body,
      status: item.status,
      statusText: '',
      headers: item.headers ?? {},
      config: config as InternalAxiosRequestConfig,
    },
  );
}

apiClient.batchGet = async function batchGet<T = unknown>(
  requests: BatchGetRequest[],
): Promise<BatchGetResponse<T>[]> {
  if (requests.length === 0) return [];
  if (requests.length > MAX_BATCH_GETS) {
    throw new Error(`batchGet supports at most ${MAX_BATCH_GETS} requests.`);
  }

  if (requests.length === 1) {
    const single = requests[0]!;
    const response = await apiClient.get<T>(single.url, { params: single.params });
    return [{ data: response.data, status: response.status }];
  }

  const envelope = await apiClient.post<{
    success: boolean;
    data?: { responses: Record<string, BatchResponseItem> };
  }>('/batch', {
    requests: requests.map((request, index) => ({
      id: String(index),
      url: request.url,
      params: request.params,
    })),
  });

  const responses = envelope.data.data?.responses ?? {};

  return Promise.all(
    requests.map(async (request, index) => {
      const item = responses[String(index)];
      if (!item) {
        throw new AxiosError(
          'Missing batched response',
          AxiosError.ERR_BAD_RESPONSE,
          { method: 'GET', url: request.url } as InternalAxiosRequestConfig,
        );
      }

      // Keep 401 on the normal GET path so the existing response interceptor
      // can perform the application's shared refresh flow.
      if (item.status === 401) {
        const response = await apiClient.get<T>(request.url, {
          params: request.params,
        });
        return { data: response.data, status: response.status };
      }

      if (item.status < 200 || item.status >= 300) {
        throw makeBatchAxiosError(
          item,
          { method: 'GET', url: request.url, params: request.params } as InternalAxiosRequestConfig,
        );
      }

      return {
        data: item.body as T,
        status: item.status,
      };
    }),
  );
};


// ── Response interceptor — silent refresh ─────────────────────────
let isRefreshing  = false;
type QueueItem    = { resolve: (token: string) => void; reject: (err: unknown) => void };
let refreshQueue: QueueItem[] = [];

// FIX REFRESH-QUEUE-LOGOUT: set to true by invalidateRefreshSession()
// when the local session ends (logout / logout-all / password change /
// account deletion). While true, the 401 handler short-circuits to
// rejection instead of firing /auth/refresh — the refresh cookie is
// gone, and a doomed refresh would land in the failure branch below
// and surface a "session expired" toast + hard redirect to /login for
// a user who just clicked Logout. Reset by resumeSession() when a new
// session starts (see useAuthMutations.ts's setAuthCookies).
let sessionRevoked = false;

/**
 * FIX REFRESH-QUEUE-LOGOUT: called from lib/authCleanup.ts's
 * clearSensitiveLocalData, which every session-ending path routes
 * through (useClearLocalSession, useChangePassword, useDeleteAccount).
 * Rejects every request currently parked in refreshQueue so their
 * retry doesn't ship the revoked access token to the server (getting
 * another 401 and re-entering this same refresh path against a
 * refresh cookie that just got deleted), and flips the sessionRevoked
 * flag so any 401 arriving after this point rejects immediately.
 */
export function invalidateRefreshSession(): void {
  sessionRevoked = true;
  const queued = refreshQueue;
  refreshQueue = [];
  for (const item of queued) {
    item.reject(new Error('Session ended — request cancelled'));
  }
}

/**
 * FIX REFRESH-QUEUE-LOGOUT: called from useAuthMutations.ts's
 * setAuthCookies when a new session is established (login/register).
 * Clears the sessionRevoked flag so subsequent 401s resume the normal
 * /auth/refresh path.
 */
export function resumeSession(): void {
  sessionRevoked = false;
}

/**
 * T735 — read accessor for the session-revoked flag. Exported so a
 * caller outside this module's own response interceptor (currently
 * AuthHydrationProvider's mount-time /auth/refresh flow) can check
 * whether a logout ran between the request going out and its response
 * coming back. Without this, a refresh response that resolved AFTER
 * the user clicked Logout would re-establish the session the user just
 * ended — the exact failure T651 fixed inside the interceptor, in a
 * different code path with the same consequence (session leak on a
 * shared device).
 */
export function isSessionRevoked(): boolean {
  return sessionRevoked;
}

function processQueue(error: unknown, token: string | null) {
  refreshQueue.forEach(({ resolve, reject }) =>
    error ? reject(error) : resolve(token!),
  );
  refreshQueue = [];
}

let sharedRefreshPromise: ReturnType<typeof import('@/api/auth.api')['authApi']['refresh']> | null = null;

export async function refreshSessionShared() {
  if (sharedRefreshPromise) {
    return sharedRefreshPromise;
  }

  sharedRefreshPromise = (async () => {
    const { authApi } = await import('@/api/auth.api');
    const res = await authApi.refresh();

    if (sessionRevoked) {
      throw new Error('Session ended during refresh');
    }

    const { accessToken, expiresIn } = res.data.data!.tokens;

    useAuthStore.getState().setAccessToken(accessToken);
    useAuthStore.getState().setCsrfToken(res.data.data!.csrfToken);
    setCookie(
      'app_access_token',
      accessToken,
      cookieMaxAgeFromExpiresIn(expiresIn),
    );
    setCookie('app_has_session', '1', SESSION_HINT_COOKIE_MAX_AGE);

    return res;
  })().finally(() => {
    sharedRefreshPromise = null;
  });

  return sharedRefreshPromise;
}

apiClient.interceptors.response.use(
  (response) => {
    try {
      const start = (response.config as { metadata?: { start?: number } }).metadata?.start;
      if (typeof start === 'number') {
        const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
        recordRequestTiming(end - start);
      }
      const measuredMs = typeof start === 'number'
        ? ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start)
        : null;
      if (measuredMs != null && measuredMs >= 80) recordRequestSuccess();
    } catch { /* ignore */ }

    // FIX QUEUE-UX-01: sw.js queues an offline mutation (POST/PUT/PATCH/
    // DELETE it couldn't send) and answers the page with 202
    // {queued: true, message}, precisely so the request doesn't fail
    // silently. But axios treats any 2xx as success, so without this every
    // mutation hook's onSuccess ran as if the operation actually reached
    // the server: "تم نشر الإعلان بنجاح" toasts, redirects to the new
    // resource's page, cache invalidation for data that was never written —
    // for a request that, offline, never left the device. Centralising the
    // fix here (the one place already responsible for cross-cutting
    // response handling, e.g. the 401 refresh flow below) means every
    // existing `onError: (err) => toast.error(parseApiError(err).message)`
    // in every mutation hook picks this up automatically and shows the
    // SW's own honest "queued, will retry" message instead — no per-hook
    // changes needed, and no false success state anywhere in the app.
    const body = response.data as Record<string, unknown> | undefined;
    if (response.status === 202 && body?.queued === true) {
      // FIX QUEUE-BADGE-01: هذه اللحظة الوحيدة بالصفحة التي "تعرف" أن طلبًا
      // جديدًا دخل طابور sw.js — الطابور نفسه (IndexedDB) يُدار بالكامل
      // داخل الـ SW ولا يبعث أي رسالة عند الإضافة (فقط عند QUEUE_REPLAYED).
      // نطلق حدثًا مخصصًا هنا ليقرأه useQueuedRequestCount ويحدّث أي شارة
      // "N بالانتظار" بالواجهة فورًا، بدل انتظار تنقّل المستخدم لصفحة /offline.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(QUEUE_UPDATED_EVENT));
      }
      return Promise.reject({
        message:    typeof body.message === 'string' ? body.message : 'لا يوجد اتصال — سيُعاد إرسال العملية تلقائيًا عند عودة الاتصال.',
        statusCode: 202,
        code:       'OFFLINE_QUEUED',
        queued:     true,
      });
    }
    return response;
  },
  async (error: AxiosError) => {
    if ((error as { code?: string } | undefined)?.code !== 'OFFLINE_QUEUED') {
      const start = (error.config as { metadata?: { start?: number } } | undefined)?.metadata?.start;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const duration = typeof start === 'number' ? Math.max(0, now - start) : undefined;
      recordRequestFailure(duration, isNetworkFailure(error) ? 'network' : 'http');
    }
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean; [NETWORK_RETRY_MARKER]?: number }) | undefined;

    // Phase 2: automatically retry only safe/idempotent HTTP methods.
    // Mutations are intentionally excluded: a client-side timeout does not
    // prove that the server failed to commit the mutation. Supported create
    // flows already carry X-Offline-Op-Id for server-side idempotency.
    if (original && isSafeMethod(original.method) && isNetworkRetryableAxiosError(error)) {
      const policy = getNetworkPolicy();
      const maxRetries = policy.tier === 'very-slow' ? 1 : policy.tier === 'slow' ? 2 : policy.tier === 'fast' ? 2 : 1;
      const attempt = Number(original[NETWORK_RETRY_MARKER] ?? 0);
      if (attempt < maxRetries && !axios.isCancel(error)) {
        original[NETWORK_RETRY_MARKER] = attempt + 1;
        recordRequestRetry();
        await new Promise<void>((resolve) => setTimeout(resolve, getRetryDelayMs(attempt + 1, getRetryAfterMs(error))));
        if (original.signal?.aborted) return Promise.reject(parseApiError(error));
        return apiClient(original);
      }
    }

    const isRefreshCall = original?.url?.includes('/auth/refresh');
    // BUG-FIX: a wrong email/password on /auth/login (and a rejected
    // /auth/register, e.g. duplicate email) also returns 401 —
    // see auth.service.ts's UnauthorizedError('Invalid email or
    // password', 'INVALID_CREDENTIALS'). Before this check, that 401
    // was indistinguishable here from a real expired-session 401, so
    // every wrong-password attempt on the login form triggered this
    // same silent-refresh path: a doomed /auth/refresh call (no
    // session exists yet to refresh), which itself then failed and
    // fell into the catch block below — clearing cookies, showing the
    // wrong toast ("انتهت جلستك" / "your session expired", which makes
    // no sense for someone who was never logged in), and hard-
    // redirecting via window.location.href back to /login after 1.2s.
    // That hard navigation is what looked like "the page refreshes
    // every time I type the wrong password" — it also wiped whatever
    // the user had already typed into the form. LoginForm/RegisterForm
    // already handle their own 401s via useLogin/useRegister's onError
    // (a toast with the real "invalid email or password" message, no
    // navigation) — this exclusion lets that existing handling run
    // instead of the session-refresh path hijacking it.
    const isAuthEntryCall = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/register');

    // FIX CSRF-403-REFRESH-01: backend's csrfProtection answers 403
    // ("Invalid or missing CSRF token") when the browser still holds the
    // csrfToken cookie but this page's in-memory copy is empty/stale —
    // e.g. a request fired right after an offline → online transition
    // (offline visual session) or before AuthHydrationProvider's
    // /auth/refresh finished. Without this, offline-draft publishing
    // treated that 403 as a *permanent* rejection and parked the draft
    // in the terminal "failed / needs manual review" state. /auth/refresh
    // is CSRF-exempt and re-issues the token, so route this case through
    // the same refresh-and-replay path below as a 401 (the replay strips
    // the stale X-CSRF-Token so the interceptor re-attaches the fresh one).
    const rawBody = error.response?.data as { message?: unknown } | undefined;
    const isCsrfRejection =
      error.response?.status === 403 &&
      typeof rawBody?.message === 'string' &&
      /csrf/i.test(rawBody.message);

    if (
      (error.response?.status !== 401 && !isCsrfRejection) ||
      // FIX OFFLINE-FAST-FAIL-CRASH: makeOfflineError() (thrown
      // from the request interceptor) is a plain ParsedError
      // object, not an AxiosError — axios passes it through with
      // no .config. Reading original._retry on undefined works
      // today only because the first clause already short-circuits
      // to `true` for those rejections. Guard explicitly so a
      // future reorder of these conditions can't turn a network
      // failure into a TypeError inside the interceptor.
      !original ||
      original._retry ||
      isRefreshCall ||
      isAuthEntryCall
    ) {
      return Promise.reject(parseApiError(error));
    }

    // FIX REFRESH-QUEUE-LOGOUT: if the session was just ended, don't
    // even try /auth/refresh. See sessionRevoked's own comment.
    if (sessionRevoked) {
      return Promise.reject(parseApiError(error));
    }

    // FIX AUTH-401-STORM-01: بلا accessToken والجهاز أوفلاين — لا تُحاول
    // refresh (سيفشل شبكة) ولا logout. ارفض بهدوء؛ الـ UI يعتمد على الكاش.
    const currentToken = useAuthStore.getState().accessToken;
    if (
      !currentToken &&
      typeof navigator !== 'undefined' &&
      navigator.onLine === false
    ) {
      return Promise.reject(parseApiError(error));
    }

    if (isRefreshing) {
      return new Promise<unknown>((resolve, reject) => {
        refreshQueue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`;
            // BUG-FIX CSRF-01: `original` is the axios config object from
            // BEFORE the 401 — its X-CSRF-Token header was set by the
            // request interceptor using whatever `csrfToken` cookie
            // existed at that time. setCsrfCookie() (authCookies.ts)
            // issues a brand-new random token on every /auth/refresh
            // success, so by the time this queued request replays, the
            // browser's actual csrfToken cookie has already rotated out
            // from under the header baked into `original`. Deleting it
            // here forces the request interceptor to re-read
            // document.cookie fresh (see getCsrfToken()) instead of
            // resending the now-stale value — axios does not re-run
            // interceptors on a manually re-invoked config object with
            // headers already set, so this has to be done explicitly.
            delete original.headers['X-CSRF-Token'];
            resolve(apiClient(original));
          },
          reject,
        });
      });
    }

    original._retry = true;
    isRefreshing    = true;
    // SW-FIX-REFRESH-RACE: capture the access token before the refresh
    // call. If a concurrent refresh (another tab / SW queue replay /
    // an earlier F5 whose request is still on the wire) wins the
    // rotation race while ours is in flight, the store will show a NEW
    // token when we land in the catch block below — that's our signal
    // to retry the original request with that token instead of treating
    // the 401 as a session end.
    const tokenBeforeRefresh = useAuthStore.getState().accessToken;

    try {
      // PROD-FIX-15: no longer reads a refreshToken from the auth
      // store — there isn't one to read anymore. The httpOnly cookie
      // the browser already holds is sent automatically by
      // withCredentials:true above; the backend reads it directly
      // (see auth.controller.ts's refresh handler) rather than
      // expecting it in the request body.
      //
      // Lazy import breaks the circular dependency:
      // authApi → client → authApi would be circular at module load time,
      // but importing it here (inside the interceptor callback) is safe because
      // the module is already fully initialised by the time any 401 fires.
      const res = await refreshSessionShared();

      // T651 — invalidateRefreshSession() (logout / logout-all /
      // password change / account deletion) sets sessionRevoked and
      // rejects refreshQueue, but it CANNOT cancel an already in-flight
      // authApi.refresh(). Without this check, that pending refresh
      // completes successfully and re-establishes the session the user
      // just ended: setAccessToken restores the in-memory token,
      // setCookie('app_access_token') + setCookie('app_has_session')
      // restore the middleware-visible cookies. sessionRevoked stays
      // true (so the NEXT 401 short-circuits as intended), but the
      // user looks authenticated — a real security issue on a shared
      // device. Discard the refresh result and reject instead.
      if (sessionRevoked) {
        processQueue(new Error('Session ended during refresh'), null);
        return Promise.reject(parseApiError(error));
      }

      const { accessToken: newAccess, expiresIn } = res.data.data!.tokens;

      useAuthStore.getState().setAccessToken(newAccess);
      // CROSS-ORIGIN-CSRF-FIX: capture the fresh csrfToken from the
      // refresh response body — see lib/csrf.ts's header comment for
      // why this in-memory value (not document.cookie) is now the
      // primary source getCsrfToken() reads from.
      useAuthStore.getState().setCsrfToken(res.data.data!.csrfToken);
      // FIX AUTH-03: previously only AuthHydrationProvider/useAuthMutations
      // wrote the app_access_token cookie (at login/initial hydration).
      // A silent refresh updated the in-memory token but left the cookie's
      // own 14-min max-age ticking down independently, so middleware.ts
      // could see an expired cookie and redirect a still-authenticated
      // user to /login even though their access token was valid and had
      // just been refreshed. Re-set the cookie on every silent refresh too.
      // FIX BUG-06: derives from the backend's own tokens.expiresIn
      // instead of the old fixed AUTH_COOKIE_MAX_AGE constant.
      setCookie('app_access_token', newAccess, cookieMaxAgeFromExpiresIn(expiresIn));
      // AUDIT-FIX C-1: re-assert the session hint too, same reasoning as
      // AuthHydrationProvider's own refresh success path — the backend
      // already refreshed its own copy via Set-Cookie on this same
      // /auth/refresh response.
      setCookie('app_has_session', '1', SESSION_HINT_COOKIE_MAX_AGE);
      processQueue(null, newAccess);

      original.headers.Authorization = `Bearer ${newAccess}`;
      // BUG-FIX CSRF-01: same stale-header problem as the queued-request
      // path above — the refresh that just succeeded also rotated the
      // csrfToken cookie via setCsrfCookie(), so the X-CSRF-Token this
      // original request was built with is now the old value. Strip it
      // so the request interceptor re-attaches the current cookie value.
      delete original.headers['X-CSRF-Token'];
      return apiClient(original);
    } catch (refreshError) {
      processQueue(refreshError, null);

      // FIX AUTH-OFFLINE-01 / AUTH-OFFLINE-SESSION-01:
      // فشل التجديد بدون رد من السيرفر (انقطاع نت، DNS، timeout) أو والجهاز
      // أوفلاين صراحةً ≠ جلسة منتهية. لا نسجّل خروجًا ولا نحوّل لـ/login.
      // فقط رفض حقيقي من الباك-إند (HTTP status) ينهي الجلسة.
      const parsedRefreshError = parseApiError(refreshError);
      const offlineOrNoResponse =
        parsedRefreshError.statusCode === 0 ||
        (typeof navigator !== 'undefined' && navigator.onLine === false) ||
        !(refreshError && typeof refreshError === 'object' && 'response' in refreshError &&
          (refreshError as { response?: unknown }).response != null);

      if (offlineOrNoResponse) {
        return Promise.reject(parseApiError(error));
      }

      // FIX REFRESH-QUEUE-LOGOUT: if the user already logged out while
      // this refresh was in flight, don't redundantly log them out
      // again or surface a "session expired" toast + hard redirect
      // they didn't ask for. Just reject.
      if (!useAuthStore.getState().isAuthenticated) {
        return Promise.reject(parseApiError(error));
      }

      // SW-FIX-REFRESH-RACE: before treating this 401 as a session end,
      // check whether a concurrent refresh won the rotation race.
      //
      // Cause: the backend rotates the refreshToken cookie atomically
      // (rotation-in-Redis). When two refresh requests are in flight at
      // the same time — rapid F5 reloads, a second tab, the SW's queue
      // replay, or AuthHydrationProvider racing the 401 interceptor —
      // one wins and rotates, the other sees TOKEN_MISMATCH (401).
      // With no retry the loser treats it as "session expired" and
      // logs the user out on every rapid refresh. Reported symptom:
      // F5 × 5 → logout.
      //
      // Fix strategy (cheap, no cross-context lock needed):
      //   1. Wait ~700ms — enough for the winner's Set-Cookie to land
      //      in the browser's cookie jar.
      //   2. Re-read the store: if a concurrent refresh succeeded, the
      //      store now has a NEW access token — replay the original
      //      request with it (no second network round-trip needed).
      //   3. Otherwise retry /auth/refresh ourselves with the (now
      //      freshly rotated) cookie. If it succeeds → continue.
      //   4. Only if the retry ALSO 401s do we treat it as a real end.
      await new Promise((r) => setTimeout(r, 700));

      const liveToken = useAuthStore.getState().accessToken;
      if (liveToken && liveToken !== tokenBeforeRefresh) {
        original.headers.Authorization = `Bearer ${liveToken}`;
        delete original.headers['X-CSRF-Token'];
        return apiClient(original);
      }

      try {
        const retryRes = await refreshSessionShared();
        if (sessionRevoked) {
          return Promise.reject(parseApiError(error));
        }
        const { accessToken: retryAccess, expiresIn: retryExp } = retryRes.data.data!.tokens;
        useAuthStore.getState().setAccessToken(retryAccess);
        useAuthStore.getState().setCsrfToken(retryRes.data.data!.csrfToken);
        setCookie('app_access_token', retryAccess, cookieMaxAgeFromExpiresIn(retryExp));
        setCookie('app_has_session', '1', SESSION_HINT_COOKIE_MAX_AGE);
        processQueue(null, retryAccess);
        original.headers.Authorization = `Bearer ${retryAccess}`;
        delete original.headers['X-CSRF-Token'];
        return apiClient(original);
      } catch {
        // Retry also failed — fall through to real logout below.
      }

      useAuthStore.getState().logout();
      // FIX AUTH-401-CLEANUP: نفس التنظيف الشامل الذي يفعله logout العادي
      // (انظر useAuthMutations.ts). بدونه: بيانات المستخدم السابق
      // (offline-lists، offline-json، notifications، messages-store،
      // كاش SW) تبقى على الجهاز بعد انتهاء الجلسة → تسريب فعلي على أي
      // جهاز مشترك يسجّل عليه حساب آخر بعده. هذا مسار مستقل عن
      // useLogout (يُطلَق من response interceptor، ليس mutation)، فيجب
      // أن يمسح بنفسه بدل الاعتماد على أن useLogout سيتولى الأمر.
      clearSensitiveLocalData();
      // AUDIT-FIX C-1: clear the session hint too — the refresh
      // genuinely failed (session revoked, expired, or backend
      // disagrees for any reason), so leaving a stale '1' behind would
      // make middleware assume a session still exists on the very next
      // full-page navigation this triggers below.
      deleteCookie('app_has_session');

      if (typeof window !== 'undefined') {
        // UX-FIX P0-1: previously redirected instantly with zero feedback,
        // silently discarding any unsaved form state (e.g. a long ad draft).
        // Show a toast first, then give it a brief moment to actually be
        // seen before the hard navigation tears the page down.
        toast.error('انتهت جلستك، الرجاء تسجيل الدخول مجددًا');

        const from = encodeURIComponent(
          window.location.pathname + window.location.search,
        );
        // UX-FIX P0-2: `reason=session_expired` lets the login page (and
        // LoginForm) distinguish "you were logged out" from an ordinary
        // visit, instead of only ever using `from` for the post-login
        // redirect target.
        setTimeout(() => {
          window.location.href = `/login?from=${from}&reason=session_expired`;
        }, 1200);
      }

      return Promise.reject(parseApiError(error));
    } finally {
      isRefreshing = false;
    }
  },
);
