'use client';

import { useState } from 'react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { ImageUpload } from '@/components/shared/forms/ImageUpload';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import { useProductCategories } from '@/hooks/queries/useProductCategories';
import { useCreateProduct, useUpdateProduct } from '@/hooks/mutations/useProductMutations';
import { parseApiError } from '@/lib/errorParser';
import { MAX_IMAGES } from '@/lib/constants';
import type { Product, ProductAvailability } from '@/types/product.types';

interface Props {
  mode: 'create' | 'edit';
  product?: Product;
}

interface Values {
  categoryId: string;
  name: string;
  description: string;
  price: string;
  discountPrice: string;
  wholesalePrice: string;
  wholesaleMinQty: string;
  availability: ProductAvailability;
  images: File[];
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

export function ProductForm({ mode, product }: Props) {
  const { data: categories } = useProductCategories();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const create = useCreateProduct((p) => setUploadProgress(p));
  const update = useUpdateProduct(product?.id ?? '');
  const isPending = create.isPending || update.isPending;

  const [values, setValues] = useState<Values>(() =>
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
          images: [],
        }
      : {
          categoryId: '',
          name: '',
          description: '',
          price: '',
          discountPrice: '',
          wholesalePrice: '',
          wholesaleMinQty: '',
          availability: 'IN_STOCK',
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
    if (mode === 'create' && values.images.length === 0) {
      e.images = 'أضف صورة واحدة على الأقل';
    }
    setErrors(e);
    setServerErrors(undefined);
    return Object.keys(e).length === 0;
  }

  // UX-FIX: mirrors validate()'s required-field rules read-only
  // (category/name/description/price, plus images but only in create
  // mode — edit mode has no image-replace endpoint, see the comment
  // near update.mutate() below).
  const isFormIncomplete =
    !values.categoryId ||
    values.name.trim().length < 2 ||
    values.description.trim().length < 10 ||
    !values.price || parseFloat(values.price) <= 0 ||
    (mode === 'create' && values.images.length === 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    if (mode === 'create') {
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
          images: values.images,
        },
        {
          onError: (err) => setServerErrors(parseApiError(err).fieldErrors),
          onSettled: () => setUploadProgress(null),
        }
      );
      return;
    }

    // Edit mode — PATCH is JSON-only; no image-replace endpoint for
    // products (see products.api.ts's file header for why).
    update.mutate(
      {
        categoryId: values.categoryId,
        name: values.name.trim(),
        description: values.description.trim(),
        price: parseFloat(values.price),
        discountPrice: values.discountPrice ? parseFloat(values.discountPrice) : null,
        wholesalePrice: values.wholesalePrice ? parseFloat(values.wholesalePrice) : null,
        wholesaleMinQty: values.wholesaleMinQty ? parseInt(values.wholesaleMinQty, 10) : null,
        availability: values.availability,
      },
      { onError: (err) => setServerErrors(parseApiError(err).fieldErrors) }
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <h2 className="font-semibold">معلومات المنتج</h2>

        <div className="space-y-1.5">
          <label htmlFor="categoryId" className="text-sm font-medium">
            الفئة <span className="text-destructive">*</span>
          </label>
          <Select value={values.categoryId} onValueChange={(v) => set('categoryId', v)}>
            <SelectTrigger id="categoryId"><SelectValue placeholder="اختر فئة المنتج" /></SelectTrigger>
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
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
          <p className="text-xs text-muted-foreground text-end">{values.description.length}/2000</p>
        </FormField>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-4">
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
        <Button type="submit" disabled={isFormIncomplete || isPending}>
          {isPending ? 'جارٍ الحفظ…' : mode === 'create' ? 'إضافة المنتج' : 'حفظ التعديلات'}
        </Button>
      </div>
    </form>
  );
}
