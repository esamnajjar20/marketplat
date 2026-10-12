'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ChevronDown, ChevronUp, Code2, Copy, Database, Gauge,
  Info, Layers, Network, Play, RotateCcw, Terminal, X,
} from 'lucide-react';
import { adminApi } from '@/api/admin.api';
import { useAuthStore } from '@/store/auth.store';

type ToolTab = 'console' | 'network' | 'elements' | 'storage' | 'performance' | 'errors' | 'info';
type ConsoleEntry = { id: number; level: 'log' | 'info' | 'warn' | 'error' | 'debug'; message: string; at: number; source?: string };
type NetworkEntry = { id: number; method: string; url: string; status: number | string; durationMs: number; at: number; failed?: boolean };
type PageError = { id: number; message: string; at: number; source?: string };

const MAX_ITEMS = 250;
const SENSITIVE_KEY = /token|secret|password|authorization|cookie|session|api.?key|credential|email|phone|\bjwt\b|bearer|\botp\b|\bpin\b|\bpwd\b|\bsid\b/i;
const TABS: Array<{ id: ToolTab; label: string; icon: typeof Terminal }> = [
  { id: 'console', label: 'Console', icon: Terminal },
  { id: 'network', label: 'Network', icon: Network },
  { id: 'elements', label: 'Elements', icon: Layers },
  { id: 'storage', label: 'Storage', icon: Database },
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'errors', label: 'Errors', icon: Activity },
  { id: 'info', label: 'معلومات', icon: Info },
];

function safeUrl(input: unknown): string {
  try {
    const raw = input instanceof Request ? input.url : String(input ?? '');
    const url = new URL(raw, window.location.href);
    const query = Array.from(url.searchParams.entries()).map(([key, value]) =>
      `${encodeURIComponent(key)}=${SENSITIVE_KEY.test(key) ? '[redacted]' : encodeURIComponent(value.slice(0, 100))}`,
    ).join('&');
    return `${url.origin}${url.pathname}${query ? `?${query}` : ''}`.slice(0, 700);
  } catch {
    return (String(input ?? '[unknown URL]').split('#', 1)[0] ?? '').slice(0, 700);
  }
}

