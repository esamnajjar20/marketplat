'use client';

import { Spinner } from '@/components/ui/spinner';

interface SessionRestoreStalledProps {
  retrying: boolean;
  onRetry: () => void;
  onLogin: () => void;
}

/**
 * Shown when the session could not be verified because the server did not
 * answer in time (slow link / cold backend). The user is NOT logged out.
 */
export function SessionRestoreStalled({ retrying, onRetry, onLogin }: SessionRestoreStalledProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60vh] min-h-[60dvh] flex-col items-center justify-center gap-4 p-6 text-center"
    >
      {retrying ? <Spinner size="lg" className="text-primary" /> : null}
      <p className="text-sm text-muted-foreground">
        الخادم بطيء حالياً. جلستك ما زالت محفوظة، ونحاول إعادة الاتصال تلقائياً.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
        >
          إعادة المحاولة
        </button>
        <button type="button" onClick={onLogin} className="rounded-md border px-4 py-2 text-sm">
          تسجيل الدخول
        </button>
      </div>
    </div>
  );
}
