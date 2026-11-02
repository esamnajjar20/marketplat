'use client';

import { Skeleton } from '@/components/ui/skeleton';
import dynamic from 'next/dynamic';
import { ReportAdButton } from '@/components/ads/ReportAdButton';
import type { Ad } from '@/types/ad.types';
import { cn } from '@/lib/utils';
import { DETAIL_PANEL_PADDED, DETAIL_SECTION_TITLE } from '@/components/shared/detail/detailTokens';

// Lazy-load SellerCard for mobile inline view.
const SellerCard = dynamic(
  () => import('@/components/ads/SellerCard').then((m) => m.SellerCard),
  { loading: () => <Skeleton className="h-24 w-full" /> },
);

interface AdDetailDescriptionProps {
  ad: Ad;
}

/**
 * The gallery, title and metadata are rendered once by AdDetail and
 * AdDetailMetadata. This component owns only the description, mobile seller
 * card and reporting action; duplicating those other sections here caused
 * two large galleries and repeated titles/metadata on the same detail page.
 */
export function AdDetailDescription({ ad }: AdDetailDescriptionProps) {
  return (
    <div className="space-y-6 md:col-span-2">
      <section className={cn(DETAIL_PANEL_PADDED, 'space-y-3')}>
        <h2 className={DETAIL_SECTION_TITLE}>التفاصيل</h2>
        <p className="whitespace-pre-line rounded-xl border border-border/50 bg-muted/20 p-4 text-sm leading-7 text-muted-foreground">
          {ad.description?.trim() || 'لا توجد تفاصيل إضافية لهذا الإعلان.'}
        </p>
      </section>

      {/* Mobile-only seller card. Desktop seller information lives in the sidebar. */}
      <div className="md:hidden">
        <SellerCard seller={ad.user} adId={ad.id} sellerProfileId={ad.sellerProfileId} store={ad.store} />
      </div>

      <div className="flex justify-end">
        <ReportAdButton adId={ad.id} />
      </div>
    </div>
  );
}
