'use client';

import { Spinner } from '@/components/ui/spinner';

interface SessionRestorationStatusProps {
  message?: string;
}

/** Accessible status shown while the protected route waits for session restore. */
export function SessionRestorationStatus({
  message = 'جارٍ التحقق من الجلسة…',
}: SessionRestorationStatusProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-[60vh] min-h-[60dvh] flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <Spinner size="lg" className="text-primary" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
