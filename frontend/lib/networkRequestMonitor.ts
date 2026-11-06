/**
 * Local, privacy-conscious request journal for the admin Network Requests view.
 * Captures fetch + XMLHttpRequest metadata and a validated X-Request-Id UUID
 * for server-log correlation, plus an allow-listed Content-Length and X-Cache
 * status; never records auth headers, bodies, cookies, arbitrary response
 * payloads, or raw query values.
 */
export type NetworkRequestOutcome = 'success' | 'http-error' | 'network-error' | 'aborted';
export type NetworkRequestRecord = {
  id: string;
  startedAt: string;
  method: string;
  url: string;
  pageRoute: string;
  kind: 'fetch' | 'xhr';
  durationMs: number;
  status: number;
  statusText?: string;
  /** Safe UUID correlation key returned by the API; no other response headers are stored. */
  requestId?: string;
  /** Content-Length when exposed by the browser; not all responses provide it. */
  responseBytes?: number;
  /** Allow-listed cache status from X-Cache, when the API exposes it. */
  cacheStatus?: 'HIT' | 'MISS' | 'STALE' | 'BYPASS';
  /** True only for an exact safe read overlapping another in-flight transport. */
  concurrentDuplicate?: boolean;
  outcome: NetworkRequestOutcome;
  error?: string;
};

export const NETWORK_REQUESTS_KEY = 'marketplat:network-request-journal:v1';
export const NETWORK_REQUESTS_EVENT = 'marketplat:network-requests-updated';
const MAX_REQUESTS = 300;
let installed = false;
let sequence = 0;
const SAFE_READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);


export type ConcurrentReadTicket = { key: string | null; duplicate: boolean };

/**
 * Compare safe reads only while they are in flight. The full URL (including
 * query values) remains in this closure's memory and is never returned or saved.
 * Tickets are individually releasable so a repeated cleanup cannot decrement
 * another identical request's in-flight count.
 */
export function createConcurrentReadTracker() {
  const counts = new Map<string, number>();
  const activeTickets = new WeakSet<object>();

  return {
    begin(method: string, rawUrl: string, pageRoute: string, baseUrl: string): ConcurrentReadTicket {
      if (!SAFE_READ_METHODS.has(method.toUpperCase())) return { key: null, duplicate: false };
      let normalizedUrl = rawUrl;
      try {
        const parsed = new URL(rawUrl, baseUrl);
        parsed.hash = '';
        parsed.searchParams.sort();
        normalizedUrl = parsed.href;
      } catch {
        // Keep the original in-memory URL only for a bounded in-flight comparison.
      }
      const key = `${pageRoute}\u0000${method.toUpperCase()}\u0000${normalizedUrl}`;
      const count = counts.get(key) ?? 0;
      counts.set(key, count + 1);
      const ticket = { key, duplicate: count > 0 };
      activeTickets.add(ticket);
      return ticket;
    },
    end(ticket: ConcurrentReadTicket): void {
      if (!ticket.key || !activeTickets.delete(ticket)) return;
      const count = counts.get(ticket.key) ?? 0;
      if (count <= 1) counts.delete(ticket.key);
      else counts.set(ticket.key, count - 1);
    },
  };
}

const concurrentReadTracker = createConcurrentReadTracker();

function safeUrl(input: string): string {
  try {
    const url = new URL(input, window.location.href);
    // Do not persist potentially sensitive query-string values. Keep parameter
    // names so a developer can still see which request variant was made.
    const keys = [...new Set([...url.searchParams.keys()])];
    const query = keys.length ? `?${keys.map((key) => `${encodeURIComponent(key)}=[redacted]`).join('&')}` : '';
    return `${url.origin === window.location.origin ? '' : url.origin}${url.pathname}${query}`.slice(0, 500);
  } catch {
    return (String(input).split('#')[0] ?? '').split('?')[0]?.slice(0, 500) ?? '';
  }
}

