'use client';

/**
 * lib/offlineWarmingReport.ts
 *
 * rate-limited error reporting for warming failures.
 *
 * Warming is designed to be silent; when it fails, the user never knows.
 * That is correct behaviour. But the team also needs visibility into
 * failures that are real bugs rather than the expected outcome on a
 * poor network. This module bridges the two: it wraps the existing
 * reportClientError with aggressive filtering so only actionable
 * failures reach Sentry, and it caps volume so a bad deploy cannot
 * exhaust the Sentry quota in an hour.
 *
 * Filters (any failure skipped if it matches ANY of these):
 *   1. Offline device — network is absent, not broken.
 *   2. AbortError — the timeout fired. On a slow link this is normal.
 *   3. First-attempt failure — transient by definition, we retry.
 *   4. Already reported this (source, route) recently.
 *
 * Rate limits (sessionStorage; reset on tab close):
 *   - Max 5 total reports per session.
 *   - Max 1 report per (source, route) per hour.
 *
 * If NEXT_PUBLIC_ERROR_REPORTER_URL is unset, reportClientError still
 * logs to console — useful in dev without a real endpoint configured.
 */

import { reportClientError } from './errorReporter';

const SESSION_COUNT_KEY = 'warming:report-count';
const ROUTE_REPORTED_KEY = 'warming:reported'; // JSON map of key -> ts
const MAX_PER_SESSION = 5;
const PER_ROUTE_COOLDOWN_MS = 60 * 60 * 1000; // 1h

// Errors we do NOT report — these are expected behaviour on Gaza's
// networks, and reporting them would drown the signal in noise.
const SKIP_PATTERNS = [
  // Fetch-abort variants — a user navigating away or closing the tab
  // produces `signal is aborted without reason` (Chrome) or `AbortError`
  // (Safari/Firefox). Both are normal cancellation, not warming bugs.
  /abort/i,                // matches "AbortError" AND "signal is aborted..."
  /^html-401/,             // session expired; auth flow handles it
  /^html-403/,             // permission; not a warming bug
  /^html-404/,             // wrong route list — dev bug, not network
  /^chunk-404/,            // deploy churn — SW handles, will refetch
  /^missing-/,             // partial chunk presence — will retry
  // SW-WARMING-REPORT-FILTER-LOWTHRESHOLD: 'low-threshold-N/M' comes
  // from offlineCoreBundle's threshold check — it fires whenever
  // fewer than 50% of the core endpoints stored successfully. On the
  // 1.45 Mbps links this app targets, that is the *expected* outcome
  // of a background warming pass, not a bug. Before this filter it
  // produced one Sentry event per session (confirmed by MARKETPLAT-9),
  // drowning real warming failures in "network was slow" noise. The
  // threshold still functions — LAST_WARMED_KEY is not written, the
  // pass retries next time — it just no longer escalates to the
  // alert stream.
  /^low-threshold-/,
];

export type WarmingSource = 'core' | 'routes' | 'personal';

interface ReportInput {
  source: WarmingSource;
  route: string;
  error: string;
  attempts: number;
}

function readCount(): number {
  try {
    return Number(sessionStorage.getItem(SESSION_COUNT_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function bumpCount(): void {
  try {
    sessionStorage.setItem(SESSION_COUNT_KEY, String(readCount() + 1));
  } catch {
    // silent
  }
}

function readReportedMap(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(ROUTE_REPORTED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeReportedMap(m: Record<string, number>): void {
  try {
    sessionStorage.setItem(ROUTE_REPORTED_KEY, JSON.stringify(m));
  } catch {
    // silent
  }
}

function shouldSkip(input: ReportInput): string | null {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'offline';
  }
  if (input.attempts < 2) return 'first-attempt';
  for (const pat of SKIP_PATTERNS) {
    if (pat.test(input.error)) return `pattern:${pat.source}`;
  }
  if (readCount() >= MAX_PER_SESSION) return 'session-cap';
  const map = readReportedMap();
  const key = `${input.source}:${input.route}`;
  const last = map[key] ?? 0;
  if (Date.now() - last < PER_ROUTE_COOLDOWN_MS) return 'route-cooldown';
  return null;
}

/**
 * Report a warming failure to the client-error endpoint. Never throws,
 * never awaits, never blocks warming. Silently drops reports that fail
 * the filters above.
 */
export function reportWarmingFailure(input: ReportInput): void {
  try {
    const skip = shouldSkip(input);
    if (skip) return;

    const map = readReportedMap();
    map[`${input.source}:${input.route}`] = Date.now();
    writeReportedMap(map);
    bumpCount();

    const err = new Error(
      `[warming] ${input.source} ${input.route} failed: ${input.error}`,
    );
    err.name = 'WarmingFailure';
    reportClientError(err, {
      source: input.source,
      route: input.route,
      attempts: input.attempts,
      warmingFailure: true,
    });
  } catch {
    // Never propagate — warming failure reporting is best-effort.
  }
}
