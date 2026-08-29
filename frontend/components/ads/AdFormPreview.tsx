'use client';

/**
 * Live preview of how the ad will appear as a card — shown inline on
 * the last wizard step (mobile/tablet) and in CreateFormLayout's sticky
 * sidebar (lg+, all steps — see AdForm) so the seller can catch a weak
 * title/price/photo before publishing.
 *
 * DESKTOP-AUDIT-05: now built on the shared LivePreviewCard shell (see
 * that file) instead of its own copy of the border/rounded/shadow/
 * label/caption markup — ProductFormPreview/ServiceListingFormPreview
 * share the same shell.
 */

import { MapPin } from 'lucide-react';
import { formatPrice } from '@/lib/formatters';
import { CONDITION_LABELS } from '@/lib/constants';
import { PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { LivePreviewCard } from '@/components/shared/forms/LivePreviewCard';
import type { AdFormValues } from '@/types/ad.types';

interface Props {
  values: AdFormValues;
  className?: string;
}

export function AdFormPreview({ values, className }: Props) {
  const filePreview =
    values.images[0] instanceof File ? URL.createObjectURL(values.images[0]) : null;
  const imageSrc = filePreview || values.existingImages[0] || PLACEHOLDER_SVG;
  const conditionLabel = values.condition
    ? CONDITION_LABELS[values.condition] ?? null
    : null;

  return (
    <LivePreviewCard
      className={className}
      caption="هكذا سيظهر إعلانك تقريباً في القوائم والبحث."
      media={
        <div className="relative aspect-[4/3] bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageSrc} alt="" className="h-full w-full object-cover" />
          {conditionLabel && (
            <span className="absolute top-2 start-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold">
              {conditionLabel}
            </span>
          )}
        </div>
      }
    >
      {values.price ? (
        <p className="font-mono text-base font-bold tabular-nums text-primary">
          {formatPrice(values.price)}
          {values.isNegotiable && (
            <span className="ms-1 text-[10px] font-medium text-primary/80">قابل للتفاوض</span>
          )}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">بدون سعر</p>
      )}
      <h3 className="line-clamp-2 text-sm font-medium leading-snug">
        {values.title.trim() || 'عنوان الإعلان'}
      </h3>
      {values.city && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          {values.city}
        </p>
      )}
    </LivePreviewCard>
  );
}
