/**
 * Device-local diagnostics that complement (not replace) Sentry.
 * Sensitive payloads, DOM text/HTML, form values and response bodies are never captured.
 */
export type DeviceErrorSeverity = 'error' | 'warning' | 'network' | 'debug';
export type BreadcrumbCategory = 'navigation' | 'click' | 'api' | 'console' | 'storage' | 'lifecycle';
export type DeviceErrorBreadcrumb = { timestamp: string; category: BreadcrumbCategory; message: string; data?: Record<string, string | number | boolean | null> };
export type PerformanceSnapshot = { capturedAt: string; usedJSHeapSize?: number; totalJSHeapSize?: number; jsHeapSizeLimit?: number; navigationDurationMs?: number; domContentLoadedMs?: number; loadEventMs?: number; longTasksLast5s?: number };
export type DeviceErrorRecord = {
  id: string; fingerprint: string; occurredAt: string; category: string; severity: DeviceErrorSeverity;
  title: string; message: string; route: string; source?: string; line?: number; column?: number;
  stack?: string; details?: string; count: number; userAgent: string; online: boolean;
  breadcrumbs?: DeviceErrorBreadcrumb[]; performance?: PerformanceSnapshot; reproductionMode?: boolean;
};

export const DEVICE_ERRORS_KEY = 'marketplat:device-error-journal:v1';
export const DEVICE_ERRORS_EVENT = 'marketplat:device-errors-updated';
export const DEVICE_ERRORS_CHANNEL = 'marketplat:device-errors';
export const REPRODUCE_MODE_KEY = 'marketplat:device-errors:reproduce-mode';
const DB_NAME = 'marketplat-device-diagnostics';
const DB_VERSION = 1;
const DB_STORE = 'records';
const MAX_BREADCRUMBS = 20;
const MAX_RECORDS = 1000;
const MAX_REPRODUCE_RECORDS = 5000;
const LOCALSTORAGE_MIRROR_RECORDS = 80;
const DEDUPE_MS = 4_000;
let sequence = 0;
let isCapturingConsole = false;
let cachedRecords: DeviceErrorRecord[] | null = null;
let dbPromise: Promise<IDBDatabase | null> | null = null;
const breadcrumbs: DeviceErrorBreadcrumb[] = [];
const longTasks: number[] = [];
let channel: BroadcastChannel | null = null;

