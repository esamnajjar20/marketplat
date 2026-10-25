import { apiRequest } from '@/api/client';

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
  });
  const data = response?.data;
  const accessToken = data?.tokens?.accessToken;
  const user = data?.user;
  if (response?.success !== true || typeof accessToken !== 'string' || !accessToken || !user || typeof user.id !== 'string' || typeof user.email !== 'string' || typeof user.name !== 'string') {
    throw new Error('استجابة تسجيل الدخول من الخادم غير متوقعة.');
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

async function performAccessRefresh(): Promise<RefreshedAccessSession> {
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
    refreshInFlight = performAccessRefresh().finally(() => {
      refreshInFlight = null;
    });
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
