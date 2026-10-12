'use client';

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
      <div aria-hidden="true" className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent motion-reduce:animate-none" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
