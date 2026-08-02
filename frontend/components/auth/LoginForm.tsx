'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLogin } from '@/hooks/mutations/useAuthMutations';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
import { ROUTES } from '@/lib/constants';
import { getSafeRedirectPath } from '@/lib/cookies';
import { parseApiError } from '@/lib/errorParser';

export function LoginForm() {
  const searchParams = useSearchParams();
  const { mutate: login, isPending, error } = useLogin();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors]     = useState<{ email?: string; password?: string }>({});

  // UX-FIX P0-2: client.ts's response interceptor appends
  // ?reason=session_expired when it force-redirects here after a failed
  // silent refresh, so a user who was actively signed in and got kicked
  // out sees why, instead of landing on an ordinary-looking login form.
  const sessionExpired = searchParams.get('reason') === 'session_expired';

  // FIX OAUTH-01: auth.routes.ts's /auth/google/failure and
  // auth.controller.ts's googleCallback catch-block both redirect back
  // here with this exact query param on any Google sign-in failure
  // (denied consent, no email on the Google account, a deactivated
  // account, etc.) — same "explain via query param" pattern as
  // sessionExpired above.
  const googleAuthFailed = searchParams.get('error') === 'google_auth_failed';

  function validate() {
    const e: typeof errors = {};
    if (!email.trim())    e.email    = 'البريد الإلكتروني مطلوب';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'بريد إلكتروني غير صالح';
    // FIX V-01: backend loginSchema only requires a non-empty password
    // (it's an existing-account login, not a strength check) — a client
    // min(6) here could reject a legitimate, older, shorter password
    // with a confusing client-only error before it even reaches the server.
    if (!password)        e.password = 'كلمة المرور مطلوبة';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // NOTE (FIX M-1 scope decision): unlike RegisterForm/AdForm, this form
  // deliberately does NOT wire up parseApiError's fieldErrors. A wrong
  // email/password combination is a 401 (UnauthorizedError, see
  // auth.service.ts's login()), not a 400 — parseApiError only attaches
  // fieldErrors on 400 by design, and correctly so here: an invalid-
  // credentials rejection isn't a per-field validation error to point at
  // one input, and 401's message is intentionally a fixed, generic string
  // regardless of the real reason, to avoid leaking whether the email or
  // the password was the wrong part (a standard login-form protection).
  // The one real 400 case (malformed email per loginSchema's z.string().email())
  // is already caught by the client-side check above before any request is
  // sent, so there is no real gap here for the backend's field-level
  // `errors` to fill.

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    // FIX AUTH-06: getSafeRedirectPath was built and unit-tested but never
    // actually called — login always landed on /dashboard, ignoring the
    // ?from= target middleware.ts attaches when redirecting an
    // unauthenticated user away from a protected page.
    const redirectTo = getSafeRedirectPath(searchParams.get('from'), ROUTES.dashboard);
    login({ email: email.trim(), password, redirectTo });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {sessionExpired && (
        <p role="alert" className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-center">
          انتهت جلستك، الرجاء تسجيل الدخول مجددًا للمتابعة
        </p>
      )}

      {googleAuthFailed && (
        <p role="alert" className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2 text-center">
          تعذّر تسجيل الدخول باستخدام Google، الرجاء المحاولة مرة أخرى أو استخدام البريد الإلكتروني
        </p>
      )}

      <FormField label="البريد الإلكتروني" htmlFor="email" required error={errors.email}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="example@email.com"
          dir="ltr"
        />
      </FormField>

      <FormField label="كلمة المرور" htmlFor="password" required error={errors.password}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          dir="ltr"
        />
      </FormField>

      <div className="flex justify-end">
        <Link href={ROUTES.forgotPassword} className="text-sm text-primary hover:underline">
          نسيت كلمة المرور؟
        </Link>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive text-center">
          {/* FIX FRIENDLY-01: error here is the raw mutation error object —
              error.message is the underlying Axios/JS message ("Request
              failed with status code 401", "Network Error", ...), never
              meant to reach the user (see app/error.tsx's SEC-06 rule,
              which this line previously violated). parseApiError() maps it
              to the same Arabic message the toast in useLogin's onError
              already shows. */}
          {parseApiError(error).message}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'جارٍ الدخول…' : 'تسجيل الدخول'}
      </Button>

      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-card px-2 text-muted-foreground">أو</span>
        </div>
      </div>

      <GoogleAuthButton label="تسجيل الدخول باستخدام Google" />

      <p className="text-center text-sm text-muted-foreground">
        ليس لديك حساب؟{' '}
        <Link href={ROUTES.register} className="text-primary hover:underline font-medium">
          إنشاء حساب
        </Link>
      </p>
    </form>
  );
}
