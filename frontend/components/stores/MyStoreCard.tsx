'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Store, ExternalLink, Sparkles, Package, PackagePlus, Heart } from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { FormField } from '@/components/shared/forms/FormField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import {
  useUpdateStore,
  useUploadStoreLogo,
  useUploadStoreCover,
} from '@/hooks/mutations/useStoreMutations';
import { parseApiError } from '@/lib/errorParser';
import { ROUTES, CITIES, ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE_MB } from '@/lib/constants';
import { STORE_STATUS_LABELS, STORE_STATUS_VARIANT } from '@/lib/storeStatus';
import { getAvatarUrl, getDetailImageUrl } from '@/lib/cloudinary';
import { toast } from 'sonner';
import { WorkingHoursEditor } from '@/components/services/WorkingHoursEditor';
import type { WorkingHours } from '@/types/service.types';
import type { StoreDetails } from '@/types/store.types';

const ALL_CLOSED: WorkingHours = {
  sun: null, mon: null, tue: null, wed: null, thu: null, fri: null, sat: null,
};

interface Props {
  store: StoreDetails;
}

interface Errors {
  name?: string;
  description?: string;
  city?: string;
  phone?: string;
}

export function MyStoreCard({ store }: Props) {
  const updateStore = useUpdateStore();
  const uploadLogo = useUploadStoreLogo();
  const uploadCover = useUploadStoreCover();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(store.name);
  const [description, setDescription] = useState(store.description);
  const [city, setCity] = useState(store.city);
  const [address, setAddress] = useState(store.address ?? '');
  const [phone, setPhone] = useState(store.phone);
  const [latitude, setLatitude] = useState(store.latitude ?? '');
  const [longitude, setLongitude] = useState(store.longitude ?? '');
  // STORE-HOURS (Foundation v1): store.workingHours is optional (null
  // until an owner sets it for the first time) — ALL_CLOSED is the
  // WorkingHoursEditor's own starting shape, same default a brand-new
  // ServiceProviderDetails row gets.
  const [workingHours, setWorkingHours] = useState<WorkingHours>(store.workingHours ?? ALL_CLOSED);
  const [errors, setErrors] = useState<Errors>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | undefined>();

  function fieldError(field: keyof Errors): string | undefined {
    return errors[field] ?? serverErrors?.[field]?.[0];
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

  // UX-FIX (paired with BecomeStoreOwnerCard's identical fix): mirrors
  // validate()'s required-field rules read-only.
  const isFormIncomplete =
    name.trim().length < 2 ||
    description.trim().length < 10 ||
    !city ||
    phone.trim().length < 7;

  // Mirrors ProfileSettingsForm's handleAvatarChange: same client-side
  // type/size check before the mutation fires, same "clear the input
  // so re-selecting the same file works" reset.
  function validateAndUpload(file: File | undefined, upload: (file: File) => void, inputEl: HTMLInputElement | null) {
    if (inputEl) inputEl.value = '';
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as typeof ALLOWED_IMAGE_TYPES[number])) {
      toast.error('نوع الصورة غير مدعوم (JPG، PNG، أو WEBP فقط)');
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error(`حجم الصورة يجب ألا يتجاوز ${MAX_FILE_SIZE_MB} ميجابايت`);
      return;
    }
    upload(file);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    updateStore.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        city,
        address: address.trim() || null,
        phone: phone.trim(),
        workingHours,
        latitude: latitude.trim() === '' ? null : Number(latitude),
        longitude: longitude.trim() === '' ? null : Number(longitude),
      },
      { onError: (err) => setServerErrors(parseApiError(err).fieldErrors) }
    );
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center gap-2 flex-wrap">
        <Store className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-lg font-semibold">{store.name}</h2>
        <Badge variant={STORE_STATUS_VARIANT[store.status]}>{STORE_STATUS_LABELS[store.status]}</Badge>
        {store.plan === 'FEATURED' && (
          // FIX P1-4: same unification as StoreHeader.tsx — "مميز" now
          // reads as the same accent color everywhere it appears.
          <Badge className="gap-1 bg-accent hover:bg-accent text-accent-foreground">
            <Sparkles className="h-3.5 w-3.5" /> مميز
          </Badge>
        )}
      </div>

      {/* FIX: logoUrl/coverImageUrl were fully supported end-to-end
          (validated, stored, rendered on StoreHeader/StoreCard) but had
          no upload UI anywhere — the only way to set either was a
          hand-crafted API call. Mirrors ProfileSettingsForm's avatar
          upload block one-for-one. */}
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
            <SafeImage
              variant="avatar"
              src={getAvatarUrl(store.logoUrl ?? '', 64)}
              alt={store.name}
              fill
              className="object-cover"
              sizes="64px"
            />
          </div>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadLogo.isPending}
              onClick={() => logoInputRef.current?.click()}
            >
              {uploadLogo.isPending ? 'جارٍ الرفع…' : 'تغيير الشعار'}
            </Button>
            <input
              ref={logoInputRef}
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(',')}
              className="hidden"
              onChange={(e) => validateAndUpload(e.target.files?.[0], (f) => uploadLogo.mutate(f), logoInputRef.current)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              JPG، PNG، أو WEBP — بحد أقصى {MAX_FILE_SIZE_MB} MB
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="relative h-24 w-full overflow-hidden rounded-md bg-muted">
            {store.coverImageUrl ? (
              <SafeImage
                src={getDetailImageUrl(store.coverImageUrl, 600)}
                alt={`غلاف ${store.name}`}
                fill
                className="object-cover"
                sizes="100vw"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                لا توجد صورة غلاف
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploadCover.isPending}
            onClick={() => coverInputRef.current?.click()}
          >
            {uploadCover.isPending ? 'جارٍ الرفع…' : 'تغيير صورة الغلاف'}
          </Button>
          <input
            ref={coverInputRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            className="hidden"
            onChange={(e) => validateAndUpload(e.target.files?.[0], (f) => uploadCover.mutate(f), coverInputRef.current)}
          />
        </div>
      </div>

      {store.status === 'PENDING' && (
        <p className="text-sm text-muted-foreground rounded-md border bg-muted/50 p-3">
          متجرك قيد المراجعة من قِبل الإدارة. سيظهر في دليل المتاجر بعد الموافقة عليه.
        </p>
      )}
      {store.status === 'BLOCKED' && (
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/5 p-3">
          تم حظر متجرك. تواصل مع الدعم لمزيد من التفاصيل.
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormField label="اسم المتجر" htmlFor="my-store-name" required error={fieldError('name')}>
          <Input id="my-store-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>

        <FormField label="الوصف" htmlFor="my-store-description" required error={fieldError('description')}>
          <textarea
            id="my-store-description"
            rows={4}
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
          <p className="text-xs text-muted-foreground text-end">{description.length}/1000</p>
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* FIX BUG-XX: same gap as ProductForm/AdForm/ServiceListingForm
              — required Select hand-rolled outside FormField, error <p>
              missing role="alert"/aria-live, Select missing
              aria-describedby/aria-invalid. FormField's auto-clone
              (UX-FIX P2-11) wires both. */}
          <FormField label="المدينة" htmlFor="my-store-city" required error={fieldError('city')}>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger id="my-store-city"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CITIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="رقم الهاتف" htmlFor="my-store-phone" required error={fieldError('phone')}>
            <Input id="my-store-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FormField>
        </div>

        <FormField label="العنوان (اختياري)" htmlFor="my-store-address">
          <Input
            id="my-store-address"
            value={address}
            maxLength={200}
            onChange={(e) => setAddress(e.target.value)}
          />
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="خط العرض (اختياري)" htmlFor="my-store-lat">
            <Input
              id="my-store-lat"
              inputMode="decimal"
              placeholder="31.5"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
            />
          </FormField>
          <FormField label="خط الطول (اختياري)" htmlFor="my-store-lng">
            <Input
              id="my-store-lng"
              inputMode="decimal"
              placeholder="34.4"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
            />
          </FormField>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          يساعد المشترين على إيجاد متجرك على الخريطة في الصفحة العامة.
        </p>

        {/* STORE-HOURS (Foundation v1): reuses the same editor
            services/WorkingHoursEditor.tsx already provides for
            ServiceProviderDetails — identical { sun: {open,close}|null,
            ... } shape on both, no duplication needed. */}
        <FormField label="ساعات العمل (اختياري)" htmlFor="my-store-hours">
          <WorkingHoursEditor value={workingHours} onChange={setWorkingHours} />
        </FormField>

        {/* UNIFY-PAYMENTS-STORES: payment methods are no longer editable
            here — they're managed once, from the seller's own profile
            page (MySellerProfileCard), and shown read-only wherever this
            store is displayed publicly (StoreHeader, ProductDetail,
            ProfileStoreSummary) via store.sellerProfile.paymentMethods. */}

        <Button type="submit" disabled={isFormIncomplete || updateStore.isPending}>
          {updateStore.isPending ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}
        </Button>
      </form>

      {/* AUDIT-FIX #3: management links (products + followed stores) were
          only reachable from StoreHeader's owner-tools block, which is
          hidden while the store is PENDING/BLOCKED — leaving the owner
          with no way to manage their catalog or followed stores until
          approval. Always shown here regardless of store.status. */}
      <div className="grid grid-cols-3 gap-2 border-t pt-4">
        <Button asChild variant="outline" size="sm" className="h-auto flex-col gap-1 rounded-2xl py-2.5 text-2xs-tight">
          <Link href={ROUTES.myStoreProductCreate}>
            <PackagePlus className="h-4 w-4" aria-hidden />
            إضافة منتج
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-auto flex-col gap-1 rounded-2xl py-2.5 text-2xs-tight">
          <Link href={ROUTES.myStoreProducts}>
            <Package className="h-4 w-4" aria-hidden />
            منتجاتي
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-auto flex-col gap-1 rounded-2xl py-2.5 text-2xs-tight">
          <Link href={ROUTES.myFollowedStores}>
            <Heart className="h-4 w-4" aria-hidden />
            المتابَعة
          </Link>
        </Button>
      </div>

      <div className="space-y-2 border-t pt-4">
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <Link href={ROUTES.myStore}>العودة للوحة المتجر</Link>
        </Button>
        {store.status === 'ACTIVE' && (
          <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground">
            <Link href={ROUTES.storeDetail(store.id)}>
              عرض صفحتي العامة <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
