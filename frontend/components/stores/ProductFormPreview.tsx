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

import { useEffect, useMemo } from 'react';
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
  // FIX OBJECT-URL-LEAK-PRODUCT: mirrors the identical fix already
  // applied to ServiceListingFormPreview (FIX OBJECT-URL-LEAK). The
  // previous code called URL.createObjectURL() inline in the render
  // body on every render — a new blob URL per keystroke while the
  // seller is typing, each one pinning the File's bytes in memory for
  // the lifetime of the tab, since nothing ever called
  // URL.revokeObjectURL.
  //
  // useMemo keys on the specific File object, so a new URL is only
  // minted when the picked file actually changes. The unmount cleanup
  // revokes the last one; the effect re-runs on every dependency
  // change, so intermediate URLs are also revoked (via the returned
  // cleanup running before the next memo value is used).
  //
  // FIX OBJECT-URL-LEAK-PRODUCT (lint): values.images[0] in a deps
  // array trips exhaustive-deps on two counts — a member expression
  // is not a "simple" dependency and the linter cannot verify what
  // the memo callback actually reads. Extracting the first image to a
  // named variable first makes both checks pass and reads no worse.
  const firstImage = values.images[0];

  const filePreview = useMemo(
    () => (firstImage instanceof File ? URL.createObjectURL(firstImage) : null),
    [firstImage],
  );

  useEffect(() => {
    if (!filePreview) return;
    return () => URL.revokeObjectURL(filePreview);
  }, [filePreview]);

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
