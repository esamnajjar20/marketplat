/** Minimal API transport. Set EXPO_PUBLIC_API_URL in apps/mobile/.env before connecting real screens. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
const DEFAULT_TIMEOUT_MS = 12_000;

export type ApiRequestOptions = Omit<RequestInit, 'signal'> & {
  timeoutMs?: number;
  token?: string;
  /** Optional caller cancellation (e.g. auth session changed) in addition to the request timeout. */
  signal?: AbortSignal;
};

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApiError('عنوان API غير مضبوط. أضف EXPO_PUBLIC_API_URL إلى ملف البيئة.');
  }
  if (!path.startsWith('/')) {
    throw new ApiError('يجب أن يبدأ مسار API بعلامة /.');
  }

  const { timeoutMs = DEFAULT_TIMEOUT_MS, token, headers, signal: externalSignal, ...init } = options;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ApiError('مهلة الاتصال يجب أن تكون رقمًا موجبًا.');
  }
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      credentials: options.credentials ?? 'include',
      headers: {
        Accept: 'application/json',
        ...(init.body && !(typeof FormData !== 'undefined' && init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
    const contentType = response.headers.get('content-type') ?? '';
    const payload: unknown = contentType.toLowerCase().includes('application/json')
      ? await response.json().catch(() => null)
      : null;
    if (!response.ok) {
      const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      const message = typeof body.message === 'string' ? body.message
        : response.status === 401 ? 'انتهت جلسة الدخول أو تحتاج إلى تسجيل الدخول.'
        : response.status === 403 ? 'ليست لديك صلاحية لتنفيذ هذا الإجراء.'
        : `فشل الطلب (${response.status})`;
      const requestId = typeof body.requestId === 'string' ? body.requestId : undefined;
      throw new ApiError(message, response.status, requestId);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('انتهت مهلة الاتصال. تحقق من الإنترنت وحاول مجددًا.');
    }
    const message = error instanceof TypeError && /network|fetch/i.test(error.message)
      ? 'تعذر الوصول إلى الخادم. تحقق من الإنترنت وعنوان API ثم حاول مجددًا.'
      : 'تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مجددًا.';
    throw new ApiError(message);
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
}
