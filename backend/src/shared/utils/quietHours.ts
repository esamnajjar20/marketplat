/**
 * Quiet-hours evaluation (pure — no I/O, no env), shared by the push path
 * (pushService.notifyUser) and the email-fallback worker.
 *
 * Prefs live on User.notificationPreferences (jsonb):
 *   quietHoursEnabled?: boolean (default false)
 *   quietHoursStart?: "HH:mm" (default "22:00")
 *   quietHoursEnd?: "HH:mm" (default "08:00")
 *   quietHoursAllowUrgent?: boolean (default true)
 *   quietHoursTimeZone?: IANA zone (default Asia/Gaza)
 *
 * Phase 3: the result now says WHEN the window ends, so a blocked push can be
 * deferred to that moment (delayed queue job) instead of being dropped.
 */

export const DEFAULT_QUIET_TZ = 'Asia/Gaza';

export type QuietHoursDecision = { blocked: false } | { blocked: true; resumeInMs: number };

/** Returns `tz` if it is a valid IANA zone, otherwise the platform default. */
export function resolveQuietTimeZone(tz: unknown): string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return DEFAULT_QUIET_TZ;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_QUIET_TZ;
  }
}

/** Local wall-clock time in the given IANA zone. */
export function wallClockIn(
  timeZone: string,
  now: Date = new Date(),
): { hours: number; minutes: number; seconds: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // Some ICU builds render midnight as "24" with hour12:false.
  return { hours: num('hour') % 24, minutes: num('minute'), seconds: num('second') };
}

export function parseHm(value: unknown, fallback: string): { h: number; m: number } {
  const raw = typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value) ? value : fallback;
  const [h, m] = raw.split(':').map((n) => Number(n));
  return {
    h: Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 22,
    m: Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0,
  };
}

/**
 * @param prefs  User.notificationPreferences (any shape; junk is tolerated)
 * @param urgent when true and quietHoursAllowUrgent !== false → never blocked
 * @param now    injectable for tests
 *
 * resumeInMs is wall-clock arithmetic (minutes to the window end minus the
 * seconds already elapsed in the current minute). Across a DST change it can be
 * off by an hour; the consumer re-evaluates when the deferred job runs, so the
 * worst case is one extra deferral, never a push inside the window.
 */
export function evaluateQuietHours(
  prefs: unknown,
  urgent: boolean | undefined,
  now: Date = new Date(),
): QuietHoursDecision {
  const p =
    prefs && typeof prefs === 'object' && !Array.isArray(prefs)
      ? (prefs as Record<string, unknown>)
      : {};
  if (p.quietHoursEnabled !== true) return { blocked: false };
  if (urgent && p.quietHoursAllowUrgent !== false) return { blocked: false };

  const start = parseHm(p.quietHoursStart, '22:00');
  const end = parseHm(p.quietHoursEnd, '08:00');
  const { hours, minutes, seconds } = wallClockIn(resolveQuietTimeZone(p.quietHoursTimeZone), now);
  const nowMin = hours * 60 + minutes;
  const startMin = start.h * 60 + start.m;
  const endMin = end.h * 60 + end.m;

  // start === end means "no window" (same as the pre-Phase-3 behaviour).
  if (startMin === endMin) return { blocked: false };
  const inside =
    startMin < endMin ? nowMin >= startMin && nowMin < endMin : nowMin >= startMin || nowMin < endMin;
  if (!inside) return { blocked: false };

  const minutesToEnd = (endMin - nowMin + 24 * 60) % (24 * 60);
  const resumeInMs = Math.max(1_000, minutesToEnd * 60_000 - seconds * 1_000);
  return { blocked: true, resumeInMs };
}
