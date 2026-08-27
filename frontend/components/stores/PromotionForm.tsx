'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/ui/Dialog';
import { useMyProducts } from '@/hooks/queries/useProducts';
import { useCreatePromotion } from '@/hooks/mutations/usePromotionMutations';
import { parseApiError } from '@/lib/errorParser';
import { formatPrice } from '@/lib/formatters';
import type { DiscountType } from '@/types/promotion.types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProductId?: string;
}

interface Values {
  productId: string;
  title: string;
  description: string;
  discountType: DiscountType;
  discountValue: string;
  startsAt: string;
  endsAt: string;
  maxUses: string;
}

interface Errors {
  productId?: string;
  title?: string;
  discountValue?: string;
  startsAt?: string;
  endsAt?: string;
  maxUses?: string;
}

const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  PERCENTAGE: 'نسبة مئوية %',
  FIXED_AMOUNT: 'مبلغ ثابت ₪',
};

const emptyValues: Values = {
  productId: '',
  title: '',
  description: '',
  discountType: 'PERCENTAGE',
  discountValue: '',
  startsAt: '',
  endsAt: '',
  maxUses: '',
};

/**
 * PROMO-1: create-only dialog — there is no separate edit form in this
 * MVP pass (matches the original design doc's Phase 8 scope: create +
 * preview; update/cancel are handled from MyPromotionsList's row
 * actions via useCancelPromotion, not a re-opened form). A promotion's
 * core terms (product/discount/window) are meant to be fixed once
 * live — cancelling and creating a new one is the intended path for
 * "I want different terms", same reasoning as most coupon systems.
 */
