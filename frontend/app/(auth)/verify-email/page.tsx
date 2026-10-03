'use client';

/**
 * FIX FEAT-EMAIL-VERIFY: landing page for the confirmation link in
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
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Mail, XCircle } from 'lucide-react';
import { authApi } from '@/api/auth.api';
import { ROUTES } from '@/lib/constants';
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
      <h1 className="text-2xl font-bold tracking-tight">تأكيد البريد الإلكتروني</h1>

      {state.kind === 'idle' && (
        <div className="w-full space-y-4 rounded-xl border bg-card p-6 text-center shadow-sm">
          <Mail className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
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

          <Button asChild variant="outline" className="h-12 w-full gap-2 rounded-xl">
            <a href={`${API_BASE_URL}/auth/google?purpose=verify`}>
              <GoogleIcon />
              تأكيد بريدي عبر Google
            </a>
          </Button>
        </div>
      )}

      {state.kind === 'verifying' && (
        <div className="flex w-full flex-col items-center gap-3 rounded-xl border bg-card p-6 shadow-sm">
          <LoadingSpinner />
          <p className="text-sm text-muted-foreground">جارٍ تأكيد بريدك الإلكتروني…</p>
        </div>
      )}

      {state.kind === 'success' && (
        <div className="w-full space-y-4 rounded-xl border bg-card p-6 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />
          <p className="text-lg font-semibold">تم تأكيد بريدك الإلكتروني بنجاح</p>
          <p className="text-sm text-muted-foreground">
            يمكنك الآن استخدام جميع ميزات سوق غزة.
          </p>
          <Button asChild className="w-full">
            <Link href={ROUTES.home}>الذهاب إلى الصفحة الرئيسية</Link>
          </Button>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="w-full space-y-4 rounded-xl border border-destructive/30 bg-card p-6 text-center shadow-sm">
          <XCircle className="mx-auto h-12 w-12 text-destructive" aria-hidden />
          <p className="text-sm text-destructive">{state.message}</p>
          <p className="text-xs text-muted-foreground">
            قد يكون الرابط منتهي الصلاحية. يمكنك طلب رابط جديد من صفحة الملف الشخصي.
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link href={ROUTES.home}>العودة للرئيسية</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
      <VerifyEmailInner />
    </Suspense>
  );
}
