/**
 * LOAD-SPEED-01 — جدولة عمل خلفي بعد أول رسم / تفاعل.
 *
 * يمنع تسخين الأوفلاين وطابور الشبكة من مزاحمة طلبات الصفحة الحالية
 * (API + JS chunks) في أول 1–2 ثانية بعد الفتح.
 */

type IdleDeadlineLike = { didTimeout: boolean; timeRemaining: () => number };

/**
 * @param fn callback
 * @param opts.timeoutMs أقصى انتظار قبل التشغيل القسري (افتراضي 2000)
 * @param opts.delayMs تأخير أدنى إضافي بعد idle (افتراضي 0)
 */
export function scheduleIdle(
  fn: () => void,
  opts: { timeoutMs?: number; delayMs?: number } = {},
): () => void {
  const timeoutMs = opts.timeoutMs ?? 2000;
  const delayMs = opts.delayMs ?? 0;
  let cancelled = false;
  let idleId: number | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const run = () => {
    if (cancelled) return;
    if (delayMs > 0) {
      timerId = setTimeout(() => {
        if (!cancelled) fn();
      }, delayMs);
    } else {
      fn();
    }
  };

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    idleId = (
      window as Window & {
        requestIdleCallback: (
          cb: (d: IdleDeadlineLike) => void,
          opts?: { timeout: number },
        ) => number;
      }
    ).requestIdleCallback(() => run(), { timeout: timeoutMs });
  } else {
    timerId = setTimeout(run, Math.min(timeoutMs, 1200));
  }

  return () => {
    cancelled = true;
    if (idleId != null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
      (
        window as Window & { cancelIdleCallback: (id: number) => void }
      ).cancelIdleCallback(idleId);
    }
    if (timerId != null) clearTimeout(timerId);
  };
}

/** بعد frame الرسم التالي ثم idle — أنسب لما بعد hydration. */
export function scheduleAfterPaint(
  fn: () => void,
  opts: { timeoutMs?: number; delayMs?: number } = {},
): () => void {
  let cancelIdle: (() => void) | null = null;
  let raf = 0;
  if (typeof window === 'undefined') {
    fn();
    return () => {};
  }
  raf = requestAnimationFrame(() => {
    cancelIdle = scheduleIdle(fn, opts);
  });
  return () => {
    cancelAnimationFrame(raf);
    cancelIdle?.();
  };
}
