'use client';

import { useEffect, useState } from 'react';
import { parseApiError } from '@/lib/errorParser';
import { isNetworkLikeFailure } from '@/lib/isNetworkLikeFailure';

/**
 * Keeps actionable, non-field publish failures visible after the toast fades.
 * Network/offline failures are intentionally omitted because their mutation
 * hooks already preserve a draft and show the dedicated offline feedback.
 */
export function PublishMutationErrorNotice({ error }: { error: unknown }) {
  const [dismissed, setDismissed] = useState(false);
  const parsed = parseApiError(error);
  const retryAfterSeconds =
    typeof parsed.retryAfterSeconds === 'number' && parsed.retryAfterSeconds > 0
      ? Math.ceil(parsed.retryAfterSeconds)
      : null;
  const [retryCountdown, setRetryCountdown] = useState<{ error: unknown; seconds: number | null }>({
    error: null,
    seconds: null,
  });

  // A new mutation error should become visible even if the previous notice
  // was dismissed. The effect is intentionally keyed to the error identity.
  useEffect(() => {
    setDismissed(false);
  }, [error]);

  useEffect(() => {
    setRetryCountdown({ error, seconds: retryAfterSeconds });
  }, [error, retryAfterSeconds]);

  const activeCountdown = retryCountdown.error === error
    ? retryCountdown.seconds
    : retryAfterSeconds;
  const isCountingDown = retryCountdown.error === error &&
    typeof retryCountdown.seconds === 'number' && retryCountdown.seconds > 0;

  useEffect(() => {
    if (!isCountingDown) return;
    const interval = window.setInterval(() => {
      setRetryCountdown((current) => {
        if (current.error !== error || typeof current.seconds !== 'number') return current;
        return { ...current, seconds: Math.max(0, current.seconds - 1) };
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [error, isCountingDown]);

  if (!error || dismissed) return null;
  // 429 is in RETRYABLE_HTTP_STATUSES, so isNetworkLikeFailure() reports it as
  // "network-like" — but a rate-limit is not an offline/draft case, and this
  // notice owns the retry-wait countdown for it. Without this exemption the
  // countdown below was unreachable.
  const isRateLimited = parsed.statusCode === 429;
  if (parsed.queued || (!isRateLimited && isNetworkLikeFailure(parsed))) return null;
  if (Object.keys(parsed.fieldErrors ?? {}).length > 0) return null;
  if (!parsed.message.trim()) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="relative rounded-lg border border-destructive/40 bg-destructive/5 p-3 pe-24 text-right text-sm"
      dir="rtl"
    >
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="absolute start-3 top-3 rounded px-2 py-1 text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="إخفاء رسالة الخطأ"
      >
        إخفاء
      </button>
      <p className="font-semibold text-destructive">تعذّر إكمال العملية</p>
      <p className="mt-1 text-foreground">{parsed.message}</p>
      <p className="mt-1 text-muted-foreground">
        بقيت بيانات النموذج كما هي. راجع سبب الخطأ ثم حاول الحفظ مرة أخرى.
      </p>
      {activeCountdown !== null && activeCountdown > 0 && (
        <p className="mt-2 font-medium text-foreground" role="timer" aria-label="الوقت المتبقي قبل إعادة المحاولة">
          انتظر {activeCountdown} ثانية قبل المحاولة مجددًا.
        </p>
      )}
      {retryAfterSeconds !== null && activeCountdown === 0 && (
        <p className="mt-2 font-medium text-foreground" role="status">يمكنك المحاولة مجددًا الآن.</p>
      )}
      {parsed.requestId && (
        <p className="mt-2 break-all text-xs text-muted-foreground">
          رقم مرجع الخطأ: <code dir="ltr">{parsed.requestId}</code>
          <span className="ms-1">— أرسله للدعم إذا استمرت المشكلة.</span>
        </p>
      )}
    </div>
  );
}
