'use client';

/**
 * DESKTOP-AUDIT-05: live preview of how the product will appear as a
 * card, shown in CreateFormLayout's sticky sidebar (lg+ only — see
 * ProductForm). Mirrors ProductCard's visual layout (square image,
 * price/discount, wholesale note) but reads directly from the form's
 * live Values instead of a server ProductWithStore — no id/store/
 * effectivePrice exist yet at this point, so this is a close
 * approximation rather than the exact same component.
 */

import { PackageX, Clock3 } from 'lucide-react';
import { formatPrice } from '@/lib/formatters';
import { PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { LivePreviewCard } from '@/components/shared/forms/LivePreviewCard';
import type { ProductFormValues } from '@/types/product.types';

interface Props {
  values: ProductFormValues;
  className?: string;
}

const AVAILABILITY_LABEL: Record<ProductFormValues['availability'], string> = {
  IN_STOCK: 'متوفر',
  LIMITED: 'كمية محدودة',
  OUT_OF_STOCK: 'غير متوفر',
};

export function ProductFormPreview({ values, className }: Props) {
  const filePreview =
    values.images[0] instanceof File ? URL.createObjectURL(values.images[0]) : null;
  const imageSrc = filePreview || values.existingImages[0] || PLACEHOLDER_SVG;

  const discount = values.discountPrice ? parseFloat(values.discountPrice) : null;
  const price = values.price ? parseFloat(values.price) : null;
  const hasDiscount = discount !== null && price !== null && discount < price;

  return (
    <LivePreviewCard
      className={className}
      caption="هكذا سيظهر منتجك تقريباً في المتجر ونتائج البحث."
      media={
        <div className="relative aspect-square bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt=""
            className={`h-full w-full object-cover ${values.availability === 'OUT_OF_STOCK' ? 'opacity-60' : ''}`}
          />
          {values.availability !== 'IN_STOCK' && (
            <span className="absolute top-2 end-2 flex items-center gap-1 rounded-full bg-foreground/70 px-2.5 py-0.5 text-xs text-background backdrop-blur-sm">
              {values.availability === 'OUT_OF_STOCK' ? (
                <PackageX className="h-3 w-3" />
              ) : (
                <Clock3 className="h-3 w-3" />
              )}
              {AVAILABILITY_LABEL[values.availability]}
            </span>
          )}
        </div>
      }
    >
      <h3 className="line-clamp-2 text-sm font-medium leading-snug">
        {values.name.trim() || 'اسم المنتج'}
      </h3>
      <div className="flex items-center gap-2">
        {price !== null ? (
          <>
            <p className="font-mono text-base font-bold text-primary">
              {formatPrice(hasDiscount ? discount : price)}
            </p>
            {hasDiscount && (
              <p className="font-mono text-xs text-muted-foreground line-through">
                {formatPrice(price)}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">بدون سعر</p>
        )}
      </div>
      {values.wholesalePrice && values.wholesaleMinQty && (
        <p className="text-xs text-muted-foreground">
          {formatPrice(values.wholesalePrice)} عند شراء {values.wholesaleMinQty}+
        </p>
      )}
    </LivePreviewCard>
  );
}
