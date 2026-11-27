'use client';

import { useEffect, useState } from 'react';
import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { useSearchParams } from 'next/navigation';
import { Mail, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useLogin } from '@/hooks/mutations/useAuthMutations';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { PasswordInput } from '@/components/shared/ui/PasswordInput';
import { AuthField } from '@/components/auth/AuthField';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
import { AuthDivider } from '@/components/auth/AuthDivider';
import { ROUTES } from '@/lib/constants';
import { getSafeRedirectPath } from '@/lib/cookies';
import { getErrorMessage } from '@/lib/i18n/ar';
import { loginFormSchema } from '@marketplat/contracts';

// Backend codes googleCallback can attach to the failure redirect that have a
// message worth showing on the login page (see lib/i18n/ar/errors.ts).
const GOOGLE_FAILURE_CODES: ReadonlySet<string> = new Set([
  'OAUTH_EMAIL_ALREADY_REGISTERED',
  'GOOGLE_ALREADY_LINKED_ELSEWHERE',
  'ACCOUNT_DEACTIVATED',
]);

export function LoginForm() {
  const searchParams = useSearchParams();
  const { mutate: login, isPending } = useLogin();

  // Account deletion is a terminal OAuth callback and returns to the login
  // page (the profile settings component is no longer mounted there). Consume
  // the one-shot query flag here so the owner receives confirmation exactly
  // once and the message is not repeated on refresh.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('account') !== 'deleted') return;
    toast.success('تم حذف الحساب وتسجيل الخروج من جميع الأجهزة.');
    url.searchParams.delete('account');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

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

  // FIX LOGIN-GOOGLE-CODE-01: googleCallback also appends `&code=<AppError
  // code>` precisely so this page can say WHY it failed — the key case is
  // OAUTH_EMAIL_ALREADY_REGISTERED (the email already belongs to a
  // password account, so the user must sign in with the password first).
  // This form used to ignore `code` and always show the generic line, which
  // left that user with no clue what to do. The value comes from the URL,
  // so it is only ever used as a lookup key into a static allow-list and
  // never rendered itself — an unknown/forged code falls back to the
  // generic message.
  const googleErrorCode = searchParams.get('code');
  const googleErrorMessage =
    googleAuthFailed && googleErrorCode && GOOGLE_FAILURE_CODES.has(googleErrorCode)
      ? getErrorMessage(googleErrorCode)
      : undefined;

  // AUDIT-FIX auth#1: carried through to "إنشاء حساب" below so a visitor
  // who arrived here via /login?from=X and has no account yet doesn't
  // lose that destination when bouncing to /register — RegisterForm
  // reads this the same way LoginForm reads its own `from`.
  const from = getSafeRedirectPath(searchParams.get('from'), '');
  // Do not propagate an external/protocol-relative return URL into the
  // registration flow. Safe same-origin paths still survive login → register.
  const registerHref = from ? `${ROUTES.register}?from=${encodeURIComponent(from)}` : ROUTES.register;

  function validate() {
    const result = loginFormSchema.safeParse({ email, password });
    const e: typeof errors = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (field === 'email' || field === 'password') e[field] ??= issue.message;
      }
    }
    // Login deliberately checks only a non-empty password; historical passwords are not re-strengthened.
    setErrors(e);
    // Move focus to the first invalid field so keyboard and screen-reader
    // users immediately know where to correct the form.
    const firstInvalidField = e.email ? 'email' : e.password ? 'password' : null;
    if (firstInvalidField) {
      document.getElementById(firstInvalidField)?.focus();
    }
    return Object.keys(e).length === 0;
  }

  // UX-FIX: submit button stays disabled while either required field is
  // empty, so a user can't tap "تسجيل الدخول" on a blank form. This is
  // purely a client-side emptiness check — it does not duplicate or
  // replace validate()'s email-format check, and does not touch the
  // FIX M-1 decision below about not guessing at wrong-credential
  // messaging; a 401 for a syntactically valid but wrong email/password
  // pair still surfaces the same way once the button is enabled.
  const isFormIncomplete = !email.trim() || !password;

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
    if (isPending || !validate()) return;
    // FIX AUTH-06: getSafeRedirectPath was built and unit-tested but never
    // actually called — login always landed on /dashboard, ignoring the
    // ?from= target middleware.ts attaches when redirecting an
    // unauthenticated user away from a protected page.
    const redirectTo = getSafeRedirectPath(searchParams.get('from'), ROUTES.dashboard);
    login({ email: email.trim(), password, redirectTo });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {sessionExpired && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-sm-tight leading-relaxed text-warning-strong"
        >
          <span aria-hidden>⚠</span>
          انتهت جلستك، الرجاء تسجيل الدخول مجددًا للمتابعة
        </p>
      )}
      {googleAuthFailed && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive-soft px-3.5 py-2.5 text-sm-tight leading-relaxed text-destructive"
        >
          <span aria-hidden>⚠</span>
          {googleErrorMessage ??
            'تعذّر تسجيل الدخول باستخدام Google، الرجاء المحاولة مرة أخرى أو استخدام البريد الإلكتروني'}
        </p>
      )}

      <AuthField label="البريد الإلكتروني" htmlFor="email" icon={Mail} required error={errors.email}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            const value = e.target.value;
            setEmail(value);
            setErrors((current) => {
              if (!current.email) return current;
              const next = { ...current };
              delete next.email;
              return next;
            });
          }}
          placeholder="example@email.com"
          dir="ltr"
        />
      </AuthField>

      <AuthField label="كلمة المرور" htmlFor="password" icon={Lock} iconOnLeft required error={errors.password}>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            const value = e.target.value;
            setPassword(value);
            setErrors((current) => {
              if (!current.password) return current;
              const next = { ...current };
              delete next.password;
              return next;
            });
          }}
          placeholder="••••••••"
          dir="ltr"
        />
      </AuthField>

      <div className="flex justify-end">
        <IntentPrefetchLink href={ROUTES.forgotPassword} className="text-sm-tight font-bold text-primary hover:underline" prefetch={false}>
          نسيت كلمة المرور؟
        </IntentPrefetchLink>
      </div>

      {/* FIX BUG-XX: this block duplicated useLogin's onError toast —
          both showed the exact same mapped error message at once.
          RegisterForm's identical flow relies on its mutation's toast
          alone with no inline block; removed here to match, since the
          toast (not this block) is the pattern used by every other
          mutation in the app (see useAuthMutations.ts). */}

      <Button
        type="submit"
        size="lg"
        className={`h-12 w-full rounded-2xl text-card-title font-bold ${isFormIncomplete ? 'opacity-60' : ''}`}
        aria-disabled={isFormIncomplete || isPending}
        disabled={isFormIncomplete || isPending}
        loading={isPending}
        loadingText="جارٍ الدخول..."
      >
        تسجيل الدخول
      </Button>
      {isFormIncomplete && !isPending && (
        <p className="text-center text-xs text-muted-foreground">أدخل البريد وكلمة المرور للمتابعة</p>
      )}

      <AuthDivider />

      <GoogleAuthButton label="تسجيل الدخول باستخدام Google" />

      <p className="text-center text-sm-tight text-muted-foreground">
        ليس لديك حساب؟{' '}
        <IntentPrefetchLink href={registerHref} className="font-bold text-primary hover:underline" prefetch={false}>
          إنشاء حساب
        </IntentPrefetchLink>
      </p>
    </form>
  );
}
