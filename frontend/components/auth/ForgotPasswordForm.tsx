'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForgotPassword } from '@/hooks/mutations/useAuthMutations';
import { Button }    from '@/components/shared/ui/Button';
import { Input }     from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { ROUTES } from '@/lib/constants';
import { toast } from 'sonner';
import { parseApiError } from '@/lib/errorParser';

export function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  // AUDIT-FIX auth#1 (propagation): keeps `from` alive on the
  // "العودة لتسجيل الدخول" links below in case a visitor detoured
  // through here from /login?from=X — same reasoning as LoginForm's
  // own registerHref.
  const from = searchParams.get('from');
  const loginHref = from ? `${ROUTES.login}?from=${encodeURIComponent(from)}` : ROUTES.login;

  // AUDIT-FIX auth#3: was a hand-rolled useState/try-catch calling
  // authApi.forgotPassword directly — the one form in this group of 4
  // not using React Query like useLogin/useRegister already do.
  const { mutate: forgotPassword, isPending } = useForgotPassword();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent,  setSent]  = useState(false);

  // UX-FIX: single-field form, so this is just an emptiness check —
  // the email-format check in handleSubmit below still runs on actual
  // submit and still owns setting `error`.
  const isFormIncomplete = !email.trim();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError('البريد الإلكتروني مطلوب'); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { setError('بريد إلكتروني غير صالح'); return; }
    setError('');
    forgotPassword(
      { email: email.trim() },
      {
        onSuccess: () => setSent(true),
        // AUDIT-FIX auth#4: previously toast-only — unlike LoginForm/
        // RegisterForm/ResetPasswordForm, which all also set a
        // persistent on-page error. A toast disappears after a few
        // seconds; this form is a single field with nothing else to
        // fall back on for someone who glances back a moment later, so
        // it now matches the other three forms in this group instead
        // of being the one silent exception.
        onError: (err) => {
          setError(parseApiError(err).message);
          toast.error(parseApiError(err).message);
        },
      },
    );
  }

  if (sent) {
    return (
      <div className="text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-success/10 flex items-center justify-center text-2xl text-success">✓</div>
        <h2 className="font-semibold text-lg">تحقق من بريدك الإلكتروني</h2>
        <p className="text-sm text-muted-foreground">
          أرسلنا رابط إعادة تعيين كلمة المرور إلى <span className="font-medium text-foreground">{email}</span>
        </p>
        <Link href={loginHref} className="block text-sm text-primary hover:underline">
          العودة لتسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <p className="text-sm text-muted-foreground">
        أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.
      </p>

      <FormField label="البريد الإلكتروني" htmlFor="email" required error={error}>
        <Input id="email" type="email" dir="ltr" autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="example@email.com" />
      </FormField>

      <Button type="submit" className="w-full" disabled={isFormIncomplete || isPending}>
        {isPending ? 'جارٍ الإرسال…' : 'إرسال رابط الاسترداد'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href={loginHref} className="text-primary hover:underline">العودة لتسجيل الدخول</Link>
      </p>
    </form>
  );
}
