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
  cookie              - all cookies
  cookie csrf         - csrfToken cookie value
  auth                - auth store summary
  auth csrf           - csrfToken from store
  auth token          - accessToken (masked)
  query count         - number of cached queries
  query list          - all query keys
  storage keys        - localStorage keys
  sw                  - service worker registrations
  online              - navigator.onLine + visibility
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
  const outputRef = useRef<HTMLDivElement>(null);

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
      return 'document.cookie:\n' + (document.cookie || '(empty)');
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

  const submit = async () => {
    const cmd = input.trim();
    if (!cmd) return;
    let output: string;
    let error = false;
    try {
      output = await runCommand(cmd);
    } catch (e) {
      output = 'Error: ' + (e instanceof Error ? e.message : String(e));
      error = true;
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
          Debug console — type <code className="rounded bg-muted px-1 py-0.5">help</code> for commands. ↑ ↓ recalls history.
        </p>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="type a command..."
          className="min-h-20 w-full resize-y rounded-md border bg-background p-2 font-mono text-sm"
          dir="ltr"
          spellCheck={false}
        />
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => void submit()}>Run</Button>
          <Button size="sm" variant="outline" onClick={() => setEntries([])}>Clear output</Button>
        </div>
      </div>

      <div
        ref={outputRef}
        className="max-h-[60vh] overflow-y-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs"
        dir="ltr"
      >
        {entries.length === 0 ? (
          <p className="text-muted-foreground" dir="rtl">No output yet.</p>
        ) : (
          entries.map((entry, i) => (
            <div key={i} className="mb-3 border-b border-border/40 pb-2 last:border-0">
              <div>
                <span className="text-muted-foreground">
                  {new Date(entry.at).toLocaleTimeString('ar-PS')}
                </span>
                {' '}
                <span className="font-semibold text-primary">$ {entry.command}</span>
              </div>
              <pre className={`mt-1 whitespace-pre-wrap break-all ${entry.error ? 'text-destructive' : ''}`}>
                {entry.output}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
