'use client';

import { useState } from 'react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { ImageUpload } from '@/components/shared/forms/ImageUpload';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import { useServiceCategories } from '@/hooks/queries/useServiceCategories';
import { useCreateServiceListing, useUpdateServiceListing } from '@/hooks/mutations/useServiceListingMutations';
import { parseApiError } from '@/lib/errorParser';
import { MAX_IMAGES } from '@/lib/constants';
import type {
  ServiceListing,
  ServicePricingType,
  ServiceLocationType,
} from '@/types/service.types';

interface Props {
  mode: 'create' | 'edit';
  listing?: ServiceListing;
}

interface Values {
  categoryId: string;
  title: string;
  description: string;
  pricingType: ServicePricingType;
  price: string;
  durationEstimate: string;
  serviceLocation: ServiceLocationType;
  images: File[];
}

interface Errors {
  categoryId?: string;
  title?: string;
  description?: string;
  price?: string;
  images?: string;
}

const PRICING_LABELS: Record<ServicePricingType, string> = {
  FIXED: 'سعر ثابت',
  STARTING_FROM: 'يبدأ من',
  NEGOTIABLE: 'حسب الاتفاق',
};

const LOCATION_LABELS: Record<ServiceLocationType, string> = {
  AT_CUSTOMER: 'لدى العميل',
  AT_PROVIDER: 'لدى مقدم الخدمة',
  REMOTE: 'عن بُعد',
};

