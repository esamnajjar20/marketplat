'use client';

import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';

interface SessionRestorationStatusProps {
  message?: string;
}

// FIX AUTH-SLOW-HINT-01: the session restore can take up to 15s on a slow link.
// After this delay show a hint + a manual reload so the user is never staring at
// an unexplained spinner.
const SLOW_HINT_AFTER_MS = 6_000;

/** Accessible status shown while the protected route waits for session restore. */
export function SessionRestorationStatus({
  message = 'جارٍ التحقق من الجلسة…',
}: SessionRestorationStatusProps) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_HINT_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-[60vh] min-h-[60dvh] flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <Spinner size="lg" className="text-primary" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {slow ? (
        <>
          <p className="text-xs text-muted-foreground">الاتصال أبطأ من المعتاد، جلستك محفوظة.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border px-3 py-2 text-sm"
          >
            إعادة تحميل الصفحة
          </button>
        </>
      ) : null}
    </div>
  );
}
