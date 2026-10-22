'use client';
import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; label?: string; }
interface State { error: Error | null; }

export class DevErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('[DevErrorBoundary]', this.props.label, error);
    console.error('[DevErrorBoundary] stack:', info.componentStack);
    // Also report to observability endpoint (now via correct Worker URL)
    try {
      fetch('https://marketplat-api.esamnajjar6.workers.dev/api/v1/observability/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          component: this.props.label || 'unknown',
          url: typeof window !== 'undefined' ? window.location.href : '',
        }),
      }).catch(() => {});
    } catch {}
  }
  render() {
    if (this.state.error) {
      return (
        <div dir="rtl" style={{
          margin: 16, padding: 16, border: '2px solid #dc2626', borderRadius: 12,
          background: '#fef2f2', fontFamily: 'monospace', fontSize: 12,
          lineHeight: 1.5, color: '#7f1d1d', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          <div style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 8 }}>
            ⚠️ خطأ في {this.props.label || 'المكون'}
          </div>
          <div><strong>Message:</strong> {this.state.error.message}</div>
          {this.state.error.stack && (
            <div style={{ marginTop: 8, fontSize: 10, color: '#991b1b' }}>
              {this.state.error.stack.split('\n').slice(0, 10).join('\n')}
            </div>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
