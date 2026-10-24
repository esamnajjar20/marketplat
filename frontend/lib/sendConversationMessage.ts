import { getCsrfToken } from '@/lib/csrf';
import { OFFLINE_OP_ID_HEADER, newOfflineOperationId } from '@/lib/offlineOperationId';
import { useAuthStore } from '@/store/auth.store';
import type { Message, SendMessagePayload } from '@/types/conversation.types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

export type ConversationMessageRequest =
  | { kind: 'text'; payload: SendMessagePayload }
  | { kind: 'image'; file: File; body?: string }
  | { kind: 'file'; file: File; body?: string }
  | { kind: 'audio'; file: File; body?: string };

function messagePath(conversationId: string, kind: ConversationMessageRequest['kind']) {
  const suffix = kind === 'text' ? '' : `/${kind}`;
  return `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages${suffix}`;
}

function responseError(statusCode: number, body: unknown): Record<string, unknown> {
  const data =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const code = typeof data.code === 'string' ? data.code : undefined;
  const rawMessage = typeof data.message === 'string' ? data.message : '';
  const message = rawMessage.replace(/<[^>]*>/g, '').trim().slice(0, 200);

  const statusMessage: Record<number, string> = {
    400: message || 'البيانات المرسلة غير صحيحة',
    401: 'انتهت جلستك، يرجى تسجيل الدخول مجدداً',
    403: 'لا تملك صلاحية لهذا الإجراء',
    404: 'المحادثة أو الرسالة المطلوبة غير موجودة',
    409: 'يوجد تعارض في البيانات',
    422: 'تحقق من صحة البيانات المدخلة',
    429: 'طلبات كثيرة جداً، يرجى المحاولة لاحقاً',
  };

  return {
    message: statusCode >= 500
      ? 'خطأ في الخادم، يرجى المحاولة لاحقاً'
      : statusMessage[statusCode] || message || 'تعذّر تنفيذ الطلب',
    statusCode,
    ...(code ? { code } : {}),
  };
}

export async function sendConversationMessage(
  conversationId: string,
  request: ConversationMessageRequest,
  operationId = newOfflineOperationId(),
): Promise<Message> {
  const headers = new Headers({
    Accept: 'application/json',
    [OFFLINE_OP_ID_HEADER]: operationId,
  });
  const token = useAuthStore.getState().accessToken;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const csrfToken = getCsrfToken();
  if (csrfToken) headers.set('X-CSRF-Token', csrfToken);

  let body: BodyInit;
  if (request.kind === 'text') {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(request.payload);
  } else {
    const form = new FormData();
    const field = request.kind === 'image' ? 'image' : request.kind;
    form.append(field, request.file);
    if (request.body?.trim()) form.append('body', request.body.trim());
    body = form;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${messagePath(conversationId, request.kind)}`, {
      method: 'POST',
      headers,
      body,
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw {
      message: 'تعذّر الاتصال بالخادم، تحقق من اتصالك بالإنترنت',
      statusCode: 0,
      code: 'NETWORK_ERROR',
    };
  }

  const result: unknown = await response.json().catch(() => null);
  if (response.status === 202 && result && typeof result === 'object' &&
      (result as { queued?: unknown }).queued === true) {
    const queued = result as { message?: unknown };
    throw {
      message: typeof queued.message === 'string'
        ? queued.message
        : 'تم حفظ الرسالة للإرسال عند عودة الاتصال',
      statusCode: 202,
      code: 'OFFLINE_QUEUED',
      queued: true,
    };
  }
  if (!response.ok) throw responseError(response.status, result);

  const payload = result && typeof result === 'object'
    ? (result as { data?: unknown }).data
    : undefined;
  if (!payload || typeof payload !== 'object') {
    throw new Error('استجابة إرسال الرسالة غير صالحة');
  }
  return payload as Message;
}