function scrubRoute(input: string): string {
  try { const url = new URL(input, typeof window !== 'undefined' ? window.location.origin : 'https://local.invalid'); return url.pathname; }
  catch { return input.split('?')[0]?.split('#')[0] ?? '/'; }
}
function scrubSource(input: string): string {
  try { const url = new URL(input, typeof window !== 'undefined' ? window.location.origin : 'https://local.invalid'); return `${url.origin}${url.pathname}`; }
  catch { return input.split('?')[0]?.split('#')[0] ?? input; }
}
function redactSensitive(value: string): string {
  return value
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/g, 'Bearer [REDACTED]')
    .replace(/((?:access[_-]?token|refresh[_-]?token|password|passwd|secret|api[_-]?key|cookie|session)\s*[=:]\s*)[^\s,;&]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:token|access_token|refresh_token|password|api_key|code)=)[^&#\s]*/gi, '$1[REDACTED]');
}
function toReadable(value: unknown): string {
  if (typeof value === 'string') return redactSensitive(value);
  if (value instanceof Error) return redactSensitive(`${value.name}: ${value.message}`);
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return redactSensitive(JSON.stringify(value) ?? Object.prototype.toString.call(value)); } catch { return Object.prototype.toString.call(value); }
}
function errorStack(value: unknown): string | undefined { return value instanceof Error && value.stack ? redactSensitive(value.stack).slice(0, 12000) : undefined; }
function getDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'id' }); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}
function readLocalRecords(): DeviceErrorRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(DEVICE_ERRORS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is DeviceErrorRecord => Boolean(x && typeof x === 'object' && 'id' in x && 'title' in x)) : [];
  } catch { return []; }
}
let persistWrites = 0;
function persist(records: DeviceErrorRecord[], changedRecord?: DeviceErrorRecord, pruneNow = false): void {
  const limit = isReproduceMode() ? MAX_REPRODUCE_RECORDS : MAX_RECORDS;
  cachedRecords = records.slice(0, limit);
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(DEVICE_ERRORS_KEY, JSON.stringify(cachedRecords.slice(0, LOCALSTORAGE_MIRROR_RECORDS))); } catch { /* IndexedDB is the larger store; storage can be blocked. */ }
  }
  void getDb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(DB_STORE, 'readwrite'); const store = tx.objectStore(DB_STORE);
      if (changedRecord) store.put(changedRecord);
      // Prune periodically, rather than rewriting thousands of rows for every console line.
      persistWrites += 1;
      if (pruneNow || persistWrites % 50 === 0) {
        const request = store.getAll();
        request.onsuccess = () => {
          const all = (request.result as DeviceErrorRecord[]).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
          all.slice(limit).forEach((record) => store.delete(record.id));
        };
      }
    } catch { /* fallback journal remains available */ }
  });
}
function dispatchUpdate(source: 'local' | 'remote' = 'local'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DEVICE_ERRORS_EVENT, { detail: { source } }));
  if (source === 'local') { try { channel?.postMessage({ type: 'refresh', at: Date.now() }); } catch { /* channel may be closed */ } }
}
function fingerprintOf(input: Pick<DeviceErrorRecord, 'category' | 'title' | 'message' | 'route' | 'source'>): string {
  // Ignore changing numeric IDs/line offsets in minified React errors where possible.
  const normalized = input.message.replace(/\b\d{5,}\b/g, '#').slice(0, 500);
  return [input.category, input.title, normalized, input.route, input.source ?? ''].join('|').toLowerCase();
}
export function isReproduceMode(): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(REPRODUCE_MODE_KEY) === '1'; } catch { return false; }
}
export function setReproduceMode(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try { if (enabled) window.localStorage.setItem(REPRODUCE_MODE_KEY, '1'); else window.localStorage.removeItem(REPRODUCE_MODE_KEY); } catch { /* private mode */ }
  addBreadcrumb('lifecycle', `وضع إعادة الإنتاج ${enabled ? 'مفعّل' : 'متوقف'}`);
  if (!enabled && cachedRecords && cachedRecords.length > MAX_RECORDS) persist(cachedRecords.slice(0, MAX_RECORDS), undefined, true);
  dispatchUpdate();
}
export function addBreadcrumb(category: BreadcrumbCategory, message: string, data?: DeviceErrorBreadcrumb['data']): void {
  if (typeof window === 'undefined') return;
  const safeData = data ? Object.fromEntries(Object.entries(data).filter(([key]) => !/token|password|secret|cookie|authorization|email|phone|message|body/i.test(key)).slice(0, 8)) : undefined;
  breadcrumbs.push({ timestamp: new Date().toISOString(), category, message: redactSensitive(message).slice(0, 160), ...(safeData && Object.keys(safeData).length ? { data: safeData } : {}) });
  if (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.splice(0, breadcrumbs.length - MAX_BREADCRUMBS);
}
export function getRecentBreadcrumbs(): DeviceErrorBreadcrumb[] { return breadcrumbs.map((item) => ({ ...item, data: item.data ? { ...item.data } : undefined })); }
export function getDeviceErrors(): DeviceErrorRecord[] { return (cachedRecords ?? readLocalRecords()).slice(); }
export async function getDeviceErrorsAsync(): Promise<DeviceErrorRecord[]> {
  const db = await getDb();
  if (!db) return getDeviceErrors();
  return new Promise((resolve) => {
    try {
      const request = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).getAll();
      request.onsuccess = () => {
        const idbRecords = (request.result as DeviceErrorRecord[]).filter((record) => record && typeof record.id === 'string');
        const merged = new Map<string, DeviceErrorRecord>();
        [...idbRecords, ...readLocalRecords()].forEach((record) => merged.set(record.id, record));
        const rows = [...merged.values()].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)).slice(0, isReproduceMode() ? MAX_REPRODUCE_RECORDS : MAX_RECORDS);
        cachedRecords = rows;
        resolve(rows);
      };
      request.onerror = () => resolve(getDeviceErrors());
    } catch { resolve(getDeviceErrors()); }
  });
}
export function clearDeviceErrors(): void {
  if (typeof window === 'undefined') return;
  cachedRecords = []; breadcrumbs.length = 0;
  try { window.localStorage.removeItem(DEVICE_ERRORS_KEY); } catch { /* blocked */ }
  void getDb().then((db) => { try { db?.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).clear(); } catch { /* fallback */ } });
  dispatchUpdate();
}
function hydrationDomDetails(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const html = document.documentElement; const body = document.body;
  const attrs = (element: Element | null) => element ? Array.from(element.attributes).slice(0, 20).map((attribute) => [attribute.name, attribute.value]) : [];
  const children = body ? Array.from(body.children).slice(0, 24).map((element) => {
    const id = element.id ? `#${element.id}` : '';
    const className = typeof element.className === 'string' && element.className ? `.${element.className.trim().split(/\s+/).slice(0, 3).join('.')}` : '';
    return `${element.tagName.toLowerCase()}${id}${className}`;
  }) : [];
  return JSON.stringify({ htmlAttributes: attrs(html), bodyAttributes: attrs(body), bodyChildElements: children, documentLanguage: html.lang || null, documentDirection: html.dir || null, documentTranslation: html.getAttribute('translate') });
}
function performanceSnapshot(): PerformanceSnapshot | undefined {
  if (typeof window === 'undefined') return undefined;
  const snapshot: PerformanceSnapshot = { capturedAt: new Date().toISOString() };
  try {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number; jsHeapSizeLimit?: number } }).memory;
    if (memory) { snapshot.usedJSHeapSize = memory.usedJSHeapSize; snapshot.totalJSHeapSize = memory.totalJSHeapSize; snapshot.jsHeapSizeLimit = memory.jsHeapSizeLimit; }
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav) { snapshot.navigationDurationMs = Math.round(nav.duration); snapshot.domContentLoadedMs = Math.round(nav.domContentLoadedEventEnd); snapshot.loadEventMs = Math.round(nav.loadEventEnd); }
    snapshot.longTasksLast5s = longTasks.filter((time) => Date.now() - time <= 5000).length;
  } catch { /* partial snapshot is fine */ }
  return snapshot;
}
export function recordDeviceError(input: {
  category: string; severity?: DeviceErrorSeverity; title: string; message: string; source?: string;
  line?: number; column?: number; stack?: string; details?: string;
}): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const recordBase = {
    category: input.category, severity: input.severity ?? 'error' as DeviceErrorSeverity,
    title: redactSensitive(input.title).slice(0, 240), message: redactSensitive(input.message).slice(0, 6000),
    route: scrubRoute(window.location.href), source: input.source ? scrubSource(input.source) : undefined,
    line: input.line, column: input.column, stack: input.stack ? redactSensitive(input.stack).slice(0, 12000) : undefined,
    details: input.details ? redactSensitive(input.details).slice(0, 6000) : undefined,
  };
  const fingerprint = fingerprintOf(recordBase); const records = getDeviceErrors();
  const existing = records.find((r) => r.fingerprint === fingerprint && now - Date.parse(r.occurredAt) < DEDUPE_MS);
  if (existing) {
    existing.count += 1; existing.occurredAt = new Date(now).toISOString();
    existing.breadcrumbs = getRecentBreadcrumbs(); existing.performance = performanceSnapshot();
    persist(records, existing); dispatchUpdate(); return;
  }
  const record: DeviceErrorRecord = {
    ...recordBase, id: `${now.toString(36)}-${(++sequence).toString(36)}`, fingerprint,
    occurredAt: new Date(now).toISOString(), count: 1, userAgent: navigator.userAgent.slice(0, 500), online: navigator.onLine,
    breadcrumbs: getRecentBreadcrumbs(), performance: performanceSnapshot(), reproductionMode: isReproduceMode(),
  };
  records.unshift(record); persist(records.slice(0, isReproduceMode() ? MAX_REPRODUCE_RECORDS : MAX_RECORDS), record); dispatchUpdate();
}
function installCapture(): void {
  if (typeof window === 'undefined' || window.__marketplatDeviceErrorCaptureInstalled) return;
  window.__marketplatDeviceErrorCaptureInstalled = true;
  try {
    if ('BroadcastChannel' in window) { channel = new BroadcastChannel(DEVICE_ERRORS_CHANNEL); channel.onmessage = (event) => { if (event.data?.type === 'refresh') { cachedRecords = readLocalRecords(); dispatchUpdate('remote'); } }; }
  } catch { channel = null; }
  // Restore the larger IndexedDB journal when available, while retaining synchronous localStorage fallback.
  void getDb().then((db) => {
    if (!db) return;
    try { const request = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).getAll(); request.onsuccess = () => {
      const idbRecords = (request.result as DeviceErrorRecord[]).filter((r) => r && typeof r.id === 'string');
      const localRecords = readLocalRecords(); const merged = new Map<string, DeviceErrorRecord>();
      [...idbRecords, ...localRecords].forEach((record) => merged.set(record.id, record));
      cachedRecords = [...merged.values()].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)).slice(0, isReproduceMode() ? MAX_REPRODUCE_RECORDS : MAX_RECORDS);
      dispatchUpdate('remote');
    }; } catch { /* fallback */ }
  });
  window.addEventListener('error', (event: ErrorEvent) => {
    const target = event.target;
    if (target && target !== window && target instanceof Element) {
      const tag = target.tagName.toLowerCase(); const resource = (target as HTMLElement & { src?: string; href?: string }).src || (target as HTMLElement & { href?: string }).href || '';
      addBreadcrumb('lifecycle', `فشل تحميل مورد ${tag}`, { tag });
      recordDeviceError({ category: 'resource-load', severity: 'network', title: `فشل تحميل مورد (${tag})`, message: `تعذّر تحميل مورد من نوع ${tag}.`, source: resource }); return;
    }
    recordDeviceError({ category: 'runtime', title: event.message || 'خطأ JavaScript غير معروف', message: event.error instanceof Error ? `${event.error.name}: ${event.error.message}` : (event.message || 'Unknown window error'), source: event.filename, line: event.lineno || undefined, column: event.colno || undefined, stack: errorStack(event.error) });
  }, true);
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => recordDeviceError({ category: 'promise', title: 'وعد (Promise) فشل دون معالجة', message: toReadable(event.reason), stack: errorStack(event.reason), details: event.reason instanceof Error ? undefined : toReadable(event.reason) }));
  window.addEventListener('online', () => { addBreadcrumb('lifecycle', 'عاد الاتصال'); recordDeviceError({ category: 'connectivity', severity: 'warning', title: 'عاد الاتصال بالإنترنت', message: 'عاد المتصفح للإبلاغ عن اتصال متاح.' }); });
  window.addEventListener('offline', () => { addBreadcrumb('lifecycle', 'انقطع الاتصال'); recordDeviceError({ category: 'connectivity', severity: 'network', title: 'انقطع الاتصال بالإنترنت', message: 'أبلغ المتصفح أن الجهاز أصبح دون اتصال.' }); });
  addBreadcrumb('navigation', scrubRoute(window.location.href));
  window.addEventListener('popstate', () => addBreadcrumb('navigation', scrubRoute(window.location.href)));
  window.addEventListener('storage', (event) => {
    if (event.key?.startsWith('marketplat:') && event.key !== DEVICE_ERRORS_KEY && event.key !== REPRODUCE_MODE_KEY) addBreadcrumb('storage', `${event.newValue === null ? 'remove' : 'change'} ${event.key.slice(0, 100)}`);
  });
  // Record only application-owned storage key names; never capture values.
  try {
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.setItem = function(key: string, value: string) {
      if (key.startsWith('marketplat:') && key !== DEVICE_ERRORS_KEY && key !== REPRODUCE_MODE_KEY) addBreadcrumb('storage', `set ${key.slice(0, 100)}`);
      return originalSetItem.call(this, key, value);
    };
    Storage.prototype.removeItem = function(key: string) {
      if (key.startsWith('marketplat:') && key !== DEVICE_ERRORS_KEY && key !== REPRODUCE_MODE_KEY) addBreadcrumb('storage', `remove ${key.slice(0, 100)}`);
      return originalRemoveItem.call(this, key);
    };
  } catch { /* restricted storage implementations */ }
  const originalPushState = history.pushState.bind(history); const originalReplaceState = history.replaceState.bind(history);
  history.pushState = function(...args: Parameters<History['pushState']>) { const result = originalPushState(...args); addBreadcrumb('navigation', scrubRoute(window.location.href)); return result; };
  history.replaceState = function(...args: Parameters<History['replaceState']>) { const result = originalReplaceState(...args); addBreadcrumb('navigation', scrubRoute(window.location.href)); return result; };
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button,a,[role="button"],[data-error-breadcrumb]') : null;
    if (!target) return;
    const explicit = target.getAttribute('data-error-breadcrumb');
    const label = explicit || target.getAttribute('aria-label') || target.getAttribute('title');
    if (label) addBreadcrumb('click', label, { tag: target.tagName.toLowerCase() });
    else if (target instanceof HTMLAnchorElement) addBreadcrumb('click', `رابط ${scrubRoute(target.href)}`);
    // Do not capture arbitrary button text: it may contain user-specific content.
  }, true);
  const originalError = console.error.bind(console); const originalWarn = console.warn.bind(console); const originalLog = console.log.bind(console);
  const captureConsole = (level: 'error' | 'warning' | 'debug', original: (...args: unknown[]) => void, args: unknown[]) => {
    original(...args); if (isCapturingConsole || (level === 'debug' && !isReproduceMode())) return;
    isCapturingConsole = true;
    try {
      const firstError = args.find((arg) => arg instanceof Error); const text = args.map(toReadable).join(' ').slice(0, 6000);
      if (text.trim()) {
        addBreadcrumb('console', `${level}: ${text.slice(0, 120)}`);
        const isHydration = /hydration|hydrated|react error #?418|react error #?423|react error #?425/i.test(text);
        recordDeviceError({ category: isHydration ? 'hydration' : 'console', severity: level === 'debug' ? 'debug' : level === 'warning' ? 'warning' : 'error', title: firstError instanceof Error ? `${firstError.name}: ${firstError.message}` : level === 'warning' ? 'تحذير من التطبيق' : level === 'debug' ? 'سجل تشخيصي (وضع إعادة الإنتاج)' : 'رسالة خطأ من التطبيق', message: text, stack: errorStack(firstError), details: isHydration ? hydrationDomDetails() : undefined });
      }
    } finally { isCapturingConsole = false; }
  };
  console.error = (...args: unknown[]) => captureConsole('error', originalError, args);
  console.warn = (...args: unknown[]) => captureConsole('warning', originalWarn, args);
  console.log = (...args: unknown[]) => captureConsole('debug', originalLog, args);
  // Long-task API is optional and not available in every browser.
  try { const observer = new PerformanceObserver((list) => { const now = Date.now(); list.getEntries().forEach(() => longTasks.push(now)); while (longTasks.length > 50) longTasks.shift(); }); observer.observe({ type: 'longtask', buffered: false }); } catch { /* unsupported */ }
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const request = args[0]; const url = typeof request === 'string' ? request : request instanceof URL ? request.href : request.url;
    const method = (args[1]?.method ?? (request instanceof Request ? request.method : 'GET')).toUpperCase();
    addBreadcrumb('api', `${method} ${scrubRoute(url)}`);
    let response: Response;
    try { response = await originalFetch(...args); }
    catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) recordDeviceError({ category: 'network-request', severity: 'network', title: 'فشل طلب الشبكة', message: `${method} ${scrubRoute(url)}: ${toReadable(error)}`, source: url, stack: errorStack(error) });
      throw error;
    }
    if (response.status >= 500) recordDeviceError({ category: 'http-server', severity: 'error', title: `خطأ خادم HTTP ${response.status}`, message: `أعاد طلب الشبكة الحالة ${response.status} ${response.statusText}.`, source: url, details: `method=${method}` });
    return response;
  };
}

declare global { interface Window { __marketplatDeviceErrorCaptureInstalled?: boolean; } }
installCapture();
