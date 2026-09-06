'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Package, Tag, Layers, Star, Megaphone } from 'lucide-react';
import { StoreAds } from '@/components/stores/StoreAds';
import { StoreProducts } from '@/components/stores/StoreProducts';
import { StoreCollections } from '@/components/stores/StoreCollections';
import { StoreReviewsList } from '@/components/stores/StoreReviewsList';
import { StoreReviewButton } from '@/components/stores/StoreReviewButton';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants';

type Tab = 'products' | 'offers' | 'collections' | 'ads';

const TABS: { id: Tab; label: string; icon: typeof Package }[] = [
  { id: 'products', label: 'المنتجات', icon: Package },
  { id: 'ads', label: 'الإعلانات', icon: Megaphone },
  { id: 'offers', label: 'العروض', icon: Tag },
  { id: 'collections', label: 'المجموعات', icon: Layers },
];

interface Props {
  storeId: string;
  storeName: string;
  ownerUserId: string;
}

export function StoreStorefront({ storeId, storeName, ownerUserId }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const tab = (sp.get('tab') as Tab | null) ?? 'products';
  const active: Tab = TABS.some((t) => t.id === tab) ? tab : 'products';

  function setTab(next: Tab) {
    const params = new URLSearchParams(sp.toString());
    if (next === 'products') params.delete('tab');
    else params.set('tab', next);
    params.delete('productsPage');
    router.push(`${ROUTES.storeDetail(storeId)}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-8">
      <div className="flex gap-1 overflow-x-auto border-b pb-0" role="tablist" aria-label="أقسام المتجر">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active === id}
            onClick={() => setTab(id)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              active === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {active === 'products' && (
        <section className="space-y-3" role="tabpanel">
          <StoreProducts storeId={storeId} storeName={storeName} />
        </section>
      )}

      {active === 'ads' && (
        <section className="space-y-3" role="tabpanel">
          <StoreAds storeId={storeId} storeName={storeName} />
        </section>
      )}

      {active === 'offers' && (
        <section className="space-y-3" role="tabpanel">
          <p className="text-sm text-muted-foreground">منتجات عليها عروض نشطة حاليًا</p>
          <StoreProducts storeId={storeId} storeName={storeName} offersOnly />
        </section>
      )}

      {active === 'collections' && (
        <section className="space-y-3" role="tabpanel">
          <StoreCollections storeId={storeId} />
        </section>
      )}

      <section className="space-y-3 border-t pt-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-lg font-bold">
            <Star className="h-4 w-4 text-muted-foreground" />
            التقييمات
          </h2>
          <StoreReviewButton storeId={storeId} storeName={storeName} ownerUserId={ownerUserId} />
        </div>
        <StoreReviewsList storeId={storeId} />
      </section>
    </div>
  );
}
