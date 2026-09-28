/**
 * lib/env.ts
 *
 * Centralizes the NEXT_PUBLIC_* raw env-var reads that were previously
 * duplicated across the frontend, each with its own separate access
 * point (and in one case, silently different fallback logic):
 *
 *  - NEXT_PUBLIC_API_URL: lib/constants.ts (API_BASE_URL) and
 *    middleware.ts (buildCsp's apiOrigin) each read it independently.
 *  - NEXT_PUBLIC_VAPID_PUBLIC_KEY: lib/pwa.ts and
 *    PushNotificationToggle.tsx each read it independently.
 *
 * This module deliberately does NOT impose a single fallback value for
 * either var — constants.ts and middleware.ts need genuinely different
 * defaults (a real, usable URL to call vs. "omit this origin from CSP
 * if unset"), so unifying the fallback itself would be wrong, not just
 * a refactor. What's centralized here is the single point of
 * `process.env.NEXT_PUBLIC_*` access; each consumer still applies its
 * own fallback on top of the raw value returned below, exactly as it
 * did before this file existed.
 *
 * Exported as functions, not frozen top-level consts, for the same
 * reason lib/pwa.ts's getVapidPublicKey already is one (see its own
 * FIX PWA-05 comment): NEXT_PUBLIC_* values are inlined by Next.js at
 * build time either way, but a `export const X = process.env.Y` here
 * would freeze the value at first import — which breaks tests (see
 * __tests__/unit/lib/pwa.test.ts) that set the env var per test case
 * and expect the already-imported code to see the new value on its
 * next call. A per-call function read has no such staleness problem.
 */

export function getRawApiUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_API_URL;
}

export function getRawVapidPublicKey(): string | undefined {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
}

/** Public Android install URL (Play Store or direct APK). Unset → no promo is shown. */
export function getRawAndroidAppUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_ANDROID_APP_URL;
}