export function parseContentLengthHeader(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value.trim())) return undefined;
  const bytes = Number(value);
  return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : undefined;
}

function safeCacheStatus(value: string | null): NetworkRequestRecord['cacheStatus'] {
  const normalized = value?.trim().toUpperCase();
  return normalized === 'HIT' || normalized === 'MISS' || normalized === 'STALE' || normalized === 'BYPASS'
    ? normalized
    : undefined;
}

export type NetworkRouteSummary = {
  pageRoute: string;
  requestCount: number;
  failedCount: number;
  abortedCount: number;
  concurrentDuplicateCount: number;
  knownResponseBytes: number;
  sizedResponseCount: number;
  averageDurationMs: number;
};

/** Aggregate only safe metadata; missing Content-Length stays explicitly unknown. */
export function summarizeNetworkRequestsByRoute(records: NetworkRequestRecord[]): NetworkRouteSummary[] {
  const groups = new Map<string, NetworkRequestRecord[]>();
  for (const record of records) {
    const rows = groups.get(record.pageRoute) ?? [];
    rows.push(record);
    groups.set(record.pageRoute, rows);
  }

  return [...groups.entries()].map(([pageRoute, rows]) => {
    const sized = rows.filter((row) => Number.isSafeInteger(row.responseBytes) && (row.responseBytes ?? -1) >= 0);
    return {
      pageRoute,
      requestCount: rows.length,
      failedCount: rows.filter((row) => row.outcome === 'http-error' || row.outcome === 'network-error').length,
      abortedCount: rows.filter((row) => row.outcome === 'aborted').length,
      concurrentDuplicateCount: rows.filter((row) => row.concurrentDuplicate === true).length,
      knownResponseBytes: sized.reduce((total, row) => total + (row.responseBytes ?? 0), 0),
      sizedResponseCount: sized.length,
      averageDurationMs: rows.length ? Math.round(rows.reduce((total, row) => total + row.durationMs, 0) / rows.length) : 0,
    };
  }).sort((a, b) => b.requestCount - a.requestCount || a.pageRoute.localeCompare(b.pageRoute));
}

function safeRequestId(value: string | null): string | undefined {
  if (!value) return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return message
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/(token|password|secret|cookie|authorization|api[_-]?key)\s*[=:]\s*[^\s,;&]+/gi, '$1=[REDACTED]')
    .slice(0, 240);
}

export function getNetworkRequests(): NetworkRequestRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(NETWORK_REQUESTS_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];

    return value
      .filter((row): row is NetworkRequestRecord => Boolean(
        row && typeof row === 'object' && typeof row.id === 'string' && typeof row.url === 'string',
      ))
      .map((row) => ({
        ...row,
        // The journal is localStorage and therefore untrusted. Normalize the
        // new optional fields before UI formatting or aggregation.
        responseBytes: typeof row.responseBytes === 'number' && Number.isSafeInteger(row.responseBytes) && row.responseBytes >= 0
          ? row.responseBytes
          : undefined,
        cacheStatus: safeCacheStatus(typeof row.cacheStatus === 'string' ? row.cacheStatus : null),
        concurrentDuplicate: typeof row.concurrentDuplicate === 'boolean' ? row.concurrentDuplicate : undefined,
      }));
  } catch { return []; }
}

function emitUpdate(): void {
  window.dispatchEvent(new CustomEvent(NETWORK_REQUESTS_EVENT));
}

function saveRequest(input: Omit<NetworkRequestRecord, 'id'>): void {
  if (typeof window === 'undefined') return;
  const row: NetworkRequestRecord = { ...input, id: `${Date.now().toString(36)}-${(++sequence).toString(36)}` };
  try {
    const rows = getNetworkRequests();
    rows.unshift(row);
    window.localStorage.setItem(NETWORK_REQUESTS_KEY, JSON.stringify(rows.slice(0, MAX_REQUESTS)));
    emitUpdate();
  } catch { /* Quota/private browsing: diagnostics must never break requests. */ }
}

