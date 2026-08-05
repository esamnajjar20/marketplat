'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRegister } from '@/hooks/mutations/useAuthMutations';
import { parseApiError } from '@/lib/errorParser';
import { getSafeRedirectPath } from '@/lib/cookies';
import { track } from '@/lib/analytics';
import { Button }    from '@/components/shared/ui/Button';
import { Input }     from '@/components/shared/ui/Input';
import { PasswordInput } from '@/components/shared/ui/PasswordInput';
import { FormField } from '@/components/shared/forms/FormField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
import { AuthDivider } from '@/components/auth/AuthDivider';
import { ROUTES, CITIES } from '@/lib/constants';

interface Errors {
  name?: string; email?: string; password?: string; confirmPassword?: string; phone?: string;
}

export function RegisterForm() {
  const searchParams = useSearchParams();
  const { mutate: register, isPending } = useRegister();

  // AUDIT-FIX auth#1: RegisterForm previously never read `from` at all,
  // so a visitor who arrived here via /login?from=X → "إنشاء حساب" (or
  // directly at /register?from=X) always landed on /dashboard after a
  // successful signup instead of the page they originally wanted.
  // Mirrors LoginForm's own from-handling exactly.
  const from = searchParams.get('from');
  const loginHref = from ? `${ROUTES.login}?from=${encodeURIComponent(from)}` : ROUTES.login;

  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone,    setPhone]    = useState('');
  const [city,     setCity]     = useState('');
  const [errors,   setErrors]   = useState<Errors>({});
  // FIX M-1: field-level errors from the backend (e.g. 409 email-taken,
  // or a Zod validation edge case the client-side checks below don't
  // catch, like a backend-side uniqueness or format rule).
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | undefined>();

  // Gap #7 (product analytics): fires once on mount — "started signup"
  // is defined as landing on this form, paired with SIGNUP_COMPLETED in
  // useAuthMutations.ts's useRegister onSuccess. Empty dependency array
  // is deliberate: a visitor re-typing/correcting fields on the same
  // visit is still one signup attempt, not a new one per render.
  useEffect(() => {
    track('SIGNUP_STARTED');
  }, []);

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
    if (!confirmPassword)              e.confirmPassword = 'تأكيد كلمة المرور مطلوب';
    else if (confirmPassword !== password) e.confirmPassword = 'كلمتا المرور غير متطابقتين';
    if (phone && !/^[0-9+]{9,15}$/.test(phone)) e.phone = 'رقم هاتف غير صالح';
    setErrors(e);
    setServerErrors(undefined);
    return Object.keys(e).length === 0;
  }

  // UX-FIX: mirrors validate()'s required-field rules (name/email/
  // password/confirmPassword) without its side effects, so the submit
  // button only becomes tappable once the form could plausibly pass.
  // phone stays excluded — it's optional per validate() itself.
  const isFormIncomplete =
    !name.trim() ||
    !email.trim() ||
    !password ||
    password.length < 8 ||
    !confirmPassword ||
    confirmPassword !== password;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const redirectTo = getSafeRedirectPath(from, ROUTES.dashboard);
    register(
      { name: name.trim(), email: email.trim(), password, phone: phone || undefined, city: city || undefined, redirectTo },
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
        <PasswordInput id="password" autoComplete="new-password" dir="ltr" value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      </FormField>

      <FormField label="تأكيد كلمة المرور" htmlFor="confirmPassword" required error={fieldError('confirmPassword')}>
        <PasswordInput id="confirmPassword" autoComplete="new-password" dir="ltr" value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" />
      </FormField>

      <FormField label="رقم الهاتف" htmlFor="phone" error={fieldError('phone')} hint="اختياري">
        <Input id="phone" type="tel" autoComplete="tel" dir="ltr" value={phone}
          onChange={(e) => setPhone(e.target.value)} placeholder="+970591234567" />
      </FormField>

      {/*
        AUDIT-FIX auth#5: was a raw <select> with hand-rolled Tailwind
        classes — visually close but not identical to the other 4
        FormField/Input fields in this same form, and skipped FormField
        entirely (no aria-describedby wiring). Every other <select> in
        the app already goes through this same shadcn Select
        (ProductForm, ServiceListingForm, BecomeStoreOwnerCard, ...);
        this was the one native holdout.
      */}
      <FormField label="المدينة" htmlFor="city" hint="اختياري">
        <Select value={city} onValueChange={setCity}>
          <SelectTrigger id="city"><SelectValue placeholder="اختر مدينتك" /></SelectTrigger>
          <SelectContent>
            {CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormField>

      <Button type="submit" className="w-full mt-2" disabled={isFormIncomplete || isPending}>
        {isPending ? 'جارٍ التسجيل…' : 'إنشاء الحساب'}
      </Button>

      <AuthDivider />

      <GoogleAuthButton label="التسجيل باستخدام Google" />

      <p className="text-center text-sm text-muted-foreground">
        لديك حساب بالفعل؟{' '}
        <Link href={loginHref} className="text-primary hover:underline font-medium">تسجيل الدخول</Link>
      </p>
    </form>
  );
}
