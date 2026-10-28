'use client';

/**
 * TEMPORARY production diagnostics for React hydration failures.
 * Remove this component after the #418 investigation is complete.
 * It records only matching hydration/React minified errors and exposes
 * a local on-screen report; it does not send data to any server.
 */
import { useEffect, useState } from 'react';

type DiagnosticReport = {
  id: string;
  time: string;
  route: string;
  kind: string;
  message: string;
  stack: string;
  userAgent: string;
};

const MATCH = /hydration|hydrated|react error #(?:418|423|425)|minified react error/i;
const MAX_REPORTS = 5;

function safeText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

declare global {
  interface Window {
    __temporaryHydrationReports?: DiagnosticReport[];
    __temporaryHydrationDiagnosticsInstalled?: boolean;
  }
}

// Install at client-module evaluation time so it can catch failures that happen
// before React runs this component's effects during initial hydration.
if (typeof window !== 'undefined' && !window.__temporaryHydrationDiagnosticsInstalled) {
  window.__temporaryHydrationDiagnosticsInstalled = true;
  window.__temporaryHydrationReports = window.__temporaryHydrationReports ?? [];
  let sequence = 0;

  const addReport = (kind: string, message: string, stack = '') => {
    const combined = `${message}\n${stack}`;
    if (!MATCH.test(combined)) return;
    const report: DiagnosticReport = {
      id: `${Date.now()}-${sequence++}`,
      time: new Date().toISOString(),
      route: window.location.pathname,
      kind,
      message: message.slice(0, 5000),
      stack: stack.slice(0, 12000),
      userAgent: navigator.userAgent,
    };
    const previous = window.__temporaryHydrationReports ?? [];
    if (previous.some((item) => item.route === report.route && item.message === report.message)) return;
    window.__temporaryHydrationReports = [report, ...previous].slice(0, MAX_REPORTS);
    // Notify the visible panel if it has mounted. This remains entirely local.
    window.dispatchEvent(new CustomEvent('temporary-hydration-diagnostic'));
    console.warn('[temporary hydration diagnostics]', report);
  };

  window.addEventListener('error', (event: ErrorEvent) => {
    const errorText = event.error instanceof Error ? `${event.error.name}: ${event.error.message}` : '';
    const message = [event.message, errorText].filter(Boolean).join('\n') || 'Unknown window error';
    addReport('window.error', message, event.error instanceof Error ? event.error.stack ?? '' : '');
  });
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const message = safeText(event.reason);
    addReport('unhandledrejection', message, event.reason instanceof Error ? event.reason.stack ?? '' : '');
  });
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    originalConsoleError.apply(console, args);
    addReport('console.error', args.map(safeText).join(' '));
  };
}

export function HydrationDiagnostics() {
  const [reports, setReports] = useState<DiagnosticReport[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const refreshReports = () => setReports([...(window.__temporaryHydrationReports ?? [])]);
    refreshReports();
    window.addEventListener('temporary-hydration-diagnostic', refreshReports);
    return () => window.removeEventListener('temporary-hydration-diagnostic', refreshReports);
  }, []);
  if (dismissed || reports.length === 0) return null;

  const reportText = JSON.stringify({
    diagnostic: 'TEMPORARY_REACT_HYDRATION_REPORT',
    reports,
  }, null, 2);

  const copyReport = () => {
    // Clipboard access is user-triggered; fallback remains selectable in the panel.
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(reportText).catch(() => undefined);
    }
  };

  return (
    <aside
      role="alert"
      aria-live="assertive"
      dir="ltr"
      style={{
        position: 'fixed', zIndex: 2147483647, left: 10, right: 10, bottom: 10,
        maxHeight: '48vh', overflow: 'auto', background: '#211b12', color: '#fff4d6',
        border: '2px solid #e7a93b', borderRadius: 10, padding: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,.45)', font: '12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <strong style={{ flex: 1, fontSize: 14 }}>Temporary React hydration diagnostics</strong>
        <button type="button" onClick={copyReport} style={buttonStyle}>Copy report</button>
        <button type="button" onClick={() => setDismissed(true)} style={buttonStyle}>Dismiss</button>
      </div>
      <p style={{ margin: '0 0 8px' }}>Detected {reports.length} matching error(s). No report was sent to a server. Copy the report and share it with the developer.</p>
      <textarea
        aria-label="Hydration diagnostic report"
        readOnly
        value={reportText}
        onFocus={(event) => event.currentTarget.select()}
        style={{ display: 'block', boxSizing: 'border-box', width: '100%', minHeight: 110, maxHeight: 260, background: '#120f0b', color: '#f8e9c8', border: '1px solid #79602f', padding: 8, font: 'inherit' }}
      />
    </aside>
  );
}

const buttonStyle: React.CSSProperties = {
  background: '#f0bd55', color: '#20170a', border: 0, borderRadius: 5,
  padding: '5px 8px', fontWeight: 700, cursor: 'pointer',
};
