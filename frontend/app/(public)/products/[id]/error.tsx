'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { ROUTES } from '@/lib/constants';
import { reportClientError, isOfflineChunkLoadError} from '@/lib/errorReporter';

/**
 * FIX PRODUCT-ERR-LOG-01: this was the only route-level error.tsx in the
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
    // OFFLINE-REDIRECT-01: an offline ChunkLoadError means there is no
    // cached shell to serve and no network to fetch one. The generic
    // "حدث خطأ غير متوقع" UI is wrong here — /offline exists exactly
    // for this situation. Redirect instead of showing an error the
    // user can't act on.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      window.location.replace('/offline');
    }
  }, []);

useEffect(() => {
    // Mobile remote-inspect consoles often render an Error object as an
    // empty `TypeError {}` (message/stack are non-enumerable, so the
    // collapsed view shows nothing) — log them as plain strings too so
    // they're visible without needing to expand the object.
    // eslint-disable-next-line no-console
    console.error('[ProductDetailError] message:', error.message, '| stack:', error.stack);
    // CHUNK-OFFLINE-NOREPORT-01: skip the report when this is

    // a chunk error on an offline device — no recovery is

    // possible and it spams the reporter on weak networks.

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
