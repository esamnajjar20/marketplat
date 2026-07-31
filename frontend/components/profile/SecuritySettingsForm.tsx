'use client';

import { useState } from 'react';
import { Button }    from '@/components/shared/ui/Button';
import { Input }     from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { useChangePassword } from '@/hooks/mutations/useAuthMutations';
import { parseApiError } from '@/lib/errorParser';
import { toast } from 'sonner';

interface Errors { current?: string; newPass?: string; confirm?: string; }

export function SecuritySettingsForm() {
  const [current,  setCurrent]  = useState('');
  const [newPass,  setNewPass]  = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [errors,   setErrors]   = useState<Errors>({});
  const changePassword = useChangePassword();

  function validate() {
    const e: Errors = {};
    if (!current)                   e.current = 'أدخل كلمة المرور الحالية';
    if (!newPass)                   e.newPass = 'أدخل كلمة المرور الجديدة';
    else if (newPass.length < 8)    e.newPass = '8 أحرف على الأقل';
    else if (newPass === current)   e.newPass = 'كلمة المرور الجديدة يجب أن تختلف عن الحالية';
    if (confirm !== newPass)        e.confirm = 'كلمتا المرور غير متطابقتين';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    // FIX SEC-07: on success, useChangePassword itself clears the local
    // session and redirects to /login — this form no longer resets its
    // own fields on success because the component unmounts on redirect
    // before that would matter. On failure the user stays here and the
    // fields are deliberately left as-is so they don't have to retype
    // everything after e.g. a typo in the current password.
    // FIX M-1: this used to assume every 400 here meant "current password
    // wrong" and hardcoded that message onto the `current` field — true for
    // users.service.ts's BadRequestError('كلمة المرور الحالية غير صحيحة')
    // (verified: that's the exact string it throws), but wrong for the other
    // real 400 this endpoint can return: changePasswordSchema caps
    // newPassword at 100 chars (auth.validation.ts), which nothing here
    // checked client-side — that failure is a ZodError and arrives with a
    // proper fieldErrors.newPassword, not fieldErrors.current, so hardcoding
    // it onto `current` pointed the user at the wrong field entirely.
    // fieldErrors is only ever present for genuine Zod validation failures
    // (see parseApiError), so when it exists we trust it over the guess.
    //
    // Now switches on parsed.code === 'CURRENT_PASSWORD_INVALID' (the code
    // users.service.ts's changePassword() actually attaches) instead of
    // guessing from statusCode alone — the old statusCode-only check
    // happened to be correct today only because no other bare
    // BadRequestError exists on this endpoint's 400 path, but it would
    // silently mis-target `current` again the moment one is added (the
    // same class of bug RegisterForm.tsx had). parsed.message is used
    // directly rather than a second hardcoded copy of the same string,
    // since errorParser.ts now resolves it from the shared i18n dictionary.
    changePassword.mutate({ currentPassword: current, newPassword: newPass }, {
      onError: (err) => {
        const parsed = parseApiError(err);
        if (parsed.fieldErrors) {
          setErrors({
            current: parsed.fieldErrors.currentPassword?.[0],
            newPass: parsed.fieldErrors.newPassword?.[0],
          });
        } else if (parsed.code === 'CURRENT_PASSWORD_INVALID') {
          setErrors({ current: parsed.message });
        } else {
          toast.error(parsed.message);
        }
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5 max-w-lg">
      <h2 className="font-semibold">تغيير كلمة المرور</h2>
      <FormField label="كلمة المرور الحالية" htmlFor="current" required error={errors.current}>
        <Input id="current" type="password" dir="ltr" autoComplete="current-password"
          value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="••••••••" />
      </FormField>
      <FormField label="كلمة المرور الجديدة" htmlFor="newp" required error={errors.newPass} hint="8 أحرف على الأقل">
        <Input id="newp" type="password" dir="ltr" autoComplete="new-password"
          value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="••••••••" />
      </FormField>
      <FormField label="تأكيد كلمة المرور" htmlFor="confirmp" required error={errors.confirm}>
        <Input id="confirmp" type="password" dir="ltr" autoComplete="new-password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" />
      </FormField>
      <Button type="submit" disabled={changePassword.isPending}>
        {changePassword.isPending ? 'جارٍ التغيير…' : 'تغيير كلمة المرور'}
      </Button>
    </form>
  );
}
