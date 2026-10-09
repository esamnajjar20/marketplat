/**
 * Device-local production error journal.
 * Reports are stored only in this browser profile's localStorage; there is no upload endpoint.
 */
export type DeviceErrorSeverity = 'error' | 'warning' | 'network';
export type DeviceErrorRecord = {
  id: string;
  fingerprint: string;
  occurredAt: string;
  category: string;
  severity: DeviceErrorSeverity;
  title: string;
  message: string;
  route: string;
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
  details?: string;
  count: number;
  userAgent: string;
  online: boolean;
};

export const DEVICE_ERRORS_KEY = 'marketplat:device-error-journal:v1';
export const DEVICE_ERRORS_EVENT = 'marketplat:device-errors-updated';
const MAX_RECORDS = 300;
const DEDUPE_MS = 4_000;
let sequence = 0;
let isCapturingConsole = false;

function scrubRoute(input: string): string {
  try {
    const url = new URL(input, typeof window !== 'undefined' ? window.location.origin : 'https://local.invalid');
    return `${url.pathname}`;
  } catch {
    return input.split('?')[0]?.split('#')[0] ?? '/';
  }
}

function scrubSource(input: string): string {
  try {
    const url = new URL(input, typeof window !== 'undefined' ? window.location.origin : 'https://local.invalid');
    return `${url.origin}${url.pathname}`;
  } catch {
    return input.split('?')[0]?.split('#')[0] ?? input;
  }
}

function redactSensitive(value: string): string {
  return value
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/g, 'Bearer [REDACTED]')
    .replace(/((?:access[_-]?token|refresh[_-]?token|password|passwd|secret|api[_-]?key)\s*[=:]\s*)[^\s,;&]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:token|access_token|refresh_token|password|api_key)=)[^&#\s]*/gi, '$1[REDACTED]');
}

function toReadable(value: unknown): string {
  if (typeof value === 'string') return redactSensitive(value);
  if (value instanceof Error) return redactSensitive(`${value.name}: ${value.message}`);
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return redactSensitive(JSON.stringify(value) ?? Object.prototype.toString.call(value)); }
  catch { return Object.prototype.toString.call(value); }
}

function errorStack(value: unknown): string | undefined {
  return value instanceof Error && value.stack ? value.stack.slice(0, 12000) : undefined;
}

/** Small, privacy-safe DOM snapshot for hydration reports (no page text or HTML). */
function hydrationDomDetails(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const html = document.documentElement;
  const body = document.body;
  const attrs = (element: Element | null) => element
    ? Array.from(element.attributes).slice(0, 20).map((attribute) => [attribute.name, attribute.value])
    : [];
  const children = body
    ? Array.from(body.children).slice(0, 24).map((element) => {
        const id = element.id ? `#${element.id}` : '';
        const className = typeof element.className === 'string' && element.className
          ? `.${element.className.trim().split(/\s+/).slice(0, 3).join('.')}`
          : '';
        return `${element.tagName.toLowerCase()}${id}${className}`;
      })
    : [];
  return JSON.stringify({
    htmlAttributes: attrs(html),
    bodyAttributes: attrs(body),
    bodyChildElements: children,
    documentLanguage: html.lang || null,
    documentDirection: html.dir || null,
    documentTranslation: html.getAttribute('translate'),
  });
}

function readRecords(): DeviceErrorRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(DEVICE_ERRORS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is DeviceErrorRecord => Boolean(x && typeof x === 'object' && 'id' in x && 'title' in x)) : [];
  } catch { return []; }
}

function fingerprintOf(input: Pick<DeviceErrorRecord, 'category' | 'title' | 'message' | 'route' | 'source'>): string {
  return [input.category, input.title, input.message.slice(0, 500), input.route, input.source ?? ''].join('|').toLowerCase();
}

export function getDeviceErrors(): DeviceErrorRecord[] { return readRecords(); }

export function clearDeviceErrors(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(DEVICE_ERRORS_KEY); } catch { /* storage can be blocked */ }
  window.dispatchEvent(new CustomEvent(DEVICE_ERRORS_EVENT));
}

