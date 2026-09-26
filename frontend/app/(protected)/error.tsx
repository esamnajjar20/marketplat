'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/shared/ui/Button';
import { reportClientError, handleChunkLoadError, isChunkLoadError, isOfflineChunkLoadError} from '@/lib/errorReporter';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

interface ProtectedErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * AUDIT-FIX (5.10): (protected) had no segment-level error.tsx, unlike
 * (public)/ads/[id]/error.tsx and the root app/error.tsx. A render-time
 * throw anywhere under this group — e.g. service-requests/[id]/page.tsx
 * dereferencing request.listing.provider.sellerProfile.userId, or any
 * other protected page — had no local boundary to catch it and fell
 * through to the root error.tsx, losing ProtectedHeader/ProtectedSidebar
 * and dropping the user out of the whole app shell instead of just the
 * one broken page.
 *
 * Rendered inside (protected)/layout.tsx (Next.js only unmounts a
 * segment's own error up to its nearest ancestor layout, not past it),
 * so ProtectedHeader/ProtectedSidebar stay mounted and only the page
 * content area is replaced — same page-level-vs-app-shell distinction
 * AdDetailError draws relative to the root error.tsx.
 *
 * SEC-06: same policy as every other error.tsx in this app —
 * error.message is never rendered (may carry stack traces, file paths,
 * or internal API details); only a generic Arabic message plus
 * error.digest as a support reference. Reported via reportClientError.
 */
export default function ProtectedError({ error, reset }: ProtectedErrorProps) {
  const [recovering, setRecovering] = useState(false);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    // FIX CHUNK-LOAD-RECOVERY-01: see app/error.tsx for the full
    // rationale. Protected pages are where the failure surfaces most
    // often, because PERSONAL_SHELL_CACHE is what serves a stale HTML
    // document after every deploy.
    if (handleChunkLoadError(error)) {
      setRecovering(true);
      return;
    }
    // CHUNK-OFFLINE-NOREPORT-01: skip the report when this is

    // a chunk error on an offline device — no recovery is

    // possible and it spams the reporter on weak networks.

    if (!isOfflineChunkLoadError(error)) {

      reportClientError(error, { boundary: 'ProtectedError', digest: error.digest });

    }
  }, [error]);

  if (recovering) return null;

  // OFFLINE-ERROR-01: on Gaza's intermittent links the most common
  // cause of a route-level throw is a failed fetch, not a bug in the
  // page. React Query's suspense boundary surfaces the network error
  // as a thrown Error, and the previous generic "حدث خطأ" copy read
  // as "the app is broken" — misleading when the user simply has no
  // signal. Detect offline and show a network-specific message with a
  // reload action; reconnecting fires the browser 'online' event, but
  // the cleanest recovery is a full reload, which reissues both the
  // RSC payload and any in-flight query.
  if (!isOnline) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <span className="text-5xl" aria-hidden>📶</span>
        <h2 className="text-xl font-semibold">لا يتوفر اتصال بالإنترنت</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          تحقّق من اتصالك بالشبكة ثم حاول مجدداً. أي بيانات محفوظة محلياً
          ستبقى كما هي.
        </p>
        <Button onClick={() => window.location.reload()}>حاول مجدداً</Button>
      </div>
    );
  }

  const chunkFailed = isChunkLoadError(error);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="text-5xl">⚠️</span>
      <h2 className="text-xl font-semibold">حدث خطأ أثناء تحميل هذه الصفحة</h2>
      {/* SEC-06: Show generic message only — never error.message (may contain internals) */}
      <p className="max-w-sm text-sm text-muted-foreground">
        {chunkFailed
          ? 'تعذّر تحميل ملفات هذه الصفحة. تأكد من اتصالك بالإنترنت ثم أعد المحاولة.'
          : 'يرجى المحاولة مرة أخرى. إذا استمر الخطأ، تواصل مع الدعم الفني.'}
      </p>
      {error.digest && (
        <code className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
          رمز الخطأ: {error.digest}
        </code>
      )}
      {/* FIX CHUNK-OFFLINE-01: reset() only re-renders — it can keep hitting
          the same failed chunk. A full reload re-requests it. */}
      <Button onClick={chunkFailed ? () => window.location.reload() : reset}>
        حاول مجدداً
      </Button>
    </div>
  );
}