export function PromotionForm({ open, onOpenChange, initialProductId }: Props) {
  const { data: productsPage } = useMyProducts({ status: 'ACTIVE', limit: 100 });
  const products = productsPage?.items ?? [];
  const create = useCreatePromotion();

  const [values, setValues] = useState<Values>(() =>
    initialProductId ? { ...emptyValues, productId: initialProductId } : emptyValues,
  );
  useEffect(() => {
    if (open && initialProductId) {
      setValues((v) => ({ ...v, productId: initialProductId }));
    }
  }, [open, initialProductId]);
  const [errors, setErrors] = useState<Errors>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | undefined>();

  function fieldError(field: keyof Errors): string | undefined {
    return errors[field] ?? serverErrors?.[field]?.[0];
  }

  function set<K extends keyof Values>(key: K, val: Values[K]) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  function reset() {
    setValues(emptyValues);
    setErrors({});
    setServerErrors(undefined);
  }

  const selectedProduct = products.find((p) => p.id === values.productId);

  function validate(): boolean {
    const e: Errors = {};
    if (!values.productId) e.productId = 'اختر المنتج';
    if (values.title.trim().length < 2) e.title = 'اسم العرض قصير جداً';
    const discountValue = parseFloat(values.discountValue);
    if (!values.discountValue || discountValue <= 0) {
      e.discountValue = 'أدخل قيمة خصم صحيحة';
    } else if (values.discountType === 'PERCENTAGE' && discountValue > 100) {
      e.discountValue = 'النسبة المئوية لا يمكن أن تتجاوز 100';
    }
    if (!values.startsAt) e.startsAt = 'حدد تاريخ البداية';
    if (!values.endsAt) e.endsAt = 'حدد تاريخ النهاية';
    if (values.startsAt && values.endsAt && new Date(values.endsAt) <= new Date(values.startsAt)) {
      e.endsAt = 'يجب أن يكون تاريخ النهاية بعد تاريخ البداية';
    }
    if (values.maxUses && (parseInt(values.maxUses, 10) <= 0)) {
      e.maxUses = 'أدخل رقماً صحيحاً';
    }
    setErrors(e);
    setServerErrors(undefined);
    return Object.keys(e).length === 0;
  }

  const isFormIncomplete =
    !values.productId ||
    values.title.trim().length < 2 ||
    !values.discountValue ||
    !values.startsAt ||
    !values.endsAt;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    create.mutate(
      {
        productId: values.productId,
        title: values.title.trim(),
        description: values.description.trim() || undefined,
        discountType: values.discountType,
        discountValue: parseFloat(values.discountValue),
        startsAt: new Date(values.startsAt).toISOString(),
        endsAt: new Date(values.endsAt).toISOString(),
        maxUses: values.maxUses ? parseInt(values.maxUses, 10) : undefined,
      },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
        onError: (err) => setServerErrors(parseApiError(err).fieldErrors),
      }
    );
  }

  // Live preview of the discounted price — mirrors the original design
  // doc's Phase 8 preview panel, computed client-side from the same
  // percentage/fixed-amount rule as backend's promotions.service.ts
  // computeEffectivePrice, purely for the seller's benefit before
  // submitting (the actual price is always resolved server-side).
  const previewPrice = (() => {
    if (!selectedProduct || !values.discountValue) return null;
    const original = parseFloat(selectedProduct.price);
    const discountValue = parseFloat(values.discountValue);
    if (Number.isNaN(original) || Number.isNaN(discountValue)) return null;
    const discounted =
      values.discountType === 'PERCENTAGE'
        ? original * (1 - discountValue / 100)
        : Math.max(original - discountValue, 0);
    return Math.round(discounted * 100) / 100;
  })();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إنشاء عرض جديد</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <FormField label="المنتج" htmlFor="promo-productId" required error={fieldError('productId')}>
            <Select value={values.productId} onValueChange={(v) => set('productId', v)}>
              <SelectTrigger id="promo-productId"><SelectValue placeholder="اختر المنتج" /></SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="اسم العرض" htmlFor="promo-title" required error={fieldError('title')}>
            <Input
              id="promo-title"
              value={values.title}
              maxLength={200}
              onChange={(e) => set('title', e.target.value)}
              placeholder="مثال: خصم الصيف"
            />
          </FormField>

          <FormField label="الوصف (اختياري)" htmlFor="promo-description">
            <textarea
              id="promo-description"
              rows={2}
              maxLength={500}
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="promo-discountType" className="text-sm font-medium">نوع الخصم</label>
              <Select value={values.discountType} onValueChange={(v) => set('discountType', v as DiscountType)}>
                <SelectTrigger id="promo-discountType"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(DISCOUNT_TYPE_LABELS) as [DiscountType, string][]).map(
                    ([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <FormField label="قيمة الخصم" htmlFor="promo-discountValue" required error={fieldError('discountValue')}>
              <Input
                id="promo-discountValue"
                type="number"
                min="0"
                step="0.01"
                value={values.discountValue}
                onChange={(e) => set('discountValue', e.target.value)}
                placeholder={values.discountType === 'PERCENTAGE' ? '15' : '50.00'}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="تاريخ البداية" htmlFor="promo-startsAt" required error={fieldError('startsAt')}>
              <input
                id="promo-startsAt"
                type="datetime-local"
                value={values.startsAt}
                onChange={(e) => set('startsAt', e.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </FormField>

            <FormField label="تاريخ النهاية" htmlFor="promo-endsAt" required error={fieldError('endsAt')}>
              <input
                id="promo-endsAt"
                type="datetime-local"
                value={values.endsAt}
                onChange={(e) => set('endsAt', e.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </FormField>
          </div>

          <FormField label="الحد الأقصى للاستخدام (اختياري)" htmlFor="promo-maxUses" error={fieldError('maxUses')}>
            <Input
              id="promo-maxUses"
              type="number"
              min="1"
              step="1"
              value={values.maxUses}
              onChange={(e) => set('maxUses', e.target.value)}
              placeholder="بدون حد أقصى"
            />
          </FormField>

          {selectedProduct && previewPrice !== null && (
            <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
              <p className="text-sm font-medium">{selectedProduct.name}</p>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground line-through">
                  {formatPrice(selectedProduct.price)}
                </span>
                <span className="font-mono text-sm font-bold text-primary">
                  {formatPrice(String(previewPrice))}
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" disabled={isFormIncomplete || create.isPending}>
              {create.isPending ? 'جارٍ الحفظ…' : 'إنشاء العرض'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
