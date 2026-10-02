'use client';

import { useRef, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/shared/ui/Button';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { Input } from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { FormSteps } from '@/components/shared/forms/FormSteps';
import { ImageUpload } from '@/components/shared/forms/ImageUpload';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import { useServiceCategories } from '@/hooks/queries/useServiceCategories';
import { useFormDraft, readFormDraft } from '@/hooks/useFormDraft';
import { getAdDraft } from '@/lib/offlineAdDrafts';
import {
  setActiveOfflineDraftId,
  serviceFieldsFromDraftPayload,
} from '@/lib/offlineDraftResume';
import {
  useCreateServiceListing,
  useUpdateServiceListing,
  useAddServiceListingImages,
  useRemoveServiceListingImage,
  useReorderServiceListingImages,
} from '@/hooks/mutations/useServiceListingMutations';
import { parseApiError } from '@/lib/errorParser';
import { isNetworkLikeFailure } from '@/lib/isNetworkLikeFailure';
import { reconcileImages } from '@/lib/reconcileImages';
import { MAX_IMAGES, ROUTES } from '@/lib/constants';;
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

// PHASE-OFFLINE-DRAFTS: نفس نمط AdForm.tsx's DraftValues بالضبط.
type ServiceDraftValues = Omit<ServiceListingFormValues, 'images' | 'existingImages'>;

export function ServiceListingForm({ mode, listing }: Props) {
  const { data: categories } = useServiceCategories();
  const searchParams = useSearchParams();
  const offlineDraftId = searchParams.get('draftId');
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

  const [values, setValues] = useState<ServiceListingFormValues>(() => {
    if (listing) {
      return {
        categoryId: listing.categoryId,
        title: listing.title,
        description: listing.description,
        pricingType: listing.pricingType,
        price: listing.price ?? '',
        durationEstimate: listing.durationEstimate ?? '',
        serviceLocation: listing.serviceLocation,
        images: [],
        existingImages: listing.images,
      };
    }
    const empty = {
      categoryId: '',
      title: '',
      description: '',
      pricingType: 'NEGOTIABLE' as ServicePricingType,
      price: '',
      durationEstimate: '',
      serviceLocation: 'AT_PROVIDER' as ServiceLocationType,
      images: [] as File[],
      existingImages: [] as string[],
    };
    if (offlineDraftId) return empty;
    return {
      ...empty,
      ...(readFormDraft<ServiceDraftValues>('service:create') ?? {}),
      images: [],
      existingImages: [],
    };
  });
  const [errors, setErrors] = useState<Errors>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | undefined>();

  // استئناف مسودة IndexedDB من مركز المزامنة (?draftId=)
  useEffect(() => {
    if (!offlineDraftId) return;
    let cancelled = false;
    void (async () => {
      try {
        const d = await getAdDraft(offlineDraftId);
        if (cancelled || !d || d.kind !== 'service') return;
        const fields = serviceFieldsFromDraftPayload(d.payload);
        setValues((prev) => ({
          ...prev,
          ...fields,
          pricingType: (fields.pricingType as ServicePricingType) || prev.pricingType,
          serviceLocation: (fields.serviceLocation as ServiceLocationType) || prev.serviceLocation,
          images: [],
          existingImages: prev.existingImages,
        }));
        setActiveOfflineDraftId(d.id);
        const labels = d.payload.imageLabels;
        if (Array.isArray(labels) && labels.length > 0) {
          toast.message('استُعيدت حقول المسودة', {
            description: 'أعد اختيار الصور إن لزم — النسخ الأصلية غير محفوظة في المسودة المحلية.',
          });
        } else {
          toast.message('استُعيدت المسودة المحلية');
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offlineDraftId]);

  // PHASE-OFFLINE-DRAFTS: بوضع create فقط — نفس استثناء AdForm.tsx
  // لوضع edit (بيانات سيرفر حقيقية موجودة أصلاً، لا داعي لمسودة).
  const { clearDraft, lastSavedAt } = useFormDraft<ServiceDraftValues>(
    'service:create',
    {
      categoryId: values.categoryId,
      title: values.title,
      description: values.description,
      pricingType: values.pricingType,
      price: values.price,
      durationEstimate: values.durationEstimate,
      serviceLocation: values.serviceLocation,
    },
    { enabled: mode === 'create' },
  );

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

  // SW-SVCFORM-HISTORY-GUARD-01: same fix as AdForm.tsx and
  // ProductForm.tsx. history.back() with no previous in-app entry
  // (deep link, bookmark, shared URL) either leaves the app or
  // produces a blank tab. Also adds the missing discard confirmation.
  const router = useRouter();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [initialValues] = useState(() => values);
  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);

  function goBackSafely() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      history.back();
    } else {
      router.push(ROUTES.myServices);
    }
  }

  function handleCancel() {
    if (isDirty) {
      setShowCancelConfirm(true);
    } else {
      if (mode === 'create') clearDraft();
      goBackSafely();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    // FIX WIZARD-ENTER-BYPASS: pressing Enter in any text field
    // fires the form's submit handler regardless of which wizard
    // step is currently visible. The submit button only renders on
    // the final step, but the browser does not care. Without this
    // guard, Enter on step 1 ran validate() (passes, because the
    // required-image gate is disabled) and fired create.mutate()
    // with whatever the two unseen steps' defaults happened to be.
    // Forward to the next step instead — same action as the Next
    // button — so the wizard flow is preserved.
    if (isWizard && step < totalSteps) {
      goNextStep();
      return;
    }
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
          // PHASE-OFFLINE-DRAFTS: لا داعي لمسودة بعد نجاح النشر الفعلي.
          onSuccess: () => clearDraft(),
          // FIX SUBMIT-REF-STUCK: onError already cleared the ref,
          // but onSuccess left it true. Normally invisible — the
          // mutation's own onSuccess pushes to /my-services, which
          // unmounts the form and takes the ref with it. But if
          // that navigation itself fails (offline blip right after
          // a successful create), the user lands back on a live
          // form where every subsequent submit silently no-ops
          // because the guard at the top of handleSubmit sees a
          // stale true. Reset it in onSettled so both paths clear
          // it — the ref is for in-flight de-duplication only, not
          // for "has this form ever submitted."
          onSettled: () => {
            setUploadProgress(null);
            isSubmittingRef.current = false;
          },
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

    // T792 — build the listing-fields payload up front so the catch
    // block below can fire update.mutate() itself if the image steps
    // fail due to a network error. Without this, an offline edit that
    // changes both text AND images lost the text edits: addImages
    // threw first, the catch block returned, update.mutate() never
    // ran, and useUpdateServiceListing's own onError — the only place
    // a draft is saved — was never invoked.
    const payload = {
      categoryId: values.categoryId,
      title: values.title.trim(),
      description: values.description.trim(),
      pricingType: values.pricingType,
      price: priceRequired ? parseFloat(values.price) : null,
      durationEstimate: values.durationEstimate.trim() || null,
      serviceLocation: values.serviceLocation,
    } satisfies UpdateServiceListingPayload;

    try {
      // Shared with the other two entity forms — see lib/reconcileImages.ts
      // for the ordering rules (EPIC 1.5 add-before-remove, Gap #11 reorder).
      await reconcileImages(
        { originalImages, existingImages: values.existingImages, newFiles: values.images },
        {
          addImages: (files) => addImages.mutateAsync({ id: currentListing.id, files }),
          removeImage: (imageUrl) => removeImage.mutateAsync({ id: currentListing.id, imageUrl }),
          reorderImages: (images) => reorderImages.mutateAsync({ id: currentListing.id, images }),
          onUploadStart: () => setUploadProgress(0),
        },
      );
    } catch (err) {
      const parsed = parseApiError(err);
      // T792 — a network failure here means update.mutate will also
      // fail offline. Firing it anyway lets useUpdateServiceListing's
      // onError save the text edits as an offline draft, instead of
      // losing them because only the image step was attempted.
      if (isNetworkLikeFailure(parsed)) {
        setIsSavingImages(false);
        setUploadProgress(null);
        update.mutate(payload, {
          onError: (mutErr) => setServerErrors(parseApiError(mutErr).fieldErrors),
        });
        isSubmittingRef.current = false;
        return;
      }
      // Non-network failure (4xx — bad image, payload mismatch): the
      // user must fix the offending input before the listing's own
      // fields should be saved. Previously the error was swallowed
      // with a bare `return` (FIX SUBMIT-EDIT-SILENT-FAIL added the
      // toast); now the finally block's cleanup still runs.
      toast.error(parsed.message || 'فشل حفظ الصور، حاول مرة أخرى');
      setIsSavingImages(false);
      isSubmittingRef.current = false;
      setUploadProgress(null);
      return;
    }

    // Success path — image reconciliation completed without error.
    setIsSavingImages(false);
    setUploadProgress(null);
    update.mutate(payload, {
      onError: (err) => setServerErrors(parseApiError(err).fieldErrors),
    });
    isSubmittingRef.current = false;
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
      {mode === 'create' && lastSavedAt && (
        <p
          className="flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-primary"
          role="status"
          aria-live="polite"
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
          مسودة محفوظة تلقائياً — يمكنك إغلاق الصفحة والعودة لاحقاً
        </p>
      )}
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
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
          >
            إلغاء
          </Button>
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
  const cancelDialog = (
    <ConfirmDialog
      open={showCancelConfirm}
      onOpenChange={setShowCancelConfirm}
      title="تجاهل التغييرات؟"
      description="لديك تغييرات غير محفوظة في هذا النموذج. إذا تابعت، ستفقد كل ما أدخلته."
      confirmLabel="تجاهل التغييرات"
      cancelLabel="متابعة التعديل"
      destructive
      onConfirm={() => {
        // SW-SVCFORM-HISTORY-GUARD-01: explicit discard also drops the
        // autosaved draft so it does not resurrect on the next visit.
        if (mode === 'create') clearDraft();
        goBackSafely();
      }}
    />
  );

  return (
    <>
      <CreateFormLayout form={formElement} preview={<ServiceListingFormPreview values={values} />} />
      {cancelDialog}
    </>
  );
}
