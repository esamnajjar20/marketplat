/**
 * جسر بين الـ Service Worker وواجهة "محفوظ للأوفلاين".
 *
 * sw.js (cacheVisitedDocumentShell) يرسل SHELL_CACHE_RESULT عند تعثّر حفظ صفحة
 * أو نجاح إعادة المحاولة، و STALE_API_SERVED عند عرض بيانات API بعد انتهاء
 * صلاحيتها (فترة السماح). كل الدوال آمنة عند غياب الـ SW (SSR/اختبارات/dev).
 */

export type ShellCacheStatus = 'pending' | 'saved' | 'failed';

export type SwUiNotice =
  | { type: 'SHELL_CACHE_RESULT'; pathname: string; status: ShellCacheStatus }
  | { type: 'STALE_API_SERVED'; cachedAt: number };

export function parseSwUiNotice(data: unknown): SwUiNotice | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (
    d.type === 'SHELL_CACHE_RESULT' &&
    typeof d.pathname === 'string' &&
    (d.status === 'pending' || d.status === 'saved' || d.status === 'failed')
  ) {
    return { type: 'SHELL_CACHE_RESULT', pathname: d.pathname, status: d.status };
  }
  if (d.type === 'STALE_API_SERVED' && typeof d.cachedAt === 'number' && Number.isFinite(d.cachedAt)) {
    return { type: 'STALE_API_SERVED', cachedAt: d.cachedAt };
  }
  return null;
}

export function subscribeSwUiNotices(listener: (notice: SwUiNotice) => void): () => void {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return () => {};
  const handler = (event: MessageEvent) => {
    const notice = parseSwUiNotice(event.data);
    if (notice) listener(notice);
  };
  navigator.serviceWorker.addEventListener('message', handler);
  return () => navigator.serviceWorker?.removeEventListener('message', handler);
}

/** يطلب من الـ SW إعادة محاولة الصفحات التي تعثّر حفظها (آمن لو لا يوجد SW متحكّم). */
export function requestPendingShellRetry(): void {
  try {
    if (typeof navigator === 'undefined') return;
    navigator.serviceWorker?.controller?.postMessage({ type: 'RETRY_PENDING_SHELLS' });
  } catch {
    /* ignore */
  }
}
