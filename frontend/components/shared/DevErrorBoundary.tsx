'use client';
import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; label?: string; }
interface State { error: Error | null; }

export class DevErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[DevErrorBoundary]', this.props.label, error);
    }
  }
  render() {
    if (this.state.error) {
      return (
        <section dir="rtl" role="alert" className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          <h2 className="font-semibold">تعذّر تحميل هذا الجزء من الصفحة</h2>
          <p className="mt-1 text-sm">أعد تحميل الصفحة، ثم حاول مرة أخرى.</p>
          <button
            type="button"
            className="mt-3 rounded-md bg-red-800 px-3 py-2 text-sm font-medium text-white"
            onClick={() => window.location.reload()}
          >
            إعادة تحميل الصفحة
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}
