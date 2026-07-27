import { ShoppingBag } from 'lucide-react';
import { AdCard } from '@/components/ads/AdCard';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import type { AdListItem } from '@/types/ad.types';

interface Props {
  ads: AdListItem[];
}

export function SellerProfileAds({ ads }: Props) {
  if (ads.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="h-8 w-8" />}
        title="لا توجد إعلانات"
        description="لم ينشر هذا البائع أي إعلانات نشطة بعد"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {ads.map(ad => (
        <AdCard key={ad.id} ad={ad} />
      ))}
    </div>
  );
}
