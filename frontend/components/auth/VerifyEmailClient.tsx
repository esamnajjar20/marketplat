'use client';

/**
 * landing page for the confirmation link in
 * the signup email. The backend redirects nothing — the URL inside
 * the email points directly here (`/verify-email?token=...`), and
 * this page calls POST /auth/verify-email with that token. Three
 * possible states:
 *
 *   - no token → user opened the page manually; show a "check your
 *     inbox" message rather than firing an empty request.
 *   - verifying → spinner; the POST is in flight.
 *   - success / error → resolved card with either a green check or
 *     a red error and a resend action where applicable.
 *
 * useSearchParams requires a Suspense boundary in Next 15 — the
 * wrapper below provides one, keeping the Suspense requirement out
 * of the page component itself.
 */

import { Suspense, useEffect, useRef, useState } from 'react';
import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Mail, XCircle } from 'lucide-react';
import { authApi } from '@/api/auth.api';
import { ROUTES, APP_NAME } from '@/lib/constants';
import { parseApiError } from '@/lib/errorParser';
import { Button } from '@/components/shared/ui/Button';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { GoogleIcon } from '@/components/auth/GoogleAuthButton';
import { API_BASE_URL } from '@/lib/constants';

type State =
  | { kind: 'idle' }            // no token in URL
  | { kind: 'verifying' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

function VerifyEmailInner() {
  const sp = useSearchParams();
  const token = sp.get('token');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const firedRef = useRef(false);

  useEffect(() => {
    if (!token || firedRef.current) return;
    firedRef.current = true;
    setState({ kind: 'verifying' });

    authApi
      .verifyEmail({ token })
      .then(() => setState({ kind: 'success' }))
      .catch((err) => {
        setState({ kind: 'error', message: parseApiError(err).message });
      });
  }, [token]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-10">
      <h1 className="text-[24px] font-extrabold tracking-tight text-[var(--legacy-primary-deep)]">تأكيد البريد الإلكتروني</h1>

      {state.kind === 'idle' && (
        <div className="w-full space-y-4 rounded-2xl border border-[var(--legacy-border)] bg-card p-6 text-center shadow-[0_1px_3px_rgba(42,36,29,0.06)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--legacy-primary-soft)] text-[var(--legacy-primary)]">
            <Mail className="h-6 w-6" aria-hidden />
          </div>
          <p className="text-sm-tight leading-relaxed text-[var(--legacy-muted-text)]">
            افتح الرابط الذي أرسلناه إلى بريدك الإلكتروني لتأكيد الحساب.
          </p>

          {/* FEAT-GOOGLE-VERIFY-RESET: alternative verification path
              that does not depend on outbound email. Goes to the same
              Google OAuth flow as the sign-in button, but with
              ?purpose=verify — the backend's googleCallback marks the
              account verified and redirects back to /dashboard without
              issuing a session. Uses a plain <a> (not Button onClick)
              because the OAuth round trip must be a real top-level
              navigation so the browser follows Google's redirect chain
              and returns with any cookies the backend sets — same
              reasoning as GoogleAuthButton's own comment. */}
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 text-muted-foreground">أو</span>
            </div>
          </div>

          <Button asChild variant="outline" className="h-12 w-full gap-2 rounded-2xl border-[var(--legacy-border)] font-bold">
            <a href={`${API_BASE_URL}/auth/google?purpose=verify`}>
              <GoogleIcon />
              تأكيد بريدي عبر Google
            </a>
          </Button>
        </div>
      )}

      {state.kind === 'verifying' && (
        <div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-[var(--legacy-border)] bg-card p-8 shadow-[0_1px_3px_rgba(42,36,29,0.06)]">
          <LoadingSpinner />
          <p className="text-sm-tight text-[var(--legacy-muted-text)]">جارٍ تأكيد بريدك الإلكتروني...</p>
        </div>
      )}

      {state.kind === 'success' && (
        <div className="w-full space-y-4 rounded-2xl border border-[var(--legacy-border)] bg-card p-6 text-center shadow-[0_1px_3px_rgba(42,36,29,0.06)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--legacy-primary-soft)] text-[var(--legacy-primary)]">
            <CheckCircle2 className="h-7 w-7" aria-hidden />
          </div>
          <p className="text-[18px] font-extrabold text-[var(--legacy-ink)]">تم تأكيد بريدك الإلكتروني بنجاح</p>
          <p className="text-sm-tight text-[var(--legacy-muted-text)]">يمكنك الآن استخدام جميع ميزات {APP_NAME}.</p>
          <Button asChild className="h-12 w-full rounded-2xl text-card-title font-bold">
            <IntentPrefetchLink href={ROUTES.home} prefetch={false}>الذهاب إلى الصفحة الرئيسية</IntentPrefetchLink>
          </Button>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="w-full space-y-4 rounded-2xl border border-[var(--legacy-danger-border)] bg-card p-6 text-center shadow-[0_1px_3px_rgba(42,36,29,0.06)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--legacy-danger-soft)] text-[var(--legacy-danger)]">
            <XCircle className="h-7 w-7" aria-hidden />
          </div>
          <p className="text-sm font-bold text-[var(--legacy-danger)]">{state.message}</p>
          <p className="text-xs text-[var(--legacy-muted-text)]">
            قد يكون الرابط منتهي الصلاحية. يمكنك طلب رابط جديد من صفحة الملف الشخصي.
          </p>
          <Button asChild variant="outline" className="h-11 w-full rounded-2xl border-[var(--legacy-border)] font-bold">
            <IntentPrefetchLink href={ROUTES.home} prefetch={false}>العودة للرئيسية</IntentPrefetchLink>
          </Button>
        </div>
      )}
    </div>
  );
}

export function VerifyEmailClient() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
      <VerifyEmailInner />
    </Suspense>
  );
}
