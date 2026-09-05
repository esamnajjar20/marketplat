'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { FormSteps } from '@/components/shared/forms/FormSteps';
import { ImageUpload } from '@/components/shared/forms/ImageUpload';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import { useProductCategories } from '@/hooks/queries/useProductCategories';
import { useFormDraft, readFormDraft } from '@/hooks/useFormDraft';
import {
  useCreateProduct,
  useUpdateProduct,
  useAddProductImages,
  useRemoveProductImage,
  useReorderProductImages,
} from '@/hooks/mutations/useProductMutations';
import { parseApiError } from '@/lib/errorParser';
import { MAX_IMAGES } from '@/lib/constants';
import { CreateFormLayout } from '@/components/shared/forms/CreateFormLayout';
import { toast } from 'sonner';
import { ProductFormPreview } from '@/components/stores/ProductFormPreview';
import type { Product, ProductAvailability, UpdateProductPayload, ProductFormValues } from '@/types/product.types';

interface Props {
  mode: 'create' | 'edit';
  product?: Product;
}

interface Errors {
  categoryId?: string;
  name?: string;
  description?: string;
  price?: string;
  discountPrice?: string;
  wholesalePrice?: string;
  images?: string;
}

const AVAILABILITY_LABELS: Record<ProductAvailability, string> = {
  IN_STOCK: 'متوفر',
  LIMITED: 'كمية محدودة',
  OUT_OF_STOCK: 'غير متوفر',
};

// PHASE-OFFLINE-DRAFTS: نفس نمط AdForm.tsx's DraftValues بالضبط — كل
// شيء عدا images/existingImages (ملفات File حية غير قابلة لـ JSON، أو
// بيانات سيرفر بوضع التعديل لا داعي لمسودة عنها).
type ProductDraftValues = Omit<ProductFormValues, 'images' | 'existingImages'>;

