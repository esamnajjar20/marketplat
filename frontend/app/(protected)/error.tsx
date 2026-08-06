'use client';

import { useEffect } from 'react';
import { Button } from '@/components/shared/ui/Button';
import { reportClientError } from '@/lib/errorReporter';

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
  useEffect(() => {
    reportClientError(error, { boundary: 'ProtectedError', digest: error.digest });
  }, [error]);

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