function serialize(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 12_000);
  if (typeof value === 'undefined') return 'undefined';
  if (value instanceof Error) return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`.slice(0, 12_000);
  try {
    const seen = new WeakSet<object>();
    const result = JSON.stringify(value, (_key, item: unknown) => {
      if (typeof item === 'bigint') return `${item.toString()}n`;
      if (item && typeof item === 'object') {
        if (seen.has(item)) return '[Circular]';
        seen.add(item);
        if (item instanceof Element) return { tagName: item.tagName, id: item.id || undefined, className: typeof item.className === 'string' ? item.className.slice(0, 200) : undefined };
        if (item instanceof Error) return { name: item.name, message: item.message, stack: item.stack };
      }
      return item;
    }, 2);
    return (result ?? String(value)).slice(0, 12_000);
  } catch {
    try { return String(value).slice(0, 12_000); } catch { return '[Unserializable value]'; }
  }
}

function readStorage(storage: Storage): Array<{ key: string; value: string }> {
  const items: Array<{ key: string; value: string }> = [];
  for (let index = 0; index < storage.length && items.length < 100; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    const value = storage.getItem(key) ?? '';
    items.push({ key, value: SENSITIVE_KEY.test(key) ? '[masked for safety]' : value.slice(0, 500) });
  }
  return items;
}

export function AdminScriptConsole() {
  const role = useAuthStore((state) => state.user?.role ?? null);
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  const hydrated = useAuthStore((state) => state.isHydrated);
  const [enabled, setEnabled] = useState(false);
  const [settingLoaded, setSettingLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [armed, setArmed] = useState(false);
  const [source, setSource] = useState('document.title');
  const [tab, setTab] = useState<ToolTab>('console');
  const [logs, setLogs] = useState<ConsoleEntry[]>([]);
  const [requests, setRequests] = useState<NetworkEntry[]>([]);
  const [errors, setErrors] = useState<PageError[]>([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selector, setSelector] = useState('main');
  const [inspected, setInspected] = useState('');
  const [storageSnapshot, setStorageSnapshot] = useState<{ local: Array<{ key: string; value: string }>; session: Array<{ key: string; value: string }> } | null>(null);
  const [perfSnapshot, setPerfSnapshot] = useState<Array<{ name: string; type: string; duration: number; size: number }>>([]);
  const [pageInfo, setPageInfo] = useState<Record<string, string>>({});
  const outputRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  const isAdmin = hydrated && authenticated && (role === 'ADMIN' || role === 'SUPER_ADMIN');
  const scriptExecutionAllowed = process.env.NODE_ENV === 'development';
  const latestOutput = useMemo(() => logs.at(-1)?.message ?? '', [logs]);

  const recordLog = useCallback((level: ConsoleEntry['level'], args: unknown[], sourceLabel?: string) => {
    const message = args.map(serialize).join(' ');
    setLogs((current) => [...current, { id: nextId.current++, level, message, at: Date.now(), source: sourceLabel }].slice(-MAX_ITEMS));
  }, []);

  const recordRequest = useCallback((entry: Omit<NetworkEntry, 'id' | 'at'>) => {
    setRequests((current) => [...current, { ...entry, id: nextId.current++, at: Date.now() }].slice(-MAX_ITEMS));
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setEnabled(false);
      setSettingLoaded(false);
      setOpen(false);
      return;
    }
    let alive = true;
    const refreshSetting = () => {
      void adminApi.getDeveloperToolsSetting().then((response) => {
        if (!alive) return;
        const next = response.data.data?.enabled === true;
        setEnabled(next);
        setSettingLoaded(true);
        if (!next) setOpen(false);
      }).catch(() => {
        if (!alive) return;
        setEnabled(false);
        setSettingLoaded(true);
        setOpen(false);
      });
    };
    const onSettingChange = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      const next = detail?.enabled === true;
      setEnabled(next);
      if (!next) setOpen(false);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') refreshSetting(); };
    refreshSetting();
    window.addEventListener('focus', refreshSetting);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('developer-tools-setting-changed', onSettingChange);
    return () => {
      alive = false;
      window.removeEventListener('focus', refreshSetting);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('developer-tools-setting-changed', onSettingChange);
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !enabled) return;
    const originalConsole = {
      log: console.log, info: console.info, warn: console.warn,
      error: console.error, debug: console.debug, table: console.table,
    };
    const wrap = (level: ConsoleEntry['level'], original: (...args: never[]) => void) =>
      ((...args: unknown[]) => {
        recordLog(level, args, 'page');
        Reflect.apply(original, console, args);
      }) as typeof console.log;
    console.log = wrap('log', originalConsole.log as (...args: never[]) => void);
    console.info = wrap('info', originalConsole.info as (...args: never[]) => void);
    console.warn = wrap('warn', originalConsole.warn as (...args: never[]) => void);
    console.error = wrap('error', originalConsole.error as (...args: never[]) => void);
    console.debug = wrap('debug', originalConsole.debug as (...args: never[]) => void);
    console.table = ((data: unknown, columns?: string[]) => {
      recordLog('log', [data], 'page.table');
      Reflect.apply(originalConsole.table, console, [data, columns]);
    }) as typeof console.table;

    const originalFetch = window.fetch;
    window.fetch = (async (...args: Parameters<typeof window.fetch>) => {
      const input = args[0];
      const init = args[1];
      const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const url = safeUrl(input);
      const started = performance.now();
      try {
        const response = await Reflect.apply(originalFetch, window, args) as Response;
        recordRequest({ method, url, status: response.status, durationMs: Math.round(performance.now() - started), failed: !response.ok });
        return response;
      } catch (error) {
        recordRequest({ method, url, status: 'ERR', durationMs: Math.round(performance.now() - started), failed: true });
        recordLog('error', [error], 'fetch');
        throw error;
      }
    }) as typeof window.fetch;

    const xhrProto = XMLHttpRequest.prototype as unknown as { open: (...args: unknown[]) => void; send: (...args: unknown[]) => void };
    const originalOpen = xhrProto.open;
    const originalSend = xhrProto.send;
    const xhrMeta = new WeakMap<XMLHttpRequest, { method: string; url: string; started: number }>();
    xhrProto.open = function (this: XMLHttpRequest, ...args: unknown[]) {
      const method = String(args[0] ?? 'GET').toUpperCase();
      const url = safeUrl(args[1]);
      xhrMeta.set(this, { method, url, started: 0 });
      return Reflect.apply(originalOpen, this, args);
    };
    xhrProto.send = function (this: XMLHttpRequest, ...args: unknown[]) {
      const meta = xhrMeta.get(this) ?? { method: 'GET', url: '[unknown URL]', started: 0 };
      meta.started = performance.now();
      xhrMeta.set(this, meta);
      const onLoadEnd = () => {
        this.removeEventListener('loadend', onLoadEnd);
        recordRequest({ method: meta.method, url: meta.url, status: this.status || 'ERR', durationMs: Math.round(performance.now() - meta.started), failed: this.status === 0 || this.status >= 400 });
      };
      this.addEventListener('loadend', onLoadEnd, { once: true });
      return Reflect.apply(originalSend, this, args);
    };

    const onError = (event: ErrorEvent) => setErrors((current) => [...current, { id: nextId.current++, message: event.message || 'JavaScript error', source: event.filename ? safeUrl(event.filename) : undefined, at: Date.now() }].slice(-MAX_ITEMS));
    const onRejection = (event: PromiseRejectionEvent) => setErrors((current) => [...current, { id: nextId.current++, message: serialize(event.reason), at: Date.now() }].slice(-MAX_ITEMS));
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      console.log = originalConsole.log;
      console.info = originalConsole.info;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.debug = originalConsole.debug;
      console.table = originalConsole.table;
      window.fetch = originalFetch;
      xhrProto.open = originalOpen;
      xhrProto.send = originalSend;
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [enabled, isAdmin, recordLog, recordRequest]);

  useEffect(() => {
    if (!isAdmin || !enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, isAdmin]);

  useEffect(() => {
    if (open && outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [logs, requests, errors, open, tab]);

  const runScript = useCallback(async () => {
    const code = source.trim();
    if (!code || running || !armed || !isAdmin || !enabled || !scriptExecutionAllowed) return;
    setRunning(true);
    recordLog('debug', [code], 'input');
    try {
      const AsyncFunction = Object.getPrototypeOf(async function () { /* noop */ }).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<unknown>;
      let execute: (...args: unknown[]) => Promise<unknown>;
      try {
        execute = new AsyncFunction(`return await (\n${code}\n);`);
      } catch {
        // Fall back to statement mode only for a compile-time expression error.
        execute = new AsyncFunction(`${code}\n`);
      }
      const value = await execute();
      if (typeof value !== 'undefined') recordLog('log', [value], 'result');
      else recordLog('info', ['Execution completed (no return value)'], 'result');
    } catch (error) {
      recordLog('error', [error], 'execution');
    } finally {
      setRunning(false);
    }
  }, [armed, enabled, isAdmin, recordLog, running, scriptExecutionAllowed, source]);

  const copyOutput = useCallback(async () => {
    try { await navigator.clipboard.writeText(latestOutput); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }
    catch { setCopied(false); }
  }, [latestOutput]);

  const refreshStorage = useCallback(() => {
    setStorageSnapshot({ local: readStorage(window.localStorage), session: readStorage(window.sessionStorage) });
  }, []);

  const refreshPerformance = useCallback(() => {
    const entries = performance.getEntriesByType('resource').slice(-120).map((rawEntry) => {
      const entry = rawEntry as PerformanceResourceTiming;
      return {
        name: safeUrl(entry.name), type: entry.initiatorType, duration: Math.round(entry.duration),
        size: Number(entry.transferSize || 0),
      };
    });
    setPerfSnapshot(entries);
  }, []);

  const inspectElements = useCallback(() => {
    try {
      const nodes = Array.from(document.querySelectorAll(selector)).slice(0, 80);
      setInspected(nodes.length ? nodes.map((node, index) => {
        const element = node as HTMLElement;
        const attrs = Array.from(element.attributes).slice(0, 15).map((attribute) => `${attribute.name}="${attribute.value.slice(0, 120)}"`).join(' ');
        return `${index + 1}. <${element.tagName.toLowerCase()}${element.id ? ` id="${element.id}"` : ''}${element.className && typeof element.className === 'string' ? ` class="${element.className.slice(0, 180)}"` : ''}>\n   ${attrs}\n   text: ${(element.innerText || '').trim().slice(0, 250)}`;
      }).join('\n\n') : 'لا توجد عناصر مطابقة للمحدد.');
    } catch (error) { setInspected(`محدد CSS غير صالح: ${serialize(error)}`); }
  }, [selector]);

  const refreshInfo = useCallback(() => {
    setPageInfo({
      url: safeUrl(window.location.href),
      route: window.location.pathname,
      title: document.title,
      viewport: `${window.innerWidth} × ${window.innerHeight}`,
      screen: `${window.screen.width} × ${window.screen.height}`,
      online: navigator.onLine ? 'متصل' : 'غير متصل',
      language: navigator.language,
      userAgent: navigator.userAgent,
      connection: String((navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType ?? 'غير متاح'),
      memory: String((performance as Performance & { memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number } }).memory?.usedJSHeapSize ? `${Math.round(((performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize ?? 0) / 1024 / 1024)} MB used` : 'غير متاح'),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    if (tab === 'storage') refreshStorage();
    if (tab === 'performance') refreshPerformance();
    if (tab === 'info') refreshInfo();
  }, [open, tab, refreshStorage, refreshPerformance, refreshInfo]);

  if (!isAdmin || !settingLoaded || !enabled) return null;

  return (
    <>
      {!open && <button type="button" onClick={() => setOpen(true)} title="فتح أدوات المطوّر (Ctrl+Shift+K)" aria-label="فتح أدوات المطوّر" className="fixed bottom-4 left-4 z-[9998] inline-flex h-11 items-center gap-2 rounded-full border border-amber-400/60 bg-slate-950 px-4 text-sm font-semibold text-amber-200 shadow-xl hover:bg-slate-900"><Terminal className="h-4 w-4" /> DevTools</button>}
      {open && (
        <section aria-label="أدوات المطوّر" className={`fixed bottom-3 left-3 z-[9999] flex max-h-[92dvh] flex-col overflow-hidden rounded-xl border border-amber-400/50 bg-slate-950 text-slate-100 shadow-2xl ${expanded ? 'h-[92dvh] w-[min(1240px,calc(100vw-24px))]' : 'h-[min(700px,86dvh)] w-[min(900px,calc(100vw-24px))]'}`} dir="ltr">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-700 bg-slate-900 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2"><Code2 className="h-4 w-4 text-amber-300" /><strong className="text-sm">MarketPlat Developer Tools</strong><span className="rounded bg-emerald-300/10 px-2 py-0.5 text-[10px] text-emerald-200">ADMIN ONLY</span></div>
            <div className="flex items-center gap-1"><button type="button" className="rounded p-1.5 hover:bg-slate-700" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? 'تصغير' : 'تكبير'}>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</button><button type="button" className="rounded p-1.5 hover:bg-slate-700" onClick={() => setOpen(false)} aria-label="إغلاق"><X className="h-4 w-4" /></button></div>
          </header>
          <div className="shrink-0 border-b border-amber-500/30 bg-amber-950/40 px-3 py-2 text-xs leading-5 text-amber-100" dir="rtl">هذه أدوات تشخيص قوية تعمل على الصفحة الحالية. لا تسجّل أجسام الطلبات أو ترويساتها، وتُخفِي قيم مفاتيح التخزين الحساسة. تنفيذ JavaScript الحر متاح في بيئة التطوير فقط؛ لن يتم تعطيل CSP في الإنتاج.</div>
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-800 p-2">{TABS.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs ${tab === item.id ? 'bg-amber-300 font-bold text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}><Icon className="h-3.5 w-3.5" />{item.label}{item.id === 'network' && requests.length > 0 ? ` (${requests.length})` : ''}{item.id === 'console' && logs.length > 0 ? ` (${logs.length})` : ''}{item.id === 'errors' && errors.length > 0 ? ` (${errors.length})` : ''}</button>; })}</nav>
          <div ref={outputRef} className="min-h-0 flex-1 overflow-auto bg-black/30 p-3 text-xs">
            {tab === 'console' && <div className="space-y-3">
              {scriptExecutionAllowed ? <><div className="text-slate-500">اكتب تعبيرًا أو سكربت JavaScript. Ctrl+Enter للتنفيذ.</div><textarea value={source} onChange={(event) => setSource(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void runScript(); } }} spellCheck={false} className="min-h-28 w-full resize-y rounded-lg border border-slate-700 bg-slate-900 p-3 font-mono text-sm text-slate-100 outline-none focus:border-amber-400" placeholder={'document.querySelectorAll("button").length'} /><div className="flex flex-wrap items-center gap-2"><label className="flex min-w-0 flex-1 items-start gap-2 text-xs leading-5 text-slate-300" dir="rtl"><input type="checkbox" checked={armed} onChange={(event) => setArmed(event.target.checked)} className="mt-1 accent-amber-400" />أفهم أن الكود سيعمل داخل الصفحة الحالية بصلاحيات حسابي</label><button type="button" disabled={!armed || running || !source.trim()} onClick={() => void runScript()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-300 px-3 text-xs font-bold text-slate-950 disabled:opacity-40"><Play className="h-3.5 w-3.5" />{running ? 'Running…' : 'Run'}</button></div></> : <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-amber-100" dir="rtl">تنفيذ السكربتات الحرة معطّل في الإنتاج لحماية سياسة أمان المحتوى (CSP). يمكنك استخدام باقي أدوات التشخيص هنا، أو تشغيل الموقع في بيئة التطوير لتنفيذ السكربتات.</div>}
              <div className="flex items-center justify-between"><strong className="text-slate-300">Console output</strong><div className="flex gap-2"><button type="button" onClick={() => setLogs([])} className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-slate-300"><RotateCcw className="h-3 w-3" />Clear</button><button type="button" disabled={!latestOutput} onClick={() => void copyOutput()} className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-slate-300 disabled:opacity-40"><Copy className="h-3 w-3" />{copied ? 'Copied' : 'Copy latest'}</button></div></div>
              {logs.length === 0 ? <p className="text-slate-600">ستظهر هنا نتائج السكربتات وconsole.log/warn/error بعد تفعيل الأدوات.</p> : logs.map((entry) => <article key={entry.id} className="border-b border-slate-800 py-2"><div className={`mb-1 flex justify-between gap-2 ${entry.level === 'error' ? 'text-red-300' : entry.level === 'warn' ? 'text-amber-200' : 'text-emerald-200'}`}><span>{entry.level.toUpperCase()} {entry.source ? `· ${entry.source}` : ''}</span><span className="text-[10px] text-slate-600">{new Date(entry.at).toLocaleTimeString()}</span></div><pre className="whitespace-pre-wrap break-words font-mono text-slate-200">{entry.message}</pre></article>)}
            </div>}
            {tab === 'network' && <div className="space-y-2"><div className="flex items-center justify-between"><div className="text-slate-400">طلبات fetch وXHR من لحظة تفعيل الأدوات؛ لا تُعرض أجسام الطلبات أو الترويسات.</div><button type="button" onClick={() => setRequests([])} className="rounded border border-slate-700 px-2 py-1">Clear</button></div>{requests.length === 0 ? <p className="py-8 text-center text-slate-600">لم يتم رصد طلبات بعد. أعد تحميل الصفحة بعد فتح الأدوات لالتقاط طلبات البداية.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left"><thead className="text-slate-500"><tr><th className="p-2">Method</th><th className="p-2">URL</th><th className="p-2">Status</th><th className="p-2">Time</th><th className="p-2">Time stamp</th></tr></thead><tbody>{[...requests].reverse().map((request) => <tr key={request.id} className="border-t border-slate-800"><td className="p-2 font-mono">{request.method}</td><td className="max-w-[420px] break-all p-2 font-mono">{request.url}</td><td className={`p-2 ${request.failed ? 'text-red-300' : 'text-emerald-300'}`}>{request.status}</td><td className="p-2">{request.durationMs} ms</td><td className="p-2 text-slate-500">{new Date(request.at).toLocaleTimeString()}</td></tr>)}</tbody></table></div>}</div>}
            {tab === 'elements' && <div className="space-y-3"><p className="text-slate-400">فحص DOM للصفحة الحالية عبر محدد CSS. الفحص للقراءة فقط ولا يعرض HTML الكامل أو قيم الحقول الحساسة.</p><div className="flex gap-2"><input value={selector} onChange={(event) => setSelector(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') inspectElements(); }} className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono" placeholder="main, button, #app"/><button type="button" onClick={inspectElements} className="rounded bg-amber-300 px-3 font-bold text-slate-950">Inspect</button></div><pre className="whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-900 p-3 font-mono">{inspected || 'اكتب محدد CSS واضغط Inspect.'}</pre></div>}
            {tab === 'storage' && <div className="space-y-3"><div className="flex items-center justify-between"><p className="text-slate-400">أسماء وقيم التخزين المحلي والجلسة؛ القيم ذات المفاتيح الحساسة مخفية.</p><button type="button" onClick={refreshStorage} className="rounded border border-slate-700 px-2 py-1">Refresh</button></div>{storageSnapshot && (['local' as const, 'session' as const]).map((kind) => <section key={kind}><h3 className="mb-2 font-semibold">{kind === 'local' ? 'localStorage' : 'sessionStorage'}</h3>{storageSnapshot[kind].length ? storageSnapshot[kind].map((item) => <div key={item.key} className="grid grid-cols-[minmax(120px,0.7fr)_minmax(0,1.3fr)] gap-2 border-t border-slate-800 py-2"><code className="break-all text-amber-200">{item.key}</code><code className="break-all text-slate-300">{item.value}</code></div>) : <p className="text-slate-600">فارغ</p>}</section>)}</div>}
            {tab === 'performance' && <div className="space-y-2"><div className="flex items-center justify-between"><p className="text-slate-400">موارد الصفحة من Performance API، مع الحجم المنقول حين يتيحه المتصفح.</p><button type="button" onClick={refreshPerformance} className="rounded border border-slate-700 px-2 py-1">Refresh</button></div>{perfSnapshot.length === 0 ? <p className="py-8 text-center text-slate-600">لا توجد موارد مسجلة.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left"><thead className="text-slate-500"><tr><th className="p-2">Resource</th><th className="p-2">Type</th><th className="p-2">Duration</th><th className="p-2">Transfer</th></tr></thead><tbody>{perfSnapshot.map((entry, index) => <tr key={`${entry.name}-${index}`} className="border-t border-slate-800"><td className="max-w-[400px] break-all p-2 font-mono">{entry.name}</td><td className="p-2">{entry.type}</td><td className="p-2">{entry.duration} ms</td><td className="p-2">{entry.size ? `${Math.round(entry.size / 1024)} KB` : '—'}</td></tr>)}</tbody></table></div>}</div>}
            {tab === 'errors' && <div className="space-y-2"><div className="flex items-center justify-between"><p className="text-slate-400">أخطاء JavaScript ووعود Promise غير المعالجة منذ تفعيل الأدوات.</p><button type="button" onClick={() => setErrors([])} className="rounded border border-slate-700 px-2 py-1">Clear</button></div>{errors.length === 0 ? <p className="py-8 text-center text-slate-600">لا توجد أخطاء مسجلة.</p> : [...errors].reverse().map((error) => <div key={error.id} className="border-t border-slate-800 py-2"><p className="whitespace-pre-wrap break-words text-red-300">{error.message}</p><p className="mt-1 text-slate-600">{error.source ?? ''} · {new Date(error.at).toLocaleTimeString()}</p></div>)}</div>}
            {tab === 'info' && <div className="space-y-2"><div className="flex items-center justify-between"><p className="text-slate-400">معلومات البيئة والمتصفح على الصفحة الحالية.</p><button type="button" onClick={refreshInfo} className="rounded border border-slate-700 px-2 py-1">Refresh</button></div>{Object.entries(pageInfo).map(([key, value]) => <div key={key} className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 border-b border-slate-800 py-2"><span className="text-slate-500">{key}</span><span className="break-all text-slate-200">{value}</span></div>)}</div>}
          </div>
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-700 px-3 py-2 text-[10px] text-slate-500"><span>MarketPlat · Admin-only · current page: {typeof window !== 'undefined' ? window.location.pathname : ''}</span><span>Ctrl+Shift+K · Esc</span></footer>
        </section>
      )}
    </>
  );
}
