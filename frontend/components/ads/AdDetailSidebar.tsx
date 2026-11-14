'use client';

import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatters';
import dynamic from 'next/dynamic';
import { DetailSafetyTips } from '@/components/shared/DetailSafetyTips';

// Lazy-load SellerCard (already done in AdDetail, but need it here too)
const SellerCard = dynamic(
  () => import('@/components/ads/SellerCard').then((m) => m.SellerCard),
  { loading: () => <Skeleton className="h-24 w-full" /> },
);
import { DETAIL_PRICE_PANEL } from '@/components/shared/detail/detailTokens';
import type { Ad } from '@/types/ad.types';
import { Skeleton } from '@/components/shared/ui/Skeleton';

interface AdDetailSidebarProps {
  ad: Ad;
  isOwnAd: boolean;
}

export function AdDetailSidebar({ ad, isOwnAd }: AdDetailSidebarProps) {
  if (isOwnAd) return null;

  return (
    <aside className="hidden w-full shrink-0 space-y-4 lg:block lg:w-1/3">
      <div className={cn(DETAIL_PRICE_PANEL, 'space-y-3')}>
        <div className="text-sm text-muted-foreground">السعر المطلوب</div>
        <div className="text-3xl font-bold tabular-nums text-primary">{formatPrice(ad.price)}</div>
        {ad.isNegotiable && (
          <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
            <span>قابل للتفاوض</span>
          </div>
        )}
      </div>

      <SellerCard seller={ad.user} adId={ad.id} sellerProfileId={ad.sellerProfileId} store={ad.store} />

      <DetailSafetyTips defaultOpen />
    </aside>
  );
}
