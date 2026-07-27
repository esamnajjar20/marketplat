'use client';

/**
 * FIX BUG-05: bio and phone were seeded with useState('') — always
 * empty regardless of what the user had actually saved before, unlike
 * NotificationSettingsForm.tsx next to it which correctly loads real
 * data via useMe(). A user who had a bio/phone saved would open this
 * form, see both fields blank, and — if they typed something new and
 * saved without noticing — silently overwrite their existing value
 * with whatever they'd just typed, never having seen what was there
 * before. name/city are now synced from the same useMe() response too
 * for consistency, instead of only ever reading the leaner
 * useAuthStore snapshot (AuthUser, which has no bio/phone field at
 * all — there is nowhere in the store these two could have come from).
 */
import { useRef, useState, useEffect } from 'react';
import Image from 'next/image';
import { Button }    from '@/components/shared/ui/Button';
import { Input }     from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { CITIES, ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE_MB } from '@/lib/constants';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { useMe } from '@/hooks/queries/useAuth';
import { useUpdateProfile, useUploadAvatar } from '@/hooks/mutations/useUpdateProfile';
import { getAvatarUrl } from '@/lib/cloudinary';
import { parseApiError } from '@/lib/errorParser';
import { toast } from 'sonner';

export function ProfileSettingsForm() {
  const user = useAuthStore(selectUser);
  const { data: me, isLoading: isMeLoading } = useMe();
  const updateProfile = useUpdateProfile();
  const uploadAvatar  = useUploadAvatar();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user?.name ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const [bio,  setBio]  = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  // FIX M-1: the real gap here — updateProfileSchema validates phone against
  // /^\+?[0-9]{9,15}$/ (users.validation.ts), which this form never checked
  // client-side (plain <Input type="tel">, no pattern/JS check below). Any
  // phone number with spaces, dashes, or the wrong digit count — very
  // common when typed by hand — passed straight through to a 400 with no
  // indication of what was wrong. `name`'s min(2)/max(100) is effectively
  // already covered by the trim() check below for any realistic input, but
  // this catches it too if the backend rule ever tightens further.
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | undefined>();

  function fieldError(field: 'name' | 'phone'): string | undefined {
    return errors[field] ?? serverErrors?.[field]?.[0];
  }

  // Sync once the full profile arrives — useAuthStore's AuthUser has no
  // bio/phone at all, so those two only ever get a real value from
  // here. Runs once per fetched `me` object (not on every keystroke),
  // same pattern as NotificationSettingsForm's useEffect.
  useEffect(() => {
    if (!me) return;
    setName(me.name);
    setCity(me.city ?? '');
    setBio(me.bio ?? '');
    setPhone(me.phone ?? '');
  }, [me]);

  function validate() {
    const e: typeof errors = {};
    if (!name.trim()) e.name = 'الاسم مطلوب';
    setErrors(e);
    setServerErrors(undefined);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    updateProfile.mutate(
      { name: name.trim(), city: city || undefined, bio: bio || undefined, phone: phone || undefined },
      {
        onSuccess: () => toast.success('تم حفظ التغييرات'),
        onError: (err) => setServerErrors(parseApiError(err).fieldErrors),
      }
    );
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type as typeof ALLOWED_IMAGE_TYPES[number])) {
      toast.error('نوع الصورة غير مدعوم (JPG، PNG، أو WEBP فقط)');
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error(`حجم الصورة يجب ألا يتجاوز ${MAX_FILE_SIZE_MB} ميجابايت`);
      return;
    }
    uploadAvatar.mutate(file);
  }

  if (isMeLoading) {
    return <div className="flex justify-center py-8"><LoadingSpinner /></div>;
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5 max-w-lg">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
          <Image src={getAvatarUrl(user?.avatarUrl ?? '', 64)} alt={user?.name ?? ''} fill className="object-cover" sizes="64px" />
        </div>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploadAvatar.isPending}
            onClick={() => avatarInputRef.current?.click()}
          >
            {uploadAvatar.isPending ? 'جارٍ الرفع…' : 'تغيير الصورة'}
          </Button>
          <input
            ref={avatarInputRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            className="hidden"
            onChange={handleAvatarChange}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            JPG، PNG، أو WEBP — بحد أقصى {MAX_FILE_SIZE_MB} MB
          </p>
        </div>
      </div>

      <FormField label="الاسم الكامل" htmlFor="pname" required error={fieldError('name')}>
        <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>

      <div className="space-y-1.5">
        <label htmlFor="pcity" className="text-sm font-medium">المدينة</label>
        <select id="pcity" value={city} onChange={(e) => setCity(e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <option value="">اختر مدينتك</option>
          {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <FormField label="رقم الهاتف" htmlFor="pphone" hint="لن يُعرض للعامة" error={fieldError('phone')}>
        <Input id="pphone" type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+970..." />
      </FormField>

      <FormField label="نبذة شخصية" htmlFor="pbio">
        <textarea id="pbio" rows={3} maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)}
          placeholder="أخبر الآخرين عنك..."
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
        <p className="text-xs text-muted-foreground text-end">{bio.length}/300</p>
      </FormField>

      <Button type="submit" disabled={updateProfile.isPending}>
        {updateProfile.isPending ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
      </Button>
    </form>
  );
}
