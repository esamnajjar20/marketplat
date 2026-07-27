/**
 * Users API — maps to backend /api/v1/users/* endpoints.
 *
 * FIX API-SHAPE-01: getUserAds now unwraps the backend's real response
 *   shape via unwrapPaginated — see lib/apiPagination.ts.
 */
import { apiClient } from './client';
import { unwrapPaginated } from '@/lib/apiPagination';
import type { AxiosRequestConfig } from 'axios';
import type { User, PublicUser, UpdateProfilePayload, NotificationPreferences } from '@/types/user.types';
import type { AdListItem } from '@/types/ad.types';
import type { ApiResponse } from '@/types/api.types';
import { authApi } from './auth.api';

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword:     string;
}

export const usersApi = {
  /** FIX AUTH-05: accepts optional config so callers can pass an AbortSignal. */
  getMe: (config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<User>>('/users/me', config),

  updateMe: (payload: UpdateProfilePayload) =>
    apiClient.patch<ApiResponse<User>>('/users/me', payload),

  deleteMe: () =>
    apiClient.delete<ApiResponse<null>>('/users/me'),

  /**
   * POST /users/me/password — changes the authenticated user's password.
   *
   * FIX INTEG-04: previously duplicated authApi.changePassword's
   * request body verbatim — two independent implementations of the
   * same endpoint that could silently drift apart. Now a thin
   * pass-through to the single real implementation, kept here only so
   * existing callers/tests referencing usersApi.changePassword don't
   * break. Prefer authApi.changePassword (via useChangePassword in
   * useAuthMutations.ts) directly for any new code — that hook also
   * clears the local session on success, which this thin wrapper does
   * not do on its own.
   */
  changePassword: (payload: ChangePasswordPayload) => authApi.changePassword(payload),

  /**
   * FIX FEAT-02: PATCH /users/me/notifications — previously had no
   * endpoint to call at all; NotificationSettingsForm.tsx's save button
   * only showed a toast with nothing persisted. Partial updates are
   * supported (only changed keys need to be sent).
   */
  updateNotificationPreferences: (payload: Partial<NotificationPreferences>) =>
    apiClient.patch<ApiResponse<User>>('/users/me/notifications', payload),

  getById: (id: string) =>
    apiClient.get<ApiResponse<PublicUser>>(`/users/${id}`),

  getUserAds: (id: string, params?: { page?: number; limit?: number }) =>
    apiClient
      .get<ApiResponse<AdListItem[]>>(`/users/${id}/ads`, { params })
      .then((r) => unwrapPaginated<AdListItem>(r)),

  /**
   * POST /users/me/avatar — uploads a new avatar image.
   * Field name must be 'image' to match the backend's upload.single('image')
   * middleware (the same multer config used for ad photo uploads).
   * Returns the full updated user object (matches PATCH /users/me's response).
   */
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('image', file);
    return apiClient.post<ApiResponse<User>>('/users/me/avatar', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
