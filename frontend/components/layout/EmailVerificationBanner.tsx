'use client';

/**
 * dismissible banner shown in the protected
 * layout to any user whose email is not yet verified. Three states
 * of the "resend" button are handled by the mutation's own isPending
 * flag (idle / sending / disable). Dismissal is per-session (state,
 * not storage) — a reload brings it back, so it can't be permanently
 * hidden by accident.
 *
 * Deliberately does NOT block any navigation or feature here — the
 * user can still browse while unverified. The backend gating commit
 * (if/when added) is what actually refuses specific actions.
 */

import { useState } from 'react';
import { MailWarning, X } from 'lucide-react';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { useResendVerification } from '@/hooks/mutations/useAuthMutations';
import { Button } from '@/components/shared/ui/Button';

export function EmailVerificationBanner() {
  const user = useAuthStore(selectUser);
  const [dismissed, setDismissed] = useState(false);
  const resend = useResendVerification();

  // Hide when: no user (guests), the field is explicitly true, or the
  // user dismissed it for this session.
  if (!user || user.emailVerified === true || dismissed) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/40 bg-warning-soft px-4 py-2.5 text-sm text-warning-strong dark:border-warning/50 dark:bg-warning/10 dark:text-warning"
    >
      <div className="flex min-w-0 items-center gap-2">
        <MailWarning className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">
          بريدك الإلكتروني غير مُفعَّل — يرجى تأكيده لتأمين حسابك.
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-7 border-warning bg-transparent text-warning-strong hover:bg-warning/10 dark:border-warning/60 dark:text-warning dark:hover:bg-warning/20"
          disabled={resend.isPending}
          onClick={() => resend.mutate()}
        >
          {resend.isPending ? 'جارٍ الإرسال…' : 'إعادة إرسال الرابط'}
        </Button>
        <button
          type="button"
          aria-label="إغلاق"
          className="rounded p-1 hover:bg-warning/10 dark:hover:bg-warning/20"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
