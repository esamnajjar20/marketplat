import { API_BASE_URL } from '@/lib/constants';

/**
 * FIX ERROR-REPORTER-URL-01: the Cloudflare build env still had
 * NEXT_PUBLIC_ERROR_REPORTER_URL pointing at the OLD Render backend
 * (https://marketplat-nz19.onrender.com/api/v1/observability/client-error).
 * That host is no longer the API (the app talks to the marketplat-api Worker),
 * so every client-error report ended in `TypeError: Failed to fetch` — visible
 * in the network log as a failed POST on every page where an error occurred.
 *
 * Resolution rules:
 *  - unset                       → undefined (console-only, unchanged behaviour)
 *  - set to a non-legacy host    → used as is
 *  - set to a *.onrender.com host → the same endpoint path on the current API
 *    origin (API_BASE_URL), so a stale env var can never break reporting again.
 *
 * Permanent fix is still to update the env var in the Cloudflare build settings
 * (see README of this change); this keeps production safe until then.
 */
const LEGACY_HOST = /(^|\.)onrender\.com$/i;
const CLIENT_ERROR_PATH = '/observability/client-error';

export function resolveErrorReporterUrl(
  configured: string | undefined = process.env.NEXT_PUBLIC_ERROR_REPORTER_URL,
): string | undefined {
  const value = configured?.trim();
  if (!value) return undefined;
  try {
    const { hostname } = new URL(value);
    if (!LEGACY_HOST.test(hostname)) return value;
  } catch {
    return value; // not an absolute URL (e.g. relative path) — leave untouched
  }
  return `${API_BASE_URL.replace(/\/+$/, '')}${CLIENT_ERROR_PATH}`;
}
