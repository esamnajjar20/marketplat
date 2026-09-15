'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/shared/ui/Button';
import { ROUTES } from '@/lib/constants';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  /** واجهة مخصّصة تُعرض بدلاً من الواجهة الافتراضية عند وقوع خطأ. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * حدود خطأ — رسالة هادئة + مسارات واضحة للتعافي.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('ErrorBoundary', error, info);
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div
        className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 py-12 text-center"
        role="alert"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-8 w-8" aria-hidden />
        </div>
        <div className="max-w-sm space-y-1.5">
          <h2 className="text-lg font-bold tracking-tight">
            {this.props.fallbackTitle ?? 'حدث خطأ غير متوقع'}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            لا تقلق — يمكنك المحاولة مرة أخرى أو العودة للرئيسية والمتابعة من هناك.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" className="gap-1.5 rounded-xl" onClick={this.handleRetry}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            إعادة المحاولة
          </Button>
          <Button type="button" variant="outline" className="gap-1.5 rounded-xl" asChild>
            <Link href={ROUTES.home}>
              <Home className="h-4 w-4" aria-hidden />
              الرئيسية
            </Link>
          </Button>
        </div>
      </div>
    );
  }
}