export function clearNetworkRequests(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(NETWORK_REQUESTS_KEY); } catch { /* restricted storage */ }
  emitUpdate();
}

export function installNetworkRequestMonitor(): void {
  if (typeof window === 'undefined' || installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    const startedAt = new Date().toISOString();
    const pageRoute = window.location.pathname;
    const start = performance.now();
    const trackedRead = concurrentReadTracker.begin(method, rawUrl, pageRoute, window.location.href);
    let outcome: NetworkRequestOutcome = 'success';
    try {
      const response = await originalFetch(input, init);
      if (!response.ok) outcome = 'http-error';
      saveRequest({ startedAt, method, url: safeUrl(rawUrl), pageRoute, kind: 'fetch', durationMs: Math.round(performance.now() - start), status: response.status, statusText: response.statusText.slice(0, 100), requestId: safeRequestId(response.headers.get('X-Request-Id')), responseBytes: parseContentLengthHeader(response.headers.get('Content-Length')), cacheStatus: safeCacheStatus(response.headers.get('X-Cache')), concurrentDuplicate: trackedRead.duplicate, outcome });
      return response;
    } catch (error) {
      outcome = error instanceof DOMException && error.name === 'AbortError' ? 'aborted' : 'network-error';
      saveRequest({ startedAt, method, url: safeUrl(rawUrl), pageRoute, kind: 'fetch', durationMs: Math.round(performance.now() - start), status: 0, concurrentDuplicate: trackedRead.duplicate, outcome, error: safeError(error) });
      throw error;
    } finally {
      concurrentReadTracker.end(trackedRead);
    }
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const requestInfo = new WeakMap<XMLHttpRequest, { method: string; url: string; rawUrl: string }>();
  const sent = new WeakSet<XMLHttpRequest>();
  XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...rest: unknown[]): void {
    requestInfo.set(this, { method: String(method || 'GET').toUpperCase(), url: safeUrl(String(url)), rawUrl: String(url) });
    // The variadic tail differs across lib.dom versions; preserve it at runtime.
    (originalOpen as (...args: unknown[]) => void).call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function(...args: [Document | XMLHttpRequestBodyInit | null] | []): void {
    let activeTrackedRead: { key: string | null; duplicate: boolean } | null = null;
    if (!sent.has(this)) {
      sent.add(this);
      const info = requestInfo.get(this);
      if (info) {
        const startedAt = new Date().toISOString();
        const pageRoute = window.location.pathname;
        const start = performance.now();
        const trackedRead = concurrentReadTracker.begin(info.method, info.rawUrl, pageRoute, window.location.href);
        activeTrackedRead = trackedRead;
        let outcome: NetworkRequestOutcome = 'success';
        this.addEventListener('loadend', () => {
          const status = this.status || 0;
          if (outcome !== 'aborted') {
            if (status === 0) outcome = 'network-error';
            else if (status >= 400) outcome = 'http-error';
          }
          saveRequest({ startedAt, method: info.method, url: info.url, pageRoute, kind: 'xhr', durationMs: Math.round(performance.now() - start), status, statusText: (this.statusText || '').slice(0, 100), requestId: safeRequestId(this.getResponseHeader('X-Request-Id')), responseBytes: parseContentLengthHeader(this.getResponseHeader('Content-Length')), cacheStatus: safeCacheStatus(this.getResponseHeader('X-Cache')), concurrentDuplicate: trackedRead.duplicate, outcome });
          concurrentReadTracker.end(trackedRead);
          activeTrackedRead = null;
          sent.delete(this);
        }, { once: true });
        this.addEventListener('abort', () => { outcome = 'aborted'; }, { once: true });
      }
    }
    try {
      (originalSend as (...args: unknown[]) => void).apply(this, args);
    } catch (error) {
      // A synchronous XHR send failure has no loadend event to release it.
      if (activeTrackedRead) concurrentReadTracker.end(activeTrackedRead);
      sent.delete(this);
      throw error;
    }
  };
}