export function ProductForm({ mode, product }: Props) {
  const { data: categories } = useProductCategories();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const create = useCreateProduct((p) => setUploadProgress(p));
  const update = useUpdateProduct(product?.id ?? '');
  // Gap #3 fix: same pattern as AdForm — addImages/removeImage drive the
  // edit-mode image changes, awaited before the field-only PATCH fires.
  const addImages = useAddProductImages((p) => setUploadProgress(p));
  const removeImage = useRemoveProductImage();
  const reorderImages = useReorderProductImages();
  const [isSavingImages, setIsSavingImages] = useState(false);
  const isSubmittingRef = useRef(false);
  const isPending = create.isPending || update.isPending
    || addImages.isPending || removeImage.isPending || reorderImages.isPending || isSavingImages;

  // Snapshot of the product's images as they were when the form
  // mounted, so we can diff against values.existingImages on submit to
  // know which ones the user actually removed — same as AdForm's
  // originalImages (FIX I-04).
  const [originalImages] = useState<string[]>(() => product?.images ?? []);

  const [values, setValues] = useState<ProductFormValues>(() =>
    product
      ? {
          categoryId: product.categoryId,
          name: product.name,
          description: product.description,
          price: product.price,
          discountPrice: product.discountPrice ?? '',
          wholesalePrice: product.wholesalePrice ?? '',
          wholesaleMinQty: product.wholesaleMinQty ? String(product.wholesaleMinQty) : '',
          availability: product.availability,
          stockQuantity: product.stockQuantity != null ? String(product.stockQuantity) : '',
          images: [],
          existingImages: product.images,
        }
      : {
          // PHASE-OFFLINE-DRAFTS: بذر الحالة الابتدائية من مسودة محفوظة
          // إن وُجدت — نفس منطق AdForm.tsx بالضبط.
          ...{
            categoryId: '',
            name: '',
            description: '',
            price: '',
            discountPrice: '',
            wholesalePrice: '',
            wholesaleMinQty: '',
            availability: 'IN_STOCK' as ProductAvailability,
            stockQuantity: '',
          },
          ...(readFormDraft<ProductDraftValues>('product:create') ?? {}),
          images: [],
          existingImages: [],
        }
  );
  const [errors, setErrors] = useState<Errors>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | undefined>();

  // PHASE-OFFLINE-DRAFTS: يحفظ الحقول النصية دوريًا بينما المستخدم
  // يملأ نموذج منتج *جديد* — بوضع create فقط (نفس استثناء AdForm.tsx:
  // بوضع edit توجد بيانات منتج حقيقية بالسيرفر، فاستعادة مسودة قديمة
  // فوقها سيكون مربكًا لا مفيدًا).
  const { clearDraft, lastSavedAt } = useFormDraft<ProductDraftValues>(
    'product:create',
    {
      categoryId: values.categoryId,
      name: values.name,
      description: values.description,
      price: values.price,
      discountPrice: values.discountPrice,
      wholesalePrice: values.wholesalePrice,
      wholesaleMinQty: values.wholesaleMinQty,
      availability: values.availability,
      stockQuantity: values.stockQuantity,
    },
    { enabled: mode === 'create' },
  );

  function fieldError(field: keyof Errors): string | undefined {
    return errors[field] ?? serverErrors?.[field]?.[0];
  }

  function set<K extends keyof ProductFormValues>(key: K, val: ProductFormValues[K]) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  function validate(): boolean {
    const e: Errors = {};
    if (!values.categoryId) e.categoryId = 'اختر فئة المنتج';
    if (values.name.trim().length < 2) e.name = 'اسم المنتج قصير جداً';
    if (values.description.trim().length < 10) e.description = 'الوصف قصير جداً (10 أحرف على الأقل)';
    if (!values.price || parseFloat(values.price) <= 0) e.price = 'أدخل سعراً صحيحاً';
    if (
      values.discountPrice &&
      values.price &&
      parseFloat(values.discountPrice) >= parseFloat(values.price)
    ) {
      e.discountPrice = 'يجب أن يكون سعر الخصم أقل من السعر الأصلي';
    }
    if ((values.wholesalePrice && !values.wholesaleMinQty) || (!values.wholesalePrice && values.wholesaleMinQty)) {
      e.wholesalePrice = 'أدخل سعر الجملة والحد الأدنى للكمية معاً';
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
  // (category/name/description/price, plus the combined image count
  // now that edit mode supports add/remove too — Gap #3 fix).
  // TEMPORARY: totalImageCount required-image gate disabled to match
  // validate() above — remove once image hosting is configured.
  const isFormIncomplete =
    !values.categoryId ||
    values.name.trim().length < 2 ||
    values.description.trim().length < 10 ||
    !values.price || parseFloat(values.price) <= 0;

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
          name: values.name.trim(),
          description: values.description.trim(),
          price: parseFloat(values.price),
          discountPrice: values.discountPrice ? parseFloat(values.discountPrice) : undefined,
          wholesalePrice: values.wholesalePrice ? parseFloat(values.wholesalePrice) : undefined,
          wholesaleMinQty: values.wholesaleMinQty ? parseInt(values.wholesaleMinQty, 10) : undefined,
          availability: values.availability,
          ...(values.stockQuantity.trim() !== '' ? { stockQuantity: Number(values.stockQuantity) } : {}),
          images: values.images,
        },
        {
          onError: (err) => {
            setServerErrors(parseApiError(err).fieldErrors);
            isSubmittingRef.current = false;
          },
          // PHASE-OFFLINE-DRAFTS: نفس منطق AdForm.tsx — لا داعي لمسودة
          // بعد نجاح النشر الفعلي.
          onSuccess: () => clearDraft(),
          onSettled: () => setUploadProgress(null),
        }
      );
      return;
    }

    if (!product) return;
    isSubmittingRef.current = true;
    void submitEdit(product);
  }

  // Gap #3 fix: mirrors AdForm's submitEdit exactly — awaits the image
  // add/remove calls first (each reports its own error via its hook's
  // onError), and only fires the field-only PATCH once both resolve,
  // so a failure surfaces on the page the user is still looking at
  // instead of racing a redirect. Also mirrors the "don't go to zero
  // images even momentarily" reordering for the min-1-image backend guard.
  async function submitEdit(currentProduct: Product) {
    setIsSavingImages(true);
    try {
      const removedUrls = originalImages.filter(
        (url) => !values.existingImages.includes(url),
      );

      const wouldGoToZero =
        removedUrls.length > 0 && values.existingImages.length === 0;

      if (wouldGoToZero && values.images.length > 0) {
        setUploadProgress(0);
        await addImages.mutateAsync({ id: currentProduct.id, files: values.images });
        for (const imageUrl of removedUrls) {
          await removeImage.mutateAsync({ id: currentProduct.id, imageUrl });
        }
      } else {
        for (const imageUrl of removedUrls) {
          await removeImage.mutateAsync({ id: currentProduct.id, imageUrl });
        }
        if (values.images.length > 0) {
          setUploadProgress(0);
          await addImages.mutateAsync({ id: currentProduct.id, files: values.images });
        }
      }

      // Gap #11: mirrors AdForm's submitEdit — only the surviving
      // existing images are reordered; new uploads stay appended at
      // the end (backend's addImages ordering), so this stays a valid
      // permutation without needing the just-uploaded files' URLs.
      const survivingExisting = originalImages.filter((url) => values.existingImages.includes(url));
      const reorderChanged = values.existingImages.some((url, i) => url !== survivingExisting[i]);
      if (reorderChanged && values.existingImages.length > 1) {
        await reorderImages.mutateAsync({ id: currentProduct.id, images: values.existingImages });
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
      name: values.name.trim(),
      description: values.description.trim(),
      price: parseFloat(values.price),
      discountPrice: values.discountPrice ? parseFloat(values.discountPrice) : null,
      wholesalePrice: values.wholesalePrice ? parseFloat(values.wholesalePrice) : null,
      wholesaleMinQty: values.wholesaleMinQty ? parseInt(values.wholesaleMinQty, 10) : null,
      availability: values.availability,
      stockQuantity: values.stockQuantity.trim() === '' ? null : Number(values.stockQuantity),
    } satisfies UpdateProductPayload;

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
        values.name.trim().length >= 2 &&
        values.description.trim().length >= 10
      );
    }
    if (s === 2) {
      return Boolean(values.price.trim()) && Number(values.price) > 0;
    }
    return true;
  }

  function goNextStep() {
    if (!canProceedFromStep(step)) {
      if (step === 1) {
        toast.error('أكمل الفئة والاسم والوصف (10 أحرف على الأقل) للمتابعة');
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
              { id: 'basics', label: 'الأساسيات', description: 'الفئة والاسم والوصف' },
              { id: 'pricing', label: 'التسعير', description: 'السعر والتوفر' },
              { id: 'photos', label: 'الصور', description: 'صور المنتج' },
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
        <h2 className="font-semibold">معلومات المنتج</h2>

        {/* FIX BUG-XX: this field required Select but was hand-rolled
            outside FormField — its error <p> had no role="alert"/
            aria-live (unlike every sibling FormField's error, which
            gets both), and the Select itself had no aria-describedby/
            aria-invalid pointing at that error. FormField's auto-clone
            (UX-FIX P2-11) wires both automatically. */}
        <FormField label="الفئة" htmlFor="categoryId" required error={fieldError('categoryId')}>
          <Select value={values.categoryId} onValueChange={(v) => set('categoryId', v)}>
            <SelectTrigger id="categoryId"><SelectValue placeholder="اختر فئة المنتج" /></SelectTrigger>
            <SelectContent>
              {categories?.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>{cat.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="اسم المنتج" htmlFor="name" required error={fieldError('name')}>
          <Input
            id="name"
            value={values.name}
            maxLength={200}
            onChange={(e) => set('name', e.target.value)}
            placeholder="مثال: خلاط كهربائي 500 واط"
          />
        </FormField>

        <FormField label="الوصف" htmlFor="description" required error={fieldError('description')}>
          <textarea
            id="description"
            rows={5}
            maxLength={2000}
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="اشرح تفاصيل المنتج ومواصفاته..."
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground text-end">{values.description.length}/2000</p>
        </FormField>
      </div>

      <div className={`space-y-4 rounded-xl border border-border bg-card p-4 shadow-xs ${isWizard && step !== 2 ? "hidden" : ""}`}>
        <h2 className="font-semibold">التسعير والتوفر</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="السعر (₪)" htmlFor="price" required error={fieldError('price')}>
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

          <FormField label="سعر بعد الخصم (اختياري)" htmlFor="discountPrice" error={fieldError('discountPrice')}>
            <Input
              id="discountPrice"
              type="number"
              min="0"
              step="0.01"
              value={values.discountPrice}
              onChange={(e) => set('discountPrice', e.target.value)}
              placeholder="0.00"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="سعر الجملة (اختياري)" htmlFor="wholesalePrice" error={fieldError('wholesalePrice')}>
            <Input
              id="wholesalePrice"
              type="number"
              min="0"
              step="0.01"
              value={values.wholesalePrice}
              onChange={(e) => set('wholesalePrice', e.target.value)}
              placeholder="0.00"
            />
          </FormField>

          <FormField label="الحد الأدنى للكمية (للجملة)" htmlFor="wholesaleMinQty">
            <Input
              id="wholesaleMinQty"
              type="number"
              min="1"
              step="1"
              value={values.wholesaleMinQty}
              onChange={(e) => set('wholesaleMinQty', e.target.value)}
              placeholder="مثال: 10"
            />
          </FormField>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="availability" className="text-sm font-medium">التوفر</label>
          <Select value={values.availability} onValueChange={(v) => set('availability', v as ProductAvailability)}>
            <SelectTrigger id="availability"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(AVAILABILITY_LABELS) as [ProductAvailability, string][]).map(
                ([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        
        <FormField label="الكمية في المخزون (اختياري)" htmlFor="stockQuantity">
          <Input
            id="stockQuantity"
            type="number"
            min={0}
            inputMode="numeric"
            value={values.stockQuantity}
            onChange={(e) => set('stockQuantity', e.target.value)}
            placeholder="مثال: 25"
          />
          <p className="text-xs text-muted-foreground mt-1">
            0 = غير متوفر، 1–5 = محدود، أكثر = متوفر (يُحدَّث التوفر تلقائيًا عند الحفظ).
          </p>
        </FormField>
</div>
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
            onClick={() => {
              // PHASE-OFFLINE-DRAFTS: إلغاء صريح بوضع الإنشاء = المستخدم
              // لا يريد هذه المسودة بعد الآن.
              if (mode === 'create') clearDraft();
              history.back();
            }}
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
                {isPending ? 'جارٍ الحفظ…' : mode === 'create' ? 'إضافة المنتج' : 'حفظ التعديلات'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </form>
  );

  // FIX DESKTOP-WIDTH-02: previously create-mode only. `values` is
  // seeded from `product` in edit mode too (see the useState above),
  // and ProductFormPreview already reads existingImages for the
  // edit-mode image source, so the same lg+ split view now applies to
  // both modes — a seller editing a product gets the same live preview
  // a seller creating one gets, instead of a bare single column.
  return <CreateFormLayout form={formElement} preview={<ProductFormPreview values={values} />} />;
}
