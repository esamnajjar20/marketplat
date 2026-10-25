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
      <h1 className="text-[24px] font-extrabold tracking-tight text-[#1F4D33]">تأكيد البريد الإلكتروني</h1>

      {state.kind === 'idle' && (
        <div className="w-full space-y-4 rounded-2xl border border-[#EAE3D6] bg-white p-6 text-center shadow-[0_1px_3px_rgba(42,36,29,0.06)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F1EC] text-[#397F56]">
            <Mail className="h-6 w-6" aria-hidden />
          </div>
          <p className="text-[13px] leading-relaxed text-[#6B6459]">
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

          <Button asChild variant="outline" className="h-12 w-full gap-2 rounded-2xl border-[#EAE3D6] font-bold">
            <a href={`${API_BASE_URL}/auth/google?purpose=verify`}>
              <GoogleIcon />
              تأكيد بريدي عبر Google
            </a>
          </Button>
        </div>
      )}

      {state.kind === 'verifying' && (
        <div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-[#EAE3D6] bg-white p-8 shadow-[0_1px_3px_rgba(42,36,29,0.06)]">
          <LoadingSpinner />
          <p className="text-[13px] text-[#6B6459]">جارٍ تأكيد بريدك الإلكتروني...</p>
        </div>
      )}

      {state.kind === 'success' && (
        <div className="w-full space-y-4 rounded-2xl border border-[#EAE3D6] bg-white p-6 text-center shadow-[0_1px_3px_rgba(42,36,29,0.06)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F1EC] text-[#397F56]">
            <CheckCircle2 className="h-7 w-7" aria-hidden />
          </div>
          <p className="text-[18px] font-extrabold text-[#2A241D]">تم تأكيد بريدك الإلكتروني بنجاح</p>
          <p className="text-[13px] text-[#6B6459]">يمكنك الآن استخدام جميع ميزات سوق غزة.</p>
          <Button asChild className="h-12 w-full rounded-2xl text-[15px] font-bold">
            <Link href={ROUTES.home}>الذهاب إلى الصفحة الرئيسية</Link>
          </Button>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="w-full space-y-4 rounded-2xl border border-[#F1C9C4] bg-white p-6 text-center shadow-[0_1px_3px_rgba(42,36,29,0.06)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FBE9E7] text-[#9B2118]">
            <XCircle className="h-7 w-7" aria-hidden />
          </div>
          <p className="text-[14px] font-bold text-[#9B2118]">{state.message}</p>
          <p className="text-[12px] text-[#6B6459]">
            قد يكون الرابط منتهي الصلاحية. يمكنك طلب رابط جديد من صفحة الملف الشخصي.
          </p>
          <Button asChild variant="outline" className="h-11 w-full rounded-2xl border-[#EAE3D6] font-bold">
            <Link href={ROUTES.home}>العودة للرئيسية</Link>
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
