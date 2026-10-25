'use client';

import dynamic from 'next/dynamic';
import { useRef, type KeyboardEvent } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';
import { Star } from 'lucide-react';
// PERF-04: StoreProducts lazy-loaded — default tab but heavy (grid, search, sort, pagination, recommendations)
// Using dynamic with SuspenseFallback to avoid blocking initial render on /stores/[id]
const StoreProducts = dynamic(
  () => import('@/components/stores/StoreProducts').then((m) => m.StoreProducts),
  { loading: () => <SuspenseFallback /> },
);
import { StoreReviewButton } from '@/components/stores/StoreReviewButton';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants';
import { getStoreTypePresentation, type StoreWithSellerAndCounts } from '@/types/store.types';
import { SuspenseFallback } from '@/components/shared/feedback/SuspenseFallback';

const StoreAds = dynamic(
  () => import('@/components/stores/StoreAds').then((m) => m.StoreAds),
  { loading: () => <SuspenseFallback /> },
);
const StoreCollections = dynamic(
  () => import('@/components/stores/StoreCollections').then((m) => m.StoreCollections),
  { loading: () => <SuspenseFallback /> },
);
const StoreReviewsList = dynamic(
  () => import('@/components/stores/StoreReviewsList').then((m) => m.StoreReviewsList),
  { loading: () => <SuspenseFallback /> },
);
// BUNDLE-OPT-02: Lazy-load StoreAbout tab (simple, no queries)
// Only loads when user clicks "عن المتجر" tab
const StoreAbout = dynamic(
  () => import('@/components/stores/StoreAbout').then((m) => m.StoreAbout),
  { loading: () => <SuspenseFallback /> },
);

type Tab = 'products' | 'offers' | 'collections' | 'ads' | 'reviews' | 'about';

const TABS: { id: Tab; label: string }[] = [
  { id: 'products', label: 'المنتجات' },
  { id: 'offers', label: 'العروض' },
  { id: 'collections', label: 'المجموعات' },
  { id: 'ads', label: 'الإعلانات' },
  { id: 'reviews', label: 'التقييمات' },
  { id: 'about', label: 'عن المتجر' },
];

interface Props {
  storeId: string;
  storeName: string;
  ownerUserId: string;
  /** full store payload for the "عن المتجر" tab. */
  store?: StoreWithSellerAndCounts;
}

export function StoreStorefront({ storeId, storeName, ownerUserId, store }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const tab = (sp.get('tab') as Tab | null) ?? 'products';
  const presentation = getStoreTypePresentation(store?.storeType);
  const active: Tab = TABS.some((t) => t.id === tab) ? tab : 'products';
  const tabs = TABS.map((item) => ({ ...item, label: presentation.page[item.id === 'products' ? 'products' : item.id === 'offers' ? 'offers' : item.id === 'collections' ? 'collections' : item.id === 'ads' ? 'ads' : item.id === 'reviews' ? 'reviews' : 'about'] }));
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);


  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowLeft') next = index + 1;
    else if (event.key === 'ArrowRight') next = index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    const bounded = (next + tabs.length) % tabs.length;
    const nextTab = tabs[bounded];
    if (!nextTab) return;
    setTab(nextTab.id);
    tabRefs.current[bounded]?.focus();
  }

  function setTab(next: Tab) {
    const params = new URLSearchParams(sp.toString());
    if (next === 'products') params.delete('tab');
    else params.set('tab', next);
    params.delete('productsPage');
    router.push(`${ROUTES.storeDetail(storeId)}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-5 lg:space-y-6">
      <div
        className="sticky top-[var(--protected-header-offset,4rem)] z-20 -mx-2 flex gap-1.5 overflow-x-auto overscroll-x-contain border-b border-border bg-background/95 px-4 scrollbar-thin backdrop-blur supports-[backdrop-filter]:bg-background/85"
        role="tablist"
        aria-label="أقسام المتجر"
      >
        {tabs.map(({ id, label }, index) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`store-tab-${id}`}
            aria-selected={active === id}
            aria-controls={`store-panel-${id}`}
            tabIndex={active === id ? 0 : -1}
            ref={(el) => { tabRefs.current[index] = el; }}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            onClick={() => setTab(id)}
            className={cn(
              'h-12 shrink-0 whitespace-nowrap border-b-[3px] px-3 text-sm transition-colors',
              active === id
                ? 'border-primary font-extrabold text-primary-strong'
                : 'border-transparent font-semibold text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {active === 'products' && (
        <section className="rounded-2xl border border-border/60 bg-background/60 p-1" role="tabpanel"
          id="store-panel-products"
          aria-labelledby="store-tab-products">
          <StoreProducts storeId={storeId} storeName={storeName} />
        </section>
      )}

      {active === 'ads' && (
        <section className="space-y-3" role="tabpanel"
          id="store-panel-ads"
          aria-labelledby="store-tab-ads">
          <StoreAds storeId={storeId} storeName={storeName} />
        </section>
      )}

      {active === 'offers' && (
        <section className="space-y-3" role="tabpanel"
          id="store-panel-offers"
          aria-labelledby="store-tab-offers">
          <p className="text-sm text-muted-foreground">{presentation.page.offers}</p>
          <StoreProducts storeId={storeId} storeName={storeName} offersOnly />
        </section>
      )}

      {active === 'collections' && (
        <section className="space-y-3" role="tabpanel"
          id="store-panel-collections"
          aria-labelledby="store-tab-collections">
          <StoreCollections storeId={storeId} />
        </section>
      )}

      {active === 'reviews' && (
        <section className="space-y-3" role="tabpanel"
          id="store-panel-reviews"
          aria-labelledby="store-tab-reviews">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-lg font-bold">
              <Star className="h-4 w-4 text-muted-foreground" />
              {presentation.page.reviews}
            </h2>
            <StoreReviewButton storeId={storeId} storeName={storeName} ownerUserId={ownerUserId} />
          </div>
          <StoreReviewsList
          storeId={storeId}
          averageRating={store?.sellerProfile?.averageRating}
          totalRatings={store?.sellerProfile?.totalRatings}
        />
        </section>
      )}

      {active === 'about' && store && (
        <section className="space-y-5 lg:space-y-6" role="tabpanel"
          id="store-panel-about"
          aria-labelledby="store-tab-about">
          <StoreAbout store={store} presentation={presentation} />
        </section>
      )}

      {active === 'about' && !store && (
        <section className="space-y-3" role="tabpanel"
          id="store-panel-about"
          aria-labelledby="store-tab-about">
          <p className="text-sm text-muted-foreground">لا تتوفر تفاصيل إضافية لهذا المتجر.</p>
        </section>
      )}
    </div>
  );
}

