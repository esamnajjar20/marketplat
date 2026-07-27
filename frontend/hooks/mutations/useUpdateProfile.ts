/**
 * useUpdateProfile — saves profile field changes and syncs the auth store.
 *
 * REFACTOR: merged from useUserMutations.ts (facade) + useUserMutationsInternal.ts.
 * The facade also bundled useDeleteAccount and useChangePassword, but neither
 * was ever called anywhere in the app (account deletion has no UI yet, and
 * the security settings form calls authApi.changePassword directly). Keeping
 * unused mutation hooks around just adds maintenance surface for no benefit,
 * so they were removed rather than carried forward.
 *
 * FIX INTEG-08: useDeleteAccount is back. usersApi.deleteMe() and the
 * backend DELETE /users/me (usersService.deleteMe — deactivates the
 * user, cascades their ACTIVE ads to DELETED, and revokes every
 * refresh token) were both fully implemented and tested, but nothing
 * in the UI could ever call it. Session cleanup mirrors
 * useChangePassword in useAuthMutations.ts: the backend has already
 * invalidated every token, so there is no valid session left to keep
 * locally, and redirect goes to the home page as an anonymous visitor
 * (not login — there is no account left to log back into).
 */
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { usersApi }      from '@/api/users.api';
import { queryKeys }     from '@/lib/queryKeys';
import { ROUTES }        from '@/lib/constants';
import { parseApiError } from '@/lib/errorParser';
import { toast }         from 'sonner';
import { useAuthStore, selectPatchUser, selectLogout } from '@/store/auth.store';
import { clearAuthCookies, clearServiceWorkerApiCache } from './useAuthMutations';
import { unwrapData } from '@/lib/apiPagination';
import type { UpdateProfilePayload, NotificationPreferences } from '@/types/user.types';

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const patchUser   = useAuthStore(selectPatchUser);

  return useMutation({
    mutationFn: (data: UpdateProfilePayload) =>
      usersApi.updateMe(data).then((r) => unwrapData(r)),
    onSuccess: (updated) => {
      patchUser({
        name:      updated.name,
        city:      updated.city ?? null,
        avatarUrl: updated.avatarUrl ?? null,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
      toast.success('تم حفظ التغييرات');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/**
 * FIX FEAT-02: useUpdateNotificationPreferences — previously
 * NotificationSettingsForm.tsx's save button only showed a success
 * toast with no backing API call or storage. Supports partial updates
 * (only the changed key needs to be sent) since each toggle in the form
 * fires its own save.
 */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: Partial<NotificationPreferences>) =>
      usersApi.updateNotificationPreferences(patch).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
      toast.success('تم حفظ إعدادات الإشعارات');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/**
 * FIX INTEG-08: DELETE /users/me — permanently deactivates the account.
 * The backend has already revoked every refresh token and deactivated
 * the user by the time this resolves, so there is no session left to
 * keep: clear local state the same way useChangePassword does, then
 * send the (now-anonymous) visitor home.
 */
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  const logout       = useAuthStore(selectLogout);
  const router        = useRouter();

  return useMutation({
    mutationFn: () => usersApi.deleteMe(),
    onSuccess: () => {
      logout();
      clearAuthCookies();
      clearServiceWorkerApiCache();
      queryClient.clear();
      toast.success('تم حذف حسابك بنجاح');
      router.push(ROUTES.home);
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/**
 * useUploadAvatar — uploads a new avatar photo via the real backend
 * endpoint (POST /users/me/avatar), closing the security gap from
 * report item #8 where avatars were uploaded directly from the client
 * to an unsigned Cloudinary preset.
 */
export function useUploadAvatar() {
  const queryClient = useQueryClient();
  const patchUser   = useAuthStore(selectPatchUser);

  return useMutation({
    mutationFn: (file: File) =>
      usersApi.uploadAvatar(file).then((r) => unwrapData(r)),
    onSuccess: (updated) => {
      patchUser({ avatarUrl: updated.avatarUrl ?? null });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
      toast.success('تم تحديث الصورة الشخصية');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}
