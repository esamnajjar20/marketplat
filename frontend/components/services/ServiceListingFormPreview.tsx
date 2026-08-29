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
  const filePreview =
    values.images[0] instanceof File ? URL.createObjectURL(values.images[0]) : null;
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
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" aria-hidden />
          {values.durationEstimate}
        </p>
      )}
    </LivePreviewCard>
  );
}
