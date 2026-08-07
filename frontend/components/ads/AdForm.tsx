'use client';

import { useState, useEffect, useRef } from 'react';
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
import { parseApiError } from '@/lib/errorParser';
import type { Ad, AdFormValues, AdFormMode, UpdateAdPayload } from '@/types/ad.types';

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

  const [values, setValues] = useState<AdFormValues>(() =>
    ad ? {
      title: ad.title, description: ad.description,
      price: ad.price ?? '', isNegotiable: ad.isNegotiable,
      condition: ad.condition ?? '', city: ad.city,
      categoryId: ad.categoryId ?? '', images: [],
      existingImages: ad.images,
    } : EMPTY
  );
  const [errors, setErrors] = useState<Errors>({});
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
  // way (the edit-mode path resets it itself in submitEdit's finally).
  useEffect(() => {
    if (mode === 'create' && !createAd.isPending) {
      isSubmittingRef.current = false;
    }
  }, [mode, createAd.isPending]);

  /** Client-side error takes priority (it's live, pre-submit); falls back to the backend's. */
  function fieldError(field: keyof Errors): string | undefined {
    return errors[field] ?? serverErrors?.[field]?.[0];
  }

  function set<K extends keyof AdFormValues>(key: K, val: AdFormValues[K]) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  function validate() {
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
      createAd.mutate(payload, { onSettled: () => setUploadProgress(null) });
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
      return;
    } finally {
      setIsSavingImages(false);
      isSubmittingRef.current = false;
      setUploadProgress(null);
    }

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
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* Basic info */}
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <h2 className="font-semibold">معلومات الإعلان</h2>

        <FormField label="عنوان الإعلان" htmlFor="title" required error={fieldError('title')}>
          <Input id="title" value={values.title} maxLength={100}
            onChange={(e) => set('title', e.target.value)}
            placeholder="مثال: سيارة تويوتا كامري 2019 نظيفة" />
        </FormField>

        <FormField label="الوصف" htmlFor="desc" required error={fieldError('description')}>
          <textarea id="desc" value={values.description} maxLength={5000} rows={5}
            onChange={(e) => set('description', e.target.value)}
            placeholder="اكتب تفاصيل الإعلان بوضوح..."
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
          <p className="text-xs text-muted-foreground text-end">{values.description.length}/5000</p>
        </FormField>
      </div>

      {/* Classification */}
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <h2 className="font-semibold">التصنيف والموقع</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="categoryId" className="text-sm font-medium">الفئة</label>
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
          </div>

          <FormField label="المدينة" htmlFor="city" required error={fieldError('city')}>
            <Select value={values.city} onValueChange={(v) => set('city', v)}>
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

      {/* Pricing */}
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <h2 className="font-semibold">السعر</h2>
        <PriceInput
          value={values.price}
          onChange={(v) => set('price', v)}
          isNegotiable={values.isNegotiable}
          onNegotiableChange={(v) => set('isNegotiable', v)}
        />
      </div>

      {/* Images */}
      <div className="rounded-lg border bg-card p-4 space-y-4">
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
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => history.back()}>إلغاء</Button>
        <Button type="submit" disabled={isFormIncomplete || isPending}>
          {isPending ? 'جارٍ الحفظ…' : mode === 'create' ? 'نشر الإعلان' : 'حفظ التعديلات'}
        </Button>
      </div>
    </form>
  );
}