export function recordDeviceError(input: {
  category: string;
  severity?: DeviceErrorSeverity;
  title: string;
  message: string;
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
  details?: string;
}): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const recordBase = {
    category: input.category,
    severity: input.severity ?? 'error' as DeviceErrorSeverity,
    title: input.title.slice(0, 240),
    message: redactSensitive(input.message).slice(0, 6000),
    route: scrubRoute(window.location.href),
    source: input.source ? scrubSource(input.source) : undefined,
    line: input.line,
    column: input.column,
    stack: input.stack ? redactSensitive(input.stack).slice(0, 12000) : undefined,
    details: input.details ? redactSensitive(input.details).slice(0, 6000) : undefined,
  };
  const fingerprint = fingerprintOf(recordBase);
  const records = readRecords();
  const existing = records.find((r) => r.fingerprint === fingerprint && now - Date.parse(r.occurredAt) < DEDUPE_MS);
  if (existing) {
    existing.count += 1;
    existing.occurredAt = new Date(now).toISOString();
    try { window.localStorage.setItem(DEVICE_ERRORS_KEY, JSON.stringify(records)); } catch { /* quota/privacy mode */ }
    window.dispatchEvent(new CustomEvent(DEVICE_ERRORS_EVENT));
    return;
  }
  const record: DeviceErrorRecord = {
    ...recordBase,
    id: `${now.toString(36)}-${(++sequence).toString(36)}`,
    fingerprint,
    occurredAt: new Date(now).toISOString(),
    count: 1,
    userAgent: navigator.userAgent.slice(0, 500),
    online: navigator.onLine,
  };
  records.unshift(record);
  try { window.localStorage.setItem(DEVICE_ERRORS_KEY, JSON.stringify(records.slice(0, MAX_RECORDS))); } catch { /* quota/privacy mode */ }
  window.dispatchEvent(new CustomEvent(DEVICE_ERRORS_EVENT));
}

function installCapture(): void {
  if (typeof window === 'undefined' || window.__marketplatDeviceErrorCaptureInstalled) return;
  window.__marketplatDeviceErrorCaptureInstalled = true;

  window.addEventListener('error', (event: ErrorEvent) => {
    const target = event.target;
    // Resource load failures do not bubble as ErrorEvent.message.
    if (target && target !== window && target instanceof Element) {
      const tag = target.tagName.toLowerCase();
      const resource = (target as HTMLElement & { src?: string; href?: string }).src || (target as HTMLElement & { href?: string }).href || '';
      recordDeviceError({ category: 'resource-load', severity: 'network', title: `فشل تحميل مورد (${tag})`, message: resource ? `تعذّر تحميل مورد من نوع ${tag}.` : `تعذّر تحميل مورد من نوع ${tag}.`, source: resource });
      return;
    }
    recordDeviceError({
      category: 'runtime', title: event.message || 'خطأ JavaScript غير معروف',
      message: event.error instanceof Error ? `${event.error.name}: ${event.error.message}` : (event.message || 'Unknown window error'),
      source: event.filename, line: event.lineno || undefined, column: event.colno || undefined,
      stack: errorStack(event.error),
    });
  }, true);

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    recordDeviceError({ category: 'promise', title: 'وعد (Promise) فشل دون معالجة', message: toReadable(event.reason), stack: errorStack(event.reason), details: event.reason instanceof Error ? undefined : toReadable(event.reason) });
  });

  window.addEventListener('online', () => recordDeviceError({ category: 'connectivity', severity: 'warning', title: 'عاد الاتصال بالإنترنت', message: 'عاد المتصفح للإبلاغ عن اتصال متاح.', }));
  window.addEventListener('offline', () => recordDeviceError({ category: 'connectivity', severity: 'network', title: 'انقطع الاتصال بالإنترنت', message: 'أبلغ المتصفح أن الجهاز أصبح دون اتصال.' }));

  // React/Next error boundaries and application diagnostics often call console.error.
  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    originalError(...args);
    if (isCapturingConsole) return;
    isCapturingConsole = true;
    try {
      const firstError = args.find((arg) => arg instanceof Error);
      const text = args.map(toReadable).join(' ').slice(0, 6000);
      if (text.trim()) {
        const isHydration = /hydration|hydrated|react error #?418|react error #?423|react error #?425/i.test(text);
        recordDeviceError({
          category: isHydration ? 'hydration' : 'console',
          title: firstError instanceof Error ? `${firstError.name}: ${firstError.message}` : 'رسالة خطأ من التطبيق',
          message: text,
          stack: errorStack(firstError),
          details: isHydration ? hydrationDomDetails() : undefined,
        });
      }
    } finally { isCapturingConsole = false; }
  };

  // Capture server API failures that the browser can actually observe. 4xx
  // responses are often normal validation/auth flows, so only 5xx is journaled.
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    let response: Response;
    try { response = await originalFetch(...args); }
    catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        const request = args[0];
        const url = typeof request === 'string' ? request : request instanceof URL ? request.href : request.url;
        recordDeviceError({ category: 'network-request', severity: 'network', title: 'فشل طلب الشبكة', message: `${args[1]?.method ?? (request instanceof Request ? request.method : 'GET')} ${scrubRoute(url)}: ${toReadable(error)}`, source: url, stack: errorStack(error) });
      }
      throw error;
    }
    if (response.status >= 500) {
      const request = args[0];
      const url = typeof request === 'string' ? request : request instanceof URL ? request.href : request.url;
      recordDeviceError({ category: 'http-server', severity: 'error', title: `خطأ خادم HTTP ${response.status}`, message: `أعاد طلب الشبكة الحالة ${response.status} ${response.statusText}.`, source: url, details: `method=${args[1]?.method ?? (request instanceof Request ? request.method : 'GET')}` });
    }
    return response;
  };
}

declare global {
  interface Window { __marketplatDeviceErrorCaptureInstalled?: boolean; }
}

installCapture();
