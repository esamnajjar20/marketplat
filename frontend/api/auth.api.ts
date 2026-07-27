/**
 * Auth API — maps to backend /api/v1/auth/* endpoints.
 *
 * FIX AUTH-04: refresh() now uses RefreshResponseData (tokens only — no user).
 *
 * FIX INTEG-02: the comment here used to say "removed forgotPassword /
 * resetPassword — not in backend", but both are implemented below and
 * both exist in the backend (auth.routes.ts, added alongside the
 * password_reset_tokens migration) — that note was stale from an
 * earlier point before those flows existed and was actively misleading
 * about the current state of both sides.
 */
import { apiClient } from './client';
import type { AxiosRequestConfig } from 'axios';
import type {
  LoginPayload,
  RegisterPayload,
  LoginResponseData,
  RegisterResponseData,
  RefreshResponseData,
  SessionInfo,
} from '@/types/auth.types';
import type { ApiResponse } from '@/types/api.types';

export const authApi = {
  login: (payload: LoginPayload) =>
    apiClient.post<ApiResponse<LoginResponseData>>('/auth/login', payload),

  register: (payload: RegisterPayload) =>
    apiClient.post<ApiResponse<RegisterResponseData>>('/auth/register', payload),

  logout: () =>
    apiClient.post<ApiResponse<null>>('/auth/logout'),

  logoutAll: () =>
    apiClient.post<ApiResponse<null>>('/auth/logout-all'),

  /**
   * FIX AUTH-04: Backend returns { tokens, csrfToken } only — no user.
   * Response: { success, message, data: { tokens: { accessToken }, csrfToken } }
   *
   * FIX AUTH-05: accepts an optional AxiosRequestConfig so callers (e.g.
   * AuthHydrationProvider) can pass an AbortSignal that actually cancels
   * the request, instead of a dead timeout that never aborted anything.
   *
   * PROD-FIX-15: no longer takes a refreshToken parameter — the backend
   * now reads it from an httpOnly cookie the browser sends automatically
   * (apiClient's withCredentials:true — see client.ts), not from the
   * request body. There is no longer any refreshToken value in frontend
   * JS at all to pass here.
   */
  refresh: (config?: AxiosRequestConfig) =>
    apiClient.post<ApiResponse<RefreshResponseData>>('/auth/refresh', undefined, config),

  getSessions: () =>
    apiClient.get<ApiResponse<SessionInfo[]>>('/auth/sessions'),

  revokeSession: (sessionId: string) =>
    apiClient.delete<ApiResponse<null>>(`/auth/sessions/${sessionId}`),

  /** POST /auth/forgot-password — sends a password reset link by email. */
  forgotPassword: (payload: { email: string }) =>
    apiClient.post<ApiResponse<null>>('/auth/forgot-password', payload),

  /** POST /auth/reset-password — applies a new password using the reset token. */
  resetPassword: (payload: { token: string; newPassword: string }) =>
    apiClient.post<ApiResponse<null>>('/auth/reset-password', payload),

  /**
   * POST /users/me/password — changes the authenticated user's password.
   * FIX INTEG-04: the actually-used definition — see useChangePassword
   * in useAuthMutations.ts for why this lives here rather than being
   * called via usersApi.changePassword (users.api.ts), which is an
   * equivalent but unused duplicate of this same endpoint.
   */
  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    apiClient.post<ApiResponse<null>>('/users/me/password', payload),
};
