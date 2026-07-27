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
import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';
import { useAuthStore }  from '@/store/auth.store';
import { parseApiError } from '@/lib/errorParser';
import { API_BASE_URL }  from '@/lib/constants';
import { setCookie, deleteCookie, AUTH_COOKIE_MAX_AGE, SESSION_HINT_COOKIE_MAX_AGE } from '@/lib/cookies';
import { getCsrfToken } from '@/lib/csrf';

export const apiClient = axios.create({
  baseURL:         API_BASE_URL,
  withCredentials: true,
  headers:         { 'Content-Type': 'application/json' },
  timeout:         15_000,
});

const SAFE_METHODS = new Set(['get', 'head', 'options']);

// ── Request interceptor — attach access token + CSRF token ────────
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
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
  const method = (config.method ?? 'get').toLowerCase();
  if (!SAFE_METHODS.has(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }

  return config;
});

// ── Response interceptor — silent refresh ─────────────────────────
let isRefreshing  = false;
type QueueItem    = { resolve: (token: string) => void; reject: (err: unknown) => void };
let refreshQueue: QueueItem[] = [];

function processQueue(error: unknown, token: string | null) {
  refreshQueue.forEach(({ resolve, reject }) =>
    error ? reject(error) : resolve(token!),
  );
  refreshQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const isRefreshCall = original?.url?.includes('/auth/refresh');

    if (error.response?.status !== 401 || original._retry || isRefreshCall) {
      return Promise.reject(parseApiError(error));
    }

    if (isRefreshing) {
      return new Promise<unknown>((resolve, reject) => {
        refreshQueue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(apiClient(original));
          },
          reject,
        });
      });
    }

    original._retry = true;
    isRefreshing    = true;

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
      const { authApi } = await import('@/api/auth.api');
      const res = await authApi.refresh();

      const { accessToken: newAccess } = res.data.data!.tokens;

      useAuthStore.getState().setAccessToken(newAccess);
      // FIX AUTH-03: previously only AuthHydrationProvider/useAuthMutations
      // wrote the app_access_token cookie (at login/initial hydration).
      // A silent refresh updated the in-memory token but left the cookie's
      // own 14-min max-age ticking down independently, so middleware.ts
      // could see an expired cookie and redirect a still-authenticated
      // user to /login even though their access token was valid and had
      // just been refreshed. Re-set the cookie on every silent refresh too.
      setCookie('app_access_token', newAccess, AUTH_COOKIE_MAX_AGE);
      // AUDIT-FIX C-1: re-assert the session hint too, same reasoning as
      // AuthHydrationProvider's own refresh success path — the backend
      // already refreshed its own copy via Set-Cookie on this same
      // /auth/refresh response.
      setCookie('app_has_session', '1', SESSION_HINT_COOKIE_MAX_AGE);
      processQueue(null, newAccess);

      original.headers.Authorization = `Bearer ${newAccess}`;
      return apiClient(original);
    } catch (refreshError) {
      processQueue(refreshError, null);

      useAuthStore.getState().logout();
      // AUDIT-FIX C-1: clear the session hint too — the refresh
      // genuinely failed (session revoked, expired, or backend
      // disagrees for any reason), so leaving a stale '1' behind would
      // make middleware assume a session still exists on the very next
      // full-page navigation this triggers below.
      deleteCookie('app_has_session');

      if (typeof window !== 'undefined') {
        const from = encodeURIComponent(
          window.location.pathname + window.location.search,
        );
        window.location.href = `/login?from=${from}`;
      }

      return Promise.reject(parseApiError(error));
    } finally {
      isRefreshing = false;
    }
  },
);
