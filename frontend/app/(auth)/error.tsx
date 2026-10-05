'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/shared/ui/Button';
import { reportClientError, handleChunkLoadError, isOfflineChunkLoadError } from '@/lib/errorReporter';
import { ROUTES } from '@/lib/constants';

interface AuthErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * (auth) was the last route group without its own segment-level
 * error.tsx. A render-time throw on /login, /register,
 * /forgot-password, /reset-password or /verify-email fell through to
 * the root app/error.tsx, which drops this group's PublicHeader.
 * This boundary keeps the header in place and offers a way back.
 *
 * Same policy as the sibling boundaries: error.message is never
 * rendered (SEC-06), only error.digest as a support reference. Offline
 * failures stay on this local error surface instead of forcibly navigating
 * the user away from the page they were using.
 */
export default function AuthError({ error, reset }: AuthErrorProps) {
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (handleChunkLoadError(error)) {
      setRecovering(true);
      return;
    }
    if (!isOfflineChunkLoadError(error)) {
      reportClientError(error, { boundary: 'AuthError', digest: error.digest });
    }
  }, [error]);

  if (recovering) return null;

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card p-8 text-center shadow-sm">
      <span className="text-5xl" aria-hidden>⚠️</span>
      <h2 className="text-xl font-semibold">حدث خطأ أثناء تحميل هذه الصفحة</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        يرجى المحاولة مرة أخرى. إذا استمر الخطأ، تواصل مع الدعم الفني.
      </p>
      {error.digest && (
        <code className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
          رمز الخطأ: {error.digest}
        </code>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>حاول مجدداً</Button>
        <Button variant="outline" asChild>
          <Link href={ROUTES.login}>صفحة تسجيل الدخول</Link>
        </Button>
      </div>
    </div>
  );
}
