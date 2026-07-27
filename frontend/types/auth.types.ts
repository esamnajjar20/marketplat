/**
 * Authentication and session types.
 * Aligned with backend auth.service.ts AuthResult and controller response shapes.
 *
 * FIX T-01: LoginResponseData now matches AuthResult exactly.
 *   Backend returns: { tokens: { accessToken, refreshToken }, user: { id, name, email, role } }
 *   Refresh returns: { tokens: { accessToken, refreshToken } } — NO user field.
 *
 * PROD-FIX-15: refreshToken no longer appears in ANY response body —
 * the backend now sets it directly as an httpOnly cookie (see
 * backend-v9/src/modules/auth/auth.controller.ts's respondWithSession)
 * and strips it from the JSON tokens object before serializing the
 * response. csrfToken is new: a non-secret, double-submit-cookie value
 * the frontend must echo back via the X-CSRF-Token header on
 * state-changing requests (see api/client.ts and lib/csrf.ts).
 */

export type UserRole = 'USER' | 'ADMIN';

// ── Entities ──────────────────────────────────────────────────────

/**
 * Authenticated user stored in Zustand.
 * Populated from login/register response + /users/me for full profile fields.
 */
export interface AuthUser {
  id:        string;
  email:     string;
  name:      string;
  role:      UserRole;
  avatarUrl: string | null;
  city:      string | null;
}

/**
 * Token pair as returned in a response body.
 *
 * PROD-FIX-15: refreshToken removed — it now lives exclusively in an
 * httpOnly cookie the backend sets directly on the response, never in
 * JSON the frontend could parse and store. sessionId was already
 * excluded (backend's own Omit<TokenPair, 'sessionId'>) before this fix.
 */
export interface AuthTokens {
  accessToken: string;
}

export interface SessionInfo {
  sessionId:  string;
  /** Masked IP address — backend applies GDPR masking. */
  ip:         string;
  userAgent:  string;
  lastSeen:   string;   // ISO 8601
  isCurrent:  boolean;
}

// ── Store slice ───────────────────────────────────────────────────

export interface AuthState {
  user:            AuthUser | null;
  tokens:          AuthTokens | null;
  isAuthenticated: boolean;
}

// ── Request payloads ──────────────────────────────────────────────

export interface LoginPayload {
  email:    string;
  password: string;
}

export interface RegisterPayload {
  name:      string;
  email:     string;
  password:  string;
  city?:     string;
  phone?:    string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token:       string;
  newPassword: string;
}

// ── Response data shapes ──────────────────────────────────────────

/**
 * FIX T-01: Matches backend AuthResult exactly.
 * user only has { id, name, email, role } from login/register.
 * avatarUrl and city come from a subsequent GET /users/me call.
 */
export interface AuthResultUser {
  id:    string;
  name:  string;
  email: string;
  role:  string; // backend types as string, we narrow to UserRole after validation
}

export interface LoginResponseData {
  user:      AuthResultUser;
  tokens:    AuthTokens;
  /** PROD-FIX-15: double-submit CSRF token — see this file's header comment. */
  csrfToken: string;
}

export type RegisterResponseData = LoginResponseData;

/**
 * FIX AUTH-04: Refresh returns ONLY tokens — no user field.
 * Backend: res.json(successResponse('Token refreshed', { tokens, csrfToken }))
 */
export interface RefreshResponseData {
  tokens:    AuthTokens;
  csrfToken: string;
}
