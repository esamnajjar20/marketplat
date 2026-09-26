'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/shared/ui/Button';
import { reportClientError, handleChunkLoadError, isOfflineChunkLoadError} from '@/lib/errorReporter';

interface AdminErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * AUDIT-FIX: (admin) had no segment-level error.tsx, unlike (protected)
 * and (public)/ads/[id]. A render-time throw anywhere under this group —
 * e.g. one of the large admin tables (AdminUsersTable, AdminReportsTable)
 * hitting a malformed row — had no local boundary to catch it and fell
 * through to the root error.tsx, dropping the admin out of the whole app
 * shell (losing AdminSidebar) instead of just the one broken page.
 *
 * Same pattern as (protected)/error.tsx: rendered inside
 * (admin)/layout.tsx, so AdminSidebar stays mounted and only the page
 * content area is replaced.
 *
 * SEC-06: same policy as every other error.tsx in this app —
 * error.message is never rendered (may carry stack traces, file paths,
 * or internal API details); only a generic Arabic message plus
 * error.digest as a support reference. Reported via reportClientError.
 */
export default function AdminError({ error, reset }: AdminErrorProps) {
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    // FIX CHUNK-LOAD-RECOVERY-01: see app/error.tsx.
    if (handleChunkLoadError(error)) {
      setRecovering(true);
      return;
    }
    // CHUNK-OFFLINE-NOREPORT-01: skip the report when this is

    // a chunk error on an offline device — no recovery is

    // possible and it spams the reporter on weak networks.

    if (!isOfflineChunkLoadError(error)) {

      reportClientError(error, { boundary: 'AdminError', digest: error.digest });

    }
  }, [error]);

  if (recovering) return null;

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="text-5xl">⚠️</span>
      <h2 className="text-xl font-semibold">حدث خطأ أثناء تحميل هذه الصفحة</h2>
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
    </div>
  );
}
