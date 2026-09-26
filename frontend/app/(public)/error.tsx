'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/shared/ui/Button';
import { reportClientError, handleChunkLoadError, isOfflineChunkLoadError} from '@/lib/errorReporter';
import { ROUTES } from '@/lib/constants';

interface PublicErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * SW-ERR-PUBLIC-BOUNDARY-01: (public) was the only route group without
 * its own segment-level error.tsx — (admin) and (protected) both have
 * one. A render-time throw anywhere under (public) that wasn't inside
 * one of the two routes that already ship a local boundary
 * (ads/[id]/error.tsx and products/[id]/error.tsx) fell through to the
 * root app/error.tsx, which replaces the whole shell — no PublicHeader,
 * no BottomNav, no way back into the app besides the browser's own
 * back button. This boundary catches everything else:
 *   /stores/[id], /services/[id], /requests/[id], /requests (index),
 *   /sellers/[id], /service-providers/[id], /search, /offline,
 *   /categories/[slug], and every other (public) route.
 *
 * The two existing per-route boundaries keep priority — Next.js
 * resolves the closest boundary first, so ads/[id]/error.tsx and
 * products/[id]/error.tsx are unchanged.
 *
 * Same SEC-06 policy as every other error.tsx in the app: error.message
 * is never rendered (may carry stack traces, file paths, or internal
 * API details). Only a generic Arabic message plus error.digest as a
 * support reference. Reported via reportClientError.
 *
 * ChunkLoadError handling (FIX CHUNK-LOAD-RECOVERY-01) is included for
 * the same reason it exists in the other boundaries: a stale cached
 * HTML document pointing at a rotated chunk hash is the single most
 * common cause of a route-level throw after a deploy, and a single
 * forced reload resolves it. handleChunkLoadError does the throttle
 * check internally.
 */
export default function PublicError({ error, reset }: PublicErrorProps) {
  const [recovering, setRecovering] = useState(false);

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
    if (handleChunkLoadError(error)) {
      setRecovering(true);
      return;
    }
    // CHUNK-OFFLINE-NOREPORT-01: skip the report when this is

    // a chunk error on an offline device — no recovery is

    // possible and it spams the reporter on weak networks.

    if (!isOfflineChunkLoadError(error)) {

      reportClientError(error, { boundary: 'PublicError', digest: error.digest });

    }
  }, [error]);

  if (recovering) return null;

  return (
    <div className="container mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <span className="text-5xl" aria-hidden>⚠️</span>
      <h2 className="text-xl font-semibold">حدث خطأ أثناء تحميل هذه الصفحة</h2>
      {/* SEC-06: Show generic message only — never error.message (may
          contain stack traces, file paths, or internal API details). */}
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
          <Link href={ROUTES.home}>العودة للرئيسية</Link>
        </Button>
      </div>
    </div>
  );
}
