'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRegister } from '@/hooks/mutations/useAuthMutations';
import { parseApiError } from '@/lib/errorParser';
import { Button }    from '@/components/shared/ui/Button';
import { Input }     from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { ROUTES, CITIES } from '@/lib/constants';

interface Errors {
  name?: string; email?: string; password?: string; phone?: string;
}

export function RegisterForm() {
  const { mutate: register, isPending } = useRegister();

  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [phone,    setPhone]    = useState('');
  const [city,     setCity]     = useState('');
  const [errors,   setErrors]   = useState<Errors>({});
  // FIX M-1: field-level errors from the backend (e.g. 409 email-taken,
  // or a Zod validation edge case the client-side checks below don't
  // catch, like a backend-side uniqueness or format rule).
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | undefined>();

  function fieldError(field: keyof Errors): string | undefined {
    return errors[field] ?? serverErrors?.[field]?.[0];
  }

  function validate() {
    const e: Errors = {};
    if (!name.trim())            e.name = 'الاسم الكامل مطلوب';
    else if (name.trim().length < 2) e.name = 'الاسم يجب أن يكون حرفين على الأقل';
    if (!email.trim())   e.email    = 'البريد الإلكتروني مطلوب';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'بريد إلكتروني غير صالح';
    if (!password)       e.password = 'كلمة المرور مطلوبة';
    else if (password.length < 8) e.password = 'كلمة المرور 8 أحرف على الأقل';
    if (phone && !/^[0-9+]{9,15}$/.test(phone)) e.phone = 'رقم هاتف غير صالح';
    setErrors(e);
    setServerErrors(undefined);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    register(
      { name: name.trim(), email: email.trim(), password, phone: phone || undefined, city: city || undefined },
      { onError: (err) => setServerErrors(parseApiError(err).fieldErrors) },
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <FormField label="الاسم الكامل" htmlFor="name" required error={fieldError('name')}>
        <Input id="name" autoComplete="name" value={name}
          onChange={(e) => setName(e.target.value)} placeholder="أحمد محمد" />
      </FormField>

      <FormField label="البريد الإلكتروني" htmlFor="email" required error={fieldError('email')}>
        <Input id="email" type="email" autoComplete="email" dir="ltr" value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="example@email.com" />
      </FormField>

      <FormField label="كلمة المرور" htmlFor="password" required error={fieldError('password')}
        hint="8 أحرف على الأقل">
        <Input id="password" type="password" autoComplete="new-password" dir="ltr" value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      </FormField>

      <FormField label="رقم الهاتف" htmlFor="phone" error={fieldError('phone')} hint="اختياري">
        <Input id="phone" type="tel" autoComplete="tel" dir="ltr" value={phone}
          onChange={(e) => setPhone(e.target.value)} placeholder="+970591234567" />
      </FormField>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="city" className="text-sm font-medium">المدينة <span className="text-muted-foreground text-xs">(اختياري)</span></label>
        <select id="city" value={city} onChange={(e) => setCity(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <option value="">اختر مدينتك</option>
          {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <Button type="submit" className="w-full mt-2" disabled={isPending}>
        {isPending ? 'جارٍ التسجيل…' : 'إنشاء الحساب'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        لديك حساب بالفعل؟{' '}
        <Link href={ROUTES.login} className="text-primary hover:underline font-medium">تسجيل الدخول</Link>
      </p>
    </form>
  );
}
