import { apiRequest } from '@/api/client';

type Envelope<T> = { success: boolean; message?: string; data?: T };
/** Re-authenticated account deactivation. Password-less OAuth accounts need their provider re-auth flow. */
export async function deleteAccountAfterReauthentication(currentPassword: string, token: string, csrfToken?: string | null): Promise<void> {
  const response = await apiRequest<Envelope<unknown>>('/api/v1/users/me/delete-confirmed', {
    method: 'POST', token,
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
    body: JSON.stringify({ currentPassword }),
  });
  if (!response || response.success !== true) throw new Error(response?.message || 'تعذر حذف الحساب.');
}
