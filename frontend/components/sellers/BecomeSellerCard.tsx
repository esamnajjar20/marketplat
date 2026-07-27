'use client';

import { useState } from 'react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { useCreateSellerProfile } from '@/hooks/mutations/useSellerMutations';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { parseApiError } from '@/lib/errorParser';

export function BecomeSellerCard() {
  const user = useAuthStore(selectUser);
  const createProfile = useCreateSellerProfile();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<{ agreed?: string }>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | undefined>();

  function fieldError(field: 'displayName' | 'bio'): string | undefined {
    return serverErrors?.[field]?.[0];
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) {
      setErrors({ agreed: 'يجب الموافقة على شروط البيع للمتابعة' });
      return;
    }
    setErrors({});
    setServerErrors(undefined);

    createProfile.mutate(
      {
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
        agreedToSellerTerms: true,
      },
      {
        onError: err => setServerErrors(parseApiError(err).fieldErrors),
      }
    );
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">أصبح بائعاً</h2>
        <p className="text-sm text-muted-foreground">
          أنشئ ملفك كبائع لتتمكن من نشر الإعلانات. لا حاجة لأي موافقة إدارية — فقط أكمل النموذج
          أدناه.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormField label="اسم العرض" htmlFor="seller-display-name" error={fieldError('displayName')}>
          <Input
            id="seller-display-name"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder={user?.name ?? 'اسمك كما سيظهر للمشترين'}
          />
        </FormField>

        <FormField label="نبذة عنك كبائع (اختياري)" htmlFor="seller-bio" error={fieldError('bio')}>
          <textarea
            id="seller-bio"
            rows={3}
            maxLength={300}
            value={bio}
            onChange={e => setBio(e.target.value)}
            placeholder="أخبر المشترين عن نفسك أو عن ما تبيعه..."
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
          <p className="text-xs text-muted-foreground text-end">{bio.length}/300</p>
        </FormField>

        <div className="flex items-start gap-2">
          <input
            id="seller-terms"
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            className="mt-1"
          />
          <label htmlFor="seller-terms" className="text-sm">
            أوافق على شروط البيع الخاصة بالمنصة
          </label>
        </div>
        {errors.agreed && (
          <p className="text-xs text-destructive" role="alert">
            {errors.agreed}
          </p>
        )}

        <Button type="submit" disabled={createProfile.isPending}>
          {createProfile.isPending ? 'جارٍ الإنشاء…' : 'إنشاء ملف البائع'}
        </Button>
      </form>
    </div>
  );
}
