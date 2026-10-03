'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import { useMySellerProfile } from '@/hooks/queries/useSellers';
import { useCreateStore } from '@/hooks/mutations/useStoreMutations';
import { useFormDraft, readFormDraft } from '@/hooks/useFormDraft';
import { parseApiError } from '@/lib/errorParser';
import { ROUTES, CITIES } from '@/lib/constants';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { getSafeRedirectPath } from '@/lib/cookies';
import { useStoreTypes } from '@/hooks/queries/useStoreTypes';
import { StoreDynamicFields } from '@/components/stores/StoreDynamicFields';
import type { StoreAttributes } from '@/types/store.types';

interface Errors {
  name?: string;
  description?: string;
  city?: string;
  phone?: string;
}

// PHASE-OFFLINE-DRAFTS: هذا النموذج بلا images أصلاً (متجر لا يحمل
// صورًا هنا)، فكل حقوله قابلة للمسودة مباشرة بلا استثناء.
interface StoreDraftValues {
  name: string;
  description: string;
  city: string;
  address: string;
  phone: string;
  latitude: string;
  longitude: string;
  storeTypeId: string;
  attributes: StoreAttributes;
}

/**
 * Store is built on top of an existing SellerProfile, exactly like
 * ServiceProviderDetails — mirrors BecomeServiceProviderCard's
 * "check seller profile first, show the right CTA" shape one-for-one.
 */
