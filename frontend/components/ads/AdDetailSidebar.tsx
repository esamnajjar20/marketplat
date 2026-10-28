'use client';

import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatters';
import dynamic from 'next/dynamic';
import { DetailSafetyTips } from '@/components/shared/DetailSafetyTips';

// Lazy-load SellerCard (already done in AdDetail, but need it here too)
const SellerCard = dynamic(
  () => import('@/components/ads/SellerCard').then((m) => m.SellerCard),
  { loading: () => <div className="h-24 w-full animate-pulse bg-muted" /> },
);
import { DETAIL_PRICE_PANEL } from '@/components/shared/detail/detailTokens';
import type { Ad } from '@/types/ad.types';

interface AdDetailSidebarProps {
  ad: Ad;
  isOwnAd: boolean;
}

export function AdDetailSidebar({ ad, isOwnAd }: AdDetailSidebarProps) {
  if (isOwnAd) return null;

  return (
    <aside className="hidden md:flex md:w-1/3 flex-col gap-6">
      <div className="space-y-6">
        <div className={cn(DETAIL_PRICE_PANEL, 'space-y-1')}>
          <div className="text-sm text-muted-foreground">السعر المطلوب</div>
          <div className="text-3xl font-bold text-primary">{formatPrice(ad.price)}</div>
          {ad.isNegotiable && (
            <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3 mt-3">
              <span>قابل للتفاوض</span>
            </div>
          )}
        </div>

        <SellerCard seller={ad.user} adId={ad.id} sellerProfileId={ad.sellerProfileId} store={ad.store} />

        <DetailSafetyTips defaultOpen />
      </div>
    </aside>
  );
}
