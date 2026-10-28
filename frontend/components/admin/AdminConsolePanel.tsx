'use client';

/**
 * Admin debug console.
 *
 * Safari/Chrome DevTools are painful on mobile — this panel exposes a
 * curated set of diagnostic commands backed by imports (no eval, no
 * window globals). CSP on this deployment forbids 'unsafe-eval' in
 * production, so a free-form JS console isn't available; the whitelist
 * approach covers the 90% case (cookies, auth store, react-query cache,
 * storage, SW, network) without weakening the CSP.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { getQueryClient } from '@/lib/queryClient';
import { Button } from '@/components/shared/ui/Button';
import { getNetworkRequests } from '@/lib/networkRequestMonitor';
import { getDeviceErrorsAsync } from '@/lib/deviceErrorMonitor';

const HISTORY_KEY = 'admin:console:history';
const MAX_HISTORY = 20;

interface ConsoleEntry {
  command: string;
  output: string;
  error: boolean;
  at: number;
}

const HELP_TEXT = `Commands:
  help                - this list
  cookie              - cookie names only (values masked)
  cookie csrf         - csrfToken cookie value (masked)
  auth                - auth store summary
  auth csrf           - csrfToken from store
  auth token          - accessToken (masked)
  query count         - number of cached queries
  query list          - all query keys
  network summary     - local request totals and failures
  errors summary      - local device error totals by severity
  storage keys        - localStorage keys
  sw                  - service worker registrations
  online              - navigator.onLine + visibility
  route               - current browser route
  memory              - browser memory metrics when supported
  network recent      - last 10 local requests (metadata only)
  errors recent       - last 10 local device errors
  clear-cache         - clear React Query cache
  reload              - reload page

Arrow Up/Down in the input recalls history.`;

function mask(s: string | null | undefined): string {
  if (!s) return '(empty)';
  if (s.length <= 8) return s + '...';
  return s.slice(0, 4) + '…' + s.slice(-4) + ' (len=' + s.length + ')';
}

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|; )csrfToken=([^;]*)/);
  return m?.[1] !== undefined ? decodeURIComponent(m[1]) : null;
}

export function AdminConsolePanel() {
  const [input, setInput] = useState('');
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [running, setRunning] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/admin/debug-toggle').then((r) => r.json()).then((d) => setDebugEnabled(!!d.enabled)).catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [entries]);

  const pushHistory = (cmd: string) => {
    const next = [cmd, ...history.filter((h) => h !== cmd)].slice(0, MAX_HISTORY);
    setHistory(next);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setHistoryIdx(-1);
  };

  const runCommand = useCallback(async (raw: string): Promise<string> => {
    const cmd = raw.trim().toLowerCase();
    if (!cmd) return HELP_TEXT;
    const parts = cmd.split(/\s+/);
    const head = parts[0];
    const sub = parts[1];

    if (cmd === 'help') return HELP_TEXT;

    if (head === 'cookie') {
      if (sub === 'csrf') return 'csrfToken cookie: ' + mask(readCsrfCookie());
      const cookieNames = document.cookie.split(';').map((part) => part.trim().split('=')[0]).filter(Boolean);
      return 'cookie names visible to JavaScript (' + cookieNames.length + '):\n' + (cookieNames.length ? [...new Set(cookieNames)].sort().join('\n') : '(none)') + '\nValues are intentionally hidden. HttpOnly cookies are not visible to JavaScript.';
    }

    if (head === 'auth') {
      const state = useAuthStore.getState();
      if (sub === 'csrf') return 'store.csrfToken: ' + mask(state.csrfToken ?? null);
      if (sub === 'token') return 'store.accessToken: ' + mask(state.accessToken ?? null);
      return [
        'isAuthenticated: ' + state.isAuthenticated,
        'userId: ' + (state.user?.id ?? '(empty)'),
        'role: ' + (state.user?.role ?? '(empty)'),
        'accessToken: ' + mask(state.accessToken ?? null),
        'csrfToken: ' + mask(state.csrfToken ?? null),
      ].join('\n');
    }

    if (head === 'network' && sub === 'recent') {
      const requests = getNetworkRequests().slice(0, 10);
      return requests.length ? requests.map((row) => `${row.startedAt} | ${row.method} ${row.url} | ${row.status || row.outcome} | ${row.durationMs} ms | ${row.pageRoute}`).join('\n') : 'No local requests recorded yet.';
    }

    if (head === 'network' && sub === 'summary') {
      const requests = getNetworkRequests();
      const failed = requests.filter((row) => row.outcome === 'http-error' || row.outcome === 'network-error').length;
      const aborted = requests.filter((row) => row.outcome === 'aborted').length;
      const avg = requests.length ? Math.round(requests.reduce((sum, row) => sum + Math.max(0, row.durationMs), 0) / requests.length) : null;
      return ['local requests: ' + requests.length, 'HTTP/network failures: ' + failed, 'aborted: ' + aborted, 'average duration: ' + (avg === null ? 'n/a' : avg + ' ms'), 'Scope: this browser only; no bodies or headers'].join('\n');
    }

    if (head === 'errors' && sub === 'recent') {
      const records = (await getDeviceErrorsAsync()).slice(0, 10);
      return records.length ? records.map((row) => `${row.occurredAt} | ${row.severity.toUpperCase()} | ${row.title} | ${row.route} | count=${row.count}`).join('\n') : 'No local device errors recorded yet.';
    }

    if (head === 'errors' && sub === 'summary') {
      const records = await getDeviceErrorsAsync();
      const totals = records.reduce((sum, row) => {
        if (row.severity === 'error') sum.errors += row.count;
        else if (row.severity === 'warning') sum.warnings += row.count;
        else if (row.severity === 'network') sum.network += row.count;
        return sum;
      }, { errors: 0, warnings: 0, network: 0 });
      return ['local error records: ' + records.length, 'errors: ' + totals.errors, 'warnings: ' + totals.warnings, 'network events: ' + totals.network, 'Scope: this browser only'].join('\n');
    }

    if (head === 'query') {
      const qc = getQueryClient();
      const cache = qc.getQueryCache().getAll();
      if (sub === 'count') return 'cached queries: ' + cache.length;
      if (sub === 'list') {
        const lines = cache.map((q) => '  [' + q.state.status + '] ' + JSON.stringify(q.queryKey));
        return 'query keys (' + cache.length + '):\n' + lines.join('\n');
      }
      return 'usage: query count | query list';
    }

    if (head === 'storage' && sub === 'keys') {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) keys.push(k);
      }
      keys.sort();
      return 'localStorage (' + keys.length + '):\n' + keys.map((k) => '  ' + k).join('\n');
    }

    if (head === 'sw') {
      if (!('serviceWorker' in navigator)) return 'Service Worker not supported';
      const regs = await navigator.serviceWorker.getRegistrations();
      if (regs.length === 0) return 'no registrations';
      return 'registrations (' + regs.length + '):\n' + regs.map((r) =>
        '  scope: ' + r.scope + '\n  active: ' + (r.active ? 'yes' : 'no') + '\n  waiting: ' + (r.waiting ? 'yes' : 'no')
      ).join('\n');
    }

    if (head === 'route') {
      return ['pathname: ' + window.location.pathname, 'search params: ' + (window.location.search || '(none)'), 'hash: ' + (window.location.hash || '(none)')].join('\n');
    }

    if (head === 'memory') {
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      return memory ? ['used JS heap: ' + Math.round(memory.usedJSHeapSize / 1024 / 1024) + ' MB', 'total JS heap: ' + Math.round(memory.totalJSHeapSize / 1024 / 1024) + ' MB', 'heap limit: ' + Math.round(memory.jsHeapSizeLimit / 1024 / 1024) + ' MB', 'Note: Chromium-only metric; approximate.'].join('\n') : 'Browser does not expose performance.memory.';
    }

    if (head === 'online') {
      const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
      return [
        'navigator.onLine: ' + navigator.onLine,
        'connection.effectiveType: ' + (conn?.effectiveType ?? '(n/a)'),
        'document.visibilityState: ' + document.visibilityState,
      ].join('\n');
    }

    if (cmd === 'clear-cache') {
      getQueryClient().clear();
      return 'React Query cache cleared';
    }

    if (cmd === 'reload') {
      setTimeout(() => window.location.reload(), 200);
      return 'reloading...';
    }

    return 'unknown command: "' + head + '" — type "help".';
  }, []);

  const toggleDebugConsole = async () => {
    const method = debugEnabled ? 'DELETE' : 'POST';
    try {
      const res = await fetch('/api/admin/debug-toggle', { method });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert('تعذر التبديل: ' + (err.error || res.status));
        return;
      }
      const data = await res.json();
      setDebugEnabled(!!data.enabled);
      setTimeout(() => window.location.reload(), 400);
    } catch (e) {
      alert('خطأ: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const submit = async () => {
    const cmd = input.trim();
    if (!cmd || running) return;
    setRunning(true);
    let output: string;
    let error = false;
    try {
      output = await runCommand(cmd);
    } catch (e) {
      output = 'Error: ' + (e instanceof Error ? e.message : String(e));
      error = true;
    } finally {
      setRunning(false);
    }
    setEntries((prev) => [...prev, { command: cmd, output, error, at: Date.now() }]);
    pushHistory(cmd);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
      return;
    }
    if (e.key === 'ArrowUp' && history.length > 0) {
      e.preventDefault();
      const nextIdx = Math.min(history.length - 1, historyIdx + 1);
      setHistoryIdx(nextIdx);
      setInput(history[nextIdx] ?? "");
    }
    if (e.key === 'ArrowDown' && historyIdx >= 0) {
      e.preventDefault();
      const nextIdx = historyIdx - 1;
      if (nextIdx < 0) {
        setHistoryIdx(-1);
        setInput('');
      } else {
        setHistoryIdx(nextIdx);
        setInput(history[nextIdx] ?? "");
      }
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border bg-card p-3">
        <p className="mb-2 text-xs text-muted-foreground">
          كونسول تفاعلي: اكتب الأمر في الحقل ثم اضغط Enter أو زر التنفيذ. ↑ ↓ لاسترجاع الأوامر السابقة، وShift+Enter لسطر جديد. التنفيذ محصور بأوامر تشخيص آمنة ولا يشغّل JavaScript حرًا.
        </p>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="marketplat> help"
          aria-label="أدخل أمر التشخيص"
          className="min-h-24 w-full resize-y rounded-md border bg-background p-3 font-mono text-sm leading-6 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          dir="ltr"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void submit()} disabled={running || !input.trim()}>{running ? 'Running…' : 'تنفيذ الأمر ↵'}</Button>
          <Button size="sm" variant="outline" onClick={() => setEntries([])}>مسح المخرجات</Button>
          <Button size="sm" variant={debugEnabled ? 'default' : 'outline'} onClick={() => void toggleDebugConsole()}>
            {debugEnabled ? 'تعطيل الكونسول العائم' : 'تفعيل الكونسول العائم (>_ على كل الصفحات)'}
          </Button>
          {['help', 'online', 'network summary', 'errors summary', 'route'].map((command) => (
            <Button key={command} size="sm" variant="ghost" onClick={() => setInput(command)}>{command}</Button>
          ))}
        </div>
      </div>

      <div
        ref={outputRef}
        className="max-h-[55vh] min-h-32 overflow-y-auto rounded-lg border bg-[#101820] p-3 font-mono text-xs leading-6 text-slate-100 shadow-inner"
        dir="ltr"
      >
        {entries.length === 0 ? (
          <div className="space-y-1" dir="ltr"><p className="text-emerald-300">MarketPlat diagnostic console</p><p className="text-slate-400">Type <span className="text-amber-200">help</span> to list available commands.</p><p className="text-slate-500">$ _</p></div>
        ) : (
          entries.map((entry, i) => (
            <div key={i} className="mb-3 border-b border-border/40 pb-2 last:border-0">
              <div>
                <span className="text-slate-400">
                  {new Date(entry.at).toLocaleTimeString('ar-PS')}
                </span>
                {' '}
                <span className="font-semibold text-emerald-300">$ {entry.command}</span>
              </div>
              <pre className={`mt-1 whitespace-pre-wrap break-words ${entry.error ? 'text-red-300' : 'text-slate-100'}`}>
                {entry.output}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
