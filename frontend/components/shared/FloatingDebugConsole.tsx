
'use client';

import { useEffect, useRef, useState } from 'react';

interface LogEntry {
  id: number;
  type: 'command' | 'result' | 'error';
  text: string;
}

export default function FloatingDebugConsole() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs]);

  const addLog = (type: LogEntry['type'], text: string) => {
    setLogs((prev) => [...prev, { id: ++idRef.current, type, text }]);
  };

  const run = async () => {
    const code = input.trim();
    if (!code) return;
    addLog('command', code);
    setHistory((prev) => [code, ...prev.filter((h) => h !== code)].slice(0, 30));
    setHistIdx(-1);
    setInput('');
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
      const fn = new Function('return (' + code + ')');
      const result = await fn();
      let out: string;
      try { out = JSON.stringify(result, null, 2); } catch { out = String(result); }
      addLog('result', out);
    } catch (e) {
      addLog('error', e instanceof Error ? e.message : String(e));
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void run(); return; }
    if (e.key === 'ArrowUp' && history.length > 0) {
      e.preventDefault();
      const next = Math.min(history.length - 1, histIdx + 1);
      setHistIdx(next); setInput(history[next] ?? '');
    }
    if (e.key === 'ArrowDown' && histIdx >= 0) {
      e.preventDefault();
      const next = histIdx - 1;
      if (next < 0) { setHistIdx(-1); setInput(''); }
      else { setHistIdx(next); setInput(history[next] ?? ''); }
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle floating debug console"
        style={{
          position: 'fixed', bottom: '1rem', insetInlineEnd: '1rem',
          zIndex: 2147483646, width: 56, height: 56, borderRadius: '50%',
          background: '#397F56', color: 'white', border: 'none',
          fontSize: 22, fontFamily: 'monospace', cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
        }}
      >
        {open ? '×' : '>_'}
      </button>
      {open && (
        <div dir="ltr" style={{
          position: 'fixed', bottom: '5rem', insetInlineEnd: '1rem',
          width: 'min(440px, 92vw)', maxHeight: '65vh', zIndex: 2147483645,
          background: '#101820', color: '#e6e6e6', borderRadius: 12,
          padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
          fontFamily: 'ui-monospace, monospace', fontSize: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          border: '1px solid #2a3542',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#7fffd4', fontWeight: 'bold', fontSize: 11 }}>
            <span>marketplat eval</span>
            <span style={{ color: '#888' }}>{logs.length} log(s)</span>
          </div>
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', minHeight: 140, paddingRight: 4 }}>
            {logs.length === 0 && (
              <div style={{ color: '#888' }}>
                Try: <code style={{ color: '#7fffd4' }}>2+2</code>,{' '}
                <code style={{ color: '#7fffd4' }}>document.cookie</code>,{' '}
                <code style={{ color: '#7fffd4' }}>navigator.onLine</code>
              </div>
            )}
            {logs.map((l) => (
              <div key={l.id} style={{
                marginBottom: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                color: l.type === 'command' ? '#7fffd4' : l.type === 'error' ? '#ff9c9c' : '#e6e6e6',
              }}>
                {l.type === 'command' ? '$ ' : ''}{l.text}
              </div>
            ))}
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="JavaScript... (Enter=run, Shift+Enter=newline)"
            rows={2}
            style={{
              width: '100%', background: '#1c2530', color: '#fff',
              border: '1px solid #2a3542', borderRadius: 6, padding: 8,
              fontFamily: 'ui-monospace, monospace', fontSize: 12, resize: 'vertical',
            }}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => void run()} style={{ flex: 1, padding: '6px 10px', background: '#397F56', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>Run ⏎</button>
            <button onClick={() => setLogs([])} style={{ padding: '6px 10px', background: '#333', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Clear</button>
          </div>
        </div>
      )}
    </>
  );
}