export function BecomeStoreOwnerCard() {
  const { data: sellerProfile, isLoading: isLoadingSeller } = useMySellerProfile();
  const createStore = useCreateStore();
  const { data: storeTypes = [] } = useStoreTypes();
  const router = useRouter();
  const searchParams = useSearchParams();

  // FIX P0-1 (unified pattern, mirrors BecomeSellerCard): when reached
  // via CreateProductGate's "فتح متجر" link (?from=/my-store/products/new),
  // send the user back to their original intent after the store is
  // created instead of stranding them on /my-store.
  const from = searchParams.get('from');

  // PHASE-OFFLINE-DRAFTS: بذر الحقول من مسودة محفوظة إن وُجدت — هذا
  // النموذج بلا وضع "تعديل" أصلاً (متجر واحد يُنشأ مرة)، فلا استثناء
  // لازم هنا خلافًا لـ AdForm/ProductForm/ServiceListingForm.
  const [draftSeed] = useState(() => readFormDraft<StoreDraftValues>('store:create'));

  const [name, setName] = useState(() => draftSeed?.name ?? '');
  const [description, setDescription] = useState(() => draftSeed?.description ?? '');
  const [city, setCity] = useState(() => draftSeed?.city ?? '');
  const [address, setAddress] = useState(() => draftSeed?.address ?? '');
  const [phone, setPhone] = useState(() => draftSeed?.phone ?? '');
  const [latitude, setLatitude] = useState(() => draftSeed?.latitude ?? '');
  const [longitude, setLongitude] = useState(() => draftSeed?.longitude ?? '');
  const [storeTypeId, setStoreTypeId] = useState(() => draftSeed?.storeTypeId ?? 'st_general');
  const [attributes, setAttributes] = useState<StoreAttributes>({});
  const [errors, setErrors] = useState<Errors>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | undefined>();

  const { clearDraft, lastSavedAt } = useFormDraft<StoreDraftValues>(
    'store:create',
    { name, description, city, address, phone, latitude, longitude, storeTypeId, attributes },
  );

  function fieldError(field: keyof Errors): string | undefined {
    return errors[field] ?? serverErrors?.[field]?.[0];
  }

  if (isLoadingSeller) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />

      </div>
    );
  }

  if (!sellerProfile) {
    return (
      <div className="space-y-3 max-w-lg">
        <h2 className="text-lg font-semibold">افتح متجرك</h2>
        <p className="text-sm text-muted-foreground">
          يجب أن يكون لديك ملف بائع أولاً قبل فتح متجر.
        </p>
        <Button asChild>
          <Link href={ROUTES.settings.seller}>إنشاء ملف بائع</Link>
        </Button>
      </div>
    );
  }

  function validate(): boolean {
    const e: Errors = {};
    if (name.trim().length < 2) e.name = 'اسم المتجر قصير جداً';
    if (description.trim().length < 10) e.description = 'الوصف قصير جداً (10 أحرف على الأقل)';
    if (!city) e.city = 'اختر المدينة';
    if (phone.trim().length < 7) e.phone = 'رقم الهاتف مطلوب';
    setErrors(e);
    setServerErrors(undefined);
    return Object.keys(e).length === 0;
  }

  // UX-FIX: the submit button used to stay enabled at all times (only
  // `disabled` on the pending request itself), so a user could tap
  // "إنشاء المتجر" on an empty form and only find out what's missing
  // after the fact. This mirrors `validate()`'s own rules without its
  // side effects (no setErrors/setServerErrors here — this only decides
  // whether the button is tappable; the red inline messages still only
  // appear after a real submit attempt).
  const isFormIncomplete =
    name.trim().length < 2 ||
    description.trim().length < 10 ||
    !city ||
    phone.trim().length < 7;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    createStore.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        city,
        address: address.trim() || undefined,
        phone: phone.trim(),
        ...(latitude.trim() ? { latitude: Number(latitude) } : {}),
        ...(longitude.trim() ? { longitude: Number(longitude) } : {}),
        storeTypeId,
        ...(Object.keys(attributes).length ? { attributes } : {}),
      },
      {
        onSuccess: () => {
          // PHASE-OFFLINE-DRAFTS: لا داعي لمسودة بعد إنشاء المتجر فعليًا.
          clearDraft();
          if (from) router.push(getSafeRedirectPath(from));
        },
        onError: (err) => setServerErrors(parseApiError(err).fieldErrors),
      }
    );
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">افتح متجرك</h2>
        <p className="text-sm text-muted-foreground">
          أنشئ متجرك لتتمكن من عرض منتجاتك واستقبال الزبائن.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {lastSavedAt && (
          <p
            className="flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-primary"
            role="status"
            aria-live="polite"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            مسودة محفوظة تلقائياً — يمكنك إغلاق الصفحة والعودة لاحقاً
          </p>
        )}
        <FormField label="اسم المتجر" htmlFor="store-name" required error={fieldError('name')}>
          <Input
            id="store-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: متجر أبو محمد للأدوات المنزلية"
          />
        </FormField>

        <FormField label="الوصف" htmlFor="store-description" required error={fieldError('description')}>
          <textarea
            id="store-description"
            rows={4}
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="اشرح ما يقدمه متجرك..."
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
          <p className="text-xs text-muted-foreground text-end">{description.length}/1000</p>
        </FormField>

        {/* FIX BUG-XX: same gap as ProductForm/AdForm/ServiceListingForm/
            MyStoreCard — required Select hand-rolled outside FormField,
            error <p> missing role="alert"/aria-live, Select missing
            aria-describedby/aria-invalid. FormField's auto-clone
            (UX-FIX P2-11) wires both. Not in the original audit's
            file list (BecomeStoreOwnerCard was explicitly marked
            "not covered in depth"), found on a follow-up sweep of the
            same pattern. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="المدينة" htmlFor="store-city" required error={fieldError('city')}>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger id="store-city"><SelectValue placeholder="اختر المدينة" /></SelectTrigger>
              <SelectContent>
                {CITIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="رقم الهاتف" htmlFor="store-phone" required error={fieldError('phone')}>
            <Input
              id="store-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05xxxxxxxx"
            />
          </FormField>
        </div>

        <FormField label="نوع المتجر" htmlFor="store-type" required>
          <Select value={storeTypeId} onValueChange={setStoreTypeId}>
            <SelectTrigger id="store-type">
              <SelectValue placeholder="اختر نوع المتجر" />
            </SelectTrigger>
            <SelectContent>
              {(storeTypes.length ? storeTypes : [{ id: 'st_general', slug: 'general', nameAr: 'عام' }]).map((type) => (
                <SelectItem key={type.id} value={type.id}>{type.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <StoreDynamicFields storeTypeId={storeTypeId} value={attributes} onChange={setAttributes} errors={serverErrors} />

        <FormField label="العنوان (اختياري)" htmlFor="store-address">
          <Input
            id="store-address"
            value={address}
            maxLength={200}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="الشارع، الحي..."
          />
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="خط العرض (اختياري)" htmlFor="store-lat">
            <Input id="store-lat" inputMode="decimal" placeholder="31.5" value={latitude} onChange={(e) => setLatitude(e.target.value)} />
          </FormField>
          <FormField label="خط الطول (اختياري)" htmlFor="store-lng">
            <Input id="store-lng" inputMode="decimal" placeholder="34.4" value={longitude} onChange={(e) => setLongitude(e.target.value)} />
          </FormField>
        </div>

        <Button type="submit" disabled={isFormIncomplete || createStore.isPending}>
          {createStore.isPending ? 'جارٍ الإنشاء…' : 'إنشاء المتجر'}
        </Button>
      </form>
    </div>
  );
}
