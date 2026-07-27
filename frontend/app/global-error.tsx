'use client';

import { useEffect } from 'react';
import { Button } from '@/components/shared/ui/Button';
import { reportClientError } from '@/lib/errorReporter';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Global error boundary — Next.js App Router special filename.
 *
 * FIX AUDIT-V5-02: this file was previously named `app/error.tsx`, which
 * made it a REGULAR route-level error boundary. Next.js renders a regular
 * `error.tsx` *inside* its nearest parent layout — it does not replace
 * that layout's own <html>/<body>. Since `app/layout.tsx` already renders
 * its own <html lang="ar" dir="rtl"><body>, having this file's <html>/
 * <body> nested inside that produced invalid, doubly-nested HTML on every
 * error caught by this boundary (any error thrown by app/layout.tsx
 * itself, or any error not caught by a more specific error.tsx further
 * down the tree).
 *
 * Renaming to `global-error.tsx` is the actual Next.js convention for
 * this: it's the only error boundary allowed (and required) to render
 * its own <html>/<body>, because it replaces the root layout entirely
 * when triggered. A sibling `app/error.tsx` now exists separately for
 * ordinary in-tree errors and intentionally does NOT render <html>/<body>.
 */
export default function GlobalError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // error.digest is included so this client-side report can be
    // correlated with any server-side log entry for the same error.
    reportClientError(error, { boundary: 'GlobalError', digest: error.digest });
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
        <span className="text-6xl">⚠️</span>
        <h1 className="text-2xl font-semibold">حدث خطأ غير متوقع</h1>
        {/* SEC-06: Show generic message only — never error.message (may contain internals) */}
        <p className="max-w-sm text-sm text-muted-foreground">
          يرجى المحاولة مرة أخرى. إذا استمر الخطأ، تواصل مع الدعم الفني.
        </p>
        {error.digest && (
          <code className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
            رمز الخطأ: {error.digest}
          </code>
        )}
        <Button onClick={reset}>حاول مجدداً</Button>
      </body>
    </html>
  );
}
