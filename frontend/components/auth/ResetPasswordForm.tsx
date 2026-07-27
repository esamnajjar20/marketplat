'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button }    from '@/components/shared/ui/Button';
import { Input }     from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { ROUTES } from '@/lib/constants';
import { authApi } from '@/api/auth.api';
import { toast } from 'sonner';
import { parseApiError } from '@/lib/errorParser';

interface Props { token: string; }

export function ResetPasswordForm({ token }: Props) {
  const router = useRouter();
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [errors,    setErrors]    = useState<{ password?: string; confirm?: string }>({});
  // FIX M-1: the one real gap between client and backend validation here —
  // resetPasswordSchema caps newPassword at 100 chars (see auth.validation.ts),
  // which nothing on the client checks. A password over that length passes
  // the local validate() below and gets a 400 from the backend; without this,
  // it would only ever show as a generic toast with no field highlighted.
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | undefined>();
  const [loading,   setLoading]   = useState(false);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await authApi.resetPassword({ token, newPassword: password });
      toast.success('تم تغيير كلمة المرور بنجاح');
      router.push(ROUTES.login);
    } catch (err) {
      const parsed = parseApiError(err);
      setServerErrors(parsed.fieldErrors);
      toast.error(parsed.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <FormField label="كلمة المرور الجديدة" htmlFor="password" required error={fieldError('password')}
        hint="8 أحرف على الأقل">
        <Input id="password" type="password" dir="ltr" autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      </FormField>

      <FormField label="تأكيد كلمة المرور" htmlFor="confirm" required error={fieldError('confirm')}>
        <Input id="confirm" type="password" dir="ltr" autoComplete="new-password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" />
      </FormField>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'جارٍ الحفظ…' : 'تعيين كلمة المرور'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href={ROUTES.login} className="text-primary hover:underline">العودة لتسجيل الدخول</Link>
      </p>
    </form>
  );
}
