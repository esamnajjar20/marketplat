/**
 * Gap #7 (product analytics): lightweight client-side tracker.
 * Posts to the backend's public POST /analytics/events (see backend's
 * modules/analytics/analytics.routes.ts — reachable without a session,
 * since most marketplace browsing is anonymous).
 *
 * Deliberately NOT built on top of api/client.ts's apiClient: a failed
 * analytics call must never trigger apiClient's 401/refresh interceptor
 * chain (session-expired toast, redirect to /login) — an analytics
 * beacon failing is a non-event, not something the user should ever
 * see. This uses a bare fetch/sendBeacon instead.
 *
 * Batches events in memory and flushes on a short interval, on
 * visibility change (tab hidden — covers both tab-close and
 * switching away, which `beforeunload` alone misses on mobile), and on
 * pagehide as a final fallback — using navigator.sendBeacon for the
 * unload-time flush specifically because a normal fetch can be
 * cancelled mid-flight when the page unloads, while sendBeacon is
 * designed to survive exactly that.
 */
import { API_BASE_URL } from './constants';

export type AnalyticsEventType =
  | 'PAGE_VIEW'
  | 'AD_VIEW'
  | 'SEARCH'
  | 'CATEGORY_BROWSE'
  | 'CONTACT_CLICK'
  | 'SIGNUP_STARTED'
  | 'SIGNUP_COMPLETED';

interface QueuedEvent {
  event: AnalyticsEventType;
  sessionId: string;
  metadata?: Record<string, unknown>;
  path?: string;
  referrer?: string;
}

const SESSION_STORAGE_KEY = 'analytics_session_id';
const FLUSH_INTERVAL_MS = 5_000;
const MAX_BATCH_SIZE = 20; // matches backend's trackEventsSchema cap

const queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

/**
 * One id per browser session (persisted in sessionStorage — cleared
 * when the tab/browser closes, which is the funnel boundary we want:
 * a returning visitor next week is a new session, not a continuation).
 */
function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    let id = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    }
    return id;
  } catch {
    // sessionStorage unavailable (private browsing edge cases, etc.) —
    // fall back to a per-call id rather than throwing; funnel
    // continuity is lost for this visitor, tracking still works.
    return crypto.randomUUID();
  }
}

function send(events: QueuedEvent[]): void {
  if (events.length === 0) return;
  const url = `${API_BASE_URL}/analytics/events`;
  const body = JSON.stringify({ events });

  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    const ok = navigator.sendBeacon(url, blob);
    if (ok) return;
    // sendBeacon can fail (queue full, payload rejected) — fall through
    // to fetch as a best-effort retry rather than silently dropping.
  }

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
    credentials: 'include',
  }).catch(() => {
    // Analytics is best-effort by design — see file header. Nothing to
    // do here; the event is simply lost.
  });
}

function flush(): void {
  if (queue.length === 0) return;
  const batch = queue.splice(0, MAX_BATCH_SIZE);
  send(batch);
}

function ensureFlushLifecycle(): void {
  if (typeof window === 'undefined' || flushTimer) return;

  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}

/**
 * Queue an analytics event. Fire-and-forget — callers never await or
 * handle a failure; there is nothing useful for a caller to do with
 * one (see file header).
 */
export function track(
  event: AnalyticsEventType,
  metadata?: Record<string, unknown>
): void {
  if (typeof window === 'undefined') return; // no-op during SSR

  ensureFlushLifecycle();

  queue.push({
    event,
    sessionId: getSessionId(),
    metadata,
    path: window.location.pathname,
    referrer: document.referrer || undefined,
  });

  if (queue.length >= MAX_BATCH_SIZE) flush();
}
