'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRegister } from '@/hooks/mutations/useAuthMutations';
import { parseApiError } from '@/lib/errorParser';
import { Button }    from '@/components/shared/ui/Button';
import { Input }     from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
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
      {
        // UX-FIX P-REG-2: "email already in use" / "phone already in
        // use" arrive as a plain BadRequestError (400, general
        // `message`, not Zod field-level `errors`) — auth.service.ts's
        // register() throws before it ever gets to Zod, so
        // parsed.fieldErrors is empty for this case and the field-level
        // FormFields below stayed blank. useRegister's own onError still
        // shows the toast (same pattern as useCreateAd + AdForm — the
        // toast is the immediate signal, the field message is where to
        // actually look). This just additionally points at the specific
        // input so the user doesn't have to guess which of email/phone
        // was the duplicate.
        //
        // Switches on parsed.code (EMAIL_ALREADY_EXISTS /
        // PHONE_ALREADY_EXISTS — see errorCodes.ts), not on the Arabic
        // message text: this used to compare
        // parsed.message.includes('البريد الإلكتروني'), which could never
        // match because auth.service.ts's register() sent an English
        // message ('Email already in use') that errorParser.ts only
        // translated to Arabic starting from a status-code fallback —
        // never containing that exact Arabic substring. The field-specific
        // error silently never fired; only the generic toast did.
        onError: (err) => {
          const parsed = parseApiError(err);
          setServerErrors(parsed.fieldErrors);
          if (parsed.code === 'EMAIL_ALREADY_EXISTS') {
            setErrors((prev) => ({ ...prev, email: parsed.message }));
          } else if (parsed.code === 'PHONE_ALREADY_EXISTS') {
            setErrors((prev) => ({ ...prev, phone: parsed.message }));
          }
        },
      },
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

      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-card px-2 text-muted-foreground">أو</span>
        </div>
      </div>

      <GoogleAuthButton label="التسجيل باستخدام Google" />

      <p className="text-center text-sm text-muted-foreground">
        لديك حساب بالفعل؟{' '}
        <Link href={ROUTES.login} className="text-primary hover:underline font-medium">تسجيل الدخول</Link>
      </p>
    </form>
  );
}
