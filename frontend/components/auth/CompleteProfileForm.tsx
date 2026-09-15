'use client';

/**
 * CompleteProfileForm — FEAT-GOOGLE-COMPLETE-PROFILE.
 *
 * Shown at /complete-profile right after a brand-new Google signup
 * (see authController.googleCallback's redirect and
 * ProfileCompletionGate.tsx). Collects exactly the two things a
 * Google signup never provides: a confirmed name (pre-filled from the
 * Google profile, editable) and a city (Google never supplies one at
 * all, unlike local registration where RegisterForm already asks for
 * it — optionally — up front).
 *
 * Deliberately reuses the existing PATCH /users/me (via
 * useUpdateProfile) instead of a dedicated endpoint — the backend
 * clears needsProfileCompletion the moment a city is submitted
 * through that same route (see usersService.updateMe's own comment),
 * so no new backend surface was needed for this form specifically.
 * City is required here (unlike ProfileSettingsForm's later edits,
 * and unlike RegisterForm's optional field) since collecting it is
 * this whole page's reason to exist.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { useUpdateProfile } from '@/hooks/mutations/useUpdateProfile';
import { CITIES, ROUTES } from '@/lib/constants';

interface Errors {
  name?: string;
  city?: string;
}

export function CompleteProfileForm() {
  const user = useAuthStore(selectUser);
  const updateProfile = useUpdateProfile();
  const router = useRouter();

  const [name, setName] = useState(user?.name ?? '');
  const [city, setCity] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  function fieldError(field: keyof Errors): string | undefined {
    return errors[field];
  }

  function validate(): boolean {
    const next: Errors = {};
    const trimmedName = name.trim();
    if (trimmedName.length < 2) next.name = 'الاسم يجب أن يكون حرفين على الأقل';
    if (!city) next.city = 'الرجاء اختيار مدينتك';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    // useUpdateProfile already shows a success/error toast — this
    // form only needs to react to success by leaving the page.
    updateProfile.mutate(
      { name: name.trim(), city },
      { onSuccess: () => router.replace(ROUTES.home) }
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <FormField label="الاسم الكامل" htmlFor="name" error={fieldError('name')} required>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="اسمك الكامل"
          className="h-12 rounded-xl"
          autoComplete="name"
        />
      </FormField>

      <FormField label="المدينة" htmlFor="city" error={fieldError('city')} required>
        <Select value={city} onValueChange={setCity}>
          <SelectTrigger id="city" className="h-12 rounded-xl">
            <SelectValue placeholder="اختر مدينتك" />
          </SelectTrigger>
          <SelectContent>
            {CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormField>

      <Button type="submit" className="h-12 w-full rounded-xl" disabled={updateProfile.isPending}>
        {updateProfile.isPending ? 'جارٍ الحفظ...' : 'متابعة'}
      </Button>
    </form>
  );
}
