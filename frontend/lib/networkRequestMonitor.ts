/**
 * Local, privacy-conscious request journal for the admin Network Requests view.
 * Captures fetch + XMLHttpRequest metadata only; never records headers, bodies,
 * response payloads, cookies, or raw query values.
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
  outcome: NetworkRequestOutcome;
  error?: string;
};

export const NETWORK_REQUESTS_KEY = 'marketplat:network-request-journal:v1';
export const NETWORK_REQUESTS_EVENT = 'marketplat:network-requests-updated';
const MAX_REQUESTS = 300;
let installed = false;
let sequence = 0;

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
    return Array.isArray(value) ? value.filter((row): row is NetworkRequestRecord => Boolean(row && typeof row === 'object' && typeof row.id === 'string' && typeof row.url === 'string')) : [];
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
    let outcome: NetworkRequestOutcome = 'success';
    try {
      const response = await originalFetch(input, init);
      if (!response.ok) outcome = 'http-error';
      saveRequest({ startedAt, method, url: safeUrl(rawUrl), pageRoute, kind: 'fetch', durationMs: Math.round(performance.now() - start), status: response.status, statusText: response.statusText.slice(0, 100), outcome });
      return response;
    } catch (error) {
      outcome = error instanceof DOMException && error.name === 'AbortError' ? 'aborted' : 'network-error';
      saveRequest({ startedAt, method, url: safeUrl(rawUrl), pageRoute, kind: 'fetch', durationMs: Math.round(performance.now() - start), status: 0, outcome, error: safeError(error) });
      throw error;
    }
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const requestInfo = new WeakMap<XMLHttpRequest, { method: string; url: string }>();
  const sent = new WeakSet<XMLHttpRequest>();
  XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...rest: unknown[]): void {
    requestInfo.set(this, { method: String(method || 'GET').toUpperCase(), url: safeUrl(String(url)) });
    // The variadic tail differs across lib.dom versions; preserve it at runtime.
    (originalOpen as (...args: unknown[]) => void).call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function(...args: [Document | XMLHttpRequestBodyInit | null] | []): void {
    if (!sent.has(this)) {
      sent.add(this);
      const info = requestInfo.get(this);
      if (info) {
        const startedAt = new Date().toISOString();
        const pageRoute = window.location.pathname;
        const start = performance.now();
        let outcome: NetworkRequestOutcome = 'success';
        this.addEventListener('loadend', () => {
          const status = this.status || 0;
          if (outcome !== 'aborted') {
            if (status === 0) outcome = 'network-error';
            else if (status >= 400) outcome = 'http-error';
          }
          saveRequest({ startedAt, method: info.method, url: info.url, pageRoute, kind: 'xhr', durationMs: Math.round(performance.now() - start), status, statusText: (this.statusText || '').slice(0, 100), outcome });
          sent.delete(this);
        }, { once: true });
        this.addEventListener('abort', () => { outcome = 'aborted'; }, { once: true });
      }
    }
    (originalSend as (...args: unknown[]) => void).apply(this, args);
  };
}
