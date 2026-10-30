import { apiRequest } from '@/api/client';
import { authEnvelopeResponseSchema, refreshEnvelopeResponseSchema } from '@/api/response-schemas';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  needsProfileCompletion?: boolean;
  emailVerified?: boolean;
};

export type AuthSession = {
  accessToken: string;
  expiresIn?: number;
  csrfToken?: string;
  user: AuthUser;
};

type AuthEnvelope = {
  success: boolean;
  message?: string;
  data?: {
    user?: AuthUser;
    tokens?: { accessToken?: string; expiresIn?: number };
    csrfToken?: string;
  };
};

/** Uses the existing cookie-based backend contract; refreshToken is never read or stored by the app. */
export async function loginWithPassword(email: string, password: string): Promise<AuthSession> {
  const response = await apiRequest<AuthEnvelope>('/api/v1/auth/login', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ email: email.trim(), password }),
    responseSchema: authEnvelopeResponseSchema as import('zod').ZodType<AuthEnvelope>,
  });
  const data = response?.data;
  const accessToken = data?.tokens?.accessToken;
  const user = data?.user;
  if (response?.success !== true || typeof accessToken !== 'string' || !accessToken || !user || typeof user.id !== 'string' || typeof user.email !== 'string' || typeof user.name !== 'string') {
    throw new Error(response?.message || 'لم تكتمل استجابة تسجيل الدخول.');
  }
  return {
    accessToken,
    expiresIn: typeof data.tokens?.expiresIn === 'number' ? data.tokens.expiresIn : undefined,
    csrfToken: typeof data.csrfToken === 'string' ? data.csrfToken : undefined,
    user,
  };
}

type RefreshedAccessSession = { accessToken: string; expiresIn?: number; csrfToken?: string };

let refreshInFlight: Promise<RefreshedAccessSession> | null = null;
let refreshAbortController: AbortController | null = null;

/** Cancel any in-flight refresh (used on logout to prevent state races). */
export function cancelRefreshing(): void {
  refreshAbortController?.abort();
  refreshAbortController = null;
  refreshInFlight = null;
}

async function performAccessRefresh(signal?: AbortSignal): Promise<RefreshedAccessSession> {
  type RefreshEnvelope = {
    success: boolean;
    data?: { tokens?: { accessToken?: string; expiresIn?: number }; csrfToken?: string };
  };
  // The backend deliberately exempts /auth/refresh from CSRF validation:
  // after an app restart, the client may not yet know the current CSRF value.
  // The httpOnly refresh cookie is still required by the server.
  const response = await apiRequest<RefreshEnvelope>('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    signal,
    responseSchema: refreshEnvelopeResponseSchema as import('zod').ZodType<RefreshEnvelope>,
  });
  const accessToken = response?.data?.tokens?.accessToken;
  if (response?.success !== true || typeof accessToken !== 'string' || !accessToken) {
    throw new Error('استجابة تجديد الجلسة من الخادم غير متوقعة.');
  }
  return {
    accessToken,
    expiresIn: typeof response.data?.tokens?.expiresIn === 'number' ? response.data.tokens.expiresIn : undefined,
    csrfToken: typeof response.data?.csrfToken === 'string' ? response.data.csrfToken : undefined,
  };
}

/** Coalesce concurrent refresh calls so rotating the httpOnly cookie is not raced by this client. */
export function refreshAccessSession(): Promise<RefreshedAccessSession> {
  if (!refreshInFlight) {
    refreshAbortController = new AbortController();
    const work = performAccessRefresh(refreshAbortController.signal);
    // Only clear the tracking slot if it still points to THIS promise.
    // A concurrent cancelRefreshing() + new refreshAccessSession() could
    // otherwise null a newer promise and enable two parallel cookie-rotating
    // refreshes on the server.
    const tracked = work.finally(() => {
      if (refreshInFlight === tracked) {
        refreshInFlight = null;
        refreshAbortController = null;
      }
    });
    refreshInFlight = tracked;
  }
  return refreshInFlight;
}

export async function logoutSession(accessToken: string, csrfToken?: string): Promise<void> {
  await apiRequest('/api/v1/auth/logout', {
    method: 'POST',
    credentials: 'include',
    token: accessToken,
    ...(csrfToken ? { headers: { 'X-CSRF-Token': csrfToken } } : {}),
    body: JSON.stringify({}),
  });
}

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  phone?: string;
  city?: string;
};

/** Register a new account. Uses the same envelope contract as login. */
export async function registerAccount(input: RegisterInput): Promise<AuthSession> {
  const response = await apiRequest<AuthEnvelope>('/api/v1/auth/register', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({
      name: input.name.trim(),
      email: input.email.trim(),
      password: input.password,
      ...(input.phone ? { phone: input.phone.trim() } : {}),
      ...(input.city ? { city: input.city.trim() } : {}),
    }),
    responseSchema: authEnvelopeResponseSchema as import('zod').ZodType<AuthEnvelope>,
  });
  const data = response?.data;
  const accessToken = data?.tokens?.accessToken;
  const user = data?.user;
  if (
    response?.success !== true
    || typeof accessToken !== 'string'
    || !accessToken
    || !user
    || typeof user.id !== 'string'
    || typeof user.email !== 'string'
    || typeof user.name !== 'string'
  ) {
    throw new Error(response?.message || 'لم تكتمل استجابة إنشاء الحساب.');
  }
  return {
    accessToken,
    expiresIn: typeof data.tokens?.expiresIn === 'number' ? data.tokens.expiresIn : undefined,
    csrfToken: typeof data.csrfToken === 'string' ? data.csrfToken : undefined,
    user,
  };
}
