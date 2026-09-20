'use client';

/**
 * FIX FEAT-EMAIL-VERIFY: dismissible banner shown in the protected
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
      className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
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
          className="h-7 border-amber-400 bg-transparent text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-100 dark:hover:bg-amber-900/40"
          disabled={resend.isPending}
          onClick={() => resend.mutate()}
        >
          {resend.isPending ? 'جارٍ الإرسال…' : 'إعادة إرسال الرابط'}
        </Button>
        <button
          type="button"
          aria-label="إغلاق"
          className="rounded p-1 hover:bg-amber-100 dark:hover:bg-amber-900/40"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