export function ServiceListingForm({ mode, listing }: Props) {
  const { data: categories } = useServiceCategories();
  // UX-FIX P3-10b: same real upload-progress pattern as AdForm — 0-100
  // while the create request's images are actually uploading, null the
  // rest of the time.
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const create = useCreateServiceListing((p) => setUploadProgress(p));
  const update = useUpdateServiceListing(listing?.id ?? '');
  const isPending = create.isPending || update.isPending;

  const [values, setValues] = useState<Values>(() =>
    listing
      ? {
          categoryId: listing.categoryId,
          title: listing.title,
          description: listing.description,
          pricingType: listing.pricingType,
          price: listing.price ?? '',
          durationEstimate: listing.durationEstimate ?? '',
          serviceLocation: listing.serviceLocation,
          images: [],
        }
      : {
          categoryId: '',
          title: '',
          description: '',
          pricingType: 'NEGOTIABLE',
          price: '',
          durationEstimate: '',
          serviceLocation: 'AT_PROVIDER',
          images: [],
        }
  );
  const [errors, setErrors] = useState<Errors>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | undefined>();

  function fieldError(field: keyof Errors): string | undefined {
    return errors[field] ?? serverErrors?.[field]?.[0];
  }

  function set<K extends keyof Values>(key: K, val: Values[K]) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  const priceRequired = values.pricingType !== 'NEGOTIABLE';

  function validate(): boolean {
    const e: Errors = {};
    if (!values.categoryId) e.categoryId = 'اختر فئة الخدمة';
    if (values.title.trim().length < 3) e.title = 'العنوان قصير جداً (3 أحرف على الأقل)';
    if (values.description.trim().length < 10) e.description = 'الوصف قصير جداً (10 أحرف على الأقل)';
    if (priceRequired && (!values.price || parseFloat(values.price) <= 0)) {
      e.price = 'أدخل سعراً صحيحاً';
    }
    if (mode === 'create' && values.images.length === 0) {
      e.images = 'أضف صورة واحدة على الأقل';
    }
    setErrors(e);
    setServerErrors(undefined);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    if (mode === 'create') {
      setUploadProgress(values.images.length > 0 ? 0 : null);
      create.mutate(
        {
          categoryId: values.categoryId,
          title: values.title.trim(),
          description: values.description.trim(),
          pricingType: values.pricingType,
          price: priceRequired ? parseFloat(values.price) : undefined,
          durationEstimate: values.durationEstimate.trim() || undefined,
          serviceLocation: values.serviceLocation,
          images: values.images,
        },
        {
          onError: (err) => setServerErrors(parseApiError(err).fieldErrors),
          onSettled: () => setUploadProgress(null),
        }
      );
      return;
    }

    // Edit mode — PATCH is JSON-only; the backend has no image-replace
    // endpoint for service listings, so photos are create-time only
    // (see service-listings.api.ts's file header for why).
    update.mutate(
      {
        categoryId: values.categoryId,
        title: values.title.trim(),
        description: values.description.trim(),
        pricingType: values.pricingType,
        price: priceRequired ? parseFloat(values.price) : null,
        durationEstimate: values.durationEstimate.trim() || null,
        serviceLocation: values.serviceLocation,
      },
      { onError: (err) => setServerErrors(parseApiError(err).fieldErrors) }
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <h2 className="font-semibold">معلومات الخدمة</h2>

        <div className="space-y-1.5">
          <label htmlFor="categoryId" className="text-sm font-medium">
            الفئة <span className="text-destructive">*</span>
          </label>
          <Select value={values.categoryId} onValueChange={(v) => set('categoryId', v)}>
            <SelectTrigger id="categoryId"><SelectValue placeholder="اختر فئة الخدمة" /></SelectTrigger>
            <SelectContent>
              {categories?.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>{cat.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldError('categoryId') && (
            <p className="text-xs text-destructive">{fieldError('categoryId')}</p>
          )}
        </div>

        <FormField label="عنوان الخدمة" htmlFor="title" required error={fieldError('title')}>
          <Input
            id="title"
            value={values.title}
            maxLength={200}
            onChange={(e) => set('title', e.target.value)}
            placeholder="مثال: تصليح أجهزة كهربائية منزلية"
          />
        </FormField>

        <FormField label="الوصف" htmlFor="description" required error={fieldError('description')}>
          <textarea
            id="description"
            rows={5}
            maxLength={2000}
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="اشرح تفاصيل الخدمة التي تقدمها..."
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
          <p className="text-xs text-muted-foreground text-end">{values.description.length}/2000</p>
        </FormField>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-4">
        <h2 className="font-semibold">التسعير والموقع</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="pricingType" className="text-sm font-medium">نوع التسعير</label>
            <Select
              value={values.pricingType}
              onValueChange={(v) => set('pricingType', v as ServicePricingType)}
            >
              <SelectTrigger id="pricingType"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(PRICING_LABELS) as [ServicePricingType, string][]).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="serviceLocation" className="text-sm font-medium">موقع تقديم الخدمة</label>
            <Select
              value={values.serviceLocation}
              onValueChange={(v) => set('serviceLocation', v as ServiceLocationType)}
            >
              <SelectTrigger id="serviceLocation"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(LOCATION_LABELS) as [ServiceLocationType, string][]).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {priceRequired && (
          <FormField
            label={values.pricingType === 'FIXED' ? 'السعر (₪)' : 'يبدأ من (₪)'}
            htmlFor="price"
            required
            error={fieldError('price')}
          >
            <Input
              id="price"
              type="number"
              min="0"
              step="0.01"
              value={values.price}
              onChange={(e) => set('price', e.target.value)}
              placeholder="0.00"
            />
          </FormField>
        )}

        <FormField label="المدة التقديرية (اختياري)" htmlFor="durationEstimate">
          <Input
            id="durationEstimate"
            value={values.durationEstimate}
            maxLength={100}
            onChange={(e) => set('durationEstimate', e.target.value)}
            placeholder="مثال: يوم عمل واحد، 3-5 أيام"
          />
        </FormField>
      </div>

      {mode === 'create' && (
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <h2 className="font-semibold">الصور</h2>
          {fieldError('images') && <p className="text-sm text-destructive">{fieldError('images')}</p>}
          <ImageUpload
            value={values.images}
            maxFiles={MAX_IMAGES}
            onChange={(files) => set('images', files)}
            uploadProgress={uploadProgress}
          />
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => history.back()}>إلغاء</Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'جارٍ الحفظ…' : mode === 'create' ? 'نشر الخدمة' : 'حفظ التعديلات'}
        </Button>
      </div>
    </form>
  );
}
