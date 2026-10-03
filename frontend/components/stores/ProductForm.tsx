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
import { useProductCategories } from '@/hooks/queries/useProductCategories';
import { useMyStore } from '@/hooks/queries/useStores';
import { useFormDraft, readFormDraft } from '@/hooks/useFormDraft';
import { getAdDraft } from '@/lib/offlineAdDrafts';
import {
  setActiveOfflineDraftId,
  productFieldsFromDraftPayload,
} from '@/lib/offlineDraftResume';
import {
  useCreateProduct,
  useUpdateProduct,
  useAddProductImages,
  useRemoveProductImage,
  useReorderProductImages,
} from '@/hooks/mutations/useProductMutations';
import { parseApiError } from '@/lib/errorParser';
import { isNetworkLikeFailure } from '@/lib/isNetworkLikeFailure';
import { reconcileImages } from '@/lib/reconcileImages';
import { MAX_IMAGES, ROUTES } from '@/lib/constants';
import { CreateFormLayout } from '@/components/shared/forms/CreateFormLayout';
import { toast } from 'sonner';
import { ProductFormPreview } from '@/components/stores/ProductFormPreview';
import type { Product, ProductAvailability, UpdateProductPayload, ProductFormValues } from '@/types/product.types';
import type { StoreAttributes, StoreTypeField } from '@/types/store.types';

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
  attributes?: string;
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

