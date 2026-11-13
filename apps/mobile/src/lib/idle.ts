/**
 * تأجيل عمل غير حرج إلى ما بعد الرسم الأول — بلا اعتماد على InteractionManager.
 * إطارا rAF متتاليان (≈ بعد أول paint) ثم مهلة اختيارية، مع دالة إلغاء.
 */
export function deferToIdle(task: () => void, options: { delayMs?: number } = {}): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let frame2: number | null = null;
  const frame1 = requestAnimationFrame(() => {
    frame2 = requestAnimationFrame(() => {
      timer = setTimeout(() => {
        timer = null;
        if (!cancelled) task();
      }, options.delayMs ?? 0);
    });
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame1);
    if (frame2 !== null) cancelAnimationFrame(frame2);
    if (timer) clearTimeout(timer);
  };
}
