'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { FormSteps } from '@/components/shared/forms/FormSteps';
import { ImageUpload } from '@/components/shared/forms/ImageUpload';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import { useServiceCategories } from '@/hooks/queries/useServiceCategories';
import {
  useCreateServiceListing,
  useUpdateServiceListing,
  useAddServiceListingImages,
  useRemoveServiceListingImage,
  useReorderServiceListingImages,
} from '@/hooks/mutations/useServiceListingMutations';
import { parseApiError } from '@/lib/errorParser';
import { MAX_IMAGES } from '@/lib/constants';
import { CreateFormLayout } from '@/components/shared/forms/CreateFormLayout';
import { toast } from 'sonner';
import { ServiceListingFormPreview } from '@/components/services/ServiceListingFormPreview';
import type {
  ServiceListing,
  ServicePricingType,
  ServiceLocationType,
  UpdateServiceListingPayload,
  ServiceListingFormValues,
} from '@/types/service.types';

interface Props {
  mode: 'create' | 'edit';
  listing?: ServiceListing;
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
  // Gap #3 fix: same pattern as AdForm — addImages/removeImage drive the
  // edit-mode image changes, awaited before the field-only PATCH fires.
  const addImages = useAddServiceListingImages((p) => setUploadProgress(p));
  const removeImage = useRemoveServiceListingImage();
  const reorderImages = useReorderServiceListingImages();
  const [isSavingImages, setIsSavingImages] = useState(false);
  const isSubmittingRef = useRef(false);
  const isPending = create.isPending || update.isPending
    || addImages.isPending || removeImage.isPending || reorderImages.isPending || isSavingImages;

  // Snapshot of the listing's images as they were when the form
  // mounted, so we can diff against values.existingImages on submit —
  // same as AdForm's originalImages (FIX I-04).
  const [originalImages] = useState<string[]>(() => listing?.images ?? []);

