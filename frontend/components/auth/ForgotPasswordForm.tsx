'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button }    from '@/components/shared/ui/Button';
import { Input }     from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { ROUTES } from '@/lib/constants';
import { authApi } from '@/api/auth.api';
import { toast } from 'sonner';
import { parseApiError } from '@/lib/errorParser';

export function ForgotPasswordForm() {
  const [email,   setEmail]   = useState('');
  const [error,   setError]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError('البريد الإلكتروني مطلوب'); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { setError('بريد إلكتروني غير صالح'); return; }
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword({ email: email.trim() });
      setSent(true);
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-success/10 flex items-center justify-center text-2xl text-success">✓</div>
        <h2 className="font-semibold text-lg">تحقق من بريدك الإلكتروني</h2>
        <p className="text-sm text-muted-foreground">
          أرسلنا رابط إعادة تعيين كلمة المرور إلى <span className="font-medium text-foreground">{email}</span>
        </p>
        <Link href={ROUTES.login} className="block text-sm text-primary hover:underline">
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

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'جارٍ الإرسال…' : 'إرسال رابط الاسترداد'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href={ROUTES.login} className="text-primary hover:underline">العودة لتسجيل الدخول</Link>
      </p>
    </form>
  );
}
