'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLogin } from '@/hooks/mutations/useAuthMutations';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { ROUTES } from '@/lib/constants';
import { getSafeRedirectPath } from '@/lib/cookies';

export function LoginForm() {
  const searchParams = useSearchParams();
  const { mutate: login, isPending, error } = useLogin();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors]     = useState<{ email?: string; password?: string }>({});

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
          {error.message || 'البريد الإلكتروني أو كلمة المرور غير صحيحة'}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'جارٍ الدخول…' : 'تسجيل الدخول'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        ليس لديك حساب؟{' '}
        <Link href={ROUTES.register} className="text-primary hover:underline font-medium">
          إنشاء حساب
        </Link>
      </p>
    </form>
  );
}
