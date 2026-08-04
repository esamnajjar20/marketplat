'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useResetPassword } from '@/hooks/mutations/useAuthMutations';
import { Button }    from '@/components/shared/ui/Button';
import { PasswordInput } from '@/components/shared/ui/PasswordInput';
import { FormField } from '@/components/shared/forms/FormField';
import { ROUTES } from '@/lib/constants';
import { toast } from 'sonner';
import { parseApiError } from '@/lib/errorParser';

interface Props { token: string; }

export function ResetPasswordForm({ token }: Props) {
  const router = useRouter();
  // AUDIT-FIX auth#3: was a hand-rolled useState/try-catch calling
  // authApi.resetPassword directly — same fix as ForgotPasswordForm,
  // see useForgotPassword's comment in useAuthMutations.ts.
  const { mutate: resetPassword, isPending } = useResetPassword();

  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [errors,    setErrors]    = useState<{ password?: string; confirm?: string }>({});
  // FIX M-1: the one real gap between client and backend validation here —
  // resetPasswordSchema caps newPassword at 100 chars (see auth.validation.ts),
  // which nothing on the client checks. A password over that length passes
  // the local validate() below and gets a 400 from the backend; without this,
  // it would only ever show as a generic toast with no field highlighted.
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | undefined>();

  // UX-FIX P2-12: there's no dedicated "verify reset token" endpoint on
  // the backend (only POST /auth/reset-password validates it, as part of
  // actually applying the new password — see auth.service.ts), so full
  // pre-validation would require a new backend route and is out of scope
  // here. The one thing the frontend CAN catch immediately, without any
  // extra request, is a token that's missing entirely — a common case
  // when an email client mangles or truncates the reset link — instead
  // of letting the user fill in and submit a full password form first
  // only to be told afterward that the link was never valid.
  const missingToken = !token;

  function fieldError(field: 'password' | 'confirm'): string | undefined {
    return errors[field] ?? serverErrors?.[field === 'password' ? 'newPassword' : field]?.[0];
  }

  function validate() {
    const e: typeof errors = {};
    if (!password)            e.password = 'كلمة المرور مطلوبة';
    else if (password.length < 8) e.password = 'كلمة المرور 8 أحرف على الأقل';
    if (!confirm)             e.confirm  = 'تأكيد كلمة المرور مطلوب';
    else if (confirm !== password) e.confirm = 'كلمتا المرور غير متطابقتين';
    setErrors(e);
    setServerErrors(undefined);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    resetPassword(
      { token, newPassword: password },
      {
        onSuccess: () => {
          toast.success('تم تغيير كلمة المرور بنجاح');
          router.push(ROUTES.login);
        },
        onError: (err) => {
          const parsed = parseApiError(err);
          setServerErrors(parsed.fieldErrors);
          toast.error(parsed.message);
        },
      },
    );
  }

  if (missingToken) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-destructive">
          رابط إعادة تعيين كلمة المرور غير صالح. يرجى طلب رابط جديد.
        </p>
        <Link href={ROUTES.forgotPassword} className="text-sm text-primary hover:underline">
          طلب رابط جديد
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <FormField label="كلمة المرور الجديدة" htmlFor="password" required error={fieldError('password')}
        hint="8 أحرف على الأقل">
        <PasswordInput id="password" dir="ltr" autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      </FormField>

      <FormField label="تأكيد كلمة المرور" htmlFor="confirm" required error={fieldError('confirm')}>
        <PasswordInput id="confirm" dir="ltr" autoComplete="new-password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" />
      </FormField>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'جارٍ الحفظ…' : 'تعيين كلمة المرور'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href={ROUTES.login} className="text-primary hover:underline">العودة لتسجيل الدخول</Link>
      </p>
    </form>
  );
}
