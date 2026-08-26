'use client';

import { useState, useEffect, useRef } from 'react';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { Button }     from '@/components/shared/ui/Button';
import { Input }      from '@/components/shared/ui/Input';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/shared/ui/Select';
import { FormField }  from '@/components/shared/forms/FormField';
import { ImageUpload } from '@/components/shared/forms/ImageUpload';
import { PriceInput }  from '@/components/shared/forms/PriceInput';
import { CITIES, CONDITION_LABELS, MAX_IMAGES } from '@/lib/constants';
import { useCategories } from '@/hooks/queries/useCategories';
import { useCreateAd, useUpdateAd, useAddAdImages, useRemoveAdImage, useReorderAdImages } from '@/hooks/mutations/useAdMutations';
import { useFormDraft, readFormDraft } from '@/hooks/useFormDraft';
import { AdFormPreview } from '@/components/ads/AdFormPreview';
import { parseApiError } from '@/lib/errorParser';
import type { Ad, AdFormValues, AdFormMode, UpdateAdPayload } from '@/types/ad.types';
import { toast } from 'sonner';

interface Props {
  mode: AdFormMode;
  ad?: Ad;
}

const EMPTY: AdFormValues = {
  title: '', description: '', price: '', isNegotiable: false,
  condition: '', city: '', categoryId: '', images: [], existingImages: [],
};

interface Errors {
  title?: string; description?: string; city?: string;
  images?: string; condition?: string;
}

// FIX P1-11: the persisted slice of AdFormValues — everything except
// `images`/`existingImages`, which either hold live File objects (not
// JSON-serializable) or, in edit mode, mirror server data that's
// already safe (reloading the real ad is more reliable than trusting
// a stale draft of it). Draft autosave is create-mode only for this
// reason — see the comment where useFormDraft is called below.
type DraftValues = Omit<AdFormValues, 'images' | 'existingImages'>;

