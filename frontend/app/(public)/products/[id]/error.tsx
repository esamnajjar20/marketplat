'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { ROUTES } from '@/lib/constants';
import { reportClientError, isOfflineChunkLoadError} from '@/lib/errorReporter';

/**
 * this was the only route-level error.tsx in the
 * app that didn't call reportClientError (didn't even destructure `error`)
 * — every sibling boundary (ads/[id]/error.tsx, root error.tsx,
 * (admin)/error.tsx, (protected)/error.tsx) does. Any real render crash
 * on the product page was caught and fully swallowed: nothing in the
 * console, nothing sent anywhere. Brought in line with ads/[id]/error.tsx.
 */
export default function ProductDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {

useEffect(() => {
    // Mobile remote-inspect consoles often render an Error object as an
    // empty `TypeError {}` (message/stack are non-enumerable, so the
    // collapsed view shows nothing) — log them as plain strings too so
    // they're visible without needing to expand the object.
    // eslint-disable-next-line no-console
    console.error('[ProductDetailError] message:', error.message, '| stack:', error.stack);
    if (!isOfflineChunkLoadError(error)) {

      reportClientError(error, { boundary: 'ProductDetailError', digest: error.digest });

    }
  }, [error]);

  return (
    <div className="container mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-16 text-center">
      <AlertTriangle className="h-10 w-10 text-muted-foreground" />
      <h1 className="text-lg font-semibold">حدث خطأ أثناء عرض المنتج</h1>
      {/* DEBUG: عرض الخطأ الحقيقي مؤقتاً */}
      <pre
        dir="ltr"
        className="w-full overflow-auto rounded bg-destructive/10 p-3 text-left text-xs text-destructive"
      >
        {error.message}
        {'\n\n'}
        {(error.stack || '').split('\n').slice(0, 6).join('\n')}
      </pre>
      {error.digest && (
        <code className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
          رمز الخطأ: {error.digest}
        </code>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={reset}>
          إعادة المحاولة
        </Button>
        <Button asChild>
          <Link href={ROUTES.home}>الرئيسية</Link>
        </Button>
      </div>
    </div>
  );
}
