/**
 * Records a failure from a non-critical/background task without changing
 * the primary UI flow. This replaces silent `.catch(() => undefined)`
 * patterns while keeping best-effort operations best-effort.
 */
const reporterUrl = process.env.NEXT_PUBLIC_ERROR_REPORTER_URL;

export function reportBackgroundFailure(
  context: string,
  error: unknown,
  meta?: Record<string, unknown>,
): void {
  const normalized = error instanceof Error
    ? { message: error.message, stack: error.stack }
    : { message: String(error) };

  const payload = {
    level: 'warning',
    type: 'background_task_failure',
    context,
    ...normalized,
    meta,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    timestamp: new Date().toISOString(),
    service: 'marketplace-frontend',
  };

  console.warn('[background-task]', payload);

  if (!reporterUrl || typeof fetch === 'undefined') return;

  void fetch(reporterUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Error reporting is deliberately isolated from the application error path.
  });
}
