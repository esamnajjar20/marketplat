import type { ApiEnvelope as SharedApiEnvelope } from '@/api/contracts';
import { apiRequest } from '@/api/client';

type Envelope<T> = SharedApiEnvelope<T>;
export type ActiveSession = {
  sessionId: string;
  userAgent: string;
  ip: string;
  createdAt: string;
  lastSeen: string;
  isCurrent: boolean;
};
function unwrap<T>(response: Envelope<T>, fallback: string): T {
  if (!response || response.success !== true || response.data === undefined) {
    throw new Error(response?.message || fallback);
  }
  return response.data;
}
export async function fetchActiveSessions(token: string): Promise<ActiveSession[]> {
  const result = unwrap(await apiRequest<Envelope<ActiveSession[]>>('/api/v1/auth/sessions', { token }), 'تعذر تحميل الجلسات النشطة.');
  if (!Array.isArray(result)) throw new Error('استجابة الجلسات غير صالحة.');
  return result;
}
export async function revokeActiveSession(sessionId: string, token: string, csrfToken?: string | null): Promise<void> {
  const response = await apiRequest<Envelope<unknown>>(`/api/v1/auth/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE', token,
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
    body: JSON.stringify({}),
  });
  if (!response || response.success !== true) throw new Error(response?.message || 'تعذر إنهاء الجلسة المحددة.');
}

export async function logoutAllSessions(token: string, csrfToken?: string | null): Promise<void> {
  const response = await apiRequest<Envelope<unknown>>('/api/v1/auth/logout-all', {
    method: 'POST',
    token,
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
    body: JSON.stringify({}),
  });
  if (!response || response.success !== true) {
    throw new Error(response?.message || 'تعذر تسجيل الخروج من جميع الأجهزة.');
  }
}
