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

import { useEffect, useMemo } from 'react';
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
  // SW-ADFORMPREVIEW-OBJECT-URL-FIX: same leak as the one in
  // ProductFormPreview (SW-OBJECT-URL-LEAK-PRODUCT) and
  // ServiceListingFormPreview (). This component is
  // mounted for the whole time the ad form is open — on desktop it
  // lives in CreateFormLayout's sticky sidebar across all three wizard
  // steps. Every keystroke in the title/description/price fields
  // re-renders this component, and every render minted a fresh blob
  // URL for the picked photo with no revoke. On a phone with a 3-5 MB
  // photo and a few minutes of typing, that pinned dozens of
  // references to the same File in memory until the tab closed.
  //
  // useMemo keys on the File object itself (extracted to `firstImage`
  // so exhaustive-deps can see the read); a useEffect cleanup revokes
  // each URL as the memo value changes and on unmount.
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
            <span className="absolute top-2 start-2 rounded-full bg-background/90 px-2 py-0.5 text-2xs font-semibold">
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
            <span className="ms-1 text-2xs font-medium text-primary/80">قابل للتفاوض</span>
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
