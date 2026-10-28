'use client';

/**
 * DESKTOP-AUDIT-05: live preview of how the service listing will appear
 * as a card, shown in CreateFormLayout's sticky sidebar (lg+ only —
 * see ServiceListingForm). Mirrors ServiceListingCard's visual layout
 * (price-first hierarchy, duration line) but reads from the form's
 * live Values — no id/provider exist yet at this point, so the
 * availability dot and provider name/verification badge (both provider
 * account facts, not listing facts) aren't part of this preview.
 */

import { useEffect, useMemo } from 'react';
import { Clock } from 'lucide-react';
import { formatPrice } from '@/lib/formatters';
import { PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { LivePreviewCard } from '@/components/shared/forms/LivePreviewCard';
import type { ServiceListingFormValues } from '@/types/service.types';

interface Props {
  values: ServiceListingFormValues;
  className?: string;
}

function formatServicePrice(values: ServiceListingFormValues): string {
  if (values.pricingType === 'NEGOTIABLE' || !values.price) return 'حسب الاتفاق';
  const formatted = formatPrice(values.price);
  return values.pricingType === 'STARTING_FROM' ? `يبدأ من ${formatted}` : formatted;
}

export function ServiceListingFormPreview({ values, className }: Props) {
  // FIX OBJECT-URL-LEAK: URL.createObjectURL was called inline in
  // the component body, which allocated a fresh blob URL on every
  // render — and this component re-renders on every keystroke in
  // the parent form, because `values` is passed down as a single
  // object. Worse, nothing ever called URL.revokeObjectURL, so each
  // of those URLs (each holding a reference to the underlying
  // File's data, not just the string) stayed alive for the lifetime
  // of the tab. Writing a 200-character title cost 200 leaked
  // handles; on mobile Safari this is the classic way to hit the
  // per-tab blob URL limit and get a blank preview.
  //
  // useMemo keyed on the File itself allocates a URL only when the
  // image actually changes, and the effect below revokes it on the
  // next change or on unmount — the documented ownership pair for
  // createObjectURL/revokeObjectURL. Existing URLs (edit mode) and
  // the placeholder are plain strings, not blobs, so they skip the
  // whole dance deliberately.
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

  return (
    <LivePreviewCard
      className={className}
      caption="هكذا ستظهر خدمتك تقريباً في نتائج البحث."
      media={
        <div className="relative aspect-[4/3] bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageSrc} alt="" className="h-full w-full object-cover" />
        </div>
      }
    >
      <p className="font-mono text-base font-bold tabular-nums text-primary">
        {formatServicePrice(values)}
      </p>
      <h3 className="line-clamp-2 text-sm font-medium leading-snug">
        {values.title.trim() || 'عنوان الخدمة'}
      </h3>
      {values.durationEstimate && (
        <p className="flex items-center gap-1 text-2xs-tight text-muted-foreground">
          <Clock className="h-3 w-3" aria-hidden />
          {values.durationEstimate}
        </p>
      )}
    </LivePreviewCard>
  );
}
