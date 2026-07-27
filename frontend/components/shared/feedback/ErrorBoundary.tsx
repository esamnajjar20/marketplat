/**
 * ErrorBoundary — React class component boundary for catching render errors.
 * Use around third-party widgets or complex Client Components.
 */
'use client';

import { Component, type ReactNode } from 'react';
import { Button } from '@/components/shared/ui/Button';
import { reportClientError } from '@/lib/errorReporter';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // FIX AUDIT-V3-06: previously only console.error with a TODO.
    reportClientError(error, { boundary: 'ErrorBoundary' });
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          // UX-12 FIX: role="alert" announces the error to screen readers immediately.
          <div
            role="alert"
            aria-live="assertive"
            className="flex flex-col items-center gap-4 rounded-lg border border-destructive/20 bg-destructive/5 p-8 text-center"
          >
            <p className="text-sm font-medium text-destructive">
              حدث خطأ أثناء تحميل هذا القسم.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              أعد المحاولة
            </Button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