function ProductTypeFieldInput({
  field,
  value,
  onChange,
  error,
}: {
  field: StoreTypeField;
  // FIX DYN-FIELD-UNDEF: field may be empty before first edit —
  // the parent stores optional attributes, so allow undefined here.
  value: StoreAttributes[string] | undefined;
  onChange: (value: StoreAttributes[string]) => void;
  error?: string;
}) {
  const id = `product-attribute-${field.key}`;
  if (field.type === 'BOOLEAN') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        <span>{field.labelAr}{field.required ? ' *' : ''}</span>
      </label>
    );
  }
  if (field.type === 'SELECT') {
    return (
      <FormField label={field.labelAr} htmlFor={id} required={field.required} error={error}>
        <Select value={typeof value === 'string' ? value : ''} onValueChange={onChange}>
          <SelectTrigger id={id}><SelectValue placeholder={`اختر ${field.labelAr}`} /></SelectTrigger>
          <SelectContent>{(field.options ?? []).map((option) => <SelectItem key={option.value} value={option.value}>{option.labelAr}</SelectItem>)}</SelectContent>
        </Select>
      </FormField>
    );
  }
  return (
    <FormField label={field.labelAr} htmlFor={id} required={field.required} error={error}>
      <Input
        id={id}
        type={field.type === 'NUMBER' ? 'number' : 'text'}
        value={value === undefined ? '' : String(value)}
        onChange={(e) => onChange(field.type === 'NUMBER' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
      />
    </FormField>
  );
}

export function ProductForm({ mode, product }: Props) {
  const { data: categories } = useProductCategories();
  const { data: myStore } = useMyStore();
  const productStoreType = (product as Product & { store?: { storeType?: { fields?: StoreTypeField[] } } } | undefined)?.store?.storeType;
  const productFields = (productStoreType?.fields ?? myStore?.storeType?.fields ?? []).filter((field) => field.scope === 'PRODUCT' && field.isActive !== false);
  const searchParams = useSearchParams();
  const offlineDraftId = searchParams.get('draftId');
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

  const [values, setValues] = useState<ProductFormValues>(() => {
    if (product) {
      return {
        categoryId: product.categoryId,
        name: product.name,
        description: product.description,
        price: product.price,
        discountPrice: product.discountPrice ?? '',
        wholesalePrice: product.wholesalePrice ?? '',
        wholesaleMinQty: product.wholesaleMinQty ? String(product.wholesaleMinQty) : '',
        availability: product.availability,
        stockQuantity: product.stockQuantity != null ? String(product.stockQuantity) : '',
        attributes: product.attributes ?? {},
        images: [],
        existingImages: product.images,
      };
    }
    const empty = {
      categoryId: '',
      name: '',
      description: '',
      price: '',
      discountPrice: '',
      wholesalePrice: '',
      wholesaleMinQty: '',
      availability: 'IN_STOCK' as ProductAvailability,
      stockQuantity: '',
      attributes: {},
      images: [] as File[],
      existingImages: [] as string[],
    };
    if (offlineDraftId) return empty;
    return {
      ...empty,
      ...(readFormDraft<ProductDraftValues>('product:create') ?? {}),
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
        if (cancelled || !d || d.kind !== 'product') return;
        const fields = productFieldsFromDraftPayload(d.payload);
        setValues((prev) => ({
          ...prev,
          ...fields,
          attributes: fields.attributes ?? {},
          availability: (fields.availability as ProductAvailability) || prev.availability,
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
      attributes: values.attributes,
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
    for (const field of productFields) {
      if (!field.required) continue;
      const value = values.attributes[field.key];
      if (value === undefined || value === null || value === '' || (field.type === 'SELECT' && value === '')) {
        e.attributes = 'أكمل الحقول الخاصة بهذا النوع من المتجر';
        break;
      }
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

  // SW-PRODFORM-HISTORY-GUARD-01: same fix as AdForm.tsx's
  // SW-HISTORY-GUARD-01. history.back() with no previous in-app entry
  // (a deep link, bookmark, or shared URL to /my-store/products/new)
  // either leaves the app or produces a blank tab. Fall back to the
  // product list. Also adds the missing discard-confirmation: this
  // form can hold a name, description, multiple prices, wholesale
  // terms, stock, and images; a single accidental tap on إلغاء used to
  // discard everything silently.
  const router = useRouter();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [initialValues] = useState(() => values);
  const isDirty =
    values.categoryId !== initialValues.categoryId ||
    values.name !== initialValues.name ||
    values.description !== initialValues.description ||
    values.price !== initialValues.price ||
    values.discountPrice !== initialValues.discountPrice ||
    values.wholesalePrice !== initialValues.wholesalePrice ||
    values.wholesaleMinQty !== initialValues.wholesaleMinQty ||
    values.stockQuantity !== initialValues.stockQuantity ||
    JSON.stringify(values.attributes) !== JSON.stringify(initialValues.attributes) ||
    values.availability !== initialValues.availability ||
    values.images.length > 0 ||
    values.existingImages.length !== initialValues.existingImages.length ||
    values.existingImages.some((url, i) => url !== initialValues.existingImages[i]);

  function goBackSafely() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      history.back();
    } else {
      router.push(ROUTES.myStoreProducts);
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
          ...(Object.keys(values.attributes).length > 0 ? { attributes: values.attributes } : {}),
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

    // T792 — build the product-fields payload up front so the catch
    // block below can fire update.mutate() itself if the image steps
    // fail due to a network error. Without this, an offline edit that
    // changes both text AND images lost the text edits: addImages
    // threw first, the catch block returned, update.mutate() never
    // ran, and useUpdateProduct's own onError — the only place a
    // draft is saved — was never invoked. Same fix as AdForm and
    // ServiceListingForm.
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
      ...(Object.keys(values.attributes).length > 0 ? { attributes: values.attributes } : {}),
    } satisfies UpdateProductPayload;

    try {
      // Shared with the other two entity forms — see lib/reconcileImages.ts
      // for the ordering rules (EPIC 1.5 add-before-remove, Gap #11 reorder).
      await reconcileImages(
        { originalImages, existingImages: values.existingImages, newFiles: values.images },
        {
          addImages: (files) => addImages.mutateAsync({ id: currentProduct.id, files }),
          removeImage: (imageUrl) => removeImage.mutateAsync({ id: currentProduct.id, imageUrl }),
          reorderImages: (images) => reorderImages.mutateAsync({ id: currentProduct.id, images }),
          onUploadStart: () => setUploadProgress(0),
        },
      );
    } catch (err) {
      const parsed = parseApiError(err);
      // T792 — a network failure here means update.mutate will also
      // fail offline. Firing it anyway lets useUpdateProduct's onError
      // save the text edits as an offline draft, instead of losing
      // them because only the image step was attempted.
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
      // user must fix the offending input before the product's own
      // fields should be saved. Before this fix the catch block was a
      // bare `catch { return; }` — the user saw no feedback at all,
      // and the product silently kept its old field values.
      toast.error(parsed.message || 'فشل حفظ الصور، حاول مرة أخرى');
      setIsSavingImages(false);
      isSubmittingRef.current = false;
      setUploadProgress(null);
      return;
    }

    // Success path — image reconciliation completed without error.
    // SW-FIX-PRODFORM-SUBMIT-RACE: isSubmittingRef stays true until
    // update.mutate actually settles, mirroring create mode. Previously
    // it was cleared immediately after mutate() was fired (mutate is
    // fire-and-forget), which opened a small race where an Enter keypress
    // in any field could re-trigger handleSubmit and fire a duplicate
    // PATCH before the first one's isPending flips the button state.
    setIsSavingImages(false);
    setUploadProgress(null);
    update.mutate(payload, {
      onError: (err) => setServerErrors(parseApiError(err).fieldErrors),
      onSettled: () => { isSubmittingRef.current = false; },
    });
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
        <div className="-mx-1 space-y-3 rounded-xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/90 sm:static sm:shadow-xs">
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

      {productFields.length > 0 && (
        <div className={`space-y-4 rounded-xl border border-border bg-card p-4 shadow-xs ${isWizard && step !== 2 ? "hidden" : ""}`}>
          <div>
            <h2 className="font-semibold">معلومات خاصة بنوع المتجر</h2>
            <p className="mt-1 text-xs text-muted-foreground">هذه الحقول يحددها الأدمن حسب نوع المتجر.</p>
          </div>
          {productFields.map((field) => (
            <ProductTypeFieldInput
              key={field.id}
              field={field}
              value={values.attributes[field.key]}
              onChange={(value) => set('attributes', { ...values.attributes, [field.key]: value })}
              error={field.required && (values.attributes[field.key] === undefined || values.attributes[field.key] === '') ? 'هذا الحقل مطلوب' : undefined}
            />
          ))}
          {fieldError('attributes') && <p className="text-sm text-destructive" role="alert">{fieldError('attributes')}</p>}
        </div>
      )}

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
        </div>

        {/* SW-FIX-PRODFORM-JSX-INDENT: the stockQuantity FormField was
            nested inside the availability <Select>'s space-y-1.5 wrapper —
            its closing </div> sat after the FormField, giving the field an
            unintended extra top margin. */}
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

      <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] z-40 -mx-1 border-t border-border/80 bg-background/95 p-3 shadow-[0_-4px_16px_-8px_hsl(var(--shadow-color)/0.12)] backdrop-blur supports-[backdrop-filter]:bg-background/90 sm:static sm:bottom-auto sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
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
        // SW-PRODFORM-HISTORY-GUARD-01: an explicit "discard changes"
        // confirmation is a clear signal to also drop the autosaved
        // draft — otherwise it would silently resurrect on the next
        // visit to /my-store/products/new despite the user just
        // having said no to exactly that content.
        if (mode === 'create') clearDraft();
        goBackSafely();
      }}
    />
  );

  return (
    <>
      <CreateFormLayout form={formElement} preview={<ProductFormPreview values={values} />} />
      {cancelDialog}
    </>
  );
}
