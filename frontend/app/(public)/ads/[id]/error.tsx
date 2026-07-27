'use client';

import { useEffect } from 'react';
import { Button } from '@/components/shared/ui/Button';
import { reportClientError } from '@/lib/errorReporter';

interface AdErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * FIX AUDIT-V5-02: previously rendered raw `error.message` directly to
 * the user, in English, on an otherwise fully Arabic/RTL site. This
 * contradicted the same SEC-06 policy already documented and applied in
 * app/error.tsx — error.message can carry stack traces, file paths, or
 * internal API details and should never reach the browser. Brought in
 * line with the rest of the app: Arabic copy, generic message only, and
 * the error is now reported via reportClientError instead of being
 * silently dropped.
 */
export default function AdDetailError({ error, reset }: AdErrorProps) {
  useEffect(() => {
    reportClientError(error, { boundary: 'AdDetailError', digest: error.digest });
  }, [error]);

  return (
    <div className="container mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
      <h2 className="text-xl font-semibold">تعذّر تحميل الإعلان</h2>
      {/* SEC-06: Show generic message only — never error.message (may contain internals) */}
      <p className="text-sm text-muted-foreground">
        حدث خطأ أثناء تحميل بيانات الإعلان. يرجى المحاولة مرة أخرى.
      </p>
      {error.digest && (
        <code className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
          رمز الخطأ: {error.digest}
        </code>
      )}
      <Button onClick={reset}>حاول مجدداً</Button>
    </div>
  );
}