export function AdForm({ mode, ad }: Props) {
  const { data: categories } = useCategories();
  // UX-FIX P3-10b: real upload progress (0-100) for the images actually
  // being sent in this submission, shown in ImageUpload while it's in
  // flight instead of leaving the user with only the button's static
  // "جارٍ الحفظ…" label for however long a multi-photo upload takes on a
  // slow connection. null when no upload is in progress.
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const createAd = useCreateAd((p) => setUploadProgress(p));
  const updateAd = useUpdateAd(ad?.id ?? '');
  const addImages = useAddAdImages((p) => setUploadProgress(p));
  const removeImage = useRemoveAdImage();
  const reorderImages = useReorderAdImages();
  const [isSavingImages, setIsSavingImages] = useState(false);
  const isSubmittingRef = useRef(false);
  const isPending = createAd.isPending || updateAd.isPending
    || addImages.isPending || removeImage.isPending || reorderImages.isPending || isSavingImages;

  // FIX I-04: snapshot of the ad's images as they were when the form
  // mounted, so we can diff against `values.existingImages` on submit
  // to know which ones the user actually removed.
  const [originalImages] = useState<string[]>(() => ad?.images ?? []);

  // FIX P1-11: in create mode only, seed initial state from a saved
  // draft if one exists (see useFormDraft below for how it got
  // there). Falls back to EMPTY exactly as before when there's no
  // draft, so this is a strict addition — nothing changes for a
  // first-time visit to the form.
  const [values, setValues] = useState<AdFormValues>(() => {
    if (ad) {
      return {
        title: ad.title, description: ad.description,
        price: ad.price ?? '', isNegotiable: ad.isNegotiable,
        condition: ad.condition ?? '', city: ad.city,
        categoryId: ad.categoryId ?? '', images: [],
        existingImages: ad.images,
      };
    }
    const draft = readFormDraft<DraftValues>('ad:create');
    return draft ? { ...EMPTY, ...draft } : EMPTY;
  });
  // FIX P0-2: snapshot of the form's initial values, used to detect
  // unsaved changes before discarding via "إلغاء". Compares the
  // text/select fields directly and treats any new file selected or
  // any existing image removed/reordered as dirty too — cheaper and
  // just as reliable as a deep-equal here since `images` holds live
  // File objects that aren't meaningfully comparable by value anyway.
  const [initialValues] = useState<AdFormValues>(() => values);
  const isDirty =
    values.title !== initialValues.title ||
    values.description !== initialValues.description ||
    values.price !== initialValues.price ||
    values.isNegotiable !== initialValues.isNegotiable ||
    values.condition !== initialValues.condition ||
    values.city !== initialValues.city ||
    values.categoryId !== initialValues.categoryId ||
    values.images.length > 0 ||
    values.existingImages.length !== initialValues.existingImages.length ||
    values.existingImages.some((url, i) => url !== initialValues.existingImages[i]);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // FIX P1-11: periodically persists title/description/price/etc (not
  // images — see DraftValues above) to localStorage while the user is
  // actively filling out a *new* ad, so an accidental navigation away
  // doesn't lose everything. Edit mode is intentionally excluded:
  // there's already a real saved ad to fall back to, and restoring a
  // stale draft over freshly-fetched server data would be confusing
  // rather than helpful.
  const { clearDraft, lastSavedAt } = useFormDraft<DraftValues>(
    'ad:create',
    {
      title: values.title, description: values.description, price: values.price,
      isNegotiable: values.isNegotiable, condition: values.condition,
      city: values.city, categoryId: values.categoryId,
    },
    { enabled: mode === 'create' },
  );

  function handleCancel() {
    if (isDirty) {
      setShowCancelConfirm(true);
    } else {
      if (mode === 'create') clearDraft();
      history.back();
    }
  }

  const [errors, setErrors] = useState<Errors>({});
  // FIX P1-12: previously the submit button was simply disabled
  // (isFormIncomplete) with zero indication of *why* until the user
  // guessed and hit submit anyway — validate() only ran there. Now
  // tracks which fields the user has actually left (blurred) so each
  // one's error can surface the moment they move on from it, not only
  // after a full submit attempt. hasSubmitted covers fields the user
  // never focused at all (e.g. tabbing straight to submit).
  const [touched, setTouched] = useState<Partial<Record<keyof Errors, boolean>>>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  // UX phase-3: multi-step wizard for create mode only (edit stays one page).
  const [step, setStep] = useState(1);
  const isWizard = mode === 'create';
  const totalSteps = 3;

  // FIX M-1: field-level errors from the backend's Zod validation (400
  // responses), separate from `errors` (client-side pre-submit checks).
  // Kept apart so a fresh submit attempt clears stale server errors via
  // validate()'s own setErrors() without this needing to know about that
  // state, and so a field can show either source without one silently
  // overwriting the other. See the field lookup helper below.
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | undefined>();

  // Field-level errors come from the mutation's own `error` state rather
  // than a per-call onError passed to mutate(): useCreateAd/useUpdateAd
  // already toast a generic message via their own onError, and mutate()
  // here is called with just the payload (single argument).
  useEffect(() => {
    const err = mode === 'create' ? createAd.error : updateAd.error;
    if (err) setServerErrors(parseApiError(err).fieldErrors);
  }, [createAd.error, updateAd.error, mode]);

  // Release the re-entrancy guard once the create mutation settles either
  // way (the edit-mode path resets it itself at the end of submitEdit,
  // right after updateAd.mutate() is actually called — see that
  // function's own comment).
  useEffect(() => {
    if (mode === 'create' && !createAd.isPending) {
      isSubmittingRef.current = false;
    }
  }, [mode, createAd.isPending]);

  // FIX P1-12: pulled out of validate() so it can run for a single
  // field on blur without needing a full setErrors() pass — validate()
  // below now just calls this for every field at once on submit.
  function computeErrors(): Errors {
    const e: Errors = {};
    if (!values.title.trim())        e.title       = 'عنوان الإعلان مطلوب';
    else if (values.title.length < 5) e.title      = 'العنوان قصير جداً (5 أحرف على الأقل)';
    if (!values.description.trim())  e.description = 'وصف الإعلان مطلوب';
    else if (values.description.length < 20) e.description = 'الوصف قصير جداً (20 حرفاً على الأقل)';
    if (!values.city)                e.city        = 'المدينة مطلوبة';
    // TEMPORARY (remove once image hosting is configured — mirrors the
    // matching disable in backend/ads.controller.ts's createAd): image
    // is optional for now so ads can be created and tested end-to-end
    // without a working upload service. Revert by restoring the check
    // below in both places together.
    // if (values.images.length === 0 && values.existingImages.length === 0)
    //   e.images = 'أضف صورة واحدة على الأقل';
    return e;
  }

  /** Client-side error takes priority (it's live, pre-submit); falls back to the backend's. */
  function fieldError(field: keyof Errors): string | undefined {
    // FIX P1-12: only surface a client-side error once the user has
    // actually interacted with this field (blurred it) or tried to
    // submit — otherwise every required field would show red before
    // the user has had any chance to fill it in.
    if (!touched[field] && !hasSubmitted) return undefined;
    return errors[field] ?? serverErrors?.[field]?.[0];
  }

  function handleBlur(field: keyof Errors) {
    setTouched((t) => ({ ...t, [field]: true }));
    setErrors(computeErrors());
  }

  function set<K extends keyof AdFormValues>(key: K, val: AdFormValues[K]) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  function validate() {
    const e = computeErrors();
    setHasSubmitted(true);
    setErrors(e);
    setServerErrors(undefined);
    return Object.keys(e).length === 0;
  }

  // UX-FIX: mirrors validate()'s required-field rules read-only (title/
  // description/city). Images are deliberately excluded here too, same
  // as in validate() above — see the TEMPORARY note there for why.
  const isFormIncomplete =
    !values.title.trim() ||
    values.title.length < 5 ||
    !values.description.trim() ||
    values.description.length < 20 ||
    !values.city;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    if (!validate()) return;

    if (mode === 'create') {
      isSubmittingRef.current = true;
      setUploadProgress(values.images.length > 0 ? 0 : null);
      const payload = {
        title:        values.title.trim(),
        description:  values.description.trim(),
        price:        values.price ? parseFloat(values.price) : undefined,
        isNegotiable: values.isNegotiable,
        condition:    values.condition || undefined,
        city:         values.city,
        categoryId:   values.categoryId || undefined,
        images:       values.images,
      };
      // UX-FIX P3-10b: reset the bar once the request settles either way —
      // onSuccess already navigates away, but onError leaves the user on
      // the form, where a progress bar frozen at some earlier percentage
      // would be confusing next to the (now re-enabled) submit button.
      // FIX P1-11: clear the draft once the ad is actually created —
      // onSettled (not onSuccess) would also fire on failure and wipe
      // a draft the user still needs, so this stays scoped to onSuccess.
      createAd.mutate(payload, {
        onSuccess: () => clearDraft(),
        onSettled: () => setUploadProgress(null),
      });
      return;
    }

    if (!ad) return;

    // FIX BUG-07: this used to fire removeImage/addImages inside
    // updateAd's onSuccess without awaiting either — but updateAd's own
    // onSuccess (in useAdMutations.ts) already navigates away as soon
    // as the PATCH resolves, before the image calls had any chance to
    // finish. One could silently fail after the user had already left
    // the page, with no visible error and a half-applied edit. Now the
    // image changes are awaited first (each still reports its own
    // error via its hook's onError if it fails), and updateAd — the
    // step that actually navigates — only runs once both have
    // resolved, so a failure surfaces on the page the user is still
    // looking at, and the successful case updates the ad's fields last
    // (so the images we just confirmed are already what a subsequent
    // getAdById would return, rather than the redirect racing ahead).
    isSubmittingRef.current = true;
    void submitEdit(ad);
  }

  async function submitEdit(currentAd: Ad) {
    setIsSavingImages(true);
    try {
      const removedUrls = originalImages.filter(
        (url) => !values.existingImages.includes(url),
      );

      // EPIC 1.5: if removing these would leave the ad with zero images
      // even momentarily, and the user has staged replacement uploads,
      // add the replacements first so removeImage's min-1-image guard
      // (backend) never sees a would-be-empty ad. Safe to reorder only
      // in this specific case — reversing the order in general would
      // risk momentarily exceeding addImages' 10-image cap instead.
      const wouldGoToZero =
        removedUrls.length > 0 && values.existingImages.length === 0;

      if (wouldGoToZero && values.images.length > 0) {
        setUploadProgress(0);
        await addImages.mutateAsync({ id: currentAd.id, files: values.images });
        for (const imageUrl of removedUrls) {
          await removeImage.mutateAsync({ id: currentAd.id, imageUrl });
        }
      } else {
        for (const imageUrl of removedUrls) {
          await removeImage.mutateAsync({ id: currentAd.id, imageUrl });
        }
        if (values.images.length > 0) {
          setUploadProgress(0);
          await addImages.mutateAsync({ id: currentAd.id, files: values.images });
        }
      }

      // Gap #11: values.existingImages already reflects the user's
      // drag-and-drop reorder (survivors only, removedUrls already
      // excluded above). Newly-uploaded files always land appended
      // after existing images (see addImages' backend ordering), so
      // reordering only the surviving existing images — leaving new
      // uploads in their upload order at the end — keeps this call a
      // valid permutation without needing to know the final Cloudinary
      // URLs of files that were just uploaded above.
      const survivingExisting = originalImages.filter((url) => values.existingImages.includes(url));
      const reorderChanged = values.existingImages.some((url, i) => url !== survivingExisting[i]);
      if (reorderChanged && values.existingImages.length > 1) {
        await reorderImages.mutateAsync({ id: currentAd.id, images: values.existingImages });
      }
    } catch {
      // Each mutation's own onError already toasted a specific message
      // and invalidated whatever partially succeeded; stop here so a
      // failed image step doesn't still trigger the ad-details PATCH
      // and navigate the user away from a half-applied edit.
      isSubmittingRef.current = false;
      setIsSavingImages(false);
      setUploadProgress(null);
      return;
    }

    // FIX: isSubmittingRef.current used to be reset to false inside a
    // `finally` block that ran BEFORE updateAd.mutate() below — opening
    // a re-entrancy window where the submit button was already
    // re-enabled (isPending had dropped) while the actual PATCH call
    // hadn't fired yet, letting a fast double-click/double-submit slip
    // past the guard and call updateAd.mutate() more than once. The
    // guard now only clears once the whole submit — image
    // reconciliation AND the final updateAd call — has actually been
    // issued.
    setIsSavingImages(false);
    setUploadProgress(null);

    const payload = {
      title:        values.title.trim(),
      description:  values.description.trim(),
      price:        values.price ? parseFloat(values.price) : undefined,
      isNegotiable: values.isNegotiable,
      condition:    values.condition || undefined,
      city:         values.city,
      categoryId:   values.categoryId || undefined,
    } satisfies UpdateAdPayload;

    updateAd.mutate(payload);
    isSubmittingRef.current = false;
  }


  function canProceedFromStep(s: number): boolean {
    if (s === 1) {
      return values.title.trim().length >= 3 && values.description.trim().length >= 10;
    }
    if (s === 2) {
      return Boolean(values.city.trim());
    }
    return true;
  }

  function goNextStep() {
    setHasSubmitted(true);
    if (step === 1) {
      handleBlur('title');
      handleBlur('description');
    }
    if (step === 2) {
      handleBlur('city');
    }
    if (!canProceedFromStep(step)) {
      if (step === 1) {
        toast.error('أكمل العنوان (3 أحرف على الأقل) والوصف (10 أحرف على الأقل)');
      } else if (step === 2) {
        toast.error('اختر المدينة للمتابعة');
      }
      return;
    }
    setHasSubmitted(false);
    setStep((s) => Math.min(totalSteps, s + 1));
    // Bring the new step into view on mobile after advancing
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function goPrevStep() {
    setHasSubmitted(false);
    setStep((s) => Math.max(1, s - 1));
  }

  return (
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
        <nav
          aria-label="خطوات نشر الإعلان"
          className="sticky top-0 z-20 -mx-1 rounded-lg border bg-card/95 p-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/90 sm:static sm:shadow-none"
        >
          <ol className="flex items-center justify-between gap-2">
            {[
              { n: 1, label: 'الأساسيات' },
              { n: 2, label: 'التصنيف والسعر' },
              { n: 3, label: 'الصور والنشر' },
            ].map((item) => (
              <li key={item.n} className="flex flex-1 flex-col items-center gap-1.5">
                <span
                  className={
                    item.n === step
                      ? 'flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground ring-2 ring-primary/30'
                      : item.n < step
                        ? 'flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary'
                        : 'flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground'
                  }
                  aria-current={item.n === step ? 'step' : undefined}
                >
                  {item.n < step ? '✓' : item.n}
                </span>
                <span className={`text-[11px] sm:text-xs ${item.n === step ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                  {item.label}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={totalSteps} aria-label="تقدم خطوات النشر">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            الخطوة {step} من {totalSteps}
          </p>
        </nav>
      )}

      {/* Basic info — wizard step 1 */}
      <div className={`rounded-lg border bg-card p-4 space-y-4 ${isWizard && step !== 1 ? "hidden" : ""}`}>
        <h2 className="font-semibold">معلومات الإعلان</h2>

        <FormField label="عنوان الإعلان" htmlFor="title" required error={fieldError('title')}>
          {/* UX-02 FIX: was maxLength={100} — backend's createAdSchema
              (ads.validation.ts) allows title up to 200 chars, so this
              silently blocked the last 100 chars a user was entitled to
              type, with no error or explanation. */}
          <Input id="title" value={values.title} maxLength={200}
            onChange={(e) => set('title', e.target.value)}
            onBlur={() => handleBlur('title')}
            placeholder="مثال: سيارة تويوتا كامري 2019 نظيفة" />
        </FormField>

        <FormField label="الوصف" htmlFor="desc" required error={fieldError('description')}>
          <textarea id="desc" value={values.description} maxLength={5000} rows={5}
            onChange={(e) => set('description', e.target.value)}
            onBlur={() => handleBlur('description')}
            placeholder="اكتب تفاصيل الإعلان بوضوح..."
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
          <p className="text-xs text-muted-foreground text-end">{values.description.length}/5000</p>
        </FormField>
      </div>

      {/* Classification — wizard step 2 */}
      <div className={`rounded-lg border bg-card p-4 space-y-4 ${isWizard && step !== 2 ? "hidden" : ""}`}>
        <h2 className="font-semibold">التصنيف والموقع</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* FIX BUG-XX: was a bare label + Select outside FormField, so
              this field never got aria-describedby/aria-invalid wiring
              like every sibling field in this form. categoryId has no
              required-field validation today (not in the Errors type
              or validate()/isFormIncomplete above), so there's no error
              to surface yet — but FormField's auto-clone (UX-FIX P2-11)
              still wires the a11y attributes and keeps this field
              structurally consistent with the rest of the form. */}
          <FormField label="الفئة" htmlFor="categoryId">
            <Select value={values.categoryId} onValueChange={(v) => set('categoryId', v)}>
              <SelectTrigger id="categoryId">
                <SelectValue placeholder="اختر فئة" />
              </SelectTrigger>
              <SelectContent>
                {categories?.map((cat) => (
                  <SelectGroup key={cat.id}>
                    <SelectLabel>{cat.nameAr}</SelectLabel>
                    <SelectItem value={cat.id}>{cat.nameAr}</SelectItem>
                    {cat.children?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>— {c.nameAr}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="المدينة" htmlFor="city" required error={fieldError('city')}>
            <Select value={values.city} onValueChange={(v) => { set('city', v); handleBlur('city'); }}>
              <SelectTrigger id="city">
                <SelectValue placeholder="اختر مدينتك" />
              </SelectTrigger>
              <SelectContent>
                {CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="condition" className="text-sm font-medium">حالة المنتج</label>
          <Select value={values.condition} onValueChange={(v) => set('condition', v as typeof values.condition)}>
            <SelectTrigger id="condition">
              <SelectValue placeholder="غير محدد" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CONDITION_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Pricing — wizard step 2 */}
      <div className={`rounded-lg border bg-card p-4 space-y-4 ${isWizard && step !== 2 ? "hidden" : ""}`}>
        <h2 className="font-semibold">السعر</h2>
        <PriceInput
          value={values.price}
          onChange={(v) => set('price', v)}
          isNegotiable={values.isNegotiable}
          onNegotiableChange={(v) => set('isNegotiable', v)}
        />
      </div>

      {/* Images — wizard step 3 */}
      <div className={`rounded-lg border bg-card p-4 space-y-4 ${isWizard && step !== 3 ? "hidden" : ""}`}>
        <h2 className="font-semibold">الصور</h2>
        {/* TEMPORARY: remove this note once image hosting is configured
            and the required-image check above is restored. */}
        <p className="text-xs text-muted-foreground">الصور اختيارية مؤقتاً</p>
        {fieldError('images') && <p className="text-sm text-destructive">{fieldError('images')}</p>}
        <ImageUpload
          value={values.images}
          existingUrls={values.existingImages}
          maxFiles={MAX_IMAGES}
          onChange={(files) => set('images', files)}
          onRemoveExisting={(url) => set('existingImages', values.existingImages.filter((u) => u !== url))}
          onReorderExisting={(reordered) => set('existingImages', reordered)}
          uploadProgress={uploadProgress}
        />

        {/* Live card preview — last chance to catch weak title/price/photo */}
        <AdFormPreview values={values} className="pt-2" />
      </div>

      {/* Submit / wizard navigation — sticky on mobile for thumb reach */}
      <div className="sticky bottom-0 z-20 -mx-1 border-t bg-background/95 p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur supports-[backdrop-filter]:bg-background/90 sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" onClick={handleCancel}>إلغاء</Button>
          <div className="flex flex-wrap gap-2">
            {isWizard && step > 1 && (
              <Button type="button" variant="outline" onClick={goPrevStep}>
                السابق
              </Button>
            )}
            {isWizard && step < totalSteps && (
              <Button type="button" className="min-w-[7rem] font-semibold" onClick={goNextStep}>
                التالي
              </Button>
            )}
            {(!isWizard || step === totalSteps) && (
              <Button type="submit" className="min-w-[8rem] font-semibold" disabled={isFormIncomplete || isPending}>
                {isPending ? 'جارٍ الحفظ…' : mode === 'create' ? 'نشر الإعلان' : 'حفظ التعديلات'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* FIX P0-2: confirm before discarding unsaved changes — this is a
          long form (title, description up to 5000 chars, images,
          category) and a single accidental tap on "إلغاء" (common on
          mobile) previously discarded everything with no way back. */}
      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title="تجاهل التغييرات؟"
        description="لديك تغييرات غير محفوظة في هذا النموذج. إذا تابعت، ستفقد كل ما أدخلته."
        confirmLabel="تجاهل التغييرات"
        cancelLabel="متابعة التعديل"
        destructive
        onConfirm={() => {
          // FIX P1-11: an explicit "discard changes" confirmation is a
          // clear enough signal to also drop the autosaved draft —
          // otherwise it would silently resurrect on the next visit
          // to /ads/create despite the user just having said no to
          // exactly that content.
          if (mode === 'create') clearDraft();
          history.back();
        }}
      />
    </form>
  );
}