  const [values, setValues] = useState<ServiceListingFormValues>(() =>
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
          existingImages: listing.images,
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
          existingImages: [],
        }
  );
  const [errors, setErrors] = useState<Errors>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | undefined>();

  function fieldError(field: keyof Errors): string | undefined {
    return errors[field] ?? serverErrors?.[field]?.[0];
  }

  function set<K extends keyof ServiceListingFormValues>(key: K, val: ServiceListingFormValues[K]) {
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
    // Gap #3 fix: edit mode now has a real image-replace flow, so the
    // "at least one image" rule applies to the combined staged +
    // existing set, not just create-mode's staged uploads.
    // TEMPORARY (remove once image hosting is configured — mirrors the
    // matching disable in AdForm.tsx / backend's ads.controller.ts
    // createAd): image upload requires configured storage that isn't
    // set up in this local environment yet, so the required-image
    // check is disabled here to allow local testing without it.
    // const totalImages = mode === 'create'
    //   ? values.images.length
    //   : values.images.length + values.existingImages.length;
    // if (totalImages === 0) {
    //   e.images = 'أضف صورة واحدة على الأقل';
    // }
    setErrors(e);
    setServerErrors(undefined);
    return Object.keys(e).length === 0;
  }

  // UX-FIX: mirrors validate()'s required-field rules read-only
  // (category/title/description, price only when priceRequired, and
  // the combined image count now that edit mode supports add/remove
  // too — Gap #3 fix).
  // TEMPORARY: totalImageCount required-image gate disabled to match
  // validate() above — remove once image hosting is configured.
  const isFormIncomplete =
    !values.categoryId ||
    values.title.trim().length < 3 ||
    values.description.trim().length < 10 ||
    (priceRequired && (!values.price || parseFloat(values.price) <= 0));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    if (!validate()) return;

    if (mode === 'create') {
      isSubmittingRef.current = true;
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
          onError: (err) => {
            setServerErrors(parseApiError(err).fieldErrors);
            isSubmittingRef.current = false;
          },
          onSettled: () => setUploadProgress(null),
        }
      );
      return;
    }

    if (!listing) return;
    isSubmittingRef.current = true;
    void submitEdit(listing);
  }

  // Gap #3 fix: mirrors AdForm's submitEdit exactly.
  async function submitEdit(currentListing: ServiceListing) {
    setIsSavingImages(true);
    try {
      const removedUrls = originalImages.filter(
        (url) => !values.existingImages.includes(url),
      );

      const wouldGoToZero =
        removedUrls.length > 0 && values.existingImages.length === 0;

      if (wouldGoToZero && values.images.length > 0) {
        setUploadProgress(0);
        await addImages.mutateAsync({ id: currentListing.id, files: values.images });
        for (const imageUrl of removedUrls) {
          await removeImage.mutateAsync({ id: currentListing.id, imageUrl });
        }
      } else {
        for (const imageUrl of removedUrls) {
          await removeImage.mutateAsync({ id: currentListing.id, imageUrl });
        }
        if (values.images.length > 0) {
          setUploadProgress(0);
          await addImages.mutateAsync({ id: currentListing.id, files: values.images });
        }
      }

      // Gap #11: mirrors AdForm's submitEdit — only the surviving
      // existing images are reordered; new uploads stay appended at
      // the end (backend's addImages ordering), so this stays a valid
      // permutation without needing the just-uploaded files' URLs.
      const survivingExisting = originalImages.filter((url) => values.existingImages.includes(url));
      const reorderChanged = values.existingImages.some((url, i) => url !== survivingExisting[i]);
      if (reorderChanged && values.existingImages.length > 1) {
        await reorderImages.mutateAsync({ id: currentListing.id, images: values.existingImages });
      }
    } catch {
      return;
    } finally {
      setIsSavingImages(false);
      isSubmittingRef.current = false;
      setUploadProgress(null);
    }

    const payload = {
      categoryId: values.categoryId,
      title: values.title.trim(),
      description: values.description.trim(),
      pricingType: values.pricingType,
      price: priceRequired ? parseFloat(values.price) : null,
      durationEstimate: values.durationEstimate.trim() || null,
      serviceLocation: values.serviceLocation,
    } satisfies UpdateServiceListingPayload;

    update.mutate(payload, { onError: (err) => setServerErrors(parseApiError(err).fieldErrors) });
  }


  // Multi-step wizard for create mode only (edit stays one page).
  const isWizard = mode === 'create';
  const totalSteps = 3;
  const [step, setStep] = useState(1);

  function canProceedFromStep(s: number): boolean {
    if (s === 1) {
      return (
        Boolean(values.categoryId) &&
        values.title.trim().length >= 3 &&
        values.description.trim().length >= 10
      );
    }
    if (s === 2) {
      if (priceRequired) {
        return Boolean(values.price.trim()) && Number(values.price) > 0;
      }
      return true;
    }
    return true;
  }

  function goNextStep() {
    if (!canProceedFromStep(step)) {
      if (step === 1) {
        toast.error('أكمل الفئة والعنوان والوصف (10 أحرف على الأقل) للمتابعة');
      } else if (step === 2) {
        toast.error('أدخل سعرًا صالحًا للمتابعة');
      }
      return;
    }
    setStep((s) => Math.min(totalSteps, s + 1));
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function goPrevStep() {
    setStep((s) => Math.max(1, s - 1));
  }

  const formElement = (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {isWizard && (
        <div className="sticky top-0 z-20 -mx-1 space-y-3 rounded-xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/90 sm:static sm:shadow-xs">
          <FormSteps
            steps={[
              { id: 'basics', label: 'الأساسيات', description: 'الفئة والعنوان والوصف' },
              { id: 'details', label: 'التسعير والموقع', description: 'السعر ومكان الخدمة' },
              { id: 'photos', label: 'الصور', description: 'صور الخدمة' },
            ]}
            current={step - 1}
            onStepClick={(index) => {
              if (index + 1 < step) setStep(index + 1);
            }}
          />
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={step}
            aria-valuemin={1}
            aria-valuemax={totalSteps}
            aria-label="تقدم خطوات النموذج"
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            الخطوة {step} من {totalSteps}
          </p>
        </div>
      )}
      <div className={`space-y-4 rounded-xl border border-border bg-card p-4 shadow-xs ${isWizard && step !== 1 ? "hidden" : ""}`}>
        <h2 className="font-semibold">معلومات الخدمة</h2>

        {/* FIX BUG-XX: same gap as ProductForm/AdForm — required Select
            hand-rolled outside FormField, error <p> missing role="alert"/
            aria-live, Select missing aria-describedby/aria-invalid.
            FormField's auto-clone (UX-FIX P2-11) wires both. */}
        <FormField label="الفئة" htmlFor="categoryId" required error={fieldError('categoryId')}>
          <Select value={values.categoryId} onValueChange={(v) => set('categoryId', v)}>
            <SelectTrigger id="categoryId"><SelectValue placeholder="اختر فئة الخدمة" /></SelectTrigger>
            <SelectContent>
              {categories?.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>{cat.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

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
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground text-end">{values.description.length}/2000</p>
        </FormField>
      </div>

      <div className={`space-y-4 rounded-xl border border-border bg-card p-4 shadow-xs ${isWizard && step !== 2 ? "hidden" : ""}`}>
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

      {/* Gap #3 fix: images are now editable after creation too, via the
          dedicated add/remove endpoints — same ImageUpload usage as AdForm. */}
      <div className={`space-y-4 rounded-xl border border-border bg-card p-4 shadow-xs ${isWizard && step !== 3 ? "hidden" : ""}`}>
        <h2 className="font-semibold">الصور</h2>
        {fieldError('images') && <p className="text-sm text-destructive">{fieldError('images')}</p>}
        <ImageUpload
          value={values.images}
          existingUrls={mode === 'edit' ? values.existingImages : undefined}
          maxFiles={MAX_IMAGES}
          onChange={(files) => set('images', files)}
          onRemoveExisting={
            mode === 'edit'
              ? (url) => set('existingImages', values.existingImages.filter((u) => u !== url))
              : undefined
          }
          onReorderExisting={
            mode === 'edit'
              ? (reordered) => set('existingImages', reordered)
              : undefined
          }
          uploadProgress={uploadProgress}
        />
      </div>

      <div className="sticky bottom-0 z-20 -mx-1 border-t border-border/80 bg-background/95 p-3 shadow-[0_-4px_16px_-8px_hsl(var(--shadow-color)/0.12)] backdrop-blur supports-[backdrop-filter]:bg-background/90 sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" onClick={() => history.back()}>إلغاء</Button>
          <div className="flex flex-wrap gap-2">
            {isWizard && step > 1 && (
              <Button type="button" variant="outline" onClick={goPrevStep}>السابق</Button>
            )}
            {isWizard && step < totalSteps && (
              <Button type="button" className="min-w-[7rem] font-semibold" onClick={goNextStep}>
                التالي
              </Button>
            )}
            {(!isWizard || step === totalSteps) && (
              <Button type="submit" className="min-w-[8rem] font-semibold" disabled={isFormIncomplete || isPending}>
                {isPending ? 'جارٍ الحفظ…' : mode === 'create' ? 'نشر الخدمة' : 'حفظ التعديلات'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </form>
  );

  // FIX DESKTOP-WIDTH-02: see AdForm's matching comment — no longer
  // create-mode only, same reasoning applies here.
  return (
    <CreateFormLayout form={formElement} preview={<ServiceListingFormPreview values={values} />} />
  );
}
