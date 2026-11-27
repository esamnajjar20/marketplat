import type { ApiEnvelope as SharedApiEnvelope } from '@/api/contracts';
import { apiRequest } from '@/api/client';

type Envelope<T> = SharedApiEnvelope<T>;
export type NotificationDevice = {
  id: string;
  kind: 'web' | 'native';
  label: string | null;
  platform: string | null;
  fingerprint: string;
  createdAt: string;
  lastSeenAt: string;
};

export async function fetchNotificationDevices(token: string): Promise<NotificationDevice[]> {
  const response = await apiRequest<Envelope<NotificationDevice[]>>('/api/v1/notifications/devices', { token });
  if (response?.success !== true || !Array.isArray(response.data)) {
    throw new Error(response?.message || 'تعذر تحميل أجهزة الإشعارات المسجّلة.');
  }
  return response.data;
}

export async function removeNotificationDevice(
  kind: NotificationDevice['kind'],
  id: string,
  token: string,
  csrfToken?: string | null,
): Promise<void> {
  const response = await apiRequest<Envelope<unknown>>(
    `/api/v1/notifications/devices/${kind}/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      token,
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
      body: JSON.stringify({}),
    },
  );
  if (response?.success !== true) {
    throw new Error(response?.message || 'تعذر إيقاف الإشعارات على هذا الجهاز.');
  }
}
